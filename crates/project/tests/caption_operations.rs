use cap_project::{
    CaptionDisplayMode, CaptionSegment, CaptionSettings, CaptionStylePatch, CaptionTrackSegment,
    CaptionWord, MotionDefinition, ProjectConfiguration, ProjectTransactionError, XY,
    import_caption_segments, materialize_caption_tracks, patch_caption_settings,
    update_caption_style,
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

#[test]
fn patches_caption_style_without_replacing_content_or_other_tracks() {
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
    project.captions = Some(cap_project::CaptionsData {
        segments: vec![caption("source-1", 1.0, 2.0, "保留原字幕")],
        source_timed: true,
        ..Default::default()
    });
    project.write(directory.path()).unwrap();

    let patch: CaptionStylePatch = serde_json::from_value(serde_json::json!({
        "preset": "laohu",
        "font": "Source Han Sans CN",
        "fontWeight": 700,
        "size": 50,
        "letterSpacing": 0.0,
        "backgroundOpacity": 0,
        "outline": true,
        "outlineColor": "#000000",
        "outlineWidth": 4.0,
        "shadow": true,
        "shadowColor": "#000000",
        "shadowOpacity": 75.0,
        "shadowBlur": 15.0,
        "shadowDistance": 5.0,
        "shadowAngle": -45.0,
        "position": "bottom-center",
        "animation": "none"
    }))
    .unwrap();

    let updated = update_caption_style(directory.path(), 0, patch).unwrap();
    let captions = updated.captions.unwrap();
    assert_eq!(updated.project_revision, 1);
    assert_eq!(captions.segments[0].text, "保留原字幕");
    assert!(captions.source_timed);
    assert_eq!(captions.settings.preset, "laohu");
    assert_eq!(captions.settings.font, "Source Han Sans CN");
    assert_eq!(captions.settings.outline_width, 4.0);
    assert!(captions.settings.shadow);
    assert!(!captions.settings.outline_shadow);
    assert_eq!(updated.motion.definitions.len(), 1);
}

#[test]
fn patches_caption_settings_in_memory_for_user_presets() {
    let mut settings = CaptionSettings::default();
    patch_caption_settings(
        &mut settings,
        CaptionStylePatch {
            font: Some("Source Han Sans CN VF".into()),
            letter_spacing: Some(1.25),
            shadow: Some(true),
            outline_shadow: Some(true),
            outline_shadow_distance: Some(6.0),
            ..Default::default()
        },
    )
    .unwrap();

    assert_eq!(settings.font, "Source Han Sans CN VF");
    assert_eq!(settings.letter_spacing, 1.25);
    assert!(settings.shadow);
    assert!(settings.outline_shadow);
    assert_eq!(settings.outline_shadow_distance, 6.0);

    let error = patch_caption_settings(
        &mut settings,
        CaptionStylePatch {
            font_weight: Some(950),
            ..Default::default()
        },
    )
    .unwrap_err();
    assert!(error.contains("fontWeight"));
}

#[test]
fn caption_track_segment_round_trips_bilingual_track_and_pair_metadata() {
    let segment: CaptionTrackSegment = serde_json::from_value(serde_json::json!({
        "id": "caption-1-en",
        "trackId": "en",
        "trackLabel": "English Captions",
        "language": "en",
        "pairId": "caption-1",
        "start": 1.0,
        "end": 2.0,
        "text": "English text",
        "manualPositionOverride": {"x": 0.5, "y": 0.93}
    }))
    .unwrap();

    assert_eq!(segment.track_id.as_deref(), Some("en"));
    assert_eq!(segment.pair_id.as_deref(), Some("caption-1"));
    assert_eq!(segment.manual_position_override, Some(XY::new(0.5, 0.93)));
    let serialized = serde_json::to_value(segment).unwrap();
    assert_eq!(serialized["trackLabel"], "English Captions");
}

#[test]
fn materialized_caption_mode_round_trips_without_changing_legacy_default() {
    let materialized: cap_project::CaptionsData = serde_json::from_value(serde_json::json!({
        "segments": [],
        "settings": cap_project::CaptionSettings::default(),
        "sourceTimed": true,
        "displayMode": "materialized"
    }))
    .unwrap();
    assert_eq!(materialized.display_mode, CaptionDisplayMode::Materialized);

    let legacy: cap_project::CaptionsData = serde_json::from_value(serde_json::json!({
        "segments": [],
        "settings": cap_project::CaptionSettings::default(),
        "sourceTimed": true
    }))
    .unwrap();
    assert_eq!(legacy.display_mode, CaptionDisplayMode::AutoProject);
}

#[test]
fn materializes_linked_bilingual_tracks_without_replacing_the_source_master() {
    let directory = tempfile::tempdir().unwrap();
    let mut project = ProjectConfiguration::default();
    project.captions = Some(cap_project::CaptionsData {
        segments: vec![caption("source-1", 10.0, 11.0, "源字幕")],
        source_timed: true,
        ..Default::default()
    });
    project.timeline = Some(
        serde_json::from_value(serde_json::json!({
            "segments": [],
            "zoomSegments": [],
            "captionSegments": []
        }))
        .unwrap(),
    );
    project.write(directory.path()).unwrap();

    let zh: CaptionTrackSegment = serde_json::from_value(serde_json::json!({
        "id": "display-1-zh",
        "trackId": "zh-CN",
        "trackLabel": "中文字幕",
        "language": "zh-CN",
        "pairId": "display-1",
        "start": 0.5,
        "end": 1.5,
        "text": "最终中文字幕",
        "fontSizeOverride": 64,
        "manualPositionOverride": {"x": 0.5, "y": 0.865}
    }))
    .unwrap();
    let en: CaptionTrackSegment = serde_json::from_value(serde_json::json!({
        "id": "display-1-en",
        "trackId": "en",
        "trackLabel": "English Captions",
        "language": "en",
        "pairId": "display-1",
        "start": 0.5,
        "end": 1.5,
        "text": "Final English caption",
        "fontSizeOverride": 34,
        "manualPositionOverride": {"x": 0.5, "y": 0.93}
    }))
    .unwrap();

    let updated = materialize_caption_tracks(directory.path(), 0, vec![zh, en]).unwrap();
    let captions = updated.captions.unwrap();
    let display = &updated.timeline.unwrap().caption_segments;
    assert_eq!(updated.project_revision, 1);
    assert_eq!(captions.segments[0].text, "源字幕");
    assert_eq!(captions.display_mode, CaptionDisplayMode::Materialized);
    assert_eq!(display.len(), 2);
    assert_eq!(display[0].track_id.as_deref(), Some("zh-CN"));
    assert_eq!(display[1].track_id.as_deref(), Some("en"));
    assert_eq!(display[0].pair_id, display[1].pair_id);
}

#[test]
fn track_styles_and_positions_survive_roundtrip_and_validate() {
    let mut settings = CaptionSettings::default();
    let patch: CaptionStylePatch = serde_json::from_value(serde_json::json!({
        "fontWeight":500,
        "trackStyles":[{"trackId":"zh-CN","fontSize":52},{"trackId":"en","fontSize":34}],
        "trackPositions":[{"trackId":"zh-CN","position":"manual","manualPosition":{"x":0.5,"y":0.91}}]
    })).unwrap();
    patch_caption_settings(&mut settings, patch).unwrap();
    let loaded: CaptionSettings =
        serde_json::from_value(serde_json::to_value(&settings).unwrap()).unwrap();
    assert_eq!(loaded.track_styles[0].font_size, 52);
    assert_eq!(loaded.track_styles[1].font_size, 34);
    assert_eq!(loaded.track_positions[0].position, "manual");
    let bad: CaptionStylePatch =
        serde_json::from_value(serde_json::json!({"trackStyles":[{"trackId":"en","fontSize":0}]}))
            .unwrap();
    assert!(patch_caption_settings(&mut settings, bad).is_err());
    assert_eq!(settings.track_styles[1].font_size, 34);
}
