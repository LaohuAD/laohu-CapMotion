use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use cap_project::{
    AgentEditingProfile, CaptionStylePatch, ProjectConfiguration, patch_caption_settings,
    reusable_preset_configuration,
};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetEntry {
    pub name: String,
    pub config: ProjectConfiguration,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_profile: Option<AgentEditingProfile>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PresetsStore {
    pub presets: Vec<PresetEntry>,
    pub default: Option<usize>,
    pub revision: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetMutationReceipt {
    pub ok: bool,
    pub preset: String,
    pub previous_revision: u64,
    pub revision: u64,
}

pub fn default_store_path() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("CAP_PRESETS_STORE") {
        return Ok(PathBuf::from(path));
    }
    dirs::data_dir()
        .map(|base| base.join("com.laohu.capmotion").join("store"))
        .ok_or_else(|| "Could not resolve the CapMotion application data directory".into())
}

pub fn preset_schema() -> Value {
    serde_json::json!({
        "schemaVersion": 1,
        "ownership": {
            "publicCapability": "field schema and validation only",
            "userPreset": "named values stored per operating-system user",
            "projectContent": "never stored in or replaced by a presentation preset"
        },
        "writeSemantics": {
            "projectApply": "project file transaction; an open editor can observe it through project hot reload",
            "presetStore": "transactional on disk; an already-open editor must reload its Tauri store before it can observe an external CLI write"
        },
        "domains": {
            "captions": {
                "command": "cap presets captions-style",
                "fields": [
                    "enabled", "font", "size", "color", "backgroundColor",
                    "backgroundOpacity", "position", "fontWeight",
                    "letterSpacing", "outline", "outlineColor", "outlineWidth",
                    "shadow", "shadowColor", "shadowOpacity", "shadowBlur",
                    "shadowDistance", "shadowAngle", "exportWithSubtitles",
                    "highlightColor", "fadeDuration", "wordTransitionDuration",
                    "activeWordHighlight",
                    "manualPosition", "trackPositions", "trackStyles", "animation", "highlightStyle", "uppercase"
                ],
                "constraints": {
                    "size": "1..400",
                    "trackStyles": "unique trackId; fontSize 1..400; overrides legacy per-cue size",
                    "trackPositions": "unique trackId; named or manual position; normalized coordinates 0..1",
                    "fontWeight": "100..900",
                    "opacity": "0..100",
                    "dimensions": "non-negative finite numbers",
                    "shadow": "one shadow; when outline is enabled it expands from the outline edge"
                }
            },
            "projectPresentation": {
                "command": "cap presets save",
                "fields": [
                    "aspectRatio", "background", "camera", "cursor", "audioMix",
                    "screenMotionBlur", "screenMovementSpring", "colorCorrection"
                ]
            },
            "agentProfile": {
                "command": "cap presets agent-profile",
                "purpose": "stable workflow preferences read by an Agent before editing; never written into a project timeline",
                "optional": true,
                "fields": {
                    "captions": {
                        "languageMode": ["source", "bilingual"],
                        "segmentation": ["sourceTimed", "semanticUnits"],
                        "rewriteForReadability": "boolean",
                        "maxLines": "1..4"
                    },
                    "editing": {
                        "pausePolicy": ["adaptive", "preserve", "tight"],
                        "preservePersonalExpression": "boolean",
                        "removeStandaloneFillers": "boolean",
                        "retakePolicy": ["preferLaterComplete", "preserveAll", "ask"]
                    },
                    "motion": {
                        "engine": ["remotion"],
                        "activeScreenDemo": ["avoidOverlay", "allowOverlay"],
                        "backdrop": ["dimFullFrame", "transparent", "noBackdrop"]
                    }
                }
            }
        },
        "excluded": [
            "timeline", "clips", "annotations", "keyboard events", "caption text",
            "source-audio edits", "Remotion definitions and segments", "file-backed background paths"
        ]
    })
}

pub fn list_presets(store_path: &Path) -> Result<PresetsStore, String> {
    let root = read_root(store_path)?;
    root.get("presets")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("Failed to deserialize presets: {error}"))
        .map(|store| store.unwrap_or_default())
}

pub fn get_preset(store_path: &Path, name: &str) -> Result<PresetEntry, String> {
    list_presets(store_path)?
        .presets
        .into_iter()
        .find(|preset| preset.name == name)
        .ok_or_else(|| format!("Preset '{name}' was not found"))
}

pub fn save_project_preset(
    store_path: &Path,
    expected_revision: u64,
    name: &str,
    project: &ProjectConfiguration,
    set_default: bool,
) -> Result<PresetMutationReceipt, String> {
    if name.trim().is_empty() {
        return Err("Preset name cannot be empty".into());
    }
    let mut config = reusable_preset_configuration(project);
    if let Some(captions) = config.captions.as_mut() {
        captions.settings.preset = format!("user:{name}");
    }
    mutate_store(store_path, expected_revision, name, move |store| {
        let index = match store.presets.iter().position(|preset| preset.name == name) {
            Some(index) => {
                store.presets[index].config = config;
                index
            }
            None => {
                store.presets.push(PresetEntry {
                    name: name.to_string(),
                    config,
                    agent_profile: None,
                });
                store.presets.len() - 1
            }
        };
        if set_default {
            store.default = Some(index);
        }
        Ok(())
    })
}

pub fn set_agent_profile(
    store_path: &Path,
    expected_revision: u64,
    name: &str,
    profile: AgentEditingProfile,
) -> Result<PresetMutationReceipt, String> {
    profile.validate()?;
    mutate_store(store_path, expected_revision, name, move |store| {
        let preset = store
            .presets
            .iter_mut()
            .find(|preset| preset.name == name)
            .ok_or_else(|| format!("Preset '{name}' was not found"))?;
        preset.agent_profile = Some(profile);
        Ok(())
    })
}

pub fn patch_preset_caption_style(
    store_path: &Path,
    expected_revision: u64,
    name: &str,
    patch: CaptionStylePatch,
) -> Result<PresetMutationReceipt, String> {
    mutate_store(store_path, expected_revision, name, move |store| {
        let preset = store
            .presets
            .iter_mut()
            .find(|preset| preset.name == name)
            .ok_or_else(|| format!("Preset '{name}' was not found"))?;
        preset.config = reusable_preset_configuration(&preset.config);
        let settings = &mut preset.config.captions.get_or_insert_default().settings;
        patch_caption_settings(settings, patch)?;
        settings.preset = format!("user:{name}");
        Ok(())
    })
}

fn read_root(path: &Path) -> Result<Map<String, Value>, String> {
    if !path.exists() {
        return Ok(Map::new());
    }
    let bytes = fs::read(path)
        .map_err(|error| format!("Failed to read preset store {}: {error}", path.display()))?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Failed to parse preset store {}: {error}", path.display()))?;
    value
        .as_object()
        .cloned()
        .ok_or_else(|| "Preset store root must be a JSON object".into())
}

fn mutate_store(
    path: &Path,
    expected_revision: u64,
    preset_name: &str,
    mutate: impl FnOnce(&mut PresetsStore) -> Result<(), String>,
) -> Result<PresetMutationReceipt, String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Preset store {} has no parent directory", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    let lock_path = parent.join(".cap-presets.lock");
    let lock_file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(&lock_path)
        .map_err(|error| format!("Failed to open preset lock: {error}"))?;
    lock_file
        .lock_exclusive()
        .map_err(|error| format!("Failed to lock preset store: {error}"))?;

    let mut root = read_root(path)?;
    let mut store: PresetsStore = root
        .get("presets")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("Failed to deserialize presets: {error}"))?
        .unwrap_or_default();
    if store.revision != expected_revision {
        return Err(format!(
            "Preset revision conflict: expected {expected_revision}, actual {}",
            store.revision
        ));
    }
    mutate(&mut store)?;
    let previous_revision = store.revision;
    store.revision += 1;
    root.insert(
        "presets".into(),
        serde_json::to_value(&store)
            .map_err(|error| format!("Failed to serialize presets: {error}"))?,
    );

    let temporary_path = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("store"),
        uuid::Uuid::new_v4()
    ));
    let write_result = (|| -> Result<(), String> {
        let mut temporary = File::create(&temporary_path)
            .map_err(|error| format!("Failed to create preset temp file: {error}"))?;
        serde_json::to_writer_pretty(&mut temporary, &Value::Object(root))
            .map_err(|error| format!("Failed to write preset store: {error}"))?;
        temporary
            .write_all(b"\n")
            .map_err(|error| format!("Failed to finish preset store: {error}"))?;
        temporary
            .sync_all()
            .map_err(|error| format!("Failed to sync preset store: {error}"))?;
        fs::rename(&temporary_path, path)
            .map_err(|error| format!("Failed to replace preset store: {error}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result?;

    Ok(PresetMutationReceipt {
        ok: true,
        preset: preset_name.to_string(),
        previous_revision,
        revision: store.revision,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use cap_project::{
        AgentEditingProfile, CaptionStylePatch, ProjectConfiguration, SourceAudioCut,
    };
    use serde_json::json;

    use super::{
        get_preset, list_presets, patch_preset_caption_style, save_project_preset,
        set_agent_profile,
    };

    fn seed_store(path: &std::path::Path, revision: u64) {
        let config = ProjectConfiguration::default();
        fs::write(
            path,
            serde_json::to_vec_pretty(&json!({
                "presets": {
                    "revision": revision,
                    "default": 0,
                    "presets": [{"name": "Laohu", "config": config}]
                },
                "unrelated": {"keep": true}
            }))
            .unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn saves_only_reusable_project_settings_and_increments_revision() {
        let directory = tempfile::tempdir().unwrap();
        let store_path = directory.path().join("store");
        seed_store(&store_path, 2);
        let mut project = ProjectConfiguration::default();
        project.audio.microphone_track.expanded = true;
        project.audio.microphone_track.cuts.push(SourceAudioCut {
            recording_clip: 0,
            time: 4.0,
        });
        project.background.source = serde_json::from_value(json!({
            "type": "image",
            "path": "/private/project-background.png"
        }))
        .unwrap();

        let receipt = save_project_preset(&store_path, 2, "Laohu", &project, false).unwrap();
        assert_eq!(receipt.previous_revision, 2);
        assert_eq!(receipt.revision, 3);

        let preset = get_preset(&store_path, "Laohu").unwrap();
        assert!(preset.config.audio.microphone_track.cuts.is_empty());
        assert!(!preset.config.audio.microphone_track.expanded);
        assert_eq!(
            serde_json::to_value(preset.config.background.source).unwrap(),
            json!({"type": "wallpaper", "path": null})
        );
    }

    #[test]
    fn caption_patch_is_validated_atomic_and_preserves_other_store_keys() {
        let directory = tempfile::tempdir().unwrap();
        let store_path = directory.path().join("store");
        seed_store(&store_path, 4);

        let receipt = patch_preset_caption_style(
            &store_path,
            4,
            "Laohu",
            CaptionStylePatch {
                font: Some("Source Han Sans CN VF".into()),
                letter_spacing: Some(1.5),
                preset: Some("user:Laohu".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(receipt.revision, 5);

        let preset = get_preset(&store_path, "Laohu").unwrap();
        let settings = preset.config.captions.unwrap().settings;
        assert_eq!(settings.font, "Source Han Sans CN VF");
        assert_eq!(settings.letter_spacing, 1.5);
        assert_eq!(settings.preset, "user:Laohu");

        let raw: serde_json::Value =
            serde_json::from_slice(&fs::read(&store_path).unwrap()).unwrap();
        assert_eq!(raw["unrelated"]["keep"], json!(true));

        let stale = patch_preset_caption_style(
            &store_path,
            4,
            "Laohu",
            CaptionStylePatch {
                size: Some(60),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(stale.to_string().contains("revision conflict"));
        assert_eq!(list_presets(&store_path).unwrap().revision, 5);
    }

    #[test]
    fn agent_profile_is_optional_for_legacy_presets_and_survives_visual_saves() {
        let directory = tempfile::tempdir().unwrap();
        let store_path = directory.path().join("store");
        seed_store(&store_path, 6);
        assert!(
            get_preset(&store_path, "Laohu")
                .unwrap()
                .agent_profile
                .is_none()
        );

        let profile: AgentEditingProfile = serde_json::from_value(json!({
            "captions": {
                "languageMode": "bilingual",
                "segmentation": "semanticUnits",
                "rewriteForReadability": true,
                "maxLines": 2
            },
            "editing": {
                "pausePolicy": "adaptive",
                "preservePersonalExpression": true,
                "removeStandaloneFillers": true,
                "retakePolicy": "preferLaterComplete"
            },
            "motion": {
                "engine": "remotion",
                "activeScreenDemo": "avoidOverlay",
                "backdrop": "dimFullFrame"
            }
        }))
        .unwrap();
        let receipt = set_agent_profile(&store_path, 6, "Laohu", profile.clone()).unwrap();
        assert_eq!(receipt.revision, 7);
        assert_eq!(
            get_preset(&store_path, "Laohu").unwrap().agent_profile,
            Some(profile.clone())
        );

        save_project_preset(
            &store_path,
            7,
            "Laohu",
            &ProjectConfiguration::default(),
            false,
        )
        .unwrap();
        assert_eq!(
            get_preset(&store_path, "Laohu").unwrap().agent_profile,
            Some(profile)
        );
    }

    #[test]
    fn schema_exposes_public_parameters_without_personal_values() {
        let schema = super::preset_schema();
        assert_eq!(schema["schemaVersion"], json!(1));
        assert!(
            schema["domains"]["captions"]["fields"]
                .as_array()
                .unwrap()
                .contains(&json!("letterSpacing"))
        );
        assert!(
            schema["domains"]["captions"]["fields"]
                .as_array()
                .unwrap()
                .contains(&json!("shadowBlur"))
        );
        assert!(
            !schema["domains"]["captions"]["fields"]
                .as_array()
                .unwrap()
                .contains(&json!("outlineShadow"))
        );
        assert!(
            !schema["domains"]["captions"]["fields"]
                .as_array()
                .unwrap()
                .contains(&json!("lingerDuration"))
        );
        assert!(
            !schema["domains"]["captions"]["fields"]
                .as_array()
                .unwrap()
                .contains(&json!("italic"))
        );
        assert_eq!(
            schema["writeSemantics"]["projectApply"],
            json!(
                "project file transaction; an open editor can observe it through project hot reload"
            )
        );
        assert!(
            schema["writeSemantics"]["presetStore"]
                .as_str()
                .unwrap()
                .contains("reload")
        );
        assert_eq!(
            schema["domains"]["agentProfile"]["command"],
            json!("cap presets agent-profile")
        );
        assert_eq!(
            schema["domains"]["agentProfile"]["fields"]["motion"]["engine"],
            json!(["remotion"])
        );
        assert!(!schema.to_string().contains("Source Han Sans"));
        assert!(!schema.to_string().contains("Laohu"));
    }
}
