mod animated_gradient;
mod background;
mod blur;
mod camera;
mod camera3d;
mod caption_style;
mod captions;
mod click_ripple;
mod color_grade;
mod cursor;
mod display;
mod frame;
mod keyboard;
mod mask;
mod motion;
mod notch;
mod text;

use std::sync::OnceLock;

const BUNDLED_CAPTION_FONTS: &[&[u8]] = &[
    include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/caption-fonts/SourceHanSansSC-Regular.otf"
    )),
    include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/caption-fonts/SourceHanSansSC-Medium.otf"
    )),
    include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/caption-fonts/SourceHanSansSC-Bold.otf"
    )),
    include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/caption-fonts/SourceHanSerifSC-Regular.otf"
    )),
    include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/caption-fonts/SourceHanSerifSC-Medium.otf"
    )),
    include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/caption-fonts/SourceHanSerifSC-Bold.otf"
    )),
    include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/caption-fonts/LXGWWenKai-Light.ttf"
    )),
    include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/caption-fonts/LXGWWenKai-Regular.ttf"
    )),
    include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/caption-fonts/LXGWWenKai-Medium.ttf"
    )),
];

/// Building a `glyphon::FontSystem` scans and parses every installed system font,
/// which costs hundreds of milliseconds to over a second on macOS. cosmic-text
/// explicitly documents that it should be created once and shared. We previously
/// built three of them per `RendererLayers` (text, captions, keyboard) and a fresh
/// `RendererLayers` per editor/screenshot instance, so every open paid that scan
/// several times over.
///
/// Instead, scan the system fonts a single time per process, then cheaply clone the
/// resulting font database (memory-mapped faces are reference counted) for each new
/// `FontSystem`.
pub(crate) fn new_font_system() -> glyphon::FontSystem {
    static FONT_TEMPLATE: OnceLock<(String, glyphon::fontdb::Database)> = OnceLock::new();

    let (locale, db) = FONT_TEMPLATE.get_or_init(|| {
        let font_system = glyphon::FontSystem::new();
        let mut db = font_system.db().clone();
        for bytes in BUNDLED_CAPTION_FONTS {
            db.load_font_data(bytes.to_vec());
        }
        // Pin the generic families to the fonts the editor webview resolves
        // them to. fontdb's stock defaults (e.g. "Arial") often don't match
        // any installed face, in which case cosmic-text silently shapes with
        // an arbitrary fallback font — and canvas overlays measured in the
        // webview no longer match what the renderer draws.
        #[cfg(target_os = "macos")]
        {
            // WKWebView: sans-serif → Helvetica, serif → Times, monospace →
            // Courier.
            db.set_sans_serif_family("Helvetica");
            db.set_serif_family("Times New Roman");
            db.set_monospace_family("Courier New");
        }
        #[cfg(windows)]
        {
            // WebView2 (Chromium): sans-serif → Arial, serif → Times New
            // Roman, monospace → Consolas.
            db.set_sans_serif_family("Arial");
            db.set_serif_family("Times New Roman");
            db.set_monospace_family("Consolas");
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            db.set_sans_serif_family("DejaVu Sans");
            db.set_serif_family("DejaVu Serif");
            db.set_monospace_family("DejaVu Sans Mono");
        }
        (font_system.locale().to_string(), db)
    });

    glyphon::FontSystem::new_with_locale_and_db(locale.clone(), db.clone())
}

pub use animated_gradient::*;
pub use background::*;
pub use blur::*;
pub use camera::*;
pub use camera3d::*;
pub use captions::*;
pub use click_ripple::*;
pub use color_grade::*;
pub use cursor::*;
pub use display::*;
pub use frame::*;
pub use keyboard::*;
pub use mask::*;
pub use motion::*;
pub use notch::*;
pub use text::*;

#[cfg(test)]
mod font_tests {
    use super::*;

    /// Text overlays are measured in the editor webview with the CSS generic
    /// `sans-serif`; the renderer must resolve the same generic to a real
    /// (and matching) font or boxes and line wrapping diverge from the
    /// rendered pixels.
    #[test]
    fn generic_families_resolve_to_real_fonts() {
        let font_system = new_font_system();
        for family in [
            glyphon::fontdb::Family::SansSerif,
            glyphon::fontdb::Family::Serif,
            glyphon::fontdb::Family::Monospace,
        ] {
            for weight in [400u16, 700] {
                let query = glyphon::fontdb::Query {
                    families: &[family],
                    weight: glyphon::fontdb::Weight(weight),
                    ..Default::default()
                };
                let id = font_system.db().query(&query);
                let families = id
                    .and_then(|id| font_system.db().face(id))
                    .map(|face| face.families.clone());
                assert!(
                    families.is_some(),
                    "{family:?} (weight {weight}) resolved to no font"
                );
            }
        }
    }

    #[test]
    fn bundled_caption_families_resolve() {
        let mut font_system = new_font_system();
        let mut resolved = Vec::new();
        for (name, weights) in [
            ("Source Han Sans SC", &[400u16, 500, 700][..]),
            ("Source Han Serif SC", &[400u16, 500, 700][..]),
            ("LXGW WenKai", &[300u16, 400, 500][..]),
        ] {
            let mut family_faces = Vec::new();
            for &weight in weights {
                let query = glyphon::fontdb::Query {
                    families: &[glyphon::fontdb::Family::Name(name)],
                    weight: glyphon::fontdb::Weight(weight),
                    ..Default::default()
                };
                let id = font_system.db().query(&query);
                assert!(id.is_some(), "{name} weight {weight} did not resolve");
                assert!(
                    font_system.get_font(id.unwrap()).is_some(),
                    "{name} weight {weight} resolved in fontdb but failed to load for shaping"
                );
                let id = id.unwrap();
                assert_eq!(
                    font_system.db().face(id).unwrap().weight.0,
                    weight,
                    "{name} did not resolve the exact exposed weight"
                );
                family_faces.push(id);
            }
            family_faces.dedup();
            assert_eq!(
                family_faces.len(),
                weights.len(),
                "{name} exposes weight choices that resolve to the same face"
            );
            resolved.push((name, family_faces[0]));
        }
        assert_ne!(
            resolved[0].1, resolved[1].1,
            "sans and serif resolved to the same face"
        );
        assert_ne!(
            resolved[0].1, resolved[2].1,
            "sans and WenKai resolved to the same face"
        );
    }

    #[test]
    fn bundled_caption_families_shape_cjk_with_distinct_faces() {
        fn shaped_face(
            project_family: &str,
            bundled_family: &str,
            requested_weight: u16,
        ) -> (glyphon::fontdb::ID, glyphon::fontdb::ID) {
            let mut font_system = new_font_system();
            let expected = font_system
                .db()
                .query(&glyphon::fontdb::Query {
                    families: &[glyphon::Family::Name(bundled_family)],
                    weight: glyphon::fontdb::Weight(requested_weight),
                    ..Default::default()
                })
                .expect("named family should resolve");
            assert_eq!(
                font_system.db().face(expected).unwrap().weight.0,
                requested_weight,
                "named family must expose an exact requested weight for cosmic-text"
            );
            let mut buffer =
                glyphon::Buffer::new(&mut font_system, glyphon::Metrics::new(64.0, 76.8));
            buffer.set_text(
                &mut font_system,
                "人物的停顿情绪和重音",
                &glyphon::Attrs::new()
                    .family(super::caption_style::caption_family(project_family))
                    .weight(glyphon::Weight(requested_weight)),
                glyphon::Shaping::Advanced,
            );
            let actual = glyphon::cosmic_text::LayoutRunIter::new(&buffer)
                .flat_map(|run| run.glyphs.iter().map(|glyph| glyph.font_id))
                .next()
                .expect("sample text should shape at least one glyph");
            (expected, actual)
        }

        let sans = shaped_face("Source Han Sans CN VF", "Source Han Sans SC", 700);
        let serif = shaped_face("Source Han Serif CN VF", "Source Han Serif SC", 700);
        let wenkai = shaped_face("LXGW WenKai", "LXGW WenKai", 500);
        assert_eq!(sans.0, sans.1, "CJK sans ignored the requested family");
        assert_eq!(serif.0, serif.1, "CJK serif ignored the requested family");
        assert_eq!(
            wenkai.0, wenkai.1,
            "CJK WenKai ignored the requested family"
        );
        assert_ne!(
            sans.1, serif.1,
            "CJK sans and serif shaped with the same face"
        );
        assert_ne!(
            sans.1, wenkai.1,
            "CJK sans and WenKai shaped with the same face"
        );
    }

    #[test]
    fn system_caption_aliases_shape_chinese_with_the_selected_cjk_family() {
        let mut font_system = new_font_system();
        for project_family in ["System Sans-Serif", "System Serif", "System Monospace"] {
            let expected_family =
                super::caption_style::caption_family_for_text(project_family, "人物的停顿");
            let expected_weight =
                super::caption_style::caption_weight_for_text(project_family, 400, "人物的停顿");
            let expected = font_system
                .db()
                .query(&glyphon::fontdb::Query {
                    families: &[expected_family],
                    weight: expected_weight,
                    ..Default::default()
                })
                .expect("CJK system caption family should resolve");
            let mut buffer =
                glyphon::Buffer::new(&mut font_system, glyphon::Metrics::new(64.0, 76.8));
            buffer.set_text(
                &mut font_system,
                "人物的停顿",
                &glyphon::Attrs::new()
                    .family(expected_family)
                    .weight(expected_weight),
                glyphon::Shaping::Advanced,
            );
            let actual = glyphon::cosmic_text::LayoutRunIter::new(&buffer)
                .flat_map(|run| run.glyphs.iter().map(|glyph| glyph.font_id))
                .next()
                .expect("Chinese sample should shape");
            assert_eq!(
                actual, expected,
                "{project_family} used an unrelated fallback"
            );
        }
    }
}
