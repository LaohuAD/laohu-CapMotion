use cap_project::CaptionSettings;
use serde_json::json;

#[test]
fn legacy_caption_settings_receive_stable_style_defaults() {
    let settings: CaptionSettings = serde_json::from_value(json!({
        "enabled": true,
        "font": "Source Han Sans CN VF",
        "fontWeight": 700
    }))
    .unwrap();

    assert_eq!(settings.letter_spacing, 0.0);
    assert_eq!(settings.outline_width, 1.2);
    assert!(!settings.shadow);
    assert_eq!(settings.shadow_color, "#000000");
    assert_eq!(settings.shadow_opacity, 75.0);
    assert_eq!(settings.shadow_blur, 15.0);
    assert_eq!(settings.shadow_distance, 5.0);
    assert_eq!(settings.shadow_angle, -45.0);
    assert!(!settings.outline_shadow);
    assert_eq!(settings.outline_shadow_color, "#000000");
    assert_eq!(settings.outline_shadow_opacity, 75.0);
    assert_eq!(settings.outline_shadow_blur, 15.0);
    assert_eq!(settings.outline_shadow_distance, 5.0);
    assert_eq!(settings.outline_shadow_angle, -45.0);
}

#[test]
fn new_caption_style_fields_round_trip() {
    let mut settings = CaptionSettings::default();
    settings.letter_spacing = 2.5;
    settings.outline = true;
    settings.outline_width = 4.0;
    settings.shadow = true;
    settings.shadow_blur = 12.0;
    settings.outline_shadow = true;
    settings.outline_shadow_blur = 8.0;

    let value = serde_json::to_value(&settings).unwrap();
    let decoded: CaptionSettings = serde_json::from_value(value).unwrap();

    assert_eq!(decoded.letter_spacing, 2.5);
    assert_eq!(decoded.outline_width, 4.0);
    assert!(decoded.shadow);
    assert_eq!(decoded.shadow_blur, 12.0);
    assert!(decoded.outline_shadow);
    assert_eq!(decoded.outline_shadow_blur, 8.0);
}
