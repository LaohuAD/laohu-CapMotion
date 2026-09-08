use cap_recording::sources::screen_capture::ScreenCaptureTarget;
use scap_targets::bounds::LogicalBounds;
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tokio::{sync::RwLock, time::sleep};
use tokio_util::sync::CancellationToken;
use tracing::{debug, instrument};

const RECORDING_CONTROLS_LABEL: &str = "in-progress-recording";
const RECORDING_CONTROLS_WIDTH: f64 = 320.0;
const RECORDING_CONTROLS_HEIGHT: f64 = 150.0;
const RECORDING_CONTROLS_TOP_MARGIN: f64 = 16.0;
const TICK_INTERVAL: Duration = Duration::from_millis(50);
const DEAD_WINDOW_ERROR_THRESHOLD: u8 = 5;
const HIT_TEST_PADDING_PHYSICAL: f64 = 2.0;
const RECORDING_CONTROLS_FALLBACK_PADDING_LOGICAL: f64 = 48.0;
const MAX_INTERACTIVE_BOUNDS_WIDTH: f64 = 360.0;
const MAX_INTERACTIVE_BOUNDS_HEIGHT: f64 = 220.0;

pub struct FakeWindowBounds(pub Arc<RwLock<HashMap<String, HashMap<String, LogicalBounds>>>>);

struct TokenEntry {
    id: u64,
    token: CancellationToken,
}

#[derive(Default)]
pub struct FakeWindowListeners {
    tokens: Mutex<HashMap<String, TokenEntry>>,
    next_id: AtomicU64,
}

impl FakeWindowListeners {
    fn register(&self, label: String) -> (u64, CancellationToken) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let token = CancellationToken::new();
        let mut guard = self.tokens.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(previous) = guard.insert(
            label,
            TokenEntry {
                id,
                token: token.clone(),
            },
        ) {
            previous.token.cancel();
        }
        (id, token)
    }

    fn finish(&self, label: &str, id: u64) {
        let mut guard = self.tokens.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(current) = guard.get(label)
            && current.id == id
        {
            guard.remove(label);
        }
    }

    pub fn cancel(&self, label: &str) {
        let mut guard = self.tokens.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(entry) = guard.remove(label) {
            entry.token.cancel();
        }
    }

    pub fn cancel_all(&self) {
        let mut guard = self.tokens.lock().unwrap_or_else(|e| e.into_inner());
        for (_, entry) in guard.drain() {
            entry.token.cancel();
        }
    }
}

#[tauri::command]
#[specta::specta]
#[instrument(skip(state))]
pub async fn set_fake_window_bounds(
    window: tauri::Window,
    name: String,
    bounds: LogicalBounds,
    state: tauri::State<'_, FakeWindowBounds>,
) -> Result<(), String> {
    let mut state = state.0.write().await;
    let map = state.entry(window.label().to_string()).or_default();

    map.insert(name, bounds);

    Ok(())
}

#[tauri::command]
#[specta::specta]
#[instrument(skip(state, window))]
pub async fn remove_fake_window(
    window: tauri::Window,
    name: String,
    state: tauri::State<'_, FakeWindowBounds>,
) -> Result<(), String> {
    let mut state = state.0.write().await;
    let Some(map) = state.get_mut(window.label()) else {
        return Ok(());
    };

    map.remove(&name);

    if map.is_empty() {
        state.remove(window.label());
    }

    Ok(())
}

fn should_ignore_cursor_events(
    window_position: tauri::PhysicalPosition<i32>,
    mouse_position: tauri::PhysicalPosition<f64>,
    scale_factor: f64,
    windows: &HashMap<String, LogicalBounds>,
    default_ignore: bool,
    allow_default_interaction: bool,
) -> bool {
    let mut saw_bounds = false;

    for bounds in windows.values() {
        let width = bounds.size().width();
        let height = bounds.size().height();
        if width <= 0.0
            || height <= 0.0
            || width > MAX_INTERACTIVE_BOUNDS_WIDTH
            || height > MAX_INTERACTIVE_BOUNDS_HEIGHT
        {
            continue;
        }

        saw_bounds = true;
        let x_min = (window_position.x as f64) + bounds.position().x() * scale_factor
            - HIT_TEST_PADDING_PHYSICAL;
        let x_max = (window_position.x as f64)
            + (bounds.position().x() + bounds.size().width()) * scale_factor
            + HIT_TEST_PADDING_PHYSICAL;
        let y_min = (window_position.y as f64) + bounds.position().y() * scale_factor
            - HIT_TEST_PADDING_PHYSICAL;
        let y_max = (window_position.y as f64)
            + (bounds.position().y() + bounds.size().height()) * scale_factor
            + HIT_TEST_PADDING_PHYSICAL;

        if mouse_position.x >= x_min
            && mouse_position.x <= x_max
            && mouse_position.y >= y_min
            && mouse_position.y <= y_max
        {
            return false;
        }
    }

    if saw_bounds {
        return true;
    }

    default_ignore || !allow_default_interaction
}

fn recording_controls_size_allows_default_interaction(
    window_size: tauri::PhysicalSize<u32>,
    scale_factor: f64,
) -> bool {
    let scale_factor = scale_factor.max(1.0);
    let max_width =
        (RECORDING_CONTROLS_WIDTH + RECORDING_CONTROLS_FALLBACK_PADDING_LOGICAL) * scale_factor;
    let max_height =
        (RECORDING_CONTROLS_HEIGHT + RECORDING_CONTROLS_FALLBACK_PADDING_LOGICAL) * scale_factor;

    (window_size.width as f64) <= max_width && (window_size.height as f64) <= max_height
}

fn prepare_recording_controls_default_interaction(window: &WebviewWindow) -> bool {
    let (Ok(window_size), Ok(scale_factor)) = (window.outer_size(), window.scale_factor()) else {
        let _ = window.set_ignore_cursor_events(true);
        return false;
    };

    if recording_controls_size_allows_default_interaction(window_size, scale_factor) {
        return true;
    }

    if window.set_ignore_cursor_events(true).is_err() {
        let _ = window.hide();
        return false;
    }

    let _ = window.set_size(tauri::LogicalSize::new(
        RECORDING_CONTROLS_WIDTH,
        RECORDING_CONTROLS_HEIGHT,
    ));

    false
}

fn spawn_recording_controls_sanity_checks(app: AppHandle, window: WebviewWindow) {
    let label = window.label().to_string();

    tokio::spawn(async move {
        for delay in [
            Duration::from_millis(250),
            Duration::from_secs(2),
            Duration::from_secs(5),
        ] {
            sleep(delay).await;

            if crate::app_is_exiting(&app) {
                break;
            }

            if crate::power_observer::is_system_asleep() {
                continue;
            }

            let Some(window) = app.get_webview_window(&label) else {
                break;
            };

            let ignore = !prepare_recording_controls_default_interaction(&window);
            let _ = window.set_ignore_cursor_events(ignore);
        }
    });
}

fn calculate_area_recording_controls_position(
    display_bounds: LogicalBounds,
    _area_bounds: LogicalBounds,
) -> (f64, f64) {
    let display_left = display_bounds.position().x();
    let display_top = display_bounds.position().y();
    let division_x = display_left + display_bounds.size().width() / 3.0;
    let max_x =
        (display_left + display_bounds.size().width() - RECORDING_CONTROLS_WIDTH).max(display_left);
    let pos_x = (division_x - RECORDING_CONTROLS_WIDTH / 2.0).clamp(display_left, max_x);
    let max_y =
        (display_top + display_bounds.size().height() - RECORDING_CONTROLS_HEIGHT).max(display_top);
    let pos_y = (display_top + RECORDING_CONTROLS_TOP_MARGIN).clamp(display_top, max_y);
    (pos_x, pos_y)
}

#[cfg(test)]
fn should_apply_recording_controls_initial_position(reused_window: bool) -> bool {
    !reused_window
}

pub fn calculate_recording_controls_position_for_target(
    capture_target: &ScreenCaptureTarget,
) -> Option<(f64, f64)> {
    let display_bounds = capture_target.display()?.raw_handle().logical_bounds()?;
    let area_bounds = match capture_target {
        ScreenCaptureTarget::Area { bounds, .. } => *bounds,
        _ => LogicalBounds::new(
            scap_targets::bounds::LogicalPosition::new(0.0, 0.0),
            display_bounds.size(),
        ),
    };
    Some(calculate_area_recording_controls_position(
        display_bounds,
        area_bounds,
    ))
}

pub fn spawn_fake_window_listener(app: AppHandle, window: WebviewWindow) {
    let label = window.label().to_string();
    let is_recording_controls = label == RECORDING_CONTROLS_LABEL;
    let default_ignore = !is_recording_controls;
    let initial_ignore = if is_recording_controls {
        !prepare_recording_controls_default_interaction(&window)
    } else {
        default_ignore
    };
    window.set_ignore_cursor_events(initial_ignore).ok();
    let listeners = app.state::<FakeWindowListeners>();
    let (listener_id, token) = listeners.register(label.clone());

    if is_recording_controls {
        spawn_recording_controls_sanity_checks(app.clone(), window.clone());
    }

    tokio::spawn(async move {
        let listeners = app.state::<FakeWindowListeners>();
        let state = app.state::<FakeWindowBounds>();
        let mut consecutive_errors: u8 = 0;

        loop {
            tokio::select! {
                biased;
                _ = token.cancelled() => {
                    debug!(window = %label, "Fake window listener cancelled");
                    break;
                }
                _ = sleep(TICK_INTERVAL) => {}
            }

            if crate::app_is_exiting(&app) {
                break;
            }

            if crate::power_observer::is_system_asleep() {
                continue;
            }

            if !app.webview_windows().contains_key(&label) {
                debug!(window = %label, "Fake window listener stopping: window no longer exists");
                break;
            }

            let map = state.0.read().await;

            let Some(windows) = map.get(&label) else {
                let ignore = if is_recording_controls {
                    !prepare_recording_controls_default_interaction(&window)
                } else {
                    default_ignore
                };
                if window.set_ignore_cursor_events(ignore).is_err() {
                    consecutive_errors = consecutive_errors.saturating_add(1);
                    if consecutive_errors >= DEAD_WINDOW_ERROR_THRESHOLD {
                        debug!(
                            window = %label,
                            "Fake window listener stopping: window handle is no longer responsive"
                        );
                        break;
                    }
                } else {
                    consecutive_errors = 0;
                }
                continue;
            };

            let (Ok(window_position), Ok(mouse_position), Ok(scale_factor)) = (
                window.outer_position(),
                window.cursor_position(),
                window.scale_factor(),
            ) else {
                consecutive_errors = consecutive_errors.saturating_add(1);
                if consecutive_errors >= DEAD_WINDOW_ERROR_THRESHOLD {
                    debug!(
                        window = %label,
                        "Fake window listener stopping: repeated failures querying window state"
                    );
                    break;
                }
                let ignore = if is_recording_controls {
                    !prepare_recording_controls_default_interaction(&window)
                } else {
                    default_ignore
                };
                let _ = window.set_ignore_cursor_events(ignore);
                continue;
            };

            consecutive_errors = 0;
            let allow_default_interaction = if is_recording_controls {
                prepare_recording_controls_default_interaction(&window)
            } else {
                false
            };

            let ignore = should_ignore_cursor_events(
                window_position,
                mouse_position,
                scale_factor,
                windows,
                default_ignore,
                allow_default_interaction,
            );

            window.set_ignore_cursor_events(ignore).ok();

            let focused = window.is_focused().unwrap_or(false);
            if !ignore {
                if !focused {
                    window.set_focus().ok();
                }
            } else if focused {
                window.set_ignore_cursor_events(ignore).ok();
            }
        }

        if is_recording_controls {
            let ignore = !prepare_recording_controls_default_interaction(&window);
            let _ = window.set_ignore_cursor_events(ignore);
        }

        listeners.finish(&label, listener_id);

        {
            let mut map = state.0.write().await;
            map.remove(&label);
        }
    });
}

pub fn cancel_fake_window_listener(app: &AppHandle, label: &str) {
    if let Some(listeners) = app.try_state::<FakeWindowListeners>() {
        listeners.cancel(label);
    }
}

pub fn cancel_all_fake_window_listeners(app: &AppHandle) {
    if let Some(listeners) = app.try_state::<FakeWindowListeners>() {
        listeners.cancel_all();
    }
}

pub fn init(app: &AppHandle) {
    app.manage(FakeWindowBounds(Default::default()));
    app.manage(FakeWindowListeners::default());
}

#[cfg(test)]
mod tests {
    use super::*;
    use scap_targets::bounds::{LogicalPosition, LogicalSize};

    fn bounds(x: f64, y: f64, width: f64, height: f64) -> LogicalBounds {
        LogicalBounds::new(LogicalPosition::new(x, y), LogicalSize::new(width, height))
    }

    #[test]
    fn recording_controls_without_bounds_are_interactive() {
        assert!(!should_ignore_cursor_events(
            tauri::PhysicalPosition::new(100, 200),
            tauri::PhysicalPosition::new(150.0, 240.0),
            2.0,
            &HashMap::new(),
            false,
            true,
        ));
    }

    #[test]
    fn recording_controls_without_bounds_pass_through_when_window_is_large() {
        assert!(should_ignore_cursor_events(
            tauri::PhysicalPosition::new(0, 0),
            tauri::PhysicalPosition::new(150.0, 240.0),
            2.0,
            &HashMap::new(),
            false,
            false,
        ));
    }

    #[test]
    fn non_recording_windows_without_bounds_pass_through() {
        assert!(should_ignore_cursor_events(
            tauri::PhysicalPosition::new(100, 200),
            tauri::PhysicalPosition::new(150.0, 240.0),
            2.0,
            &HashMap::new(),
            true,
            false,
        ));
    }

    #[test]
    fn cursor_inside_registered_bounds_is_interactive() {
        let mut windows = HashMap::new();
        windows.insert("controls".to_string(), bounds(10.0, 20.0, 100.0, 40.0));

        assert!(!should_ignore_cursor_events(
            tauri::PhysicalPosition::new(100, 200),
            tauri::PhysicalPosition::new(150.0, 250.0),
            2.0,
            &windows,
            false,
            true,
        ));
    }

    #[test]
    fn cursor_outside_registered_bounds_passes_through() {
        let mut windows = HashMap::new();
        windows.insert("controls".to_string(), bounds(10.0, 20.0, 100.0, 40.0));

        assert!(should_ignore_cursor_events(
            tauri::PhysicalPosition::new(100, 200),
            tauri::PhysicalPosition::new(50.0, 250.0),
            2.0,
            &windows,
            false,
            true,
        ));
    }

    #[test]
    fn zero_sized_recording_bounds_fail_open() {
        let mut windows = HashMap::new();
        windows.insert("controls".to_string(), bounds(10.0, 20.0, 0.0, 40.0));

        assert!(!should_ignore_cursor_events(
            tauri::PhysicalPosition::new(100, 200),
            tauri::PhysicalPosition::new(50.0, 250.0),
            2.0,
            &windows,
            false,
            true,
        ));
    }

    #[test]
    fn oversized_bounds_do_not_make_the_window_interactive() {
        let mut windows = HashMap::new();
        windows.insert("controls".to_string(), bounds(0.0, 0.0, 1440.0, 900.0));

        assert!(should_ignore_cursor_events(
            tauri::PhysicalPosition::new(0, 0),
            tauri::PhysicalPosition::new(150.0, 240.0),
            2.0,
            &windows,
            false,
            false,
        ));
    }

    #[test]
    fn recording_controls_default_interaction_is_size_limited() {
        assert!(recording_controls_size_allows_default_interaction(
            tauri::PhysicalSize::new(640, 300),
            2.0,
        ));
        assert!(!recording_controls_size_allows_default_interaction(
            tauri::PhysicalSize::new(1920, 1080),
            2.0,
        ));
    }

    #[test]
    fn area_recording_controls_start_at_the_upper_left_third() {
        let display = bounds(100.0, 200.0, 1920.0, 1080.0);
        let area = bounds(200.0, 100.0, 800.0, 500.0);

        let position = calculate_area_recording_controls_position(display, area);

        assert_eq!(position, (580.0, 216.0));
    }

    #[test]
    fn area_recording_controls_use_the_same_initial_anchor_near_the_bottom() {
        let display = bounds(0.0, 0.0, 1920.0, 1080.0);
        let area = bounds(300.0, 600.0, 800.0, 440.0);

        let position = calculate_area_recording_controls_position(display, area);

        assert_eq!(position, (480.0, 16.0));
    }

    #[test]
    fn area_recording_controls_use_the_same_initial_anchor_for_tall_areas() {
        let display = bounds(0.0, 0.0, 1920.0, 1080.0);
        let area = bounds(300.0, 40.0, 800.0, 1000.0);

        let position = calculate_area_recording_controls_position(display, area);

        assert_eq!(position, (480.0, 16.0));
    }

    #[test]
    fn area_recording_controls_stay_within_horizontal_display_edges() {
        let display = bounds(100.0, 200.0, 1920.0, 1080.0);
        let left_area = bounds(0.0, 100.0, 150.0, 300.0);
        let right_area = bounds(1770.0, 100.0, 150.0, 300.0);

        let left_position = calculate_area_recording_controls_position(display, left_area);
        let right_position = calculate_area_recording_controls_position(display, right_area);

        assert_eq!(left_position.0, 580.0);
        assert_eq!(right_position.0, 580.0);
    }

    #[test]
    fn reused_recording_controls_keep_the_user_position() {
        assert!(should_apply_recording_controls_initial_position(false));
        assert!(!should_apply_recording_controls_initial_position(true));
    }
}
