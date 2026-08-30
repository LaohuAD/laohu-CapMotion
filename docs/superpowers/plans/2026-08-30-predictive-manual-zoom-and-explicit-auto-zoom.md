# Predictive Manual Zoom and Explicit Auto Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make explicit manual zoom keep fast cursor movement comfortably framed in the live overlay and final export, while preventing mouse clicks from silently creating zoom segments when a recording finishes.

**Architecture:** Extend the shared project-level manual-follow configuration and pure motion function so TypeScript preview and Rust rendering use the same comfort-zone, speed-adaptive response, look-ahead and outer-guard contract. The live overlay estimates short-horizon motion from recent samples; the renderer uses the actual cursor stream at the configured future timestamp. Recording finalization becomes manual-only, while the existing editor command remains the explicit path for generating editable click-based `Auto` segments.

**Tech Stack:** Rust (`cap-project`, `cap-rendering`, `cap-desktop`), TypeScript/SolidJS, Vitest, Cargo tests, Tauri/Specta generated bindings.

---

## Task 1: Extend the shared manual-follow motion contract

**Files:**

- Modify: `crates/project/src/manual_follow.rs`
- Modify (generated after the Rust model changes): `apps/desktop/src/utils/tauri.ts`
- Modify (generated mirror): `apps/src/utils/tauri.ts`

- [ ] Add failing Rust tests for default backward-compatible deserialization, projected lead, speed-adaptive response, reversal, outer-guard containment and source-bound clamping.
- [ ] Extend `ManualFollowConfig` with serde-defaulted `comfort_zone_ratio`, `outer_guard_ratio`, `slow_response`, `fast_response`, `prediction_horizon_secs` and `max_lead_ratio` fields while accepting old JSON that only has the original fields.
- [ ] Replace the old two-input follow helper with a pure helper that accepts actual cursor, framing cursor and normalized cursor speed; use projected/future cursor for the comfort target and actual cursor for the hard safety guard.
- [ ] Run `cargo test -p cap-project manual_follow -- --nocapture` and confirm all new and existing tests pass.
- [ ] Run the project binding generator used by `apps/desktop/scripts/prepare.js`, then verify only the expected `ManualFollowConfig` type definitions changed.
- [ ] Commit the shared model and generated bindings.

## Task 2: Use real future cursor positions in final rendering

**Files:**

- Modify: `crates/rendering/src/zoom_spring.rs`

- [ ] Add failing renderer tests showing a manual-follow segment begins reframing before the current cursor reaches a distant target and safely clamps to the final cursor when the look-ahead timestamp exceeds available data.
- [ ] In `ZoomMode::ManualFollow`, map the current timeline time to recording time, sample the actual cursor now, sample the real cursor at `prediction_horizon_secs` in the future, derive normalized speed from those samples and pass both inputs into the shared follow helper.
- [ ] Preserve crop mapping, edited timeline mapping and existing project compatibility; do not shift cursor, video or audio timestamps.
- [ ] Run `cargo test -p cap-rendering manual_follow -- --nocapture` and the complete `cargo test -p cap-rendering` suite.
- [ ] Commit final-render look-ahead separately.

## Task 3: Add causal prediction to the live overlay

**Files:**

- Modify: `apps/desktop/src/utils/manual-zoom-overlay.ts`
- Modify: `apps/desktop/src/utils/manual-zoom-overlay.test.ts`
- Modify: `apps/desktop/src/routes/manual-zoom-overlay.tsx`

- [ ] Add failing Vitest cases for velocity projection, maximum-lead clamping, slow stability, fast response, direction reversal and outer-guard containment.
- [ ] Add a pure live predictor state/update helper that estimates filtered velocity from consecutive cursor samples and resets stale velocity promptly on direction reversal.
- [ ] Mirror the Rust motion constants and call the same conceptual actual-cursor/framing-cursor follow step.
- [ ] Raise sampling to at most 60 Hz while retaining the existing single-in-flight Tauri request guard and click-through/non-focus behavior.
- [ ] Run `pnpm --dir apps/desktop exec vitest run src/utils/manual-zoom-overlay.test.ts` and `pnpm --dir apps/desktop exec tsc --noEmit` (or the repository's equivalent type-check command if direct `tsc` requires generated build context).
- [ ] Commit live overlay prediction separately.

## Task 4: Make automatic zoom an explicit editor action

**Files:**

- Modify: `apps/desktop/src-tauri/src/recording.rs`
- Modify: `apps/desktop/src/routes/(window-chrome)/settings/general.tsx`
- Modify: `apps/desktop/src/routes/editor/Timeline/ZoomTrack.tsx`
- Modify: `apps/desktop/src/i18n-literals.ts`
- Modify only if now unused: `apps/desktop/src/i18n.tsx`

- [ ] Add a failing Rust unit test around the recording-finalization zoom selection proving that click-derived segments are excluded even when the legacy preference is `true`, while manual segments are retained.
- [ ] Extract a small pure helper if needed and change recording finalization to initialize the project with `completed_recording.manual_zoom_segments` only; retain cursor metadata and the legacy serialized preference field for compatibility.
- [ ] Remove the recording-settings toggle so users are not promised a behavior that no longer runs during capture.
- [ ] Keep `commands.generateZoomSegmentsFromClicks()` and make the zoom-track action clearly read `Auto Zoom` / `自动放大`, with supporting text explaining that it generates editable segments from recorded clicks.
- [ ] Run the focused Rust recording tests, the relevant frontend tests/type check, and verify existing explicit click generation tests still pass.
- [ ] Commit the explicit-auto-zoom lifecycle change.

## Task 5: Full verification and one test launch

**Files:**

- Modify only if required by a discovered defect: files already listed above.

- [ ] Run `cargo fmt --all -- --check` and format only scoped Rust files if needed.
- [ ] Run `cargo test -p cap-project`, `cargo test -p cap-rendering`, and the focused `cap-desktop` recording tests.
- [ ] Run the manual-overlay Vitest file and the available desktop TypeScript validation.
- [ ] Inspect `git diff --check`, `git status --short`, and the final diff to ensure setup-download work and user-owned untracked directories were not mixed into the zoom commits.
- [ ] Start the Tauri development app once and leave it available for manual verification: rapid movement, reversal, edge containment, shortcut-only recording zoom and explicit editor auto-zoom generation.
- [ ] Do not merge or push until the user finishes testing and explicitly asks for it.
