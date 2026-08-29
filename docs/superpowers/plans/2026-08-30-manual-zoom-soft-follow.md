# Manual Zoom Soft Follow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a persistent click-through manual-zoom frame whose live position and final rendered crop share a deterministic dead-zone soft-follow path.

**Architecture:** Add an explicit backward-compatible `ManualFollow` zoom mode and a pure Rust follow algorithm in `cap-project`. The renderer replays recorded cursor moves through that algorithm, while the overlay applies the same parameter contract and equations in TypeScript using global cursor polling and matching behavior tests.

**Tech Stack:** Rust/Serde/Specta, Cap cursor events and renderer, Tauri Webview, SolidJS, Vitest.

---

## File map

- Modify `crates/project/src/configuration.rs`: versioned `ManualFollow` zoom mode and follow parameters.
- Modify `crates/project/src/manual_zoom.rs`: new recordings create follow segments.
- Modify `crates/project/tests/manual_zoom.rs`: compatibility and segment tests.
- Create `crates/project/src/manual_follow.rs`: deterministic dead-zone algorithm.
- Modify `crates/project/src/lib.rs`: export the algorithm/types.
- Modify `crates/rendering/src/zoom_spring.rs`: replay cursor movement for manual-follow segments.
- Modify `apps/desktop-gpui/src/editor_panels.rs`, `editor_timeline.rs`: treat follow segments as manually editable.
- Modify `apps/desktop/src/routes/editor/ConfigSidebar.tsx`: expose follow segments through existing manual controls.
- Modify `apps/desktop/src/utils/manual-zoom-overlay.ts` and test: live soft-follow state and viewport projection.
- Modify `apps/desktop/src/routes/manual-zoom-overlay.tsx`: persistent 30% dim overlay and global cursor polling.
- Modify `apps/desktop/src-tauri/src/recording.rs`: overlay lifecycle and non-activating click-through behavior.
- Modify generated `apps/desktop/src/utils/tauri.ts` and `apps/src/utils/tauri.ts`.

### Task 1: Implement a deterministic dead-zone follow algorithm

**Files:**
- Create: `crates/project/src/manual_follow.rs`
- Modify: `crates/project/src/lib.rs`
- Test: `crates/project/src/manual_follow.rs`

- [ ] **Step 1: Write failing algorithm tests**

```rust
#[test]
fn cursor_inside_safe_zone_keeps_center_fixed() {
    let config = ManualFollowConfig::default();
    let next = advance_manual_follow((0.5, 0.5), (0.6, 0.55), 2.0, 1.0 / 60.0, config);
    assert_eq!(next, (0.5, 0.5));
}

#[test]
fn cursor_near_edge_moves_center_without_jumping() {
    let config = ManualFollowConfig::default();
    let next = advance_manual_follow((0.5, 0.5), (0.74, 0.5), 2.0, 1.0 / 60.0, config);
    assert!(next.0 > 0.5);
    assert!(next.0 < 0.74);
    assert_eq!(next.1, 0.5);
}

#[test]
fn follow_center_never_exposes_outside_source() {
    let next = advance_manual_follow((0.75, 0.5), (1.0, 0.5), 2.0, 1.0, ManualFollowConfig::default());
    assert_eq!(next.0, 0.75);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cargo test -p cap-project manual_follow`

Expected: module/functions do not exist.

- [ ] **Step 3: Implement the pure algorithm**

Define:

```rust
#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManualFollowConfig {
    pub safe_zone_ratio: f32,
    pub response: f32,
}

impl Default for ManualFollowConfig {
    fn default() -> Self { Self { safe_zone_ratio: 0.6, response: 14.0 } }
}
```

For each axis, compute viewport half-size `0.5 / amount`, safe half-size `viewport_half * safe_zone_ratio`, and the nearest center that places the cursor back on the safe-zone boundary. Smooth toward that target with frame-rate-independent alpha `1.0 - exp(-response * dt)`, then clamp the center to `[viewport_half, 1.0 - viewport_half]`. Invalid values fall back to the defaults.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `cargo test -p cap-project manual_follow`

Expected: all follow tests pass.

- [ ] **Step 5: Commit the algorithm**

```bash
git add crates/project/src/manual_follow.rs crates/project/src/lib.rs
git commit -m "feat: add deterministic manual zoom follow"
```

### Task 2: Add a backward-compatible manual-follow project mode

**Files:**
- Modify: `crates/project/src/configuration.rs:975-979,3380-3430`
- Modify: `crates/project/src/manual_zoom.rs`
- Modify: `crates/project/tests/manual_zoom.rs`

- [ ] **Step 1: Write failing compatibility tests**

```rust
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
    assert!(matches!(session.segments()[0].mode,
        ZoomMode::ManualFollow { x, y, .. } if x == 0.7 && y == 0.4));
}
```

- [ ] **Step 2: Run and verify RED**

Run: `cargo test -p cap-project --test manual_zoom`

Expected: `ManualFollow` is missing.

- [ ] **Step 3: Extend `ZoomMode` and the recording session**

Add:

```rust
ManualFollow {
    x: f32,
    y: f32,
    #[serde(default)]
    config: ManualFollowConfig,
},
```

Keep the existing `Manual { x, y }` unchanged. Change only newly recorded manual zoom segments to `ManualFollow`; old projects retain fixed framing.

- [ ] **Step 4: Update exhaustive manual-mode matches**

In `apps/desktop-gpui/src/editor_panels.rs`, `apps/desktop-gpui/src/editor_timeline.rs`, and `apps/desktop/src/routes/editor/ConfigSidebar.tsx`, treat `ManualFollow` as a manual mode for selection, x/y editing, track labels, and multi-selection. Preserve its `config` when x/y changes; switching Auto → Manual from the editor continues to create fixed `Manual`, because the editor action is not a recording-time follow gesture.

- [ ] **Step 5: Run compatibility tests and checks**

Run: `cargo test -p cap-project --test manual_zoom`

Run: `cargo check -p cap-desktop-gpui -p cap-desktop`

Expected: old and new modes pass round-trip tests and every exhaustive match compiles.

- [ ] **Step 6: Commit the schema**

```bash
git add crates/project/src/configuration.rs crates/project/src/manual_zoom.rs crates/project/tests/manual_zoom.rs apps/desktop-gpui/src/editor_panels.rs apps/desktop-gpui/src/editor_timeline.rs apps/desktop/src/routes/editor/ConfigSidebar.tsx
git commit -m "feat: store manual zoom follow segments"
```

### Task 3: Render manual follow from recorded cursor events

**Files:**
- Modify: `crates/rendering/src/zoom_spring.rs:470-515,820-855,879-end`

- [ ] **Step 1: Write failing renderer tests**

Add helpers for a `ManualFollow` segment and cursor moves, then assert:

```rust
#[test]
fn manual_follow_stays_stable_then_tracks_edge_cursor() {
    let segment = manual_follow_segment(0.0, 3.0, 2.0, 0.5, 0.5);
    let cursor = CursorEvents { moves: vec![
        move_event(500.0, 0.55, 0.5),
        move_event(1_500.0, 0.9, 0.5),
    ], clicks: vec![] };
    let mut timeline = timeline_for(&[segment], &cursor, 3.0);
    let stable = timeline.sample(0.75).bounds;
    let followed = timeline.sample(2.0).bounds;
    assert!((stable.top_left.x + 0.5).abs() < 0.02);
    assert!(followed.top_left.x < stable.top_left.x);
}
```

- [ ] **Step 2: Run and verify RED**

Run: `cargo test -p cap-rendering manual_follow --lib`

Expected: renderer does not handle the new mode.

- [ ] **Step 3: Add follow state to timeline precomputation**

During each fixed precompute step, map timeline time to recording time, interpolate the current cursor move, and feed the previous follow center plus cursor into `advance_manual_follow`. `Manual` remains fixed and `Auto` keeps its existing clustering behavior. Reset the follow center to the segment's stored x/y when a new `ManualFollow` segment becomes active.

- [ ] **Step 4: Run renderer tests**

Run: `cargo test -p cap-rendering manual_follow --lib`

Expected: stability, movement, and bounds tests pass.

- [ ] **Step 5: Commit rendering support**

```bash
git add crates/rendering/src/zoom_spring.rs
git commit -m "feat: render soft-follow manual zoom paths"
```

### Task 4: Implement the persistent live overlay

**Files:**
- Modify: `apps/desktop/src/utils/manual-zoom-overlay.ts`
- Modify: `apps/desktop/src/utils/manual-zoom-overlay.test.ts`
- Modify: `apps/desktop/src/routes/manual-zoom-overlay.tsx`

- [ ] **Step 1: Write failing TypeScript follow tests**

```ts
it("keeps the frame still inside the safe zone", () => {
  expect(advanceManualZoomFollow({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.55 }, 2, 1 / 60))
    .toEqual({ x: 0.5, y: 0.5 });
});

it("moves smoothly when the cursor enters the edge buffer", () => {
  const next = advanceManualZoomFollow({ x: 0.5, y: 0.5 }, { x: 0.74, y: 0.5 }, 2, 1 / 60);
  expect(next.x).toBeGreaterThan(0.5);
  expect(next.x).toBeLessThan(0.74);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --dir apps/desktop exec vitest run src/utils/manual-zoom-overlay.test.ts`

Expected: `advanceManualZoomFollow` is missing.

- [ ] **Step 3: Implement the same contract in TypeScript**

Use `{ safeZoneRatio: 0.6, response: 14 }`, the same exponential smoothing formula, and the same viewport-bound clamping as Rust. Keep `manualZoomViewport` as the final center-to-rectangle projection.

- [ ] **Step 4: Poll the global cursor without intercepting input**

In the route, import `cursorPosition` and `getCurrentWindow`. On animation frames, throttle cursor reads to about 30 Hz, convert the returned physical cursor position to normalized coordinates using the overlay window's physical outer position and size, advance the follow center, and render the viewport. Cancel the animation frame on cleanup.

- [ ] **Step 5: Apply the confirmed visuals**

Use a persistent viewport while the overlay window exists:

```tsx
class="absolute rounded-xl border-2 border-blue-8/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.30),0_0_0_1px_rgba(255,255,255,0.42)]"
```

Remove the floating `2.0× REC FRAME` label and all controls. The frame interior remains clear; only the exterior is dimmed.

- [ ] **Step 6: Run frontend tests**

Run: `pnpm --dir apps/desktop exec vitest run src/utils/manual-zoom-overlay.test.ts`

Expected: viewport and follow tests pass.

- [ ] **Step 7: Commit the live overlay**

```bash
git add apps/desktop/src/utils/manual-zoom-overlay.ts apps/desktop/src/utils/manual-zoom-overlay.test.ts apps/desktop/src/routes/manual-zoom-overlay.tsx
git commit -m "feat: keep manual zoom frame in soft follow"
```

### Task 5: Enforce click-through, no-focus overlay lifecycle

**Files:**
- Modify: `apps/desktop/src-tauri/src/recording.rs:95-215,2660-2720`
- Test: `apps/desktop/src-tauri/src/recording.rs:4486-end`

- [ ] **Step 1: Write failing overlay-option tests**

Extract a pure `manual_zoom_overlay_options()` value and assert it requests transparent, always-on-top, non-focusable, click-through behavior and 0.30 dim opacity in its URL contract.

- [ ] **Step 2: Run and verify RED**

Run: `cargo test -p cap-desktop manual_zoom_overlay --lib`

Expected: the options helper does not exist.

- [ ] **Step 3: Build/show the window without activation**

Keep `.focused(false)`, call `set_ignore_cursor_events(true)` before `show()`, and on macOS use the existing non-activating panel preparation/window-level helpers rather than activating a normal app window. Reuse the existing overlay only for the active manual segment; second toggle, recording stop, delete, restart, or failure closes it.

- [ ] **Step 4: Regenerate bindings and compile**

Run: `pnpm --dir apps/desktop run preparescript`

Run: `cargo test -p cap-desktop manual_zoom_overlay --lib`

Run: `cargo check -p cap-desktop`

Expected: tests and compile pass.

- [ ] **Step 5: Commit lifecycle changes**

```bash
git add apps/desktop/src-tauri/src/recording.rs apps/desktop/src/utils/tauri.ts apps/src/utils/tauri.ts
git commit -m "fix: make manual zoom overlay non-activating"
```

### Task 6: Verify soft follow without launching the GUI

**Files:**
- No source changes expected.

- [ ] **Step 1: Run focused and compatibility suites**

```bash
cargo test -p cap-project manual_follow
cargo test -p cap-project --test manual_zoom
cargo test -p cap-rendering manual_follow --lib
cargo test -p cap-desktop manual_zoom_overlay --lib
pnpm --dir apps/desktop exec vitest run src/utils/manual-zoom-overlay.test.ts
cargo check -p cap-desktop-gpui -p cap-desktop
pnpm exec tsc -b
pnpm --dir apps/desktop build
```

Expected: all commands pass with no GUI window.
