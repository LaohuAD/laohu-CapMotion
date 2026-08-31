# Preview Theater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app enlarged preview with a seekable progress bar and consistent play/pause controls while keeping the existing GPU canvas mounted.

**Architecture:** Extract pure transport decisions into a small helper module, keep theater state inside `PlayerContent`, and switch the existing player container to a fixed in-app layout through classes instead of conditional canvas branches. Normal and theater modes use the same canvas DOM node. A frame-coalesced seek scheduler prevents pointer movement from queuing excessive decoder work.

**Tech Stack:** SolidJS, Tauri commands, existing GPU canvas controls, Vitest.

**Working-tree rule:** Preserve all unrelated uncommitted changes and do not launch Cap until the user explicitly asks to test.

---

### Task 1: Define transport and click behavior as pure functions

**Files:**
- Create: `apps/desktop/src/routes/editor/player-transport.ts`
- Create: `apps/desktop/src/routes/editor/player-transport.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { clampSeekTime, shouldTogglePlayback } from "./player-transport";

expect(clampSeekTime(-1, 30)).toBe(0);
expect(clampSeekTime(31, 30)).toBe(30);
expect(clampSeekTime(Number.NaN, 30)).toBe(0);
expect(shouldTogglePlayback({ editorControl: false, button: false })).toBe(true);
expect(shouldTogglePlayback({ editorControl: true, button: false })).toBe(false);
expect(shouldTogglePlayback({ editorControl: false, button: true })).toBe(false);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/player-transport.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal helpers**

```ts
export const clampSeekTime = (time: number, duration: number) =>
  Number.isFinite(time) ? Math.min(Math.max(time, 0), Math.max(duration, 0)) : 0;

export const shouldTogglePlayback = (target: {
  editorControl: boolean;
  button: boolean;
}) => !target.editorControl && !target.button;
```

- [ ] **Step 4: Run and verify pass**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/player-transport.test.ts`

Expected: PASS.

### Task 2: Add a frame-coalesced seek scheduler

**Files:**
- Modify: `apps/desktop/src/routes/editor/player-transport.ts`
- Modify: `apps/desktop/src/routes/editor/player-transport.test.ts`

- [ ] **Step 1: Add a failing scheduler test with a fake frame queue**

```ts
const frames: FrameRequestCallback[] = [];
const seen: number[] = [];
const scheduler = createSeekScheduler(
  (time) => seen.push(time),
  (callback) => (frames.push(callback), frames.length),
);
scheduler.request(1);
scheduler.request(2);
scheduler.request(3);
expect(seen).toEqual([]);
frames[0](0);
expect(seen).toEqual([3]);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/player-transport.test.ts`

Expected: FAIL because `createSeekScheduler` is missing.

- [ ] **Step 3: Implement the latest-value scheduler**

Store one pending value and at most one requested animation frame. On flush, clear the scheduled flag and invoke the supplied seek function with the latest value. Expose `flush()` for pointer-up and `cancel()` for cleanup.

- [ ] **Step 4: Run and verify pass**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/player-transport.test.ts`

Expected: PASS.

### Task 3: Add theater state without remounting PreviewCanvas

**Files:**
- Modify: `apps/desktop/src/routes/editor/Player.tsx`
- Modify: `apps/desktop/src/i18n-literals.ts`
- Modify: `apps/desktop/src/i18n-literals.test.ts`

- [ ] **Step 1: Add a source-structure regression test**

Extend `apps/desktop/src/editor-i18n-coverage.test.ts` or add a focused Player source test asserting exactly one `<PreviewCanvas` occurrence and localized `Enter enlarged preview` / `Exit enlarged preview` strings.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @cap/desktop exec vitest run src/editor-i18n-coverage.test.ts`

Expected: FAIL because the theater labels and structure are absent.

- [ ] **Step 3: Implement theater state and fixed layout**

Add `const [theater, setTheater] = createSignal(false)`. Keep `<PreviewCanvas />` in one unconditional location. Toggle only the surrounding classes:

```tsx
<div class={cx(
  "flex flex-col flex-1 min-h-0 bg-gray-1",
  theater() && "fixed inset-0 z-[100] p-4",
)}>
```

Add one icon button whose accessible label and tooltip switch between localized enter/exit text. Register `Escape` alongside the existing shortcut registration and set `theater(false)` without touching playback state.

- [ ] **Step 4: Run localization/structure tests**

Run: `pnpm --filter @cap/desktop exec vitest run src/editor-i18n-coverage.test.ts src/i18n-literals.test.ts`

Expected: PASS.

### Task 4: Add the shared seek bar and canvas click-to-play

**Files:**
- Modify: `apps/desktop/src/routes/editor/Player.tsx`
- Modify: `apps/desktop/src/routes/editor/player-transport.ts`

- [ ] **Step 1: Add failing tests for pointer target classification**

Test a helper that walks `Element.closest` semantics through explicit flags: a target inside `[data-preview-edit-control]`, `button`, `input`, `[role=slider]` or `[contenteditable=true]` must return false; the canvas surface returns true.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/player-transport.test.ts`

Expected: FAIL for the new cases.

- [ ] **Step 3: Add the progress control**

Place one range/Slider control between the canvas and transport buttons, using:

```ts
const visibleTime = () => editorState.previewTime ?? editorState.playbackTime;
const seek = async (time: number) => {
  const next = clampSeekTime(time, totalDuration());
  setEditorState("playing", false);
  setEditorState("previewTime", next);
  setEditorState("playbackTime", next);
  await commands.stopPlayback();
  await commands.seekTo(Math.floor(next * FPS));
};
```

During pointer movement call the scheduler; on change-end flush the last time. Show current and total time next to the same control in normal and theater layouts.

- [ ] **Step 4: Add click-to-play without stealing editor gestures**

Mark overlay roots and handles with `data-preview-edit-control`. On preview surface click, call the existing `handlePlayPauseClick` only when `shouldTogglePlaybackFromElement(event.target)` is true. Existing overlays that stop propagation remain valid defense in depth.

- [ ] **Step 5: Run focused tests and type check**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/player-transport.test.ts src/editor-i18n-coverage.test.ts`

Expected: PASS.

Run: `pnpm --filter @cap/desktop exec tsc --noEmit`

Expected: PASS.

### Task 5: Build and manual performance acceptance

**Files:**
- Modify only files above if regressions are found.

- [ ] **Step 1: Build without launching Cap**

Run: `pnpm --filter @cap/desktop build`

Expected: PASS.

- [ ] **Step 2: Manual acceptance after explicit user request**

With the long test project open, enter theater while paused and while playing. Verify playback time is continuous, no black frame appears, dragging the progress bar lands accurately, canvas click toggles playback, editor handles do not toggle playback, `Esc` exits, and the window does not repeatedly steal focus.
