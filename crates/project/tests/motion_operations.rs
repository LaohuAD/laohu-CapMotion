use cap_project::{
    MotionArtifactStatus, MotionDefinition, MotionSegment, ProjectConfiguration,
    add_motion_segment, move_motion_segment, register_motion_definition, resize_motion_segment,
    set_motion_segment_props,
};

fn create_project() -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    ProjectConfiguration::default()
        .write(directory.path())
        .unwrap();
    directory
}

fn definition() -> MotionDefinition {
    serde_json::from_value(serde_json::json!({
        "id": "case-cards",
        "version": 1,
        "renderer": "remotion",
        "source": "motion/case-cards",
        "compositionId": "CaseCards",
        "status": "approved",
        "minDuration": 1.0,
        "defaultDuration": 5.0,
        "maxDuration": 12.0,
        "defaultPolicy": "responsive",
        "introDuration": 0.2,
        "outroDuration": 0.2
    }))
    .unwrap()
}

fn segment() -> MotionSegment {
    serde_json::from_value(serde_json::json!({
        "id": "motion-1",
        "definitionId": "case-cards",
        "definitionVersion": 1,
        "start": 12.5,
        "end": 17.5,
        "track": 0,
        "zIndex": 20,
        "durationPolicy": "responsive",
        "props": { "title": "两个案例" }
    }))
    .unwrap()
}

#[test]
fn register_add_move_and_resize_are_revision_checked_domain_operations() {
    let directory = create_project();

    let registered = register_motion_definition(directory.path(), 0, definition()).unwrap();
    assert_eq!(registered.project_revision, 1);
    let added = add_motion_segment(directory.path(), 1, segment()).unwrap();
    assert_eq!(added.project_revision, 2);
    assert_eq!(added.motion.segment("motion-1").unwrap().start, 12.5);

    let moved = move_motion_segment(directory.path(), 2, "motion-1", 20.0, Some(2)).unwrap();
    let moved_segment = moved.motion.segment("motion-1").unwrap();
    assert_eq!(moved_segment.start, 20.0);
    assert_eq!(moved_segment.end, 25.0);
    assert_eq!(moved_segment.track, 2);

    let resized = resize_motion_segment(directory.path(), 3, "motion-1", 8.0).unwrap();
    let resized_segment = resized.motion.segment("motion-1").unwrap();
    assert_eq!(resized_segment.start, 20.0);
    assert_eq!(resized_segment.end, 28.0);
    assert_eq!(resized.project_revision, 4);
}

#[test]
fn render_input_changes_mark_the_linked_artifact_stale_but_moving_does_not() {
    let directory = create_project();
    register_motion_definition(directory.path(), 0, definition()).unwrap();
    let mut segment = segment();
    segment.artifact_id = Some("artifact-1".into());
    add_motion_segment(directory.path(), 1, segment).unwrap();
    let mut project = ProjectConfiguration::load(directory.path()).unwrap();
    project.motion.artifacts.push(
        serde_json::from_value(serde_json::json!({
            "id": "artifact-1",
            "segmentId": "motion-1",
            "contentHash": "abc",
            "quality": "preview",
            "status": "ready",
            "path": "renders/motion-1.mov",
            "width": 1920,
            "height": 1080,
            "fps": 30.0,
            "hasAlpha": true,
            "duration": 5.0
        }))
        .unwrap(),
    );
    project.write(directory.path()).unwrap();

    let moved = move_motion_segment(directory.path(), 2, "motion-1", 30.0, None).unwrap();
    assert_eq!(
        moved.motion.artifacts[0].status,
        MotionArtifactStatus::Ready
    );

    let props = set_motion_segment_props(
        directory.path(),
        3,
        "motion-1",
        serde_json::json!({ "title": "更新后的案例" }),
    )
    .unwrap();
    assert_eq!(
        props.motion.artifacts[0].status,
        MotionArtifactStatus::Stale
    );
}

#[test]
fn props_must_be_a_json_object() {
    let directory = create_project();
    register_motion_definition(directory.path(), 0, definition()).unwrap();
    add_motion_segment(directory.path(), 1, segment()).unwrap();

    let error = set_motion_segment_props(
        directory.path(),
        2,
        "motion-1",
        serde_json::json!(["not", "an", "object"]),
    )
    .unwrap_err();

    assert!(error.to_string().contains("props must be a JSON object"));
    assert_eq!(
        ProjectConfiguration::load(directory.path())
            .unwrap()
            .project_revision,
        2
    );
}
