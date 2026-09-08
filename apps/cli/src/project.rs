use std::path::{Path, PathBuf};

use cap_project::{
    InstantRecordingMeta, RecordingMeta, RecordingMetaInner, StudioRecordingMeta,
    StudioRecordingStatus,
};
use serde::{Deserialize, Serialize};

use crate::{OutputFormat, write_json};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInspection {
    pub project_path: PathBuf,
    pub output_path: PathBuf,
    pub revision: u64,
    /// camelCase convenience fields so agents never reach into the snake_case `meta` passthrough.
    pub name: String,
    pub recording_type: &'static str,
    pub meta: RecordingMeta,
    pub config: cap_project::ProjectConfiguration,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptionImportDocument {
    segments: Vec<cap_project::CaptionSegment>,
    #[serde(default)]
    source_timed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CaptionTracksDocument {
    schema: String,
    tracks: Vec<CaptionTrackDocument>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CaptionTrackDocument {
    id: String,
    label: String,
    language: String,
    style: CaptionTrackStyle,
    segments: Vec<cap_project::CaptionTrackSegment>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CaptionTrackStyle {
    font_size: u32,
    position: String,
    manual_position: cap_project::XY<f32>,
}

pub fn captions_import(
    project_path: PathBuf,
    expected_revision: u64,
    captions_json: &Path,
    format: OutputFormat,
) -> Result<(), String> {
    let input = std::fs::read_to_string(captions_json)
        .map_err(|e| format!("Failed to read caption JSON: {e}"))?;
    let document: CaptionImportDocument =
        serde_json::from_str(&input).map_err(|e| format!("Invalid caption import JSON: {e}"))?;
    let caption_count = document.segments.len();
    let updated = cap_project::import_caption_segments(
        project_path,
        expected_revision,
        document.segments,
        document.source_timed,
    )
    .map_err(|e| format!("Failed to import captions: {e}"))?;

    match format {
        OutputFormat::Text => {
            println!("Imported {caption_count} caption segments");
            println!("revision: {}", updated.project_revision);
        }
        OutputFormat::Json => crate::write_json(&serde_json::json!({
            "ok": true,
            "revision": updated.project_revision,
            "captionCount": caption_count,
            "sourceTimed": document.source_timed,
        }))?,
    }
    Ok(())
}

pub fn captions_style(
    project_path: PathBuf,
    expected_revision: u64,
    style_json: &Path,
    format: OutputFormat,
) -> Result<(), String> {
    let input = std::fs::read_to_string(style_json)
        .map_err(|e| format!("Failed to read caption style JSON: {e}"))?;
    let patch: cap_project::CaptionStylePatch =
        serde_json::from_str(&input).map_err(|e| format!("Invalid caption style JSON: {e}"))?;
    let updated = cap_project::update_caption_style(project_path, expected_revision, patch)
        .map_err(|e| format!("Failed to update caption style: {e}"))?;

    match format {
        OutputFormat::Text => println!(
            "Updated caption style\nrevision: {}",
            updated.project_revision
        ),
        OutputFormat::Json => crate::write_json(&serde_json::json!({
            "ok": true,
            "revision": updated.project_revision,
        }))?,
    }
    Ok(())
}

pub fn captions_materialize(
    project_path: PathBuf,
    expected_revision: u64,
    tracks_json: &Path,
    format: OutputFormat,
) -> Result<(), String> {
    let input = std::fs::read_to_string(tracks_json)
        .map_err(|e| format!("Failed to read caption tracks JSON: {e}"))?;
    let document: CaptionTracksDocument =
        serde_json::from_str(&input).map_err(|e| format!("Invalid caption tracks JSON: {e}"))?;
    if document.schema != "laohu.cap-caption-tracks/1" {
        return Err(format!(
            "Unsupported caption track schema: {}",
            document.schema
        ));
    }
    let track_count = document.tracks.len();
    let mut segments = Vec::new();
    for track in document.tracks {
        for mut segment in track.segments {
            segment.track_id = Some(track.id.clone());
            segment.track_label = Some(track.label.clone());
            segment.language = Some(track.language.clone());
            segment.font_size_override = Some(track.style.font_size);
            segment.position_override = Some(track.style.position.clone());
            segment.manual_position_override = Some(track.style.manual_position);
            segments.push(segment);
        }
    }
    let caption_count = segments.len();
    let updated =
        cap_project::materialize_caption_tracks(project_path, expected_revision, segments)
            .map_err(|e| format!("Failed to materialize caption tracks: {e}"))?;

    match format {
        OutputFormat::Text => println!(
            "Materialized {caption_count} caption segments across {track_count} tracks\nrevision: {}",
            updated.project_revision
        ),
        OutputFormat::Json => crate::write_json(&serde_json::json!({
            "ok": true,
            "revision": updated.project_revision,
            "captionTrackCount": track_count,
            "captionSegmentCount": caption_count,
            "displayMode": "materialized",
        }))?,
    }
    Ok(())
}

pub fn presentation_patch(
    project_path: PathBuf,
    expected_revision: u64,
    patch_json: &Path,
    format: OutputFormat,
) -> Result<(), String> {
    let input = std::fs::read_to_string(patch_json)
        .map_err(|e| format!("Failed to read presentation patch JSON: {e}"))?;
    let patch: cap_project::ProjectPresentationPatch = serde_json::from_str(&input)
        .map_err(|e| format!("Invalid presentation patch JSON: {e}"))?;
    let updated = cap_project::update_project_presentation(project_path, expected_revision, patch)
        .map_err(|e| format!("Failed to update project presentation: {e}"))?;

    match format {
        OutputFormat::Text => println!(
            "Updated project presentation\nrevision: {}",
            updated.project_revision
        ),
        OutputFormat::Json => crate::write_json(&serde_json::json!({
            "ok": true,
            "revision": updated.project_revision,
        }))?,
    }
    Ok(())
}

pub fn preset_apply(
    project_path: PathBuf,
    expected_revision: u64,
    name: &str,
    store_path: Option<PathBuf>,
    format: OutputFormat,
) -> Result<(), String> {
    let store_path = store_path
        .map(Ok)
        .unwrap_or_else(crate::presets::default_store_path)?;
    let preset = crate::presets::get_preset(&store_path, name)?;
    let updated =
        cap_project::apply_reusable_preset(&project_path, expected_revision, preset.config)
            .map_err(|error| format!("Failed to apply preset: {error}"))?;

    match format {
        OutputFormat::Json => crate::write_json(&serde_json::json!({
            "ok": true,
            "preset": name,
            "revision": updated.project_revision,
        }))?,
        OutputFormat::Text => {
            println!("applied preset: {name}");
            println!("revision: {}", updated.project_revision);
        }
    }
    Ok(())
}

pub fn config_get(project_path: PathBuf) -> Result<(), String> {
    let config = match cap_project::ProjectConfiguration::load(&project_path) {
        Ok(config) => config,
        // Instant and un-edited studio recordings have no project-config.json; return the
        // effective default the editor/exporter would use rather than erroring.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => serde_json::from_str("{}")
            .map_err(|e| format!("Failed to build default project config: {e}"))?,
        Err(e) => return Err(format!("Failed to load project config: {e}")),
    };
    crate::write_json(&config)
}

pub fn config_set(
    project_path: PathBuf,
    settings_json: &str,
    format: OutputFormat,
) -> Result<(), String> {
    let config: cap_project::ProjectConfiguration = serde_json::from_str(settings_json)
        .map_err(|e| format!("Invalid project config JSON: {e}"))?;
    let updated = cap_project::replace_project_configuration(project_path, config)
        .map_err(|e| format!("Failed to replace project config: {e}"))?;
    match format {
        OutputFormat::Text => println!(
            "Replaced project configuration\nrevision: {}",
            updated.project_revision
        ),
        OutputFormat::Json => crate::write_json(&serde_json::json!({
            "ok": true,
            "revision": updated.project_revision,
        }))?,
    }
    Ok(())
}

pub fn inspect(project_path: PathBuf, format: OutputFormat) -> Result<(), String> {
    let meta = RecordingMeta::load_for_project(&project_path)
        .map_err(|e| format!("Failed to load recording meta: {e}"))?;
    let output_path = meta.output_path();
    let config = meta.project_config();

    match format {
        OutputFormat::Text => {
            println!("project: {}", project_path.display());
            println!("name: {}", meta.pretty_name);
            println!("type: {}", recording_type(&meta));
            println!("output: {}", output_path.display());
            println!("revision: {}", config.project_revision);
            Ok(())
        }
        OutputFormat::Json => write_json(&ProjectInspection {
            project_path,
            output_path,
            revision: config.project_revision,
            name: meta.pretty_name.clone(),
            recording_type: recording_type(&meta),
            meta,
            config,
        }),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileCheck {
    role: &'static str,
    path: PathBuf,
    exists: bool,
    required: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationReport {
    project_path: PathBuf,
    valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    recording_type: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    checks: Vec<FileCheck>,
    missing: Vec<PathBuf>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    problems: Vec<String>,
}

fn recording_type(meta: &RecordingMeta) -> &'static str {
    match meta.inner {
        RecordingMetaInner::Studio(_) => "studio",
        RecordingMetaInner::Instant(_) => "instant",
    }
}

fn required_check(role: &'static str, path: PathBuf) -> FileCheck {
    FileCheck {
        exists: path.exists(),
        role,
        path,
        required: true,
    }
}

fn optional_check(role: &'static str, path: PathBuf) -> FileCheck {
    FileCheck {
        exists: path.exists(),
        role,
        path,
        required: false,
    }
}

fn studio_checks(meta: &RecordingMeta, studio: &StudioRecordingMeta) -> Vec<FileCheck> {
    let mut checks = Vec::new();

    match studio {
        StudioRecordingMeta::SingleSegment { segment } => {
            checks.push(required_check(
                "displayVideo",
                meta.path(&segment.display.path),
            ));
            if let Some(camera) = &segment.camera {
                checks.push(required_check("camera", meta.path(&camera.path)));
            }
            if let Some(audio) = &segment.audio {
                checks.push(required_check("audio", meta.path(&audio.path)));
            }
            if let Some(cursor) = &segment.cursor {
                checks.push(optional_check("cursor", meta.path(cursor)));
            }
        }
        StudioRecordingMeta::MultipleSegments { inner } => {
            for segment in &inner.segments {
                checks.push(required_check(
                    "displayVideo",
                    meta.path(&segment.display.path),
                ));
                if let Some(camera) = &segment.camera {
                    checks.push(required_check("camera", meta.path(&camera.path)));
                }
                if let Some(mic) = &segment.mic {
                    checks.push(required_check("mic", meta.path(&mic.path)));
                }
                if let Some(system_audio) = &segment.system_audio {
                    checks.push(required_check("systemAudio", meta.path(&system_audio.path)));
                }
                if let Some(cursor) = &segment.cursor {
                    checks.push(optional_check("cursor", meta.path(cursor)));
                }
            }
        }
    }

    checks
}

fn studio_problems(studio: &StudioRecordingMeta) -> Vec<String> {
    let mut problems = Vec::new();

    if let StudioRecordingMeta::MultipleSegments { inner } = studio {
        if inner.segments.is_empty() {
            problems.push("studio recording has no segments".to_string());
        }
    }

    match studio.status() {
        StudioRecordingStatus::Complete => {}
        StudioRecordingStatus::InProgress => {
            problems.push("studio recording is still in progress".to_string());
        }
        StudioRecordingStatus::NeedsRemux => {
            problems.push("studio recording still needs remux".to_string());
        }
        StudioRecordingStatus::Failed { error } => {
            problems.push(format!("studio recording failed: {error}"));
        }
    }

    problems
}

fn instant_problems(instant: &InstantRecordingMeta) -> Vec<String> {
    match instant {
        InstantRecordingMeta::Complete { .. } => Vec::new(),
        InstantRecordingMeta::InProgress { recording } => {
            let state = if *recording {
                "still recording"
            } else {
                "incomplete"
            };
            vec![format!("instant recording is {state}")]
        }
        InstantRecordingMeta::Failed { error } => {
            vec![format!("instant recording failed: {error}")]
        }
    }
}

fn build_report(project_path: &Path, meta: &RecordingMeta) -> ValidationReport {
    let mut checks = vec![required_check(
        "recordingMeta",
        project_path.join("recording-meta.json"),
    )];
    checks.push(optional_check(
        "projectConfig",
        project_path.join("project-config.json"),
    ));

    let problems = match &meta.inner {
        RecordingMetaInner::Studio(studio) => {
            checks.extend(studio_checks(meta, studio));
            checks.push(optional_check("output", meta.output_path()));
            studio_problems(studio)
        }
        RecordingMetaInner::Instant(instant) => {
            checks.push(required_check("output", meta.output_path()));
            instant_problems(instant)
        }
    };

    let missing: Vec<PathBuf> = checks
        .iter()
        .filter(|c| c.required && !c.exists)
        .map(|c| c.path.clone())
        .collect();

    let valid = missing.is_empty() && problems.is_empty();
    let error = (!valid).then(|| {
        let mut reasons = Vec::new();
        if !missing.is_empty() {
            reasons.push(format!("missing {} required file(s)", missing.len()));
        }
        reasons.extend(problems.iter().cloned());
        format!("project validation failed: {}", reasons.join("; "))
    });

    ValidationReport {
        project_path: project_path.to_path_buf(),
        valid,
        recording_type: Some(recording_type(meta)),
        error,
        checks,
        missing,
        problems,
    }
}

pub(crate) fn validate_project(project_path: &Path) -> Result<(), String> {
    let meta = RecordingMeta::load_for_project(project_path)
        .map_err(|e| format!("Failed to load recording meta: {e}"))?;
    let report = build_report(project_path, &meta);

    if report.valid {
        Ok(())
    } else {
        Err(report
            .error
            .unwrap_or_else(|| "project validation failed".to_string()))
    }
}

pub fn validate(project_path: PathBuf, format: OutputFormat) -> Result<(), String> {
    let report = match RecordingMeta::load_for_project(&project_path) {
        Ok(meta) => build_report(&project_path, &meta),
        Err(e) => ValidationReport {
            checks: vec![required_check(
                "recordingMeta",
                project_path.join("recording-meta.json"),
            )],
            missing: vec![project_path.join("recording-meta.json")],
            project_path: project_path.clone(),
            valid: false,
            recording_type: None,
            error: Some(format!("Failed to load recording meta: {e}")),
            problems: Vec::new(),
        },
    };

    let valid = report.valid;

    match format {
        OutputFormat::Json => write_json(&report)?,
        OutputFormat::Text => {
            println!("project: {}", report.project_path.display());
            if let Some(error) = &report.error {
                println!("error: {error}");
            }
            for problem in &report.problems {
                println!("problem: {problem}");
            }
            for check in &report.checks {
                let status = if check.exists { "ok" } else { "missing" };
                let required = if check.required {
                    "required"
                } else {
                    "optional"
                };
                println!(
                    "  [{status}] {} ({required}): {}",
                    check.role,
                    check.path.display()
                );
            }
            println!("valid: {valid}");
        }
    }

    if valid {
        Ok(())
    } else {
        Err("project validation failed".to_string())
    }
}
