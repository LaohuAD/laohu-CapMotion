use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    CaptionDisplayMode, CaptionSegment, CaptionSettings, CaptionTrackSegment, ProjectConfiguration,
    ProjectTransactionError, XY, mutate_project,
};

/// Agent-safe, partial caption style update. Unlike replacing the full project
/// configuration, omitted fields are preserved and caption content/timeline
/// tracks are never touched.
#[derive(Type, Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct CaptionStylePatch {
    pub enabled: Option<bool>,
    pub font: Option<String>,
    pub size: Option<u32>,
    pub color: Option<String>,
    pub background_color: Option<String>,
    pub background_opacity: Option<u32>,
    pub position: Option<String>,
    pub italic: Option<bool>,
    pub font_weight: Option<u32>,
    pub letter_spacing: Option<f32>,
    pub outline: Option<bool>,
    pub outline_color: Option<String>,
    pub outline_width: Option<f32>,
    pub shadow: Option<bool>,
    pub shadow_color: Option<String>,
    pub shadow_opacity: Option<f32>,
    pub shadow_blur: Option<f32>,
    pub shadow_distance: Option<f32>,
    pub shadow_angle: Option<f32>,
    pub outline_shadow: Option<bool>,
    pub outline_shadow_color: Option<String>,
    pub outline_shadow_opacity: Option<f32>,
    pub outline_shadow_blur: Option<f32>,
    pub outline_shadow_distance: Option<f32>,
    pub outline_shadow_angle: Option<f32>,
    pub export_with_subtitles: Option<bool>,
    pub highlight_color: Option<String>,
    pub fade_duration: Option<f32>,
    pub linger_duration: Option<f32>,
    pub word_transition_duration: Option<f32>,
    pub active_word_highlight: Option<bool>,
    pub manual_position: Option<XY<f32>>,
    pub preset: Option<String>,
    pub animation: Option<String>,
    pub highlight_style: Option<String>,
    pub uppercase: Option<bool>,
}

pub fn update_caption_style(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    patch: CaptionStylePatch,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    mutate_project(project_path, expected_revision, move |project| {
        let settings = &mut project.captions.get_or_insert_default().settings;
        patch_caption_settings(settings, patch)
    })
}

/// Apply the same validated caption patch to an in-memory settings document.
/// User-preset storage uses this so project styles and preset styles share one
/// schema and one validator.
pub fn patch_caption_settings(
    settings: &mut CaptionSettings,
    patch: CaptionStylePatch,
) -> Result<(), String> {
    validate_style_patch(&patch)?;
    let migrate_legacy_outline_shadow = patch.outline_shadow == Some(true)
        && patch.shadow.is_none()
        && patch.outline.unwrap_or(settings.outline);
    let legacy_shadow_color = patch.outline_shadow_color.clone();
    let legacy_shadow_opacity = patch.outline_shadow_opacity;
    let legacy_shadow_blur = patch.outline_shadow_blur;
    let legacy_shadow_distance = patch.outline_shadow_distance;
    let legacy_shadow_angle = patch.outline_shadow_angle;
    let has_shadow_color = patch.shadow_color.is_some();
    let has_shadow_opacity = patch.shadow_opacity.is_some();
    let has_shadow_blur = patch.shadow_blur.is_some();
    let has_shadow_distance = patch.shadow_distance.is_some();
    let has_shadow_angle = patch.shadow_angle.is_some();
    macro_rules! assign {
        ($field:ident) => {
            if let Some(value) = patch.$field {
                settings.$field = value;
            }
        };
    }
    assign!(enabled);
    assign!(font);
    assign!(size);
    assign!(color);
    assign!(background_color);
    assign!(background_opacity);
    assign!(position);
    assign!(italic);
    assign!(font_weight);
    assign!(letter_spacing);
    assign!(outline);
    assign!(outline_color);
    assign!(outline_width);
    assign!(shadow);
    assign!(shadow_color);
    assign!(shadow_opacity);
    assign!(shadow_blur);
    assign!(shadow_distance);
    assign!(shadow_angle);
    assign!(outline_shadow);
    assign!(outline_shadow_color);
    assign!(outline_shadow_opacity);
    assign!(outline_shadow_blur);
    assign!(outline_shadow_distance);
    assign!(outline_shadow_angle);
    assign!(export_with_subtitles);
    assign!(highlight_color);
    assign!(fade_duration);
    assign!(linger_duration);
    assign!(word_transition_duration);
    assign!(active_word_highlight);
    if let Some(value) = patch.manual_position {
        settings.manual_position = Some(value);
    }
    assign!(preset);
    assign!(animation);
    assign!(highlight_style);
    assign!(uppercase);
    if migrate_legacy_outline_shadow {
        settings.shadow = true;
        if !has_shadow_color && let Some(value) = legacy_shadow_color {
            settings.shadow_color = value;
        }
        if !has_shadow_opacity && let Some(value) = legacy_shadow_opacity {
            settings.shadow_opacity = value;
        }
        if !has_shadow_blur && let Some(value) = legacy_shadow_blur {
            settings.shadow_blur = value;
        }
        if !has_shadow_distance && let Some(value) = legacy_shadow_distance {
            settings.shadow_distance = value;
        }
        if !has_shadow_angle && let Some(value) = legacy_shadow_angle {
            settings.shadow_angle = value;
        }
        settings.outline_shadow = false;
    }
    Ok(())
}

fn validate_style_patch(patch: &CaptionStylePatch) -> Result<(), String> {
    if patch
        .font
        .as_ref()
        .is_some_and(|value| value.trim().is_empty())
    {
        return Err("caption font cannot be empty".into());
    }
    if patch.size.is_some_and(|value| value == 0 || value > 400) {
        return Err("caption size must be between 1 and 400".into());
    }
    if patch
        .font_weight
        .is_some_and(|value| !(100..=900).contains(&value))
    {
        return Err("caption fontWeight must be between 100 and 900".into());
    }
    if patch.background_opacity.is_some_and(|value| value > 100)
        || patch
            .shadow_opacity
            .is_some_and(|value| !(0.0..=100.0).contains(&value))
        || patch
            .outline_shadow_opacity
            .is_some_and(|value| !(0.0..=100.0).contains(&value))
    {
        return Err("caption opacity must be between 0 and 100".into());
    }
    for (name, value) in [
        ("letterSpacing", patch.letter_spacing),
        ("outlineWidth", patch.outline_width),
        ("shadowBlur", patch.shadow_blur),
        ("shadowDistance", patch.shadow_distance),
        ("shadowAngle", patch.shadow_angle),
        ("outlineShadowBlur", patch.outline_shadow_blur),
        ("outlineShadowDistance", patch.outline_shadow_distance),
        ("outlineShadowAngle", patch.outline_shadow_angle),
        ("fadeDuration", patch.fade_duration),
        ("lingerDuration", patch.linger_duration),
        ("wordTransitionDuration", patch.word_transition_duration),
    ] {
        if value.is_some_and(|number| !number.is_finite()) {
            return Err(format!("caption {name} must be finite"));
        }
    }
    if patch.outline_width.is_some_and(|value| value < 0.0)
        || patch.shadow_blur.is_some_and(|value| value < 0.0)
        || patch.shadow_distance.is_some_and(|value| value < 0.0)
        || patch.outline_shadow_blur.is_some_and(|value| value < 0.0)
        || patch
            .outline_shadow_distance
            .is_some_and(|value| value < 0.0)
    {
        return Err("caption outline and shadow dimensions cannot be negative".into());
    }
    Ok(())
}

/// Replaces the ASR-backed caption segments while preserving the project's
/// existing caption styling and every non-caption track.
pub fn import_caption_segments(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    segments: Vec<CaptionSegment>,
    source_timed: bool,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    validate_segments(&segments).map_err(ProjectTransactionError::Mutation)?;

    mutate_project(project_path, expected_revision, move |project| {
        let captions = project.captions.get_or_insert_default();
        captions.segments = segments;
        captions.settings.enabled = true;
        captions.source_timed = source_timed;

        // Source-timed captions are projected through the current edit list by
        // the editor. Do not retain an obsolete rendered caption cache.
        if source_timed {
            if let Some(timeline) = project.timeline.as_mut() {
                timeline.caption_segments.clear();
            }
        }
        Ok(())
    })
}

/// Replace only the editable, final-time display caption rows. The source ASR
/// master remains untouched so every wording decision can still be traced back
/// to the recording. Materialized rows are not auto-projected from source ASR;
/// callers must regenerate them after changing the EDL.
pub fn materialize_caption_tracks(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    segments: Vec<CaptionTrackSegment>,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    validate_materialized_tracks(&segments).map_err(ProjectTransactionError::Mutation)?;

    mutate_project(project_path, expected_revision, move |project| {
        let timeline = project
            .timeline
            .as_mut()
            .ok_or_else(|| "caption tracks require an existing editable timeline".to_string())?;
        timeline.caption_segments = segments;
        let captions = project.captions.get_or_insert_default();
        captions.settings.enabled = true;
        captions.display_mode = CaptionDisplayMode::Materialized;
        Ok(())
    })
}

fn validate_materialized_tracks(segments: &[CaptionTrackSegment]) -> Result<(), String> {
    if segments.is_empty() {
        return Err("materialized caption tracks cannot be empty".into());
    }

    let mut segment_ids = HashSet::with_capacity(segments.len());
    let mut track_ids = HashSet::new();
    let mut pair_ranges: HashMap<&str, Vec<(f64, f64, &str)>> = HashMap::new();
    for segment in segments {
        let track_id = segment
            .track_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| format!("caption segment {} requires trackId", segment.id))?;
        let pair_id = segment
            .pair_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| format!("caption segment {} requires pairId", segment.id))?;
        if segment
            .language
            .as_deref()
            .is_none_or(|value| value.trim().is_empty())
        {
            return Err(format!("caption segment {} requires language", segment.id));
        }
        if segment.id.trim().is_empty() || !segment_ids.insert(segment.id.as_str()) {
            return Err(format!(
                "caption segment id {} is empty or duplicated",
                segment.id
            ));
        }
        if !segment.start.is_finite()
            || !segment.end.is_finite()
            || segment.start < 0.0
            || segment.end <= segment.start
            || segment.text.trim().is_empty()
        {
            return Err(format!(
                "caption segment {} has an invalid range or text",
                segment.id
            ));
        }
        if segment.manual_position_override.is_some_and(|position| {
            !position.x.is_finite()
                || !position.y.is_finite()
                || !(0.0..=1.0).contains(&position.x)
                || !(0.0..=1.0).contains(&position.y)
        }) {
            return Err(format!(
                "caption segment {} has an invalid manual position",
                segment.id
            ));
        }
        track_ids.insert(track_id);
        pair_ranges
            .entry(pair_id)
            .or_default()
            .push((segment.start, segment.end, track_id));
    }

    if track_ids.len() != 2 {
        return Err(format!(
            "materialized bilingual captions require exactly 2 tracks, found {}",
            track_ids.len()
        ));
    }
    for (pair_id, rows) in pair_ranges {
        if rows.len() != 2
            || rows[0].2 == rows[1].2
            || (rows[0].0 - rows[1].0).abs() > 0.000_001
            || (rows[0].1 - rows[1].1).abs() > 0.000_001
        {
            return Err(format!(
                "caption pair {pair_id} must contain one aligned segment on each track"
            ));
        }
    }
    Ok(())
}

fn validate_segments(segments: &[CaptionSegment]) -> Result<(), String> {
    let mut ids = HashSet::with_capacity(segments.len());

    for segment in segments {
        if segment.id.trim().is_empty() {
            return Err("caption segment id is required".into());
        }
        if !ids.insert(segment.id.as_str()) {
            return Err(format!("caption segment id {} is duplicated", segment.id));
        }
        if !segment.start.is_finite() || segment.start < 0.0 {
            return Err(format!(
                "caption segment {} start must be a finite non-negative number",
                segment.id
            ));
        }
        if !segment.end.is_finite() || segment.end <= segment.start {
            return Err(format!(
                "caption segment {} end must be greater than start",
                segment.id
            ));
        }
        if segment.text.trim().is_empty() {
            return Err(format!("caption segment {} text is required", segment.id));
        }
        for word in &segment.words {
            if word.text.trim().is_empty()
                || !word.start.is_finite()
                || !word.end.is_finite()
                || word.start < segment.start
                || word.end > segment.end
                || word.end <= word.start
            {
                return Err(format!(
                    "caption segment {} contains an invalid word range",
                    segment.id
                ));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_outline_shadow_patch_migrates_to_the_unified_shadow() {
        let mut settings = CaptionSettings {
            outline: true,
            ..Default::default()
        };
        patch_caption_settings(
            &mut settings,
            CaptionStylePatch {
                outline_shadow: Some(true),
                outline_shadow_color: Some("#123456".into()),
                outline_shadow_opacity: Some(62.0),
                outline_shadow_blur: Some(18.0),
                outline_shadow_distance: Some(7.0),
                outline_shadow_angle: Some(35.0),
                ..Default::default()
            },
        )
        .unwrap();

        assert!(settings.shadow);
        assert_eq!(settings.shadow_color, "#123456");
        assert_eq!(settings.shadow_opacity, 62.0);
        assert_eq!(settings.shadow_blur, 18.0);
        assert_eq!(settings.shadow_distance, 7.0);
        assert_eq!(settings.shadow_angle, 35.0);
        assert!(!settings.outline_shadow);
    }
}
