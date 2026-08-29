# Recording Session and Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recording timer recover from Webview reloads, hide stale controls when no recording exists, and collapse the live control bar into a draggable hover-to-expand handle.

**Architecture:** Add a backend-owned session clock to `InProgressRecordingCommon` and return its session ID, elapsed time, and pause state from `get_current_recording`. Move frontend reconciliation and presentation decisions into pure tested helpers, then keep the Solid route responsible only for events, rendering, and Tauri window hit-area synchronization.

**Tech Stack:** Rust, Tokio/Tauri, Specta-generated TypeScript, SolidJS, Vitest, Tailwind CSS.

---

## File map

- Create `apps/desktop/src/utils/recording-controls.ts`: pure session reconciliation, elapsed-time projection, and collapsed/expanded presentation rules.
- Create `apps/desktop/src/utils/recording-controls.test.ts`: frontend regression tests for stale state, duplicate sessions, pause, and collapse rules.
- Modify `apps/desktop/src-tauri/src/recording.rs`: backend session clock owned by every active recording and updated by pause/resume.
- Modify `apps/desktop/src-tauri/src/lib.rs`: expose the authoritative recording snapshot.
- Modify `apps/desktop/src/utils/tauri.ts`: regenerated Specta bindings.
- Modify `apps/desktop/src/routes/in-progress-recording.tsx`: consume the snapshot and render the compact/expanded bar.

### Task 1: Add an authoritative backend recording clock

**Files:**
- Modify: `apps/desktop/src-tauri/src/recording.rs:712-860`
- Test: `apps/desktop/src-tauri/src/recording.rs:4486-end`

- [ ] **Step 1: Write the failing clock tests**

Add deterministic tests that pass explicit `Instant` values rather than sleeping:

```rust
#[test]
fn recording_session_clock_excludes_paused_time() {
    let started = Instant::now();
    let clock = RecordingSessionClock::new_at(started);

    assert_eq!(clock.snapshot_at(started + Duration::from_secs(4)).elapsed_ms, 4_000);
    clock.pause_at(started + Duration::from_secs(4));
    assert_eq!(clock.snapshot_at(started + Duration::from_secs(9)).elapsed_ms, 4_000);
    clock.resume_at(started + Duration::from_secs(9));
    assert_eq!(clock.snapshot_at(started + Duration::from_secs(12)).elapsed_ms, 7_000);
}

#[test]
fn recording_session_clock_keeps_one_session_id() {
    let clock = RecordingSessionClock::new_at(Instant::now());
    assert_eq!(clock.snapshot().session_id, clock.snapshot().session_id);
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cargo test -p cap-desktop recording_session_clock --lib`

Expected: compilation fails because `RecordingSessionClock` does not exist.

- [ ] **Step 3: Implement the minimal clock**

Add a cloneable clock with private mutable state:

```rust
#[derive(Clone)]
pub struct RecordingSessionClock {
    session_id: String,
    started_at: Instant,
    state: Arc<std::sync::Mutex<RecordingSessionClockState>>,
}

struct RecordingSessionClockState {
    paused_at: Option<Instant>,
    accumulated_pause: Duration,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecordingSessionSnapshot {
    pub session_id: String,
    pub elapsed_ms: u64,
    pub paused: bool,
}
```

`new_at` assigns `Uuid::new_v4().to_string()` once. `snapshot_at(now)` computes `now - started_at - accumulated_pause`, using `paused_at` as the effective current instant while paused. Repeated `pause_at` and `resume_at` calls must be idempotent.

Add `clock: RecordingSessionClock` to `InProgressRecordingCommon`, initialize it once where `InProgressRecordingCommon` is constructed, and update the common clock only after the underlying actor successfully pauses or resumes:

```rust
pub async fn pause(&self) -> anyhow::Result<()> {
    match self { /* existing actor pause */ }
    self.common().clock.pause();
    Ok(())
}

pub async fn resume(&self) -> anyhow::Result<()> {
    match self { /* existing actor resume */ }
    self.common().clock.resume();
    Ok(())
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cargo test -p cap-desktop recording_session_clock --lib`

Expected: both clock tests pass.

- [ ] **Step 5: Commit the backend clock**

```bash
git add apps/desktop/src-tauri/src/recording.rs
git commit -m "fix: track authoritative recording session time"
```

### Task 2: Return the session snapshot from `get_current_recording`

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs:2638-2711`
- Modify: `apps/desktop/src/utils/tauri.ts:920`
- Test: `apps/desktop/src-tauri/src/lib.rs:195-230`

- [ ] **Step 1: Write the failing serialization test**

Extract construction into a pure helper and test active versus pending snapshots:

```rust
#[test]
fn active_recording_snapshot_contains_recoverable_clock_fields() {
    let snapshot = RecordingSessionSnapshot {
        session_id: "session-one".to_string(),
        elapsed_ms: 12_345,
        paused: true,
    };
    let fields = current_recording_clock_fields(Some(snapshot));
    assert_eq!(fields.session_id, Some("session-one".to_string()));
    assert_eq!(fields.elapsed_ms, 12_345);
    assert!(fields.paused);
}

#[test]
fn pending_recording_has_no_session() {
    let fields = current_recording_clock_fields(None);
    assert_eq!(fields.session_id, None);
    assert_eq!(fields.elapsed_ms, 0);
    assert!(!fields.paused);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cargo test -p cap-desktop current_recording_ --lib`

Expected: compilation fails because the clock fields/helper do not exist.

- [ ] **Step 3: Extend the API contract**

Extend `CurrentRecording` with:

```rust
session_id: Option<String>,
elapsed_ms: u64,
paused: bool,
```

For `RecordingState::Active`, read `inner.common().clock.snapshot()`. For `Pending`, return `None`, `0`, and `false`. Do not await actor state while holding the global read lock.

- [ ] **Step 4: Regenerate bindings and verify the generated type**

Run: `pnpm --dir apps/desktop run preparescript`

Expected: `CurrentRecording` in `apps/desktop/src/utils/tauri.ts` includes `sessionId: string | null`, `elapsedMs: number`, and `paused: boolean`.

- [ ] **Step 5: Run backend tests**

Run: `cargo test -p cap-desktop current_recording_ --lib`

Expected: all focused tests pass.

- [ ] **Step 6: Commit the API snapshot**

```bash
git add apps/desktop/src-tauri/src/lib.rs apps/desktop/src/utils/tauri.ts apps/src/utils/tauri.ts
git commit -m "feat: expose recoverable recording session snapshot"
```

### Task 3: Add pure frontend reconciliation and timer projection

**Files:**
- Create: `apps/desktop/src/utils/recording-controls.ts`
- Create: `apps/desktop/src/utils/recording-controls.test.ts`

- [ ] **Step 1: Write failing reconciliation tests**

```ts
import { describe, expect, it } from "vitest";
import {
  reconcileRecordingSession,
  projectElapsedMs,
  type RecordingSessionView,
} from "./recording-controls";

describe("reconcileRecordingSession", () => {
  it("hides every stale local state when the backend has no recording", () => {
    expect(reconcileRecordingSession({ kind: "countdown", value: 3 }, null, 5_000))
      .toEqual({ kind: "hidden" });
  });

  it("does not reset the same session after a remount", () => {
    const current: RecordingSessionView = {
      kind: "active", sessionId: "one", baselineElapsedMs: 9_000,
      observedAtMs: 10_000, paused: false,
    };
    const backend = { sessionId: "one", elapsedMs: 9_100, paused: false };
    expect(reconcileRecordingSession(current, backend, 10_100)).toEqual(current);
  });

  it("hydrates a new session from backend elapsed time", () => {
    expect(reconcileRecordingSession({ kind: "hidden" }, {
      sessionId: "two", elapsedMs: 4_200, paused: false,
    }, 20_000)).toEqual({
      kind: "active", sessionId: "two", baselineElapsedMs: 4_200,
      observedAtMs: 20_000, paused: false,
    });
  });
});

it("projects elapsed time only while active", () => {
  expect(projectElapsedMs({
    kind: "active", sessionId: "one", baselineElapsedMs: 3_000,
    observedAtMs: 10_000, paused: false,
  }, 12_500)).toBe(5_500);
});
```

- [ ] **Step 2: Run Vitest and verify RED**

Run: `pnpm --dir apps/desktop exec vitest run src/utils/recording-controls.test.ts`

Expected: import fails because `recording-controls.ts` does not exist.

- [ ] **Step 3: Implement the pure state functions**

Define discriminated unions for `hidden`, `countdown`, `active`, and `error`. `reconcileRecordingSession` follows these rules:

```ts
if (!backend) return { kind: "hidden" };
if (!backend.sessionId) return local.kind === "countdown" ? local : { kind: "hidden" };
if (local.kind === "active" && local.sessionId === backend.sessionId &&
    local.paused === backend.paused) return local;
return {
  kind: "active",
  sessionId: backend.sessionId,
  baselineElapsedMs: backend.elapsedMs,
  observedAtMs: nowMs,
  paused: backend.paused,
};
```

When pause state changes for the same session, rebase from the backend elapsed value. `projectElapsedMs` adds wall time only when `paused === false`.

- [ ] **Step 4: Run Vitest and verify GREEN**

Run: `pnpm --dir apps/desktop exec vitest run src/utils/recording-controls.test.ts`

Expected: all reconciliation and timer tests pass.

- [ ] **Step 5: Commit the pure frontend state**

```bash
git add apps/desktop/src/utils/recording-controls.ts apps/desktop/src/utils/recording-controls.test.ts
git commit -m "test: define recording control reconciliation"
```

### Task 4: Integrate the authoritative snapshot into the Solid route

**Files:**
- Modify: `apps/desktop/src/routes/in-progress-recording.tsx:44-370,560-640`

- [ ] **Step 1: Replace local start/pause arithmetic**

Remove `start`, `pauseResumes`, `stoppedAt`, and the code paths that call `setStart(Date.now())`. Keep a 100 ms display tick, but calculate the shown value with `projectElapsedMs(sessionView(), nowMs())`.

- [ ] **Step 2: Reconcile on query and lifecycle events**

On mount and whenever `currentRecording.data` changes, call the pure reconciler. `Started`, `Paused`, and `Resumed` events must invalidate/refetch `createCurrentRecordingQuery`; they may update temporary presentation state but must never create a new start time. `recordingStopped` immediately sets `hidden` and hides the window.

- [ ] **Step 3: Make all stale variants hide**

After a non-pending query returns `null`, call:

```ts
setSessionView({ kind: "hidden" });
void getCurrentWindow().hide();
```

This applies even when the previous local state was `countdown`, fixing the draggable `3` residue.

- [ ] **Step 4: Run focused and full frontend checks**

Run: `pnpm --dir apps/desktop exec vitest run src/utils/recording-controls.test.ts`

Run: `pnpm exec tsc -b`

Expected: tests and TypeScript build pass.

- [ ] **Step 5: Commit the route integration**

```bash
git add apps/desktop/src/routes/in-progress-recording.tsx
git commit -m "fix: restore recording controls from backend session"
```

### Task 5: Add collapsed hover-to-expand presentation

**Files:**
- Modify: `apps/desktop/src/utils/recording-controls.ts`
- Modify: `apps/desktop/src/utils/recording-controls.test.ts`
- Modify: `apps/desktop/src/routes/in-progress-recording.tsx:330-900`

- [ ] **Step 1: Write failing presentation tests**

```ts
describe("recordingControlsPresentation", () => {
  it("collapses a healthy active recording", () => {
    expect(recordingControlsPresentation({ active: true, hovered: false,
      interacting: false, countdown: false, error: false })).toBe("collapsed");
  });
  it("expands on hover, countdown, error, or active interaction", () => {
    for (const override of [
      { hovered: true }, { countdown: true }, { error: true }, { interacting: true },
    ]) expect(recordingControlsPresentation({ active: true, hovered: false,
      interacting: false, countdown: false, error: false, ...override })).toBe("expanded");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --dir apps/desktop exec vitest run src/utils/recording-controls.test.ts`

Expected: `recordingControlsPresentation` is missing.

- [ ] **Step 3: Implement presentation state and interaction**

Add the pure presentation helper, then in the route add `hovered`, `interacting`, and a 150 ms leave timer. Anchor the container to the right:

```tsx
<div
  onPointerEnter={() => setHovered(true)}
  onPointerLeave={scheduleCollapse}
  class={cx("ml-auto transition-[width] duration-150", expanded() ? "w-full" : "w-10")}
>
```

The collapsed 40×40 handle contains the red recording dot, has `data-tauri-drag-region`, and uses a distinct paused icon/color when paused. Expanded controls remain the existing bar. Pointer down inside an action sets `interacting=true` until pointer up/cancel.

- [ ] **Step 4: Synchronize only the visible hit area**

Make `syncInteractiveAreaBounds` depend on `expanded()`. In collapsed state, the referenced element must be only the 40×40 handle; in expanded state it includes the issue panel and full bar. Keep `setFakeWindowBounds`/`removeFakeWindow` cleanup unchanged.

- [ ] **Step 5: Run frontend tests and production build**

Run: `pnpm --dir apps/desktop exec vitest run src/utils/recording-controls.test.ts`

Run: `pnpm --dir apps/desktop build`

Expected: tests pass and Vinxi production build succeeds.

- [ ] **Step 6: Commit collapsed controls**

```bash
git add apps/desktop/src/utils/recording-controls.ts apps/desktop/src/utils/recording-controls.test.ts apps/desktop/src/routes/in-progress-recording.tsx
git commit -m "feat: collapse live recording controls"
```

### Task 6: Verify the subsystem without opening Cap

**Files:**
- No source changes expected.

- [ ] **Step 1: Run all focused checks**

```bash
cargo test -p cap-desktop recording_session_clock --lib
cargo test -p cap-desktop current_recording_ --lib
pnpm --dir apps/desktop exec vitest run src/utils/recording-controls.test.ts
pnpm exec tsc -b
pnpm --dir apps/desktop build
```

Expected: every command exits successfully.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff --check HEAD~5..HEAD && git status --short`

Expected: no whitespace errors and no untracked build artifacts.
