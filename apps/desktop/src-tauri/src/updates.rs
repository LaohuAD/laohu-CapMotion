use serde::{Deserialize, Serialize};
use specta::Type;
use std::time::Duration;
use tauri::{AppHandle, Manager, Url};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_specta::Event;
use tokio::sync::{Mutex, Notify};
use tracing::{info, warn};

use crate::general_settings::GeneralSettingsStore;

const UPDATE_ENDPOINT: &str =
    "https://cdn.crabnebula.app/update/cap/cap/{{target}}/{{current_version}}";
const LAOHU_BUNDLE_IDENTIFIER: &str = "com.laohu.capmotion";
const LAOHU_GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/LaohuAD/laohu-CapMotion/releases/latest";

const FIRST_CHECK_DELAY: Duration = Duration::from_secs(60);
const CHECK_INTERVAL: Duration = Duration::from_secs(2 * 60 * 60);
const BUSY_RETRY_DELAY: Duration = Duration::from_secs(5 * 60);
const UPDATE_BUSY_ERROR: &str =
    "Finish your recording, export, or upload before updating or restarting Cap.";

#[derive(Serialize, Deserialize, Type, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub enum UpdateChannel {
    #[default]
    Stable,
    Nightly,
}

#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub version: String,
    pub notes: Option<String>,
    pub channel: UpdateChannel,
    pub download_url: Option<String>,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
}

fn is_laohu_local_identifier(identifier: &str) -> bool {
    identifier == LAOHU_BUNDLE_IDENTIFIER
}

fn normalize_release_tag(tag: &str) -> String {
    tag.trim()
        .strip_prefix('v')
        .or_else(|| tag.trim().strip_prefix("release-"))
        .unwrap_or(tag.trim())
        .to_string()
}

async fn check_laohu_github_release(
    current_version: &semver::Version,
) -> Result<Option<UpdateCheckResult>, String> {
    let response = reqwest::Client::new()
        .get(LAOHU_GITHUB_LATEST_RELEASE_API)
        .header(reqwest::header::USER_AGENT, "CapMotion")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("GitHub Releases request failed: {error}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        // GitHub returns 404 when the repository does not have a release yet.
        return Ok(None);
    }

    let release = response
        .error_for_status()
        .map_err(|error| format!("GitHub Releases returned an error: {error}"))?
        .json::<GithubRelease>()
        .await
        .map_err(|error| format!("GitHub Releases response was invalid: {error}"))?;

    let remote_version = semver::Version::parse(&normalize_release_tag(&release.tag_name))
        .map_err(|error| {
            format!(
                "Unsupported GitHub release tag {}: {error}",
                release.tag_name
            )
        })?;

    if remote_version <= *current_version {
        return Ok(None);
    }

    Ok(Some(UpdateCheckResult {
        version: remote_version.to_string(),
        notes: release.body,
        channel: UpdateChannel::Stable,
        download_url: Some(release.html_url),
    }))
}

#[derive(Serialize, Type, tauri_specta::Event, Clone, Debug)]
pub struct UpdateDownloadProgress {
    pub downloaded: u32,
    pub total: Option<u32>,
}

#[derive(Serialize, Type, tauri_specta::Event, Clone, Debug)]
pub struct UpdateReady {
    pub version: String,
    pub installed: bool,
}

#[derive(Clone)]
struct PendingUpdate {
    update: Update,
    version: String,
    installed: bool,
}

#[derive(Default)]
pub struct UpdatesState {
    pending: Mutex<Option<PendingUpdate>>,
    announced_version: Mutex<Option<String>>,
    install: Mutex<()>,
    notify: Notify,
}

fn current_channel(app: &AppHandle) -> UpdateChannel {
    GeneralSettingsStore::get(app)
        .ok()
        .flatten()
        .map(|s| s.update_channel)
        .unwrap_or_default()
}

fn updater_target() -> Result<String, String> {
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x86_64"
    };

    #[cfg(target_os = "linux")]
    {
        cap_utils::linux_package::updater_target(arch)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let platform = if cfg!(target_os = "macos") {
            "darwin"
        } else {
            "windows"
        };
        Ok(format!("{platform}-{arch}"))
    }
}

fn endpoint(channel: UpdateChannel) -> Result<Url, String> {
    let url = match channel {
        UpdateChannel::Stable => UPDATE_ENDPOINT.to_string(),
        UpdateChannel::Nightly => format!("{UPDATE_ENDPOINT}?channel=nightly"),
    };
    Url::parse(&url).map_err(|e| e.to_string())
}

async fn check_channel(
    app: &AppHandle,
    channel: UpdateChannel,
    allow_stable_downgrade: bool,
) -> Result<Option<Update>, String> {
    let builder = app
        .updater_builder()
        .target(updater_target()?)
        .endpoints(vec![endpoint(channel)?])
        .map_err(|e| e.to_string())?;

    // A user on a nightly prerelease who switches back to Stable should land
    // on the newest stable build even though it is semver-lower than their
    // current version, so any differing non-prerelease remote counts as an
    // update (deliberate downgrade-on-channel-switch semantics). This must
    // ONLY apply when the user's configured channel is Stable: a nightly user
    // on the latest nightly would otherwise see the older stable release
    // qualify and flip-flop between the two channels forever.
    let builder = if allow_stable_downgrade {
        builder.version_comparator(|current, remote| {
            remote.version > current
                || (!current.pre.is_empty()
                    && remote.version.pre.is_empty()
                    && remote.version != current)
        })
    } else {
        builder.version_comparator(|current, remote| remote.version > current)
    };

    builder
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())
}

fn pick_higher_version(a: Option<Update>, b: Option<Update>) -> Option<Update> {
    match (a, b) {
        (Some(a), Some(b)) => {
            match (
                semver::Version::parse(&a.version),
                semver::Version::parse(&b.version),
            ) {
                (Ok(a_version), Ok(b_version)) => Some(if b_version > a_version { b } else { a }),
                (Ok(_), Err(_)) => Some(a),
                _ => Some(b),
            }
        }
        (a, b) => a.or(b),
    }
}

pub async fn check(app: &AppHandle) -> Result<Option<Update>, String> {
    let channel = current_channel(app);

    let stable = check_channel(app, UpdateChannel::Stable, channel == UpdateChannel::Stable).await;

    let update = if channel == UpdateChannel::Nightly {
        let nightly = check_channel(app, UpdateChannel::Nightly, false).await;

        // Both channels can produce a candidate when a stable release was
        // promoted after the last nightly; the higher version wins.
        match (stable, nightly) {
            (Ok(stable), Ok(nightly)) => pick_higher_version(stable, nightly),
            (Ok(update), Err(err)) | (Err(err), Ok(update)) => {
                warn!("Update check failed for one channel: {err}");
                update
            }
            (Err(err), Err(_)) => return Err(err),
        }
    } else {
        stable?
    };

    let state = app.state::<UpdatesState>();
    let mut pending = state.pending.lock().await;
    *pending = update.as_ref().map(|update| PendingUpdate {
        // Keep the installed flag if the background loop already installed
        // this version silently.
        installed: pending
            .as_ref()
            .is_some_and(|p| p.version == update.version && p.installed),
        version: update.version.clone(),
        update: update.clone(),
    });

    Ok(update)
}

async fn download_with_progress(app: &AppHandle, update: &Update) -> Result<Vec<u8>, String> {
    let mut downloaded: u32 = 0;
    update
        .download(
            |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u32);
                let _ = UpdateDownloadProgress {
                    downloaded,
                    total: total.and_then(|t| u32::try_from(t).ok()),
                }
                .emit(app);
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())
}

async fn is_busy(app: &AppHandle) -> bool {
    if crate::export::export_session_active() || crate::upload::upload_session_active() {
        return true;
    }

    let Some(state) = app.try_state::<crate::ArcLock<crate::App>>() else {
        return true;
    };

    state.read().await.is_recording_active_or_pending()
}

#[tauri::command]
#[specta::specta]
pub async fn updates_check(app: AppHandle) -> Result<Option<UpdateCheckResult>, String> {
    if is_laohu_local_identifier(&app.config().identifier) {
        return check_laohu_github_release(&app.package_info().version).await;
    }

    let channel = current_channel(&app);
    Ok(check(&app).await?.map(|update| UpdateCheckResult {
        version: update.version.clone(),
        notes: update.body.clone(),
        channel,
        download_url: None,
    }))
}

#[tauri::command]
#[specta::specta]
pub async fn updates_download_and_install(app: AppHandle) -> Result<(), String> {
    if is_laohu_local_identifier(&app.config().identifier) {
        return Err(
            "CapMotion 第一阶段只打开 GitHub Releases 下载页面，不执行应用内安装".to_string(),
        );
    }

    let state = app.state::<UpdatesState>();
    let _install = state.install.lock().await;

    if is_busy(&app).await {
        return Err(UPDATE_BUSY_ERROR.to_string());
    }

    let pending = match state.pending.lock().await.clone() {
        Some(pending) => pending,
        None => {
            let Some(update) = check(&app).await? else {
                return Err("No update available".to_string());
            };
            PendingUpdate {
                version: update.version.clone(),
                update,
                installed: false,
            }
        }
    };

    // The macOS background loop may have already installed this version
    // silently; restarting is all that's left to do.
    if pending.installed {
        return Ok(());
    }

    let bytes = download_with_progress(&app, &pending.update).await?;

    if is_busy(&app).await {
        return Err(UPDATE_BUSY_ERROR.to_string());
    }

    info!("Installing update {}", pending.version);
    pending.update.install(bytes).map_err(|e| e.to_string())?;

    let mut guard = state.pending.lock().await;
    if let Some(p) = guard.as_mut()
        && p.version == pending.version
    {
        p.installed = true;
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn updates_channel_changed(app: AppHandle) -> Result<(), String> {
    app.state::<UpdatesState>().notify.notify_one();
    Ok(())
}

pub fn spawn_background_loop(app: AppHandle) {
    // Never auto-update dev builds or the independently distributed Laohu build.
    if cfg!(debug_assertions) || is_laohu_local_identifier(&app.config().identifier) {
        return;
    }

    tokio::spawn(async move {
        let mut delay = FIRST_CHECK_DELAY;

        loop {
            {
                let state = app.state::<UpdatesState>();
                tokio::select! {
                    _ = tokio::time::sleep(delay) => {}
                    _ = state.notify.notified() => {}
                }
            }

            delay = CHECK_INTERVAL;

            // Stable updates stay frontend-driven; this loop only owns nightly.
            if current_channel(&app) != UpdateChannel::Nightly {
                continue;
            }

            if is_busy(&app).await {
                delay = BUSY_RETRY_DELAY;
                continue;
            }

            let update = match check(&app).await {
                Ok(Some(update)) => update,
                Ok(None) => continue,
                Err(err) => {
                    warn!("Nightly update check failed: {err}");
                    continue;
                }
            };

            let version = update.version.clone();
            let state = app.state::<UpdatesState>();

            if state.announced_version.lock().await.as_deref() == Some(version.as_str()) {
                continue;
            }

            let installed = if cfg!(target_os = "macos") {
                let _install = state.install.lock().await;
                if is_busy(&app).await {
                    delay = BUSY_RETRY_DELAY;
                    continue;
                }
                let already_installed = state
                    .pending
                    .lock()
                    .await
                    .as_ref()
                    .is_some_and(|p| p.version == version && p.installed);

                if already_installed {
                    true
                } else {
                    let bytes = match update.download(|_, _| {}, || {}).await {
                        Ok(bytes) => bytes,
                        Err(err) => {
                            warn!("Failed to download nightly update {version}: {err}");
                            continue;
                        }
                    };

                    // A recording or export may have started mid-download;
                    // don't touch the install while one is running.
                    if is_busy(&app).await {
                        delay = BUSY_RETRY_DELAY;
                        continue;
                    }

                    // Safe while Cap runs: the .app bundle is swapped in place
                    // and takes effect on relaunch.
                    if let Err(err) = update.install(bytes) {
                        warn!("Failed to install nightly update {version}: {err}");
                        continue;
                    }

                    let mut pending = state.pending.lock().await;
                    if let Some(p) = pending.as_mut()
                        && p.version == version
                    {
                        p.installed = true;
                    }

                    info!("Nightly update {version} installed; restart to apply");
                    true
                }
            } else {
                // Windows (NSIS) install exits the app mid-session and Linux
                // (deb) prompts for privileges, so never auto-install there;
                // announce and let the user trigger the install.
                info!("Nightly update {version} available");
                false
            };

            let _ = UpdateReady {
                version: version.clone(),
                installed,
            }
            .emit(&app);

            *state.announced_version.lock().await = Some(version);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{is_laohu_local_identifier, normalize_release_tag};

    #[test]
    fn only_the_laohu_bundle_uses_the_local_release_channel() {
        assert!(is_laohu_local_identifier("com.laohu.capmotion"));
        assert!(!is_laohu_local_identifier("so.cap.desktop"));
        assert!(!is_laohu_local_identifier("so.cap.desktop.dev"));
    }

    #[test]
    fn github_release_tags_are_normalized_before_version_comparison() {
        assert_eq!(normalize_release_tag("v0.6.1"), "0.6.1");
        assert_eq!(normalize_release_tag("0.6.1"), "0.6.1");
        assert_eq!(normalize_release_tag(" release-0.6.1 "), "0.6.1");
    }
}
