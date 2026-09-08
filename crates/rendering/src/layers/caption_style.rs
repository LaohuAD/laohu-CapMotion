use glyphon::{Family, Weight};

pub fn caption_family(name: &str) -> Family<'_> {
    match name.trim().to_ascii_lowercase().as_str() {
        "" | "system sans-serif" => Family::SansSerif,
        "system serif" => Family::Serif,
        "system monospace" => Family::Monospace,
        // Keep the stable project/preset IDs used by existing projects while
        // resolving them to the bundled static SC families. Static 400/500/700
        // faces are required because cosmic-text otherwise skips the variable
        // face when its metadata weight does not exactly match the request.
        "source han sans cn vf" | "source han sans cn" => Family::Name("Source Han Sans SC"),
        "source han serif cn vf" | "source han serif cn" => Family::Name("Source Han Serif SC"),
        _ => Family::Name(name),
    }
}

fn contains_cjk(text: &str) -> bool {
    text.chars().any(|character| {
        matches!(
            character as u32,
            0x3400..=0x4DBF
                | 0x4E00..=0x9FFF
                | 0xF900..=0xFAFF
                | 0x20000..=0x2FA1F
        )
    })
}

/// System aliases remain system fonts for Latin text, but Chinese captions
/// select an explicit CJK-capable system family. Leaving this to fontdb's
/// arbitrary fallback made different machines choose unrelated faces and
/// frequently ignored the requested weight.
pub fn caption_family_for_text<'a>(name: &'a str, text: &str) -> Family<'a> {
    if !contains_cjk(text) {
        return caption_family(name);
    }

    match name.trim().to_ascii_lowercase().as_str() {
        #[cfg(target_os = "macos")]
        "" | "system sans-serif" => Family::Name("PingFang SC"),
        #[cfg(target_os = "macos")]
        "system serif" => Family::Name("Songti SC"),
        #[cfg(target_os = "macos")]
        "system monospace" => Family::Name("Hiragino Sans GB"),
        #[cfg(windows)]
        "" | "system sans-serif" => Family::Name("Microsoft YaHei"),
        #[cfg(windows)]
        "system serif" => Family::Name("SimSun"),
        #[cfg(windows)]
        "system monospace" => Family::Name("Microsoft YaHei"),
        #[cfg(all(unix, not(target_os = "macos")))]
        "" | "system sans-serif" | "system monospace" => Family::Name("Source Han Sans SC"),
        #[cfg(all(unix, not(target_os = "macos")))]
        "system serif" => Family::Name("Source Han Serif SC"),
        _ => caption_family(name),
    }
}

/// Resolve a requested caption weight to one that the selected bundled family
/// actually exposes. Cosmic-text rejects a named family when it cannot find an
/// exact weight and silently falls back to an unrelated system CJK face.
pub fn caption_weight(name: &str, requested: u32) -> Weight {
    if name.trim().eq_ignore_ascii_case("LXGW WenKai") {
        let nearest = [300u32, 400, 500]
            .into_iter()
            .min_by_key(|candidate| candidate.abs_diff(requested))
            .unwrap_or(400);
        Weight(nearest as u16)
    } else {
        Weight(requested.clamp(100, 900) as u16)
    }
}

pub fn caption_weight_for_text(name: &str, requested: u32, text: &str) -> Weight {
    if !contains_cjk(text) {
        return caption_weight(name, requested);
    }

    let normalized = name.trim().to_ascii_lowercase();
    let candidates: &[u32] = match normalized.as_str() {
        #[cfg(target_os = "macos")]
        "" | "system sans-serif" => &[300, 400, 500, 600],
        #[cfg(target_os = "macos")]
        "system serif" => &[300, 400, 700, 900],
        #[cfg(target_os = "macos")]
        "system monospace" => &[300, 600],
        _ => return caption_weight(name, requested),
    };
    Weight(
        candidates
            .iter()
            .copied()
            .min_by_key(|candidate| candidate.abs_diff(requested))
            .unwrap_or(400) as u16,
    )
}

/// The editor stores tracking in pixels at the configured 1080p caption size,
/// while cosmic-text accepts tracking in EM. Converting by the configured font
/// size keeps the visible spacing stable and lets output scaling happen once.
pub fn caption_letter_spacing_em(letter_spacing_px: f32, configured_font_size: u32) -> f32 {
    letter_spacing_px / configured_font_size.max(1) as f32
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CaptionShadowGeometry {
    pub outline_width: f32,
    pub distance: f32,
    pub blur: f32,
}

/// Captions expose one shadow. When an outline exists, that same shadow grows
/// from the outline silhouette. `legacy_outline_shadow` keeps old projects
/// visible while they are migrated to the unified setting.
pub fn resolve_caption_shadow(
    outline_enabled: bool,
    outline_width: f32,
    shadow_enabled: bool,
    legacy_outline_shadow: bool,
    distance: f32,
    blur: f32,
) -> Option<CaptionShadowGeometry> {
    if !shadow_enabled && !(outline_enabled && legacy_outline_shadow) {
        return None;
    }
    Some(CaptionShadowGeometry {
        outline_width: if outline_enabled {
            outline_width.max(0.0)
        } else {
            0.0
        },
        distance: distance.max(0.0),
        blur: blur.max(0.0),
    })
}

pub fn shadow_offset(distance: f32, angle_degrees: f32) -> [f32; 2] {
    let radians = angle_degrees.to_radians();
    [distance * radians.cos(), distance * radians.sin()]
}

pub fn outline_offsets(width: f32) -> Vec<[f32; 2]> {
    let width = width.max(0.0);
    if width == 0.0 {
        return Vec::new();
    }
    let diagonal = width * std::f32::consts::FRAC_1_SQRT_2;
    vec![
        [-width, 0.0],
        [width, 0.0],
        [0.0, -width],
        [0.0, width],
        [-diagonal, -diagonal],
        [diagonal, -diagonal],
        [-diagonal, diagonal],
        [diagonal, diagonal],
    ]
}

/// Produces a denser two-ring dilation than the historical eight-direction
/// outline. The outer ring keeps the requested thickness while the inner ring
/// closes the diagonal gaps that made CJK strokes look uneven at 4-5 px.
pub fn smooth_outline_offsets(width: f32) -> Vec<[f32; 2]> {
    let width = width.max(0.0);
    if width == 0.0 {
        return Vec::new();
    }

    let mut offsets = Vec::with_capacity(24);
    for (radius, samples) in [(width * 0.5, 8usize), (width, 16usize)] {
        for index in 0..samples {
            let angle = std::f32::consts::TAU * index as f32 / samples as f32;
            offsets.push([radius * angle.cos(), radius * angle.sin()]);
        }
    }
    offsets
}

/// The shadow of an outlined caption starts at the outline silhouette, so its
/// spread is the outline width plus the requested soft-shadow blur radius.
pub fn outline_shadow_offsets(outline_width: f32, blur_radius: f32) -> Vec<[f32; 2]> {
    smooth_outline_offsets((outline_width + blur_radius).max(0.0))
}

pub fn caption_effect_extent(
    outline_width: f32,
    shadow: Option<CaptionShadowGeometry>,
    render_scale: f32,
) -> f32 {
    let outline = outline_width.max(0.0);
    let shadow_extent = shadow
        .map(|shadow| shadow.distance + shadow.outline_width + shadow.blur)
        .unwrap_or(0.0);
    outline.max(shadow_extent) * render_scale.max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_caption_font_does_not_fall_back_to_generic_sans() {
        assert_eq!(
            caption_family("Source Han Sans CN VF"),
            Family::Name("Source Han Sans SC")
        );
    }

    #[test]
    fn system_caption_uses_a_cjk_family_for_chinese_text() {
        #[cfg(target_os = "macos")]
        {
            assert_eq!(
                caption_family_for_text("System Sans-Serif", "人物的停顿"),
                Family::Name("PingFang SC")
            );
            assert_eq!(
                caption_family_for_text("System Serif", "人物的停顿"),
                Family::Name("Songti SC")
            );
            assert_eq!(
                caption_family_for_text("System Monospace", "人物的停顿"),
                Family::Name("Hiragino Sans GB")
            );
        }
        assert_eq!(
            caption_family_for_text("System Sans-Serif", "English caption"),
            Family::SansSerif
        );
    }

    #[test]
    fn bundled_caption_font_uses_the_nearest_real_face_weight() {
        assert_eq!(caption_weight("LXGW WenKai", 300), Weight(300));
        assert_eq!(caption_weight("LXGW WenKai", 400), Weight(400));
        assert_eq!(caption_weight("LXGW WenKai", 500), Weight(500));
        assert_eq!(caption_weight("LXGW WenKai", 700), Weight(500));
        assert_eq!(caption_weight("Source Han Sans CN VF", 700), Weight(700));
    }

    #[test]
    fn caption_letter_spacing_is_converted_from_pixels_to_em() {
        assert!((caption_letter_spacing_em(2.5, 50) - 0.05).abs() < f32::EPSILON);
        assert_eq!(caption_letter_spacing_em(0.0, 0), 0.0);
    }

    #[test]
    fn system_caption_weight_uses_a_real_cjk_face_without_changing_latin_weight() {
        #[cfg(target_os = "macos")]
        {
            assert_eq!(
                caption_weight_for_text("System Monospace", 400, "人物的停顿"),
                Weight(300)
            );
            assert_eq!(
                caption_weight_for_text("System Monospace", 700, "人物的停顿"),
                Weight(600)
            );
        }
        assert_eq!(
            caption_weight_for_text("System Monospace", 400, "English caption"),
            Weight(400)
        );
    }

    #[test]
    fn one_shadow_follows_the_outline_when_outline_is_enabled() {
        let shadow = resolve_caption_shadow(true, 4.0, true, false, 5.0, 12.0)
            .expect("shadow should be enabled");
        assert_eq!(shadow.outline_width, 4.0);
        assert_eq!(shadow.distance, 5.0);
        assert_eq!(shadow.blur, 12.0);
    }

    #[test]
    fn legacy_outline_shadow_is_folded_into_the_same_rendering_path() {
        let shadow = resolve_caption_shadow(true, 4.0, false, true, 5.0, 12.0)
            .expect("legacy shadow should remain visible");
        assert_eq!(shadow.outline_width, 4.0);
    }

    #[test]
    fn shadow_offset_uses_distance_and_angle() {
        let [x, y] = shadow_offset(5.0, -45.0);
        assert!((x - 3.5355).abs() < 0.001);
        assert!((y + 3.5355).abs() < 0.001);
    }

    #[test]
    fn outline_samples_expand_with_width() {
        assert!(
            outline_offsets(4.0)
                .iter()
                .all(|[x, y]| x.abs() <= 4.0 && y.abs() <= 4.0)
        );
    }

    #[test]
    fn smooth_outline_offsets_cover_inner_and_outer_rings() {
        let offsets = smooth_outline_offsets(4.0);
        assert!(offsets.len() >= 20);
        assert!(offsets.iter().any(|[x, y]| x.hypot(*y) < 3.0));
        assert!(
            offsets
                .iter()
                .any(|[x, y]| (x.hypot(*y) - 4.0).abs() < 0.01)
        );
    }

    #[test]
    fn outlined_shadow_expands_from_the_outline_not_only_the_glyph() {
        let offsets = outline_shadow_offsets(4.0, 2.0);
        assert!(
            offsets
                .iter()
                .any(|[x, y]| (x.hypot(*y) - 6.0).abs() < 0.01)
        );
    }

    #[test]
    fn effect_extent_keeps_outline_and_outline_shadow_outside_text_bounds() {
        let shadow = resolve_caption_shadow(true, 4.0, true, false, 5.0, 2.25);
        let extent = caption_effect_extent(4.0, shadow, 1.0) + 2.0;
        assert!(extent >= 13.25);
    }
}
