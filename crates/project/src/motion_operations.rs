use std::path::Path;

use serde_json::Value;

use crate::{
    MotionArtifactStatus, MotionDefinition, MotionSegment, ProjectConfiguration,
    ProjectTransactionError, mutate_project,
};

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
