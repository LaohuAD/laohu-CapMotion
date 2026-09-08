use cap_project::{
    AspectRatio, BackgroundSource, BackgroundSourceBinding, CaptionSegment, CaptionWord,
    ProjectConfiguration, ProjectPresentationPatch, ProjectTransactionError, XY,
    update_project_presentation,
};

#[test]
fn patches_presentation_without_replacing_edits_or_captions() {
    let directory = tempfile::tempdir().unwrap();
    std::fs::create_dir(directory.path().join("assets")).unwrap();
    std::fs::write(
        directory
            .path()
            .join("assets/current-desktop-background.jpg"),
        b"snapshot",
    )
    .unwrap();
    let mut project = ProjectConfiguration::default();
    project.project_revision = 15;
    project.timeline = Some(
        serde_json::from_value(serde_json::json!({
            "segments": [{
                "recordingSegment": 0,
                "timescale": 1.0,
                "start": 4.1,
                "end": 6.9,
                "name": null
            }],
            "zoomSegments": [],
            "sceneSegments": [],
            "maskSegments": [],
            "textSegments": [],
            "captionSegments": [],
            "keyboardSegments": [],
            "audioSegments": [],
            "camera3dSegments": []
        }))
        .unwrap(),
    );
    project
        .captions
        .get_or_insert_default()
        .segments
        .push(CaptionSegment {
            id: "source-1".into(),
            start: 4.1,
            end: 6.9,
            text: "source caption".into(),
            words: vec![CaptionWord {
                text: "source caption".into(),
                start: 4.1,
                end: 6.9,
            }],
        });
    project.write(directory.path()).unwrap();

    let patch: ProjectPresentationPatch = serde_json::from_value(serde_json::json!({
        "aspectRatio": "wide",
        "background": {
            "sourceBinding": "currentDesktop",
            "displayPosition": {"x": 0.5, "y": 0.4724772399102094}
        }
    }))
    .unwrap();
    let updated = update_project_presentation(directory.path(), 15, patch).unwrap();

    assert_eq!(updated.project_revision, 16);
    assert!(matches!(updated.aspect_ratio, Some(AspectRatio::Wide)));
    assert_eq!(
        updated.background.source_binding,
        Some(BackgroundSourceBinding::CurrentDesktop)
    );
    assert_eq!(
        updated.background.display_position,
        Some(XY::new(0.5, 0.4724772399102094))
    );
    assert!(matches!(
        updated.background.source,
        BackgroundSource::Wallpaper { path: Some(path) }
            if path.ends_with("assets/current-desktop-background.jpg")
    ));
    assert_eq!(updated.timeline.unwrap().segments.len(), 1);
    assert_eq!(updated.captions.unwrap().segments[0].text, "source caption");
}

#[test]
fn presentation_patch_rejects_stale_revision_and_out_of_frame_position() {
    let directory = tempfile::tempdir().unwrap();
    ProjectConfiguration::default()
        .write(directory.path())
        .unwrap();

    let invalid: ProjectPresentationPatch = serde_json::from_value(serde_json::json!({
        "background": {"displayPosition": {"x": 0.5, "y": 1.2}}
    }))
    .unwrap();
    assert!(
        update_project_presentation(directory.path(), 0, invalid)
            .unwrap_err()
            .to_string()
            .contains("between 0 and 1")
    );

    let valid: ProjectPresentationPatch = serde_json::from_value(serde_json::json!({
        "aspectRatio": "wide"
    }))
    .unwrap();
    update_project_presentation(directory.path(), 0, valid.clone()).unwrap();
    assert!(matches!(
        update_project_presentation(directory.path(), 0, valid).unwrap_err(),
        ProjectTransactionError::RevisionConflict {
            expected: 0,
            actual: 1
        }
    ));
}

#[test]
fn presentation_patch_rejects_unknown_fields() {
    let error = serde_json::from_value::<ProjectPresentationPatch>(serde_json::json!({
        "background": {"desktop": true}
    }))
    .unwrap_err();
    assert!(error.to_string().contains("desktop"));
}
