use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ManualFollowConfig {
    pub comfort_zone_ratio: f32,
    pub outer_guard_ratio: f32,
    pub slow_response: f32,
    pub fast_response: f32,
    pub prediction_horizon_secs: f32,
    pub max_lead_ratio: f32,
}

impl Default for ManualFollowConfig {
    fn default() -> Self {
        Self {
            comfort_zone_ratio: 0.35,
            outer_guard_ratio: 0.75,
            slow_response: 18.0,
            fast_response: 32.0,
            prediction_horizon_secs: 0.1,
            max_lead_ratio: 0.2,
        }
    }
}

pub fn advance_manual_follow(
    center: (f32, f32),
    actual_cursor: (f32, f32),
    framing_cursor: (f32, f32),
    cursor_speed: f32,
    amount: f32,
    dt: f32,
    config: ManualFollowConfig,
) -> (f32, f32) {
    let defaults = ManualFollowConfig::default();
    let amount = if amount.is_finite() {
        amount.max(1.0)
    } else {
        2.0
    };
    let viewport_half = 0.5 / amount;
    let comfort_zone_ratio = if config.comfort_zone_ratio.is_finite() {
        config.comfort_zone_ratio.clamp(0.0, 1.0)
    } else {
        defaults.comfort_zone_ratio
    };
    let outer_guard_ratio = if config.outer_guard_ratio.is_finite() {
        config
            .outer_guard_ratio
            .clamp(comfort_zone_ratio, 1.0)
    } else {
        defaults.outer_guard_ratio
    };
    let slow_response = positive_or(config.slow_response, defaults.slow_response);
    let fast_response = positive_or(config.fast_response, defaults.fast_response)
        .max(slow_response);
    let prediction_horizon_secs = non_negative_or(
        config.prediction_horizon_secs,
        defaults.prediction_horizon_secs,
    );
    let max_lead_ratio = non_negative_or(config.max_lead_ratio, defaults.max_lead_ratio);
    let dt = if dt.is_finite() { dt.max(0.0) } else { 0.0 };
    let cursor_speed = if cursor_speed.is_finite() {
        cursor_speed.max(0.0)
    } else {
        0.0
    };
    let max_lead = (viewport_half * 2.0 * max_lead_ratio).max(f32::EPSILON);
    let speed_mix = (cursor_speed * prediction_horizon_secs / max_lead).clamp(0.0, 1.0);
    let response = slow_response + (fast_response - slow_response) * speed_mix;
    let alpha = 1.0 - (-response * dt).exp();
    let comfort_half = viewport_half * comfort_zone_ratio;
    let guard_half = viewport_half * outer_guard_ratio;

    let advance_axis = |center: f32, actual_cursor: f32, framing_cursor: f32| {
        let min_center = viewport_half;
        let max_center = 1.0 - viewport_half;
        let center = finite_or(center, 0.5).clamp(min_center, max_center);
        let actual_cursor = finite_or(actual_cursor, center).clamp(0.0, 1.0);
        let framing_cursor = finite_or(framing_cursor, actual_cursor).clamp(0.0, 1.0);
        let target = if framing_cursor > center + comfort_half {
            framing_cursor - comfort_half
        } else if framing_cursor < center - comfort_half {
            framing_cursor + comfort_half
        } else {
            center
        }
        .clamp(min_center, max_center);
        let smoothed = center + (target - center) * alpha;
        let guarded = if actual_cursor > smoothed + guard_half {
            actual_cursor - guard_half
        } else if actual_cursor < smoothed - guard_half {
            actual_cursor + guard_half
        } else {
            smoothed
        };

        guarded.clamp(min_center, max_center)
    };

    (
        advance_axis(center.0, actual_cursor.0, framing_cursor.0),
        advance_axis(center.1, actual_cursor.1, framing_cursor.1),
    )
}

pub fn manual_follow_center_to_travel(center: f32, amount: f32) -> f32 {
    let amount = if amount.is_finite() {
        amount.max(1.0)
    } else {
        1.0
    };
    if amount <= 1.0 {
        return 0.5;
    }

    let viewport_half = 0.5 / amount;
    let center = finite_or(center, 0.5).clamp(viewport_half, 1.0 - viewport_half);
    ((center - viewport_half) / (1.0 - 2.0 * viewport_half)).clamp(0.0, 1.0)
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() { value } else { fallback }
}

fn positive_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}

fn non_negative_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() && value >= 0.0 {
        value
    } else {
        fallback
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_config_json_receives_predictive_defaults() {
        let config: ManualFollowConfig =
            serde_json::from_str(r#"{"safeZoneRatio":0.6,"response":14}"#).unwrap();

        assert_eq!(config, ManualFollowConfig::default());
    }

    #[test]
    fn actual_and_framing_cursor_inside_comfort_zone_keep_center_fixed() {
        let next = advance_manual_follow(
            (0.5, 0.5),
            (0.55, 0.55),
            (0.58, 0.55),
            0.05,
            2.0,
            1.0 / 60.0,
            ManualFollowConfig::default(),
        );
        assert_eq!(next, (0.5, 0.5));
    }

    #[test]
    fn future_framing_cursor_starts_camera_before_actual_cursor_reaches_edge() {
        let next = advance_manual_follow(
            (0.5, 0.5),
            (0.58, 0.5),
            (0.72, 0.5),
            1.4,
            2.0,
            1.0 / 60.0,
            ManualFollowConfig::default(),
        );
        assert!(next.0 > 0.5);
        assert!(next.0 < 0.72);
        assert_eq!(next.1, 0.5);
    }

    #[test]
    fn fast_cursor_uses_a_stronger_response_than_slow_cursor() {
        let slow = advance_manual_follow(
            (0.5, 0.5),
            (0.6, 0.5),
            (0.72, 0.5),
            0.1,
            2.0,
            1.0 / 60.0,
            ManualFollowConfig::default(),
        );
        let fast = advance_manual_follow(
            (0.5, 0.5),
            (0.6, 0.5),
            (0.72, 0.5),
            2.0,
            2.0,
            1.0 / 60.0,
            ManualFollowConfig::default(),
        );

        assert!(fast.0 > slow.0);
    }

    #[test]
    fn actual_cursor_is_forced_back_inside_outer_guard() {
        let next = advance_manual_follow(
            (0.5, 0.5),
            (0.9, 0.5),
            (0.9, 0.5),
            4.0,
            2.0,
            0.0,
            ManualFollowConfig::default(),
        );
        let viewport_half = 0.25;
        let guard_half = viewport_half * ManualFollowConfig::default().outer_guard_ratio;
        assert!(0.9 - next.0 <= guard_half + f32::EPSILON);
    }

    #[test]
    fn reversed_framing_cursor_changes_direction_immediately() {
        let next = advance_manual_follow(
            (0.6, 0.5),
            (0.55, 0.5),
            (0.35, 0.5),
            2.0,
            2.0,
            1.0 / 60.0,
            ManualFollowConfig::default(),
        );

        assert!(next.0 < 0.6);
    }

    #[test]
    fn follow_center_never_exposes_outside_source() {
        let next = advance_manual_follow(
            (0.75, 0.5),
            (1.0, 0.5),
            (1.0, 0.5),
            4.0,
            2.0,
            1.0,
            ManualFollowConfig::default(),
        );
        assert_eq!(next.0, 0.75);
    }

    #[test]
    fn source_center_converts_to_legacy_travel_space() {
        assert_eq!(manual_follow_center_to_travel(0.25, 2.0), 0.0);
        assert_eq!(manual_follow_center_to_travel(0.5, 2.0), 0.5);
        assert_eq!(manual_follow_center_to_travel(0.75, 2.0), 1.0);
    }
}
