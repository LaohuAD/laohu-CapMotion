# Cap Preset, Caption Position, Animation, and Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make preset saves field-differential, make subtitle placement track-wide and editable as centered X/Y coordinates, provide distinct entry-only animations, and route large project media through the user-selected storage directory.

**Architecture:** Preserve the existing `ProjectConfiguration` and user preset store as the authorities. Capture a reusable presentation snapshot when the editor opens or applies a preset, then merge only session-changed reusable fields into the selected preset; keep `agentProfile` outside that merge. Add track-position overrides to caption settings, resolve them ahead of the global fallback, and centralize storage path resolution in Rust so recordings, screenshots, project assets, and library scans agree.

**Tech Stack:** SolidJS, TypeScript, Vitest, Tauri 2, Rust, serde/specta, wgpu/glyphon.

---

### Task 1: Differential named-preset saves

**Files:**
- Modify: `apps/desktop/src/routes/editor/preset-config.ts`
- Modify: `apps/desktop/src/routes/editor/preset-config.test.ts`
- Modify: `apps/desktop/src/utils/createPresets.ts`
- Modify: `apps/desktop/src/routes/editor/context.ts`
- Modify: `apps/desktop/src/routes/editor/PresetsDropdown.tsx`

- [ ] **Step 1: Add a failing test for an editor-session baseline**

Add a test proving that a project value already different when the editor opened is not saved, while a field changed after the baseline is captured is saved:

```ts
const baseline = { background: { blur: 10 }, captions: { settings: { size: 64 } } };
const current = { background: { blur: 10 }, captions: { settings: { size: 72 } } };
const saved = { background: { blur: 22 }, captions: { settings: { size: 64 } } };
expect(mergeChangedPresetFields(saved, baseline, current)).toEqual({
  background: { blur: 22 },
  captions: { settings: { size: 72 } },
});
```

- [ ] **Step 2: Run the focused test and confirm it fails for the missing no-apply behavior**

Run: `pnpm --dir apps/desktop vitest run src/routes/editor/preset-config.test.ts`

Expected: the new integration expectation fails until `createPresets` no longer requires an applied preset name.

- [ ] **Step 3: Replace the applied-preset guard with a project-session baseline**

In `createPresets.ts`, store only a reusable project baseline:

```ts
let projectBaseline: ProjectConfiguration | undefined;

captureProjectBaseline(config) {
  projectBaseline = createReusablePresetConfig(config as never);
}
```

`saveToPreset` must use `projectBaseline ?? reusable`, call `mergeChangedPresetFields` against the latest stored `entry.config`, and then advance the baseline to the current reusable snapshot. It must never replace the whole preset entry, so `agentProfile` remains unchanged.

- [ ] **Step 4: Initialize and refresh the baseline at the correct lifecycle boundaries**

Capture the initial normalized project in `EditorContextProvider`; refresh it after Apply, Reset, Create, and successful Save. Remove the toast path that says the preset must first be applied.

- [ ] **Step 5: Run preset tests**

Run: `pnpm --dir apps/desktop vitest run src/routes/editor/preset-config.test.ts src/editor-i18n-coverage.test.ts`

Expected: PASS.

### Task 2: Track-wide manual subtitle coordinates

**Files:**
- Create: `apps/desktop/src/routes/editor/caption-position.ts`
- Create: `apps/desktop/src/routes/editor/caption-position.test.ts`
- Modify: `apps/desktop/src/store/captions.ts`
- Modify: `crates/project/src/configuration.rs`
- Modify: `apps/desktop/src/routes/editor/CaptionsTab.tsx`
- Modify: `apps/desktop/src/routes/editor/CaptionOverlay.tsx`
- Modify: `crates/rendering/src/layers/captions.rs`
- Modify generated bindings: `apps/desktop/src/utils/tauri.ts`

- [ ] **Step 1: Write coordinate conversion tests**

```ts
expect(normalizedToCenteredPixels({ x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 0 });
expect(centeredPixelsToNormalized({ x: 1, y: -1 })).toEqual({
  x: 0.5 + 1 / 1920,
  y: 0.5 - 1 / 1080,
});
```

- [ ] **Step 2: Add a serializable track-position setting**

Add this backwards-compatible shape to `CaptionSettings`:

```rust
pub struct CaptionTrackPosition {
    pub track_id: String,
    pub position: String,
    pub manual_position: Option<XY<f32>>,
}

#[serde(default)]
pub track_positions: Vec<CaptionTrackPosition>,
```

Legacy projects continue using the existing global position. New track settings override global position but remain below explicit legacy per-segment overrides until the UI clears those overrides for the edited track.

- [ ] **Step 3: Add track resolution tests in Rust and TypeScript**

Test `zh-CN` and `en` with different centers, plus a legacy track with no override falling back to global settings.

Run: `cargo test -p cap-project manual_positions -- --nocapture`

Expected: FAIL until the new shape is implemented.

- [ ] **Step 4: Implement sidebar coordinates and track selection**

The selected caption segment determines the active track; otherwise use the first caption track. When position is Manual, show X/Y number inputs in centered 1920x1080 pixels. Writing either input updates that track and clears position overrides from every segment in that track.

- [ ] **Step 5: Make canvas drag and arrow keys update the track**

Dragging any active caption writes one track setting, not one segment override. Add a document `keydown` handler that accepts held arrow repeats, ignores editable controls, and nudges by `1 / 1920` or `1 / 1080` per event.

- [ ] **Step 6: Render track positions consistently**

Resolve position in this order: legacy segment override, matching track setting, global caption setting. Preview overlay and Rust renderer must use the same resolver.

- [ ] **Step 7: Run caption tests**

Run: `pnpm --dir apps/desktop vitest run src/routes/editor/caption-position.test.ts src/routes/editor/caption-tracks.test.ts`

Run: `cargo test -p cap-project caption -- --nocapture && cargo test -p cap-rendering caption -- --nocapture`

Expected: PASS.

### Task 3: Distinct entry-only caption animations

**Files:**
- Modify: `apps/desktop/src/store/captions.ts`
- Modify: `apps/desktop/src/routes/editor/text-style.tsx`
- Modify: `apps/desktop/src/routes/editor/CaptionsTab.tsx`
- Modify: `crates/rendering/src/layers/captions.rs`
- Modify: `apps/desktop/src/i18n-literals.ts`

- [ ] **Step 1: Write animation timing tests**

Test four cases at start, middle, exact end, and after end:

```rust
assert_eq!(entry_opacity(None, start), 1.0);
assert_eq!(entry_opacity(Fade, start), 0.0);
assert_eq!(entry_opacity(Fade, end), 1.0);
assert!(rise_offset(start) > 0.0);
assert!(pop_scale(start) < 1.0);
```

Also assert that the active-caption lookup does not extend a segment beyond its end for an exit animation.

- [ ] **Step 2: Expand the public animation enum**

Use `none`, `fade`, `bounce`, and `pop`. Label `bounce` as the localized equivalent of “Rise / 上移弹入” for backwards compatibility with saved projects.

- [ ] **Step 3: Implement entry-only rendering**

Remove fade-tail lookup. `fade` changes only opacity; `bounce` changes only entry Y offset plus a light overshoot; `pop` changes only entry scale plus a light overshoot. All return their steady state before the caption end and disappear immediately at end.

- [ ] **Step 4: Update UI wording and run tests**

Rename “Fade Duration” to “Entry Duration”.

Run: `cargo test -p cap-rendering caption -- --nocapture`

Run: `pnpm --dir apps/desktop vitest run src/editor-i18n-coverage.test.ts src/i18n-literals.test.ts`

Expected: PASS.

### Task 4: Unified large-media storage location

**Files:**
- Modify: `apps/desktop/src-tauri/src/recordings_locations.rs`
- Modify: `apps/desktop/src-tauri/src/recording.rs`
- Modify: `apps/desktop/src-tauri/src/tray.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/routes/(window-chrome)/settings/general.tsx`
- Modify: `apps/desktop/src/i18n.tsx`
- Modify: `apps/desktop/src/routes/editor/ClipsSidebar.tsx`
- Modify: `apps/desktop/src/routes/editor/ConfigSidebar.tsx`
- Modify: `apps/desktop/src/routes/screenshot-editor/popovers/BackgroundSettingsPopover.tsx`

- [ ] **Step 1: Write pure path-resolution tests**

Test that the default keeps historical sibling directories and a custom location routes screenshots beneath that selected location:

```rust
assert_eq!(resolve_screenshots_dir(app_data, None), app_data.join("screenshots"));
assert_eq!(resolve_screenshots_dir(app_data, Some(external)), external.join("screenshots"));
```

- [ ] **Step 2: Centralize Rust path resolution**

Expose `recordings_dir`, `screenshots_dir`, `known_recordings_dirs`, and `known_screenshots_dirs` from `recordings_locations.rs`. Remove duplicated hard-coded `app_data_dir()/recordings` and `app_data_dir()/screenshots` writers and scanners.

- [ ] **Step 3: Store imported background images inside their project**

Use the editor or screenshot project path and write into `<project>.cap/assets/backgrounds/`. Validate the extension and sanitize the filename. Persist the absolute asset path in the current project configuration; do not write new `bg-*` files at Application Support root.

- [ ] **Step 4: Make the visible setting describe its real scope**

Change the section title/description to “工程与媒体存储位置” / “Project and media storage location”. Keep one folder chooser and the optional existing-project migration action.

- [ ] **Step 5: Verify storage behavior**

Run Rust unit tests for `recordings_locations` and TypeScript i18n coverage. Then create temporary custom storage, write a recording/screenshot/project asset through test helpers, and assert no new large file appears under the default directories.

Expected: PASS and all paths resolve under the chosen folder.

### Task 5: Project rule evolution and full regression

**Files:**
- Modify: `AGENTS.md`
- Modify: `知识沉淀/Cap 个性化预设与 Agent 接口进化计划.md`
- Modify: `知识沉淀/Cap 开发版验收与发布打包进化记录.json`

- [ ] **Step 1: Record the earliest failure and reusable rules**

Document that preset saves are field-differential, track position is track-owned, entry animation has no exit phase, and one user storage setting governs large project media.

- [ ] **Step 2: Run focused test suites**

Run the tests from Tasks 1–4 plus:

```bash
pnpm --dir apps/desktop typecheck
cargo check -p cap-desktop --features custom-protocol
```

Expected: PASS.

- [ ] **Step 3: Run source audits**

Search for stale hard-coded recording/screenshot directories, the obsolete apply-before-save error, per-segment position writes from canvas drag, and exit-animation calculations. Any remaining occurrence must be a documented compatibility path or test fixture.

- [ ] **Step 4: Do not package**

Leave the independent `/Users/a1/Applications/CapMotion.app` unchanged. Packaging is a later single action only after development validation and a new explicit user request.
