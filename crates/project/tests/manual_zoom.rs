use cap_project::{
    GlideDirection, ManualZoomSession, ZoomMode, ZoomSegment, merge_manual_zoom_segments,
};

fn segment(start: f64, end: f64, amount: f64, mode: ZoomMode) -> ZoomSegment {
    ZoomSegment {
        start,
        end,
        amount,
        mode,
        glide_direction: GlideDirection::None,
        glide_speed: 0.5,
        instant_animation: false,
        edge_snap_ratio: 0.25,
    }
}

#[test]
fn toggle_pause_resume_and_finish_preserve_recording_time() {
    let mut session = ManualZoomSession::default();

    assert!(session.toggle(2.0, 0.8, 0.3, 2.0));
    session.pause(5.0);
    session.resume(5.0);
    assert!(!session.toggle(8.0, 0.2, 0.2, 3.0));
    session.finish(9.0);

    let segments = session.segments();
    assert_eq!(segments.len(), 2);
    assert_eq!((segments[0].start, segments[0].end), (2.0, 5.0));
    assert_eq!((segments[1].start, segments[1].end), (5.0, 8.0));
    assert_eq!(segments[0].amount, 2.0);
    assert!(matches!(
        segments[0].mode,
        ZoomMode::ManualFollow { x, y, .. } if x == 0.8 && y == 0.3
    ));
}

#[test]
fn old_fixed_manual_zoom_json_still_deserializes() {
    let mode: ZoomMode = serde_json::from_str(r#"{"manual":{"x":0.4,"y":0.6}}"#).unwrap();
    assert!(matches!(mode, ZoomMode::Manual { x, y } if x == 0.4 && y == 0.6));
}

#[test]
fn new_recordings_create_manual_follow_segments() {
    let mut session = ManualZoomSession::default();
    assert!(session.toggle(1.0, 0.7, 0.4, 2.0));
    assert!(!session.toggle(3.0, 0.7, 0.4, 2.0));
    assert!(matches!(
        session.segments()[0].mode,
        ZoomMode::ManualFollow { x, y, .. } if x == 0.7 && y == 0.4
    ));
}

#[test]
fn manual_zoom_trims_overlapping_auto_zoom_instead_of_competing_with_it() {
    let auto = segment(1.0, 10.0, 2.0, ZoomMode::Auto);
    let manual = segment(4.0, 7.0, 2.5, ZoomMode::Manual { x: 0.75, y: 0.25 });

    let merged = merge_manual_zoom_segments(vec![auto], vec![manual]);

    assert_eq!(merged.len(), 3);
    assert_eq!((merged[0].start, merged[0].end), (1.0, 4.0));
    assert!(matches!(merged[0].mode, ZoomMode::Auto));
    assert_eq!((merged[1].start, merged[1].end), (4.0, 7.0));
    assert!(matches!(merged[1].mode, ZoomMode::Manual { .. }));
    assert_eq!((merged[2].start, merged[2].end), (7.0, 10.0));
    assert!(matches!(merged[2].mode, ZoomMode::Auto));
}
