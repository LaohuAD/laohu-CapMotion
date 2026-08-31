use cap_project::{
    CaptionSegment, CaptionWord, MotionDefinition, ProjectConfiguration, ProjectTransactionError,
    import_caption_segments,
};

fn caption(id: &str, start: f32, end: f32, text: &str) -> CaptionSegment {
    CaptionSegment {
        id: id.into(),
        start,
        end,
        text: text.into(),
        words: vec![CaptionWord {
            text: text.into(),
            start,
            end,
        }],
    }
}

#[test]
fn imports_source_timed_captions_without_replacing_existing_project_data() {
    let directory = tempfile::tempdir().unwrap();
    let mut project = ProjectConfiguration::default();
    project.motion.definitions.push(
        serde_json::from_value::<MotionDefinition>(serde_json::json!({
            "id": "existing-animation",
            "version": 1,
            "renderer": "remotion",
            "source": "motion/existing-animation",
            "compositionId": "ExistingAnimation",
            "status": "approved",
            "minDuration": 1.0,
            "defaultDuration": 3.0,
            "maxDuration": 10.0,
            "defaultPolicy": "responsive"
        }))
        .unwrap(),
    );
    let mut existing_captions = cap_project::CaptionsData::default();
    existing_captions.settings.font = "Source Han Sans CN".into();
    existing_captions.settings.enabled = false;
    project.captions = Some(existing_captions);
    project.write(directory.path()).unwrap();

    let updated = import_caption_segments(
        directory.path(),
        0,
        vec![caption("asr-1", 1.25, 2.5, "你好")],
        true,
    )
    .unwrap();

    assert_eq!(updated.project_revision, 1);
    assert_eq!(updated.motion.definitions.len(), 1);
    let captions = updated.captions.unwrap();
    assert_eq!(captions.segments.len(), 1);
    assert_eq!(captions.segments[0].text, "你好");
    assert_eq!(captions.settings.font, "Source Han Sans CN");
    assert!(captions.settings.enabled);
    assert!(captions.source_timed);
}

#[test]
fn rejects_stale_revision_and_invalid_caption_ranges() {
    let directory = tempfile::tempdir().unwrap();
    ProjectConfiguration::default()
        .write(directory.path())
        .unwrap();

    let invalid = import_caption_segments(
        directory.path(),
        0,
        vec![caption("asr-1", 2.0, 1.0, "倒置时码")],
        true,
    )
    .unwrap_err();
    assert!(
        invalid
            .to_string()
            .contains("end must be greater than start")
    );

    let valid = import_caption_segments(
        directory.path(),
        0,
        vec![caption("asr-1", 1.0, 2.0, "有效字幕")],
        true,
    )
    .unwrap();
    assert_eq!(valid.project_revision, 1);

    let stale = import_caption_segments(
        directory.path(),
        0,
        vec![caption("asr-2", 2.0, 3.0, "过期写入")],
        true,
    )
    .unwrap_err();
    assert!(matches!(
        stale,
        ProjectTransactionError::RevisionConflict {
            expected: 0,
            actual: 1
        }
    ));
}
