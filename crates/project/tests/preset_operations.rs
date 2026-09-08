use cap_project::{
    AgentEditingProfile, BackgroundSourceBinding, CaptionSegment, CaptionWord, MotionDefinition,
    ProjectConfiguration, SourceAudioCut, apply_reusable_preset, reusable_preset_configuration,
};

fn project_with_content() -> ProjectConfiguration {
    let mut project = ProjectConfiguration::default();
    project.project_revision = 7;
    project.background.source = serde_json::from_value(serde_json::json!({
        "type": "image",
        "path": "/private/current-background.png"
    }))
    .unwrap();
    project.audio.microphone_track.expanded = true;
    project.audio.microphone_track.cuts.push(SourceAudioCut {
        recording_clip: 0,
        time: 2.0,
    });
    project.captions = Some(cap_project::CaptionsData {
        segments: vec![CaptionSegment {
            id: "caption-1".into(),
            start: 1.0,
            end: 2.0,
            text: "project content".into(),
            words: vec![CaptionWord {
                text: "project content".into(),
                start: 1.0,
                end: 2.0,
            }],
        }],
        source_timed: true,
        ..Default::default()
    });
    project.motion.definitions.push(
        serde_json::from_value::<MotionDefinition>(serde_json::json!({
            "id": "motion-1",
            "version": 1,
            "renderer": "remotion",
            "source": "motion/example",
            "compositionId": "Example",
            "status": "approved",
            "minDuration": 1.0,
            "defaultDuration": 2.0,
            "maxDuration": 5.0,
            "defaultPolicy": "responsive"
        }))
        .unwrap(),
    );
    project
}

#[test]
fn reusable_preset_removes_project_owned_content() {
    let project = project_with_content();
    let preset = reusable_preset_configuration(&project);

    assert_eq!(preset.project_revision, 0);
    assert!(preset.timeline.is_none());
    assert!(preset.clips.is_empty());
    assert!(preset.annotations.is_empty());
    assert!(preset.keyboard.is_none());
    assert!(preset.motion.definitions.is_empty());
    assert!(preset.motion.segments.is_empty());
    assert!(preset.motion.artifacts.is_empty());
    assert!(preset.audio.microphone_track.cuts.is_empty());
    assert!(!preset.audio.microphone_track.expanded);
    assert!(preset.captions.as_ref().unwrap().segments.is_empty());
    assert!(preset.captions.as_ref().unwrap().source_timed);
    assert_eq!(
        serde_json::to_value(&preset.background.source).unwrap(),
        serde_json::json!({"type": "wallpaper", "path": null})
    );
}

#[test]
fn portable_background_sources_are_reusable() {
    let mut source = ProjectConfiguration::default();
    source.background.source = serde_json::from_value(serde_json::json!({
        "type": "color",
        "value": [20, 30, 40],
        "alpha": 255
    }))
    .unwrap();
    let preset = reusable_preset_configuration(&source);
    assert_eq!(
        serde_json::to_value(&preset.background.source).unwrap(),
        serde_json::json!({"type": "color", "value": [20, 30, 40], "alpha": 255})
    );
}

#[test]
fn desktop_background_is_saved_as_a_portable_binding_instead_of_a_stale_path() {
    let mut source = ProjectConfiguration::default();
    source.background.source = serde_json::from_value(serde_json::json!({
        "type": "wallpaper",
        "path": "/recording/assets/current-desktop-background.jpg"
    }))
    .unwrap();

    let preset = reusable_preset_configuration(&source);

    assert_eq!(
        preset.background.source_binding,
        Some(BackgroundSourceBinding::CurrentDesktop)
    );
    assert_eq!(
        serde_json::to_value(&preset.background.source).unwrap(),
        serde_json::json!({"type": "wallpaper", "path": null})
    );
}

#[test]
fn applying_desktop_background_binding_uses_the_target_projects_snapshot() {
    let directory = tempfile::tempdir().unwrap();
    std::fs::create_dir(directory.path().join("assets")).unwrap();
    std::fs::write(
        directory
            .path()
            .join("assets/current-desktop-background.jpg"),
        b"snapshot",
    )
    .unwrap();
    let current = project_with_content();
    current.write(directory.path()).unwrap();

    let mut preset = reusable_preset_configuration(&ProjectConfiguration::default());
    preset.aspect_ratio = Some(cap_project::AspectRatio::Wide);
    preset.background.source = serde_json::from_value(serde_json::json!({
        "type": "wallpaper",
        "path": null
    }))
    .unwrap();
    preset.background.source_binding = Some(BackgroundSourceBinding::CurrentDesktop);
    preset.background.display_position = Some(cap_project::XY::new(0.5, 0.43));

    let updated = apply_reusable_preset(directory.path(), 7, preset).unwrap();

    assert!(matches!(
        updated.aspect_ratio,
        Some(cap_project::AspectRatio::Wide)
    ));
    assert_eq!(
        updated.background.display_position,
        Some(cap_project::XY::new(0.5, 0.43))
    );
    assert!(matches!(
        updated.background.source,
        cap_project::BackgroundSource::Wallpaper { path: Some(path) }
            if path.ends_with("assets/current-desktop-background.jpg")
    ));
}

#[test]
fn applying_reusable_preset_changes_style_but_preserves_content() {
    let directory = tempfile::tempdir().unwrap();
    let current = project_with_content();
    let current_source = serde_json::to_value(&current.background.source).unwrap();
    current.write(directory.path()).unwrap();

    let mut preset = reusable_preset_configuration(&ProjectConfiguration::default());
    preset.background.source = serde_json::from_value(serde_json::json!({
        "type": "wallpaper",
        "path": null
    }))
    .unwrap();
    preset.background.blur = 18.0;
    preset.camera.size = 42.0;
    preset.cursor.size = 125;
    let captions = preset.captions.get_or_insert_default();
    captions.settings.font = "Source Han Sans CN VF".into();
    captions.settings.letter_spacing = 1.5;

    let updated = apply_reusable_preset(directory.path(), 7, preset).unwrap();

    assert_eq!(updated.project_revision, 8);
    assert_eq!(updated.background.blur, 18.0);
    assert_eq!(updated.camera.size, 42.0);
    assert_eq!(updated.cursor.size, 125);
    assert_eq!(
        updated.captions.as_ref().unwrap().settings.font,
        "Source Han Sans CN VF"
    );
    assert_eq!(
        serde_json::to_value(&updated.background.source).unwrap(),
        current_source
    );
    assert_eq!(updated.captions.as_ref().unwrap().segments.len(), 1);
    assert_eq!(updated.motion.definitions.len(), 1);
    assert_eq!(updated.audio.microphone_track.cuts.len(), 1);
}

#[test]
fn agent_profile_accepts_typed_preferences_and_rejects_invalid_limits() {
    let profile: AgentEditingProfile = serde_json::from_value(serde_json::json!({
        "schemaVersion": 1,
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
    profile.validate().unwrap();

    let mut invalid = profile;
    invalid.captions.max_lines = 0;
    assert!(invalid.validate().unwrap_err().contains("maxLines"));
}

#[test]
fn agent_profile_rejects_unknown_fields_instead_of_silently_ignoring_them() {
    let error = serde_json::from_value::<AgentEditingProfile>(serde_json::json!({
        "captions": {"unknownCaptionRule": true}
    }))
    .unwrap_err();
    assert!(error.to_string().contains("unknownCaptionRule"));
}
