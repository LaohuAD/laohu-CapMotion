use glyphon::Family;

pub fn caption_family(name: &str) -> Family<'_> {
    match name.trim().to_ascii_lowercase().as_str() {
        "" | "system sans-serif" => Family::SansSerif,
        "system serif" => Family::Serif,
        "system monospace" => Family::Monospace,
        _ => Family::Name(name),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_caption_font_does_not_fall_back_to_generic_sans() {
        assert_eq!(
            caption_family("Source Han Sans CN VF"),
            Family::Name("Source Han Sans CN VF")
        );
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
}
