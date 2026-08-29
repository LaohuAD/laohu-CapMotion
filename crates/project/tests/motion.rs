use cap_project::{MotionConfiguration, MotionValidationError, ProjectConfiguration};

fn project_with_motion(motion: serde_json::Value) -> ProjectConfiguration {
    serde_json::from_value(serde_json::json!({ "motion": motion })).unwrap()
}

#[test]
fn missing_motion_configuration_defaults_to_empty() {
    let project: ProjectConfiguration = serde_json::from_value(serde_json::json!({})).unwrap();

    assert_eq!(project.motion, MotionConfiguration::default());
}

#[test]
fn motion_configuration_round_trips_without_changing_values() {
    let project = project_with_motion(serde_json::json!({
        "definitions": [{
            "id": "lower-third",
            "version": 3,
            "renderer": "remotion",
            "source": "motion/lower-third",
            "compositionId": "LowerThird",
            "status": "approved",
            "minDuration": 2.0,
            "defaultDuration": 5.0,
            "maxDuration": 12.0,
            "defaultPolicy": "responsive",
            "introDuration": 0.4,
            "outroDuration": 0.3,
            "defaultProps": { "title": "Codex", "accent": "#12d6b3" }
        }],
        "segments": [{
            "id": "motion-1",
            "definitionId": "lower-third",
            "definitionVersion": 3,
            "start": 4.5,
            "end": 9.5,
            "track": 0,
            "zIndex": 20,
            "transform": { "x": 0.1, "y": 0.8, "scaleX": 1.0, "scaleY": 1.0, "rotation": 0.0 },
            "opacity": 0.9,
            "durationPolicy": "responsive",
            "props": { "title": "独立 Agent", "items": [1, true, null] }
        }],
        "artifacts": []
    }));

    project.motion.validate().unwrap();
    let encoded = serde_json::to_value(&project).unwrap();
    let decoded: ProjectConfiguration = serde_json::from_value(encoded).unwrap();

    assert_eq!(decoded.motion, project.motion);
    assert_eq!(decoded.motion.segments[0].duration(), 5.0);
}

#[test]
fn responsive_segment_must_respect_definition_duration_bounds() {
    let project = project_with_motion(serde_json::json!({
        "definitions": [{
            "id": "callout",
            "version": 1,
            "renderer": "remotion",
            "source": "motion/callout",
            "compositionId": "Callout",
            "status": "draft",
            "minDuration": 3.0,
            "defaultDuration": 5.0,
            "maxDuration": 10.0,
            "defaultPolicy": "responsive",
            "introDuration": 0.5,
            "outroDuration": 0.5
        }],
        "segments": [{
            "id": "too-short",
            "definitionId": "callout",
            "definitionVersion": 1,
            "start": 1.0,
            "end": 2.5,
            "durationPolicy": "responsive"
        }]
    }));

    assert_eq!(
        project.motion.validate(),
        Err(MotionValidationError::DurationOutOfBounds {
            segment_id: "too-short".into(),
            duration: 1.5,
            min: 3.0,
            max: 10.0,
        })
    );
}

#[test]
fn segment_must_reference_an_existing_definition_version() {
    let project = project_with_motion(serde_json::json!({
        "segments": [{
            "id": "orphan",
            "definitionId": "missing",
            "definitionVersion": 2,
            "start": 0.0,
            "end": 2.0
        }]
    }));

    assert_eq!(
        project.motion.validate(),
        Err(MotionValidationError::DefinitionNotFound {
            segment_id: "orphan".into(),
            definition_id: "missing".into(),
            definition_version: 2,
        })
    );
}

#[test]
fn frame_plan_uses_output_pixels_alpha_and_retime_mapping() {
    let project = project_with_motion(serde_json::json!({
        "definitions": [{
            "id": "cards", "version": 1, "source": "motion/cards",
            "compositionId": "Cards", "minDuration": 1.0,
            "defaultDuration": 5.0, "maxDuration": 20.0
        }],
        "segments": [{
            "id": "motion-1", "definitionId": "cards", "definitionVersion": 1,
            "start": 4.0, "end": 14.0, "track": 2, "zIndex": 30,
            "transform": { "x": 120.0, "y": -50.0, "scaleX": 0.5, "scaleY": 0.25, "rotation": 90.0 },
            "opacity": 0.75, "durationPolicy": "retime", "artifactId": "preview-1"
        }],
        "artifacts": [{
            "id": "preview-1", "segmentId": "motion-1", "contentHash": "hash",
            "quality": "preview", "status": "ready", "path": "motion/cache/cards.webm",
            "width": 1920, "height": 1080, "fps": 30.0, "hasAlpha": true,
            "duration": 5.0
        }]
    }));

    let plans = project.motion.frame_plans_at(9.0, 1920, 1080);
    assert_eq!(plans.len(), 1);
    let plan = &plans[0];
    assert_eq!(plan.segment_id, "motion-1");
    assert_eq!(plan.artifact_path, "motion/cache/cards.webm");
    assert_eq!(plan.local_time, 2.5);
    assert_eq!(plan.target_bounds, [600.0, 355.0, 1560.0, 625.0]);
    assert_eq!(plan.rotation_radians, std::f64::consts::FRAC_PI_2);
    assert_eq!(plan.opacity, 0.75);
    assert!(plan.has_alpha);
}
