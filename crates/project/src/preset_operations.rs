use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    BackgroundSource, BackgroundSourceBinding, MotionConfiguration, ProjectConfiguration,
    ProjectTransactionError, SourceAudioTrackConfiguration, mutate_project,
};

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentCaptionLanguageMode {
    #[default]
    Source,
    Bilingual,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentCaptionSegmentation {
    SourceTimed,
    #[default]
    SemanticUnits,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentPausePolicy {
    #[default]
    Adaptive,
    Preserve,
    Tight,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentRetakePolicy {
    PreferLaterComplete,
    PreserveAll,
    #[default]
    Ask,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentMotionEngine {
    #[default]
    Remotion,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentActiveScreenDemoPolicy {
    #[default]
    AvoidOverlay,
    AllowOverlay,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentMotionBackdrop {
    #[default]
    DimFullFrame,
    Transparent,
    NoBackdrop,
}

#[derive(Type, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct AgentCaptionPreferences {
    pub language_mode: AgentCaptionLanguageMode,
    pub segmentation: AgentCaptionSegmentation,
    pub rewrite_for_readability: bool,
    pub max_lines: u8,
}

impl Default for AgentCaptionPreferences {
    fn default() -> Self {
        Self {
            language_mode: AgentCaptionLanguageMode::default(),
            segmentation: AgentCaptionSegmentation::default(),
            rewrite_for_readability: false,
            max_lines: 2,
        }
    }
}

#[derive(Type, Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct AgentCutPreferences {
    pub pause_policy: AgentPausePolicy,
    pub preserve_personal_expression: bool,
    pub remove_standalone_fillers: bool,
    pub retake_policy: AgentRetakePolicy,
}

#[derive(Type, Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct AgentMotionPreferences {
    pub engine: AgentMotionEngine,
    pub active_screen_demo: AgentActiveScreenDemoPolicy,
    pub backdrop: AgentMotionBackdrop,
}

#[derive(Type, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct AgentEditingProfile {
    pub schema_version: u32,
    pub captions: AgentCaptionPreferences,
    pub editing: AgentCutPreferences,
    pub motion: AgentMotionPreferences,
}

impl Default for AgentEditingProfile {
    fn default() -> Self {
        Self {
            schema_version: 1,
            captions: AgentCaptionPreferences::default(),
            editing: AgentCutPreferences::default(),
            motion: AgentMotionPreferences::default(),
        }
    }
}

impl AgentEditingProfile {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err(format!(
                "agentProfile schemaVersion must be 1, found {}",
                self.schema_version
            ));
        }
        if !(1..=4).contains(&self.captions.max_lines) {
            return Err("agentProfile captions.maxLines must be between 1 and 4".into());
        }
        Ok(())
    }
}

/// Project presets keep reusable presentation choices, never content tied to
/// one recording. The store format remains ProjectConfiguration-compatible so
/// existing presets continue to deserialize across upgrades.
pub fn reusable_preset_configuration(project: &ProjectConfiguration) -> ProjectConfiguration {
    let mut preset = project.clone();
    if let (Some(captions), Some(timeline)) = (preset.captions.as_mut(), project.timeline.as_ref())
    {
        for row in &timeline.caption_segments {
            let id = row.track_id.as_deref().unwrap_or("default");
            if !captions
                .settings
                .track_styles
                .iter()
                .any(|s| s.track_id == id)
            {
                captions
                    .settings
                    .track_styles
                    .push(crate::CaptionTrackStyle {
                        track_id: id.to_string(),
                        font_size: row.font_size_override.unwrap_or(captions.settings.size),
                    });
            }
            if !captions
                .settings
                .track_positions
                .iter()
                .any(|s| s.track_id == id)
            {
                if let Some(position) = &row.position_override {
                    captions
                        .settings
                        .track_positions
                        .push(crate::CaptionTrackPosition {
                            track_id: id.to_string(),
                            position: position.clone(),
                            manual_position: row.manual_position_override,
                        });
                }
            }
        }
    }
    preset.project_revision = 0;
    preset.timeline = None;
    preset.clips.clear();
    preset.annotations.clear();
    preset.keyboard = None;
    preset.motion = MotionConfiguration::default();
    preset.background.source_binding =
        match (&preset.background.source, preset.background.source_binding) {
            (
                BackgroundSource::Image { path: Some(path) }
                | BackgroundSource::Wallpaper { path: Some(path) },
                _,
            ) if path.contains("current-desktop-background") => {
                Some(BackgroundSourceBinding::CurrentDesktop)
            }
            (
                BackgroundSource::Image { path: None } | BackgroundSource::Wallpaper { path: None },
                Some(BackgroundSourceBinding::CurrentDesktop),
            ) => Some(BackgroundSourceBinding::CurrentDesktop),
            _ => None,
        };
    preset.background.source = match &preset.background.source {
        BackgroundSource::Image { .. } | BackgroundSource::Wallpaper { .. } => {
            BackgroundSource::Wallpaper { path: None }
        }
        source => source.clone(),
    };
    preset.background.crop = None;
    preset.background.notch = None;
    preset.audio.microphone_track = SourceAudioTrackConfiguration::default();
    preset.audio.system_audio_track = SourceAudioTrackConfiguration::default();
    if let Some(captions) = preset.captions.as_mut() {
        captions.segments.clear();
        captions.source_timed = true;
    }
    preset
}

/// Apply only reusable presentation fields. The current project's revision,
/// media paths, edits, tracks, captions and overlays remain authoritative.
pub fn apply_reusable_preset(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    preset: ProjectConfiguration,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    let project_path = project_path.as_ref().to_path_buf();
    let desktop_snapshot = resolve_desktop_snapshot(&project_path);
    mutate_project(&project_path, expected_revision, move |project| {
        project.aspect_ratio = preset.aspect_ratio;

        let background_source = match preset.background.source_binding {
            Some(BackgroundSourceBinding::CurrentDesktop) => desktop_snapshot
                .clone()
                .map(|path| BackgroundSource::Wallpaper { path: Some(path) })
                .unwrap_or_else(|| project.background.source.clone()),
            None => match &preset.background.source {
                BackgroundSource::Image { .. } | BackgroundSource::Wallpaper { .. } => {
                    project.background.source.clone()
                }
                source => source.clone(),
            },
        };
        let background_crop = project.background.crop.clone();
        let background_notch = project.background.notch;
        project.background = preset.background;
        project.background.source = background_source;
        project.background.crop = background_crop;
        project.background.notch = background_notch;

        project.camera = preset.camera;
        project.cursor = preset.cursor;

        project.audio.mute = preset.audio.mute;
        project.audio.improve = preset.audio.improve;
        project.audio.mic_volume_db = preset.audio.mic_volume_db;
        project.audio.mic_stereo_mode = preset.audio.mic_stereo_mode;
        project.audio.system_volume_db = preset.audio.system_volume_db;

        if let Some(preset_captions) = preset.captions {
            project.captions.get_or_insert_default().settings = preset_captions.settings;
        }

        project.screen_motion_blur = preset.screen_motion_blur;
        project.screen_movement_spring = preset.screen_movement_spring;
        project.color_correction = preset.color_correction;
        Ok(())
    })
}

fn resolve_desktop_snapshot(project_path: &Path) -> Option<String> {
    let assets = project_path.join("assets");
    let stable = assets.join("current-desktop-background.jpg");
    if stable.is_file() {
        return Some(stable.to_string_lossy().into_owned());
    }
    let mut candidates = std::fs::read_dir(assets)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.starts_with("current-desktop-background-") && !name.contains(".pending.")
                })
        })
        .collect::<Vec<_>>();
    candidates.sort();
    candidates
        .pop()
        .map(|path| path.to_string_lossy().into_owned())
}
