use std::path::Path;

use serde_json::Value;

use crate::{
    MotionArtifact, MotionArtifactStatus, MotionDefinition, MotionDefinitionStatus,
    MotionDurationPolicy, MotionSegment, ProjectConfiguration, ProjectTransactionError,
    mutate_project,
};

pub const EXTERNAL_VIDEO_DEFINITION_ID: &str = "external-video-artifact";

/// Adds an already-generated video as an upper Motion track in one revision-safe
/// transaction. The base Cap timeline and original recording metadata are untouched.
pub fn import_external_motion_artifact(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    segment: MotionSegment,
    artifact: MotionArtifact,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    mutate_project(project_path, expected_revision, |project| {
        if segment.id.is_empty() || project.motion.segment(&segment.id).is_some() {
            return Err(format!(
                "motion segment {} is empty or already exists",
                segment.id
            ));
        }
        if artifact.segment_id != segment.id {
            return Err("external artifact segment id does not match motion segment".into());
        }
        if artifact.id.is_empty() || artifact.path.is_empty() || artifact.content_hash.is_empty() {
            return Err("motion artifact id, path, and content hash are required".into());
        }
        if artifact.width == 0
            || artifact.height == 0
            || !artifact.fps.is_finite()
            || artifact.fps <= 0.0
            || !artifact.duration.is_finite()
            || artifact.duration <= 0.0
        {
            return Err("motion artifact media metadata is invalid".into());
        }

        if project
            .motion
            .definition(EXTERNAL_VIDEO_DEFINITION_ID, 1)
            .is_none()
        {
            project.motion.definitions.push(MotionDefinition {
                id: EXTERNAL_VIDEO_DEFINITION_ID.into(),
                version: 1,
                source: "external-video".into(),
                composition_id: "ExternalVideoArtifact".into(),
                status: MotionDefinitionStatus::Published,
                min_duration: 0.001,
                default_duration: segment.duration(),
                max_duration: f64::MAX,
                default_policy: MotionDurationPolicy::Trim,
                ..Default::default()
            });
        }
        let definition = project
            .motion
            .definition(EXTERNAL_VIDEO_DEFINITION_ID, 1)
            .expect("external video definition was inserted");
        segment
            .validate_against(definition)
            .map_err(|error| error.to_string())?;

        let mut linked_segment = segment;
        linked_segment.artifact_id = Some(artifact.id.clone());
        project.motion.segments.push(linked_segment);
        project.motion.artifacts.push(artifact);
        project
            .motion
            .validate()
            .map_err(|error| error.to_string())?;
        Ok(())
    })
}

pub fn record_motion_artifact(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    artifact: MotionArtifact,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    mutate_project(project_path, expected_revision, |project| {
        if artifact.id.is_empty() || artifact.path.is_empty() || artifact.content_hash.is_empty() {
            return Err("motion artifact id, path, and content hash are required".into());
        }
        if artifact.width == 0
            || artifact.height == 0
            || !artifact.fps.is_finite()
            || artifact.fps <= 0.0
            || !artifact.duration.is_finite()
            || artifact.duration <= 0.0
        {
            return Err("motion artifact media metadata is invalid".into());
        }
        let segment = project
            .motion
            .segment_mut(&artifact.segment_id)
            .ok_or_else(|| {
                format!(
                    "motion segment {} does not exist for artifact {}",
                    artifact.segment_id, artifact.id
                )
            })?;
        segment.artifact_id = Some(artifact.id.clone());

        if let Some(existing) = project
            .motion
            .artifacts
            .iter_mut()
            .find(|existing| existing.id == artifact.id)
        {
            *existing = artifact;
        } else {
            project.motion.artifacts.push(artifact);
        }
        Ok(())
    })
}

pub fn register_motion_definition(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    definition: MotionDefinition,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    mutate_project(project_path, expected_revision, |project| {
        if project
            .motion
            .definition(&definition.id, definition.version)
            .is_some()
        {
            return Err(format!(
                "motion definition {} version {} already exists",
                definition.id, definition.version
            ));
        }

        project.motion.definitions.push(definition);
        Ok(())
    })
}

pub fn add_motion_segment(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    segment: MotionSegment,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    mutate_project(project_path, expected_revision, |project| {
        if project.motion.segment(&segment.id).is_some() {
            return Err(format!("motion segment {} already exists", segment.id));
        }
        if project
            .motion
            .definition(&segment.definition_id, segment.definition_version)
            .is_none()
        {
            return Err(format!(
                "motion definition {} version {} does not exist",
                segment.definition_id, segment.definition_version
            ));
        }

        project.motion.segments.push(segment);
        project
            .motion
            .validate()
            .map_err(|error| error.to_string())?;
        Ok(())
    })
}

pub fn move_motion_segment(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    segment_id: &str,
    start: f64,
    track: Option<u32>,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    mutate_project(project_path, expected_revision, |project| {
        if !start.is_finite() || start < 0.0 {
            return Err("motion segment start must be a finite non-negative number".into());
        }

        {
            let segment = project
                .motion
                .segment_mut(segment_id)
                .ok_or_else(|| format!("motion segment {segment_id} does not exist"))?;
            let duration = segment.duration();
            segment.start = start;
            segment.end = start + duration;
            if let Some(track) = track {
                segment.track = track;
            }
        }
        project
            .motion
            .validate()
            .map_err(|error| error.to_string())?;
        Ok(())
    })
}

pub fn resize_motion_segment(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    segment_id: &str,
    duration: f64,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    mutate_project(project_path, expected_revision, |project| {
        if !duration.is_finite() || duration <= 0.0 {
            return Err("motion segment duration must be a finite positive number".into());
        }

        let artifact_id = {
            let segment = project
                .motion
                .segment_mut(segment_id)
                .ok_or_else(|| format!("motion segment {segment_id} does not exist"))?;
            segment.end = segment.start + duration;
            segment.artifact_id.clone()
        };
        project
            .motion
            .validate()
            .map_err(|error| error.to_string())?;
        mark_artifact_stale(project, artifact_id.as_deref());
        Ok(())
    })
}

pub fn set_motion_segment_props(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    segment_id: &str,
    props: Value,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    mutate_project(project_path, expected_revision, |project| {
        if !props.is_object() {
            return Err("motion segment props must be a JSON object".into());
        }

        let artifact_id = {
            let segment = project
                .motion
                .segment_mut(segment_id)
                .ok_or_else(|| format!("motion segment {segment_id} does not exist"))?;
            segment.props = props;
            segment.artifact_id.clone()
        };
        mark_artifact_stale(project, artifact_id.as_deref());
        Ok(())
    })
}

fn mark_artifact_stale(project: &mut ProjectConfiguration, artifact_id: Option<&str>) {
    let Some(artifact_id) = artifact_id else {
        return;
    };
    if let Some(artifact) = project
        .motion
        .artifacts
        .iter_mut()
        .find(|artifact| artifact.id == artifact_id)
    {
        artifact.status = MotionArtifactStatus::Stale;
    }
}
