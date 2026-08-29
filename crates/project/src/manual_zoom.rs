use crate::{GlideDirection, ZoomMode, ZoomSegment};

const MIN_MANUAL_ZOOM_DURATION: f64 = 0.05;

#[derive(Clone, Copy, Debug)]
struct ActiveManualZoom {
    start: f64,
    x: f32,
    y: f32,
    amount: f64,
}

#[derive(Default, Debug)]
pub struct ManualZoomSession {
    enabled: Option<(f32, f32, f64)>,
    active: Option<ActiveManualZoom>,
    segments: Vec<ZoomSegment>,
}

impl ManualZoomSession {
    /// Returns whether manual zoom is enabled after the toggle.
    pub fn toggle(&mut self, at: f64, x: f64, y: f64, amount: f64) -> bool {
        if self.enabled.is_some() {
            self.close_active(at);
            self.enabled = None;
            return false;
        }

        let target = (
            x.clamp(0.0, 1.0) as f32,
            y.clamp(0.0, 1.0) as f32,
            amount.max(1.0),
        );
        self.enabled = Some(target);
        self.active = Some(ActiveManualZoom {
            start: at.max(0.0),
            x: target.0,
            y: target.1,
            amount: target.2,
        });
        true
    }

    pub fn pause(&mut self, at: f64) {
        self.close_active(at);
    }

    pub fn resume(&mut self, at: f64) {
        if self.active.is_none()
            && let Some((x, y, amount)) = self.enabled
        {
            self.active = Some(ActiveManualZoom {
                start: at.max(0.0),
                x,
                y,
                amount,
            });
        }
    }

    pub fn finish(&mut self, at: f64) {
        self.close_active(at);
        self.enabled = None;
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.is_some()
    }

    pub fn segments(&self) -> &[ZoomSegment] {
        &self.segments
    }

    pub fn into_segments(mut self, at: f64) -> Vec<ZoomSegment> {
        self.finish(at);
        self.segments
    }

    fn close_active(&mut self, at: f64) {
        let Some(active) = self.active.take() else {
            return;
        };
        let end = at.max(active.start);
        if end - active.start < MIN_MANUAL_ZOOM_DURATION {
            return;
        }
        self.segments.push(ZoomSegment {
            start: active.start,
            end,
            amount: active.amount,
            mode: ZoomMode::Manual {
                x: active.x,
                y: active.y,
            },
            glide_direction: GlideDirection::None,
            glide_speed: 0.5,
            instant_animation: false,
            edge_snap_ratio: 0.25,
        });
    }
}

pub fn merge_manual_zoom_segments(
    auto_segments: Vec<ZoomSegment>,
    mut manual_segments: Vec<ZoomSegment>,
) -> Vec<ZoomSegment> {
    let mut automatic = auto_segments;
    for manual in &manual_segments {
        let mut next = Vec::new();
        for automatic_segment in automatic {
            if automatic_segment.end <= manual.start || automatic_segment.start >= manual.end {
                next.push(automatic_segment);
                continue;
            }
            if automatic_segment.start < manual.start {
                next.push(ZoomSegment {
                    end: manual.start,
                    ..automatic_segment.clone()
                });
            }
            if automatic_segment.end > manual.end {
                next.push(ZoomSegment {
                    start: manual.end,
                    ..automatic_segment
                });
            }
        }
        automatic = next;
    }

    automatic.append(&mut manual_segments);
    automatic.sort_by(|a, b| a.start.total_cmp(&b.start).then(a.end.total_cmp(&b.end)));
    automatic
}
