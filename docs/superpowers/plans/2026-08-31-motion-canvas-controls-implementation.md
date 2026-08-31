# Motion Canvas Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select, move and proportionally resize active Remotion/overlay segments directly on the preview canvas without rerendering or invalidating their artifacts.

**Architecture:** Put all coordinate conversion and hit-order logic in pure TypeScript helpers, then mount a dedicated `MotionOverlay` above the GPU canvas. Selection continues to use the existing timeline `{type: "motion"}` selection so the sidebar and canvas stay synchronized; gesture updates write only `segment.transform` and pause history for one undo item.

**Tech Stack:** SolidJS, existing snapping utilities, Motion project schema, Vitest.

**Working-tree rule:** Preserve unrelated dirty files, keep Remotion as the only animation engine, and do not launch the GUI until the user requests testing.

---

### Task 1: Define exact Motion canvas geometry

**Files:**
- Create: `apps/desktop/src/routes/editor/motion-canvas.ts`
- Create: `apps/desktop/src/routes/editor/motion-canvas.test.ts`

- [ ] **Step 1: Write failing coordinate and topmost-selection tests**

```ts
const output = { width: 1920, height: 1080 };
const preview = { width: 960, height: 540 };

expect(motionPreviewRect(segment, output, preview)).toEqual({
  x: 0,
  y: 0,
  width: 960,
  height: 540,
  rotation: 0,
});

expect(
  moveMotionTransform(segment.transform, { x: 96, y: -54 }, output, preview),
).toMatchObject({ x: 192, y: -108 });

expect(
  topmostActiveMotionIndex([low, high], 5),
).toBe(1);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/motion-canvas.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement renderer-equivalent geometry**

The normalized output rect must exactly mirror Rust `frame_plans_at`:

```ts
export const motionOutputRect = (segment: MotionSegment, output: Size) => ({
  x: output.width * 0.5 + segment.transform.x - output.width * segment.transform.scaleX * 0.5,
  y: output.height * 0.5 + segment.transform.y - output.height * segment.transform.scaleY * 0.5,
  width: output.width * segment.transform.scaleX,
  height: output.height * segment.transform.scaleY,
  rotation: segment.transform.rotation,
});
```

`motionPreviewRect` multiplies x/width by `preview.width / output.width` and y/height by `preview.height / output.height`. `topmostActiveMotionIndex` filters `start <= time < end`, ready/stale linked artifacts, then sorts by `zIndex`, track and stable array order.

- [ ] **Step 4: Run and verify pass**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/motion-canvas.test.ts`

Expected: PASS.

### Task 2: Define move, scale and snapping conversions

**Files:**
- Modify: `apps/desktop/src/routes/editor/motion-canvas.ts`
- Modify: `apps/desktop/src/routes/editor/motion-canvas.test.ts`

- [ ] **Step 1: Add failing tests**

Cover: CSS delta to output-pixel delta; minimum/maximum scale 0.1–3; uniform scaling from pointer distance to center; moving does not alter scale/rotation; resizing does not alter x/y; `Shift` bypasses snapping.

```ts
expect(resizeMotionTransform(transform, 2)).toEqual({
  ...transform,
  scaleX: transform.scaleX * 2,
  scaleY: transform.scaleY * 2,
});
expect(resizeMotionTransform({ ...transform, scaleX: 2, scaleY: 2 }, 2))
  .toMatchObject({ scaleX: 3, scaleY: 3 });
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/motion-canvas.test.ts`

Expected: FAIL for missing transformation helpers.

- [ ] **Step 3: Implement pure transformations**

```ts
export function moveMotionTransform(
  initial: MotionTransform,
  delta: Point,
  output: Size,
  preview: Size,
): MotionTransform {
  return {
    ...initial,
    x: initial.x + delta.x * output.width / Math.max(preview.width, 1),
    y: initial.y + delta.y * output.height / Math.max(preview.height, 1),
  };
}

export function resizeMotionTransform(initial: MotionTransform, factor: number) {
  const scale = Math.min(3, Math.max(0.1, initial.scaleX * factor));
  return { ...initial, scaleX: scale, scaleY: scale };
}
```

Use existing `snapMovingRect` and `snapResizeCorner` by converting the Motion rect to normalized coordinates; do not create a second snapping algorithm.

- [ ] **Step 4: Run and verify pass**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/motion-canvas.test.ts`

Expected: PASS.

### Task 3: Build the dedicated MotionOverlay

**Files:**
- Create: `apps/desktop/src/routes/editor/MotionOverlay.tsx`
- Modify: `apps/desktop/src/routes/editor/Player.tsx`
- Modify: `apps/desktop/src/routes/editor/CanvasElementsOverlay.tsx`

- [ ] **Step 1: Add a source-level mounting regression test**

Extend `apps/desktop/src/editor-i18n-coverage.test.ts` to assert `Player.tsx` imports and mounts `<MotionOverlay size={size()} />` exactly once and after the GPU canvas but before `SnapGuidesOverlay`.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @cap/desktop exec vitest run src/editor-i18n-coverage.test.ts`

Expected: FAIL because MotionOverlay is absent.

- [ ] **Step 3: Expand snap exclusion to Motion**

Change `SnapExclude` to include `{ motion: number }`. Add active Motion rects to `useCanvasSnapTargets`, excluding the segment being dragged. Derive their normalized rects directly from `scaleX`, `scaleY`, `x/outputWidth`, and `y/outputHeight` so snap targets match final rendering.

- [ ] **Step 4: Render hit areas and the selected controls**

`MotionOverlay` must:

- return nothing while playing;
- derive time from `previewTime ?? playbackTime`;
- render pointer hit areas for active segments ordered by z-index;
- on click set `timeline.selection = {type: "motion", indices: [index]}` and clear `canvasSelection`;
- display one rotated border and four corner handles for the selected active segment;
- mark its root and handles `data-preview-edit-control` so player clicks do not toggle playback;
- hide controls when the linked artifact is missing, rendering or failed.

- [ ] **Step 5: Mount without duplicating the GPU canvas**

In `PreviewCanvas`, mount `<MotionOverlay size={size()} />` in the existing overlay stack. Do not add a new canvas, video element or decoder.

- [ ] **Step 6: Run structure tests and type check**

Run: `pnpm --filter @cap/desktop exec vitest run src/editor-i18n-coverage.test.ts src/routes/editor/motion-canvas.test.ts`

Expected: PASS.

Run: `pnpm --filter @cap/desktop exec tsc --noEmit`

Expected: PASS.

### Task 4: Wire one-history-item move and resize gestures

**Files:**
- Modify: `apps/desktop/src/routes/editor/MotionOverlay.tsx`
- Modify: `apps/desktop/src/routes/editor/motion-canvas.test.ts`

- [ ] **Step 1: Add failing state-update invariants**

Test that applying a moved/resized transform returns a new segment with unchanged `artifactId`, `start`, `end`, `role`, `track`, `zIndex` and artifact status. Explicitly assert no `staleLinkedArtifact` call is part of the transform helper.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/motion-canvas.test.ts`

Expected: FAIL for the new helper/invariants.

- [ ] **Step 3: Implement optimistic pointer gestures**

On pointer down:

1. stop propagation and prevent default;
2. capture the initial transform, rect, pointer and snap targets;
3. call `projectHistory.pause()` once;
4. update an optimistic local rect at most once per animation frame;
5. write only `setProject("motion", "segments", index, "transform", next)`;
6. on pointer up flush the last update, clear guides, resume history and release listeners.

Uniform resize factor is `currentDistanceFromCenter / initialDistanceFromCenter`, which remains correct even when the segment has a non-zero rotation. Do not call `staleLinkedArtifact`; compositor-only transforms reuse the existing artifact.

- [ ] **Step 4: Run tests and type check**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/motion-canvas.test.ts src/routes/editor/motion.test.ts`

Expected: PASS.

Run: `pnpm --filter @cap/desktop exec tsc --noEmit`

Expected: PASS.

### Task 5: Save/reopen and export-parity regression

**Files:**
- Modify only files above or add a narrowly scoped Rust test under `crates/project/tests/` if a serialization gap is found.

- [ ] **Step 1: Run existing Motion suites**

Run: `pnpm --filter @cap/desktop exec vitest run src/routes/editor/motion.test.ts src/routes/editor/motion-canvas.test.ts`

Run: `cargo test -p cap-project motion`

Expected: PASS; same-role timeline collision and different-role overlap behavior stay unchanged.

- [ ] **Step 2: Build without opening Cap**

Run: `pnpm --filter @cap/desktop build`

Expected: PASS.

- [ ] **Step 3: Manual acceptance after explicit user request**

In the existing Remotion demonstration project: drag an active animation, resize it, undo once, redo once, save and reopen. Verify the transform persists, the artifact status remains ready/stale as before, no Remotion render starts, a lower z-index animation can be selected from the timeline, and one exported frame matches the preview position and size.

