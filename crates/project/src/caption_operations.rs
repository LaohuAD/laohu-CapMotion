use std::{collections::HashSet, path::Path};

use crate::{CaptionSegment, ProjectConfiguration, ProjectTransactionError, mutate_project};

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
