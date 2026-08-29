use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManualFollowConfig {
    pub safe_zone_ratio: f32,
    pub response: f32,
}

impl Default for ManualFollowConfig {
    fn default() -> Self {
        Self {
            safe_zone_ratio: 0.6,
            response: 14.0,
        }
    }
}

pub fn advance_manual_follow(
    center: (f32, f32),
    cursor: (f32, f32),
    amount: f32,
    dt: f32,
    config: ManualFollowConfig,
) -> (f32, f32) {
    let defaults = ManualFollowConfig::default();
    let amount = if amount.is_finite() {
        amount.max(1.0)
    } else {
        2.0
    };
    let viewport_half = 0.5 / amount;
    let safe_zone_ratio = if config.safe_zone_ratio.is_finite() {
        config.safe_zone_ratio.clamp(0.0, 1.0)
    } else {
        defaults.safe_zone_ratio
    };
    let response = if config.response.is_finite() && config.response > 0.0 {
        config.response
    } else {
        defaults.response
    };
    let dt = if dt.is_finite() { dt.max(0.0) } else { 0.0 };
    let alpha = 1.0 - (-response * dt).exp();
    let safe_half = viewport_half * safe_zone_ratio;

    let advance_axis = |center: f32, cursor: f32| {
        let min_center = viewport_half;
        let max_center = 1.0 - viewport_half;
        let center = finite_or(center, 0.5).clamp(min_center, max_center);
        let cursor = finite_or(cursor, center).clamp(0.0, 1.0);
        let target = if cursor > center + safe_half {
            cursor - safe_half
        } else if cursor < center - safe_half {
            cursor + safe_half
        } else {
            center
        }
        .clamp(min_center, max_center);

        (center + (target - center) * alpha).clamp(min_center, max_center)
    };

    (
        advance_axis(center.0, cursor.0),
        advance_axis(center.1, cursor.1),
    )
}

pub fn manual_follow_center_to_travel(center: f32, amount: f32) -> f32 {
    let amount = if amount.is_finite() {
        amount.max(1.0)
    } else {
        1.0
    };
    if amount <= 1.0 {
        return 0.5;
    }

    let viewport_half = 0.5 / amount;
    let center = finite_or(center, 0.5).clamp(viewport_half, 1.0 - viewport_half);
    ((center - viewport_half) / (1.0 - 2.0 * viewport_half)).clamp(0.0, 1.0)
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() { value } else { fallback }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_inside_safe_zone_keeps_center_fixed() {
        let next = advance_manual_follow(
            (0.5, 0.5),
            (0.6, 0.55),
            2.0,
            1.0 / 60.0,
            ManualFollowConfig::default(),
        );
        assert_eq!(next, (0.5, 0.5));
    }

    #[test]
    fn cursor_near_edge_moves_center_without_jumping() {
        let next = advance_manual_follow(
            (0.5, 0.5),
            (0.74, 0.5),
            2.0,
            1.0 / 60.0,
            ManualFollowConfig::default(),
        );
        assert!(next.0 > 0.5);
        assert!(next.0 < 0.74);
        assert_eq!(next.1, 0.5);
    }

    #[test]
    fn follow_center_never_exposes_outside_source() {
        let next = advance_manual_follow(
            (0.75, 0.5),
            (1.0, 0.5),
            2.0,
            1.0,
            ManualFollowConfig::default(),
        );
        assert_eq!(next.0, 0.75);
    }

    #[test]
    fn source_center_converts_to_legacy_travel_space() {
        assert_eq!(manual_follow_center_to_travel(0.25, 2.0), 0.0);
        assert_eq!(manual_follow_center_to_travel(0.5, 2.0), 0.5);
        assert_eq!(manual_follow_center_to_travel(0.75, 2.0), 1.0);
    }
}
