# Recording Project Title Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the exact full recording-project title on hover only when the card's visible title is truncated.

**Architecture:** A small pure helper owns the overflow comparison, while `TargetCard` owns the DOM measurement and resize lifecycle. The existing shared Tooltip supplies the 200 ms delay, portal, and visual styling.

**Tech Stack:** TypeScript, SolidJS, Kobalte Tooltip, ResizeObserver, Vitest

---

### Task 1: Test the overflow decision

**Files:**
- Create: `apps/desktop/src/routes/(window-chrome)/new-main/target-card-title.test.ts`
- Create: `apps/desktop/src/routes/(window-chrome)/new-main/target-card-title.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { isTextTruncated } from "./target-card-title";

describe("recording card title overflow", () => {
  it("enables the full-title tooltip only for real overflow", () => {
    expect(isTextTruncated(241, 240)).toBe(true);
    expect(isTextTruncated(240, 240)).toBe(false);
    expect(isTextTruncated(180, 240)).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/desktop exec vitest run 'src/routes/(window-chrome)/new-main/target-card-title.test.ts'`

Expected: FAIL because `./target-card-title` does not exist.

- [x] **Step 3: Write the minimal helper**

```ts
export function isTextTruncated(scrollWidth: number, clientWidth: number) {
  return scrollWidth > clientWidth;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/desktop exec vitest run 'src/routes/(window-chrome)/new-main/target-card-title.test.ts'`

Expected: PASS.

### Task 2: Connect measurement to the recording title

**Files:**
- Modify: `apps/desktop/src/routes/(window-chrome)/new-main/TargetCard.tsx`

- [x] **Step 1: Add the measured state and lifecycle**

Import `createEffect`, `onCleanup`, and `onMount`; keep a title-element reference; compare `scrollWidth` and `clientWidth` through `isTextTruncated`; and attach a `ResizeObserver` with cleanup.

- [x] **Step 2: Wrap only recording titles with the shared tooltip**

Use `content={label()}` and `disabled={!titleTruncated()}` while retaining the existing `truncate` class and exact highlighted title content.

- [x] **Step 3: Run focused regression tests**

Run: `pnpm --dir apps/desktop exec vitest run 'src/routes/(window-chrome)/new-main/target-card-title.test.ts'`

Expected: PASS.

- [x] **Step 4: Run the desktop build**

Run: `pnpm --dir apps/desktop build`

Expected: build completes without TypeScript, SolidJS, or bundling errors.
