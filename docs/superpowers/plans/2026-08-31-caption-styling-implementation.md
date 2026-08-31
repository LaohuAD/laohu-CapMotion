# Caption Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make caption font family, weight, letter spacing, outline and shadow real project settings that render identically in preview and export, with complete Chinese UI copy.

**Architecture:** Extend the serde/Specta caption schema first, then add pure/testable caption style helpers in Rust, load three pinned open-source Chinese fonts into the shared `glyphon::FontSystem`, and finally expose the settings in the SolidJS caption panel. The GPU renderer remains authoritative; DOM measurement mirrors the same settings but never substitutes for export rendering.

**Tech Stack:** Rust, serde, Specta, glyphon/cosmic-text, SolidJS, Vitest, Node setup scripts.

**Working-tree rule:** The repository already contains unrelated uncommitted user work. Do not clean, stash, reset or create a worktree. Do not commit mixed files; use narrow diffs and test checkpoints until the user explicitly authorizes a commit.

---

### Task 1: Add backward-compatible caption style fields

**Files:**
- Create: `crates/project/tests/caption_style_settings.rs`
- Modify: `crates/project/src/configuration.rs:2144-2247`
- Regenerate: `apps/desktop/src/utils/tauri.ts`

- [ ] **Step 1: Write the failing legacy/default serialization test**

```rust
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
}

#[test]
fn new_caption_style_fields_round_trip() {
    let mut settings = CaptionSettings::default();
    settings.letter_spacing = 2.5;
    settings.outline = true;
    settings.outline_width = 4.0;
    settings.shadow = true;
    settings.shadow_blur = 12.0;
    let value = serde_json::to_value(&settings).unwrap();
    let decoded: CaptionSettings = serde_json::from_value(value).unwrap();
    assert_eq!(decoded.letter_spacing, 2.5);
    assert_eq!(decoded.outline_width, 4.0);
    assert!(decoded.shadow);
    assert_eq!(decoded.shadow_blur, 12.0);
}
```

- [ ] **Step 2: Run the test and verify the missing fields fail compilation**

Run: `cargo test -p cap-project --test caption_style_settings`

Expected: FAIL because `CaptionSettings` has no `letter_spacing`, `outline_width` or shadow fields.

- [ ] **Step 3: Add the exact fields and defaults**

```rust
pub letter_spacing: f32,
#[serde(alias = "outlineWidth")]
pub outline_width: f32,
pub shadow: bool,
#[serde(alias = "shadowColor")]
pub shadow_color: String,
#[serde(alias = "shadowOpacity")]
pub shadow_opacity: f32,
#[serde(alias = "shadowBlur")]
pub shadow_blur: f32,
#[serde(alias = "shadowDistance")]
pub shadow_distance: f32,
#[serde(alias = "shadowAngle")]
pub shadow_angle: f32,
```

Set the defaults asserted above in `impl Default for CaptionSettings`. Keep `shadow = false` so old projects do not change appearance.

- [ ] **Step 4: Run the Rust test and regenerate bindings**

Run: `cargo test -p cap-project --test caption_style_settings`

Expected: PASS, 2 tests.

Run: `pnpm --filter @cap/desktop preparescript`

Expected: `apps/desktop/src/utils/tauri.ts` contains camel-case `letterSpacing`, `outlineWidth`, `shadowColor`, `shadowOpacity`, `shadowBlur`, `shadowDistance`, and `shadowAngle` on `CaptionSettings`.

### Task 2: Add deterministic bundled Chinese font resources

**Files:**
- Create: `scripts/setup-caption-fonts.mjs`
- Create: `scripts/setup-caption-fonts.test.mjs`
- Create: `crates/rendering/assets/caption-fonts/README.md`
- Create: `crates/rendering/assets/caption-fonts/LICENSE-Source-Han.txt`
- Create: `crates/rendering/assets/caption-fonts/LICENSE-LXGW-WenKai.txt`
- Modify: `scripts/setup.js`
- Modify: `.gitignore`
- Modify: `crates/rendering/src/layers/mod.rs`

- [ ] **Step 1: Write a failing checksum/cache behavior test**

The test creates a local HTTP server, downloads a mock font, verifies SHA-256, reuses a valid cached file, and rejects corrupted cached bytes. Its assertions must call the exported function directly:

```js
await ensureCaptionFont({ url, fileName: "font.ttf", sha256 }, directory, {
  log: () => {},
});
assert.deepEqual(await readFile(path.join(directory, "font.ttf")), payload);
await assert.rejects(
  ensureCaptionFont({ url, fileName: "font.ttf", sha256: "0".repeat(64) }, directory),
  /checksum/i,
);
```

- [ ] **Step 2: Run the Node test and verify the module is missing**

Run: `node --test scripts/setup-caption-fonts.test.mjs`

Expected: FAIL with module-not-found for `setup-caption-fonts.mjs`.

- [ ] **Step 3: Implement the resource installer**

Export `ensureCaptionFont(entry, directory, options)` and `setupCaptionFonts(root)`. Use `scripts/download-file.mjs`, `crypto.createHash("sha256")`, atomic `.part` download behavior, and these pinned upstream files:

```js
export const CAPTION_FONTS = [
  {
    family: "Source Han Sans CN VF",
    fileName: "SourceHanSansCN-VF.ttf",
    url: "https://github.com/adobe-fonts/source-han-sans/raw/2.005R/Variable/TTF/Subset/SourceHanSansCN-VF.ttf",
    sha256: "25a01e41b5cc99893eb35a6cd2cc7611841dc19eb03cbaf7f0c1de8210f2ba0b",
  },
  {
    family: "Source Han Serif CN VF",
    fileName: "SourceHanSerifCN-VF.ttf",
    url: "https://github.com/adobe-fonts/source-han-serif/raw/2.003R/Variable/TTF/Subset/SourceHanSerifCN-VF.ttf",
    sha256: "8e052cbcdbd0f03496c9ad05da7d57901549286d5efd30f3caf66a393f6c389b",
  },
  {
    family: "LXGW WenKai",
    fileName: "LXGWWenKai-Regular.ttf",
    url: "https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Regular.ttf",
    sha256: "39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009",
  },
];
```

The script must reject entries without a 64-character checksum. The two Adobe checksums above were calculated from the pinned release-tag URLs on 2026-08-31; the LXGW checksum is the upstream release digest.

- [ ] **Step 4: Wire setup and ignore only generated binaries**

Call `await setupCaptionFonts(__root)` from `scripts/setup.js` before Rust compilation. Add only the three generated `.ttf` paths and `.part` files to `.gitignore`; keep README and license texts tracked.

- [ ] **Step 5: Load the embedded fonts once in the shared renderer database**

In `crates/rendering/src/layers/mod.rs`, add:

```rust
const BUNDLED_CAPTION_FONTS: &[&[u8]] = &[
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/caption-fonts/SourceHanSansCN-VF.ttf")),
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/caption-fonts/SourceHanSerifCN-VF.ttf")),
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/caption-fonts/LXGWWenKai-Regular.ttf")),
];

for bytes in BUNDLED_CAPTION_FONTS {
    db.load_font_data(bytes.to_vec());
}
```

Load before storing `FONT_TEMPLATE`, so every cloned `FontSystem` sees the same faces.

- [ ] **Step 6: Extend the existing font-resolution test**

Query `Family::Name("Source Han Sans CN VF")`, `Family::Name("Source Han Serif CN VF")`, and `Family::Name("LXGW WenKai")`; assert that each resolves. For Source Han Sans/Serif also query weights 400 and 700 and assert both remain in the requested family.

- [ ] **Step 7: Run setup and font tests**

Run: `node --test scripts/setup-caption-fonts.test.mjs`

Expected: PASS.

Run: `pnpm cap-setup`

Expected: three verified font files exist under `crates/rendering/assets/caption-fonts/`.

Run: `cargo test -p cap-rendering font_tests`

Expected: generic and bundled families resolve.

### Task 3: Make the GPU renderer honor the selected family and tracking

**Files:**
- Create: `crates/rendering/src/layers/caption_style.rs`
- Modify: `crates/rendering/src/layers/mod.rs`
- Modify: `crates/rendering/src/layers/captions.rs`

- [ ] **Step 1: Write failing pure helper tests**

```rust
#[test]
fn named_caption_font_does_not_fall_back_to_generic_sans() {
    assert_eq!(caption_family("Source Han Sans CN VF"), Family::Name("Source Han Sans CN VF"));
}

#[test]
fn shadow_offset_uses_distance_and_angle() {
    let [x, y] = shadow_offset(5.0, -45.0);
    assert!((x - 3.5355).abs() < 0.001);
    assert!((y + 3.5355).abs() < 0.001);
}

#[test]
fn outline_samples_expand_with_width() {
    assert!(outline_offsets(4.0).iter().all(|[x, y]| x.abs() <= 4.0 && y.abs() <= 4.0));
}
```

- [ ] **Step 2: Run and verify failure**

Run: `cargo test -p cap-rendering caption_style`

Expected: FAIL because the module/functions do not exist.

- [ ] **Step 3: Implement style helpers and use them in caption shaping**

`caption_family` must preserve named families:

```rust
pub fn caption_family(name: &str) -> Family<'_> {
    match name.trim().to_ascii_lowercase().as_str() {
        "" | "system sans-serif" => Family::SansSerif,
        "system serif" => Family::Serif,
        "system monospace" => Family::Monospace,
        _ => Family::Name(name),
    }
}
```

Every `Attrs::new()` used for base text and rich-text highlighting must include:

```rust
.family(font_family)
.weight(Weight(caption_data.settings.font_weight.clamp(100, 900) as u16))
.letter_spacing(caption_data.settings.letter_spacing)
```

Do not keep the old three-bucket 400/500/700 mapping.

- [ ] **Step 4: Run renderer tests**

Run: `cargo test -p cap-rendering caption_style`

Expected: PASS.

### Task 4: Render configurable outline and Jianying-style shadow

**Files:**
- Modify: `crates/rendering/src/layers/caption_style.rs`
- Modify: `crates/rendering/src/layers/captions.rs`

- [ ] **Step 1: Add failing tests for disabled effects and bounded blur samples**

```rust
assert!(shadow_samples(false, 5.0, -45.0, 15.0).is_empty());
let samples = shadow_samples(true, 5.0, -45.0, 15.0);
assert!(!samples.is_empty());
assert!(samples.len() <= 25);
assert!(samples.iter().all(|sample| sample.alpha > 0.0 && sample.alpha <= 1.0));
```

- [ ] **Step 2: Run and verify failure**

Run: `cargo test -p cap-rendering caption_style::tests::shadow_samples_are_bounded`

Expected: FAIL because `shadow_samples` is missing.

- [ ] **Step 3: Implement the render passes**

Build shadow `TextArea`s before outline and fill. Convert angle/distance to a base offset, then add a bounded symmetric kernel whose radius is derived from `shadowBlur`; normalize sample alpha so increasing blur does not make the shadow arbitrarily darker. Multiply by `shadowOpacity / 100` and the existing fade opacity.

Replace fixed `1.2 * render_scale` with:

```rust
let outline_thickness = caption_data.settings.outline_width.max(0.0) * render_scale;
```

Keep ordering: shadow → outline → fill/highlight.

- [ ] **Step 4: Run all rendering tests**

Run: `cargo test -p cap-rendering layers::captions`

Run: `cargo test -p cap-rendering caption_style`

Expected: PASS.

### Task 5: Expose real font/style controls and Chinese translations

**Files:**
- Create: `apps/desktop/src/routes/editor/caption-style.test.ts`
- Create: `apps/desktop/src/routes/editor/caption-style.ts`
- Modify: `apps/desktop/src/routes/editor/text-style.tsx`
- Modify: `apps/desktop/src/store/captions.ts`
- Modify: `apps/desktop/src/routes/editor/CaptionsTab.tsx`
- Modify: `apps/desktop/src/routes/editor/CaptionOverlay.tsx`
- Modify: `apps/desktop/src/i18n-literals.ts`
- Modify: `apps/desktop/src/i18n-literals.test.ts`
- Modify: `apps/desktop/src/editor-i18n-coverage.test.ts`

- [ ] **Step 1: Write failing normalization and option-merging tests**

```ts
expect(normalizeCaptionStyle({})).toMatchObject({
  letterSpacing: 0,
  outlineWidth: 1.2,
  shadow: false,
  shadowOpacity: 75,
  shadowBlur: 15,
  shadowDistance: 5,
  shadowAngle: -45,
});
expect(mergeCaptionFonts(["PingFang SC", "LXGW WenKai"])).toEqual([
  "Source Han Sans CN VF",
  "Source Han Serif CN VF",
  "LXGW WenKai",
  "PingFang SC",
]);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/caption-style.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement helpers and extend presets without changing old visuals**

Merge bundled and installed font names with stable de-duplication. Extend every `CaptionPresetStyle` with explicit defaults. Keep existing preset defaults `shadow: false`, `letterSpacing: 0`, `outlineWidth: 1.2`.

The bundled options use Chinese user-facing labels while retaining stable technical values:

```ts
{ value: "Source Han Sans CN VF", label: "思源黑体（简体中文）" }
{ value: "Source Han Serif CN VF", label: "思源宋体（简体中文）" }
{ value: "LXGW WenKai", label: "霞鹜文楷" }
```

If an existing project names a system font that is no longer installed, keep that value as a selected `（字体不可用）` option and show the renderer fallback notice. Do not overwrite the stored family name, so reinstalling the font restores the intended style.

- [ ] **Step 4: Replace the fixed caption font select and add effect panels**

Use `listSystemFonts()` and the merged options in `CaptionsTab.tsx`. Add sliders with these bounded ranges:

```text
letterSpacing  -2..20 step 0.1
outlineWidth    0..12 step 0.1
shadowOpacity   0..100 step 1
shadowBlur      0..30 step 1
shadowDistance  0..30 step 1
shadowAngle  -180..180 step 1
```

Hide dependent color/sliders when their effect switch is off, but preserve stored values.

- [ ] **Step 5: Make overlay measurement mirror the GPU settings**

Map system generic names as before; otherwise use CSS `font-family: "<selected>", system-ui, sans-serif`. Apply numeric `font-weight` and `letter-spacing: <value>px` to the hidden measurement element. The overlay does not draw the authoritative shadow; it only measures/selects.

- [ ] **Step 6: Add all caption-panel literals to the unified i18n map**

At minimum cover `Font Settings`, `Font Weight`, `Letter Spacing`, `Outline`, `Outline Color`, `Outline Width`, `Shadow`, `Shadow Color`, `Shadow Opacity`, `Shadow Blur`, `Shadow Distance`, `Shadow Angle`, `Background Settings`, `Export Options`, `Export with Subtitles`, all caption positions, weight labels, animation labels and highlight labels.

Extend the tests to assert the Chinese translations while still preserving technical values such as font family names.

- [ ] **Step 7: Run desktop tests and type checks**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/caption-style.test.ts src/i18n-literals.test.ts src/editor-i18n-coverage.test.ts`

Expected: PASS.

Run: `pnpm --filter @cap/desktop exec tsc --noEmit`

Expected: PASS.

### Task 6: Cross-layer regression and visual evidence

**Files:**
- Modify only if a regression is found in files already listed above.

- [ ] **Step 1: Run focused Rust and desktop suites**

Run: `cargo test -p cap-project --test caption_style_settings`

Run: `cargo test -p cap-rendering font_tests`

Run: `cargo test -p cap-rendering caption_style`

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/caption-style.test.ts src/i18n-literals.test.ts src/editor-i18n-coverage.test.ts`

Expected: all PASS.

- [ ] **Step 2: Build without launching the GUI**

Run: `pnpm --filter @cap/desktop build`

Expected: build succeeds; no Cap window is opened.

- [ ] **Step 3: Manual acceptance only after the user asks to test**

Open the existing test `.cap` project, capture one preview frame and one exported frame for each bundled family, and compare family, weight, spacing, outline and shadow. Record any visual mismatch as FAIL; do not declare parity from unit tests alone.
