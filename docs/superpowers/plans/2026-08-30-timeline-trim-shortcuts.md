# Timeline Trim Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Jianying-style Q/W/E one-shot trim commands, configurable editor-local shortcuts, three toolbar buttons, and macOS wheel routing to both Cap editors.

**Architecture:** Store editor-local bindings in a dedicated `editor_shortcuts` store so bare keys are never registered as operating-system hotkeys. Put command/time/selection resolution in pure helpers, keep clip ripple edits and overlay-local edits in the existing edit layers, and make Webview and GPUI consume the same persisted shape and defaults.

**Tech Stack:** SolidJS/TypeScript, Vitest, Rust/GPUI, serde JSON store, Cargo tests.

---

### Task 1: Shared editor-shortcut schema and persistence

**Files:**
- Create: `apps/desktop/src/utils/editor-shortcuts.ts`
- Create: `apps/desktop/src/utils/editor-shortcuts.test.ts`
- Modify: `apps/desktop/src/store.ts`
- Modify: `apps/desktop-gpui/src/store.rs`

- [x] **Step 1: Write failing TypeScript tests**

Cover default Q/W/E bindings, missing-key backfill, event matching, display labels, clearing a binding, and duplicate-chord detection.

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm -F @cap/desktop exec vitest run src/utils/editor-shortcuts.test.ts`

Expected: FAIL because `editor-shortcuts.ts` does not exist.

- [x] **Step 3: Implement the TypeScript schema**

Define:

```ts
export type EditorShortcutAction =
  | "trimPrevious"
  | "splitAtCursor"
  | "trimNext";

export type EditorShortcutBinding = {
  code: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
};

export const DEFAULT_EDITOR_SHORTCUTS = {
  trimPrevious: { code: "KeyQ", meta: false, ctrl: false, alt: false, shift: false },
  splitAtCursor: { code: "KeyW", meta: false, ctrl: false, alt: false, shift: false },
  trimNext: { code: "KeyE", meta: false, ctrl: false, alt: false, shift: false },
};
```

Add normalization, matching, chord-key, and conflict helpers. Declare `editorShortcutsStore` with defaults in `store.ts`.

- [x] **Step 4: Add equivalent Rust store helpers and tests**

Add serde structs/enums/defaults for the same `editor_shortcuts` section and prove unknown/future fields survive a rewrite.

- [x] **Step 5: Run focused tests and commit**

Run:

```bash
pnpm -F @cap/desktop exec vitest run src/utils/editor-shortcuts.test.ts
cargo test --manifest-path apps/desktop-gpui/Cargo.toml editor_shortcuts
```

Expected: PASS.

Commit: `feat: persist editor shortcut bindings`

### Task 2: Pure trim/split command semantics

**Files:**
- Create: `apps/desktop/src/routes/editor/timeline-commands.ts`
- Create: `apps/desktop/src/routes/editor/timeline-commands.test.ts`
- Modify: `apps/desktop/src/routes/editor/context.ts`
- Modify: `apps/desktop-gpui/src/editor_edits.rs`

- [x] **Step 1: Write failing resolver and edit tests**

Test hover-time priority, playhead fallback, strict segment intersection, selected-only filtering, Q/W/E mapping, clip ripple behavior, overlay-local boundary edits, audio `trimStart`, and 3D keyframe retention/retiming.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm -F @cap/desktop exec vitest run src/routes/editor/timeline-commands.test.ts
cargo test --manifest-path apps/desktop-gpui/Cargo.toml timeline_command
```

Expected: FAIL because the command helpers do not exist.

- [x] **Step 3: Implement TypeScript commands**

Expose one project action:

```ts
executeTimelineEditCommand(
  action: "trimPrevious" | "splitAtCursor" | "trimNext",
  time: number,
  selection: TimelineSelection,
): boolean
```

Clip commands mutate source boundaries and call the established ripple remapping once. Overlay commands update or split only selected intersecting segments and preserve type-specific fields.

- [x] **Step 4: Implement Rust parity**

Add the equivalent pure edit dispatcher to `editor_edits.rs`, reusing `split_clip_segment`, clip duration/ripple helpers, generic track traits, and the dedicated 3D split/keyframe logic.

- [x] **Step 5: Run focused tests and commit**

Expected: all focused TypeScript and Rust tests PASS.

Commit: `feat: add timeline trim commands`

### Task 3: Webview keyboard dispatch and toolbar

**Files:**
- Modify: `apps/desktop/src/routes/editor/useEditorShortcuts.ts`
- Modify: `apps/desktop/src/routes/editor/Timeline/index.tsx`
- Modify: `apps/desktop/src/routes/editor/Player.tsx`
- Modify: `apps/desktop/src/i18n.tsx`
- Add or reuse icons under: `packages/ui-solid/icons/`

- [x] **Step 1: Write failing shortcut-dispatch tests**

Cover user-configured chords, ignored repeat/input events, invalid selection no-op, and removal of legacy S/C behavior.

- [x] **Step 2: Run tests and verify RED**

Run the focused Vitest file and expect missing command dispatch.

- [x] **Step 3: Implement keyboard dispatch**

Subscribe to `editorShortcutsStore`, resolve `previewTime ?? playbackTime`, and dispatch Q/W/E actions only when editor scope is active. Remove `S` from `Player.tsx` and `C` from `Timeline/index.tsx`.

- [x] **Step 4: Replace scissors toggle with three buttons**

Render trim-left, split, and trim-right buttons in that order. Tooltips use localized names and the current binding. The middle button is immediate, not a toggle.

- [x] **Step 5: Run tests/typecheck and commit**

Run:

```bash
pnpm -F @cap/desktop exec vitest run src/routes/editor
pnpm -F @cap/desktop exec tsc --noEmit
```

Expected: PASS.

Commit: `feat: add timeline trim controls`

### Task 4: Shortcut settings UI

**Files:**
- Modify: `apps/desktop/src/routes/(window-chrome)/settings/hotkeys.tsx`
- Modify: `apps/desktop/src/i18n.tsx`
- Modify: `apps/desktop-gpui/src/settings_pages.rs`

- [x] **Step 1: Write failing conflict/persistence UI-helper tests**

Cover separate global/editor sections, clear, restore defaults, and duplicate chord rejection.

- [x] **Step 2: Run tests and verify RED**

Expected: FAIL because the editor section is absent.

- [x] **Step 3: Implement Solid settings section**

Reuse the existing binding recorder and key chips but save to `editor_shortcuts`. Do not call `commands.setHotkey`. Add localized title, description, labels, restore action, and conflict error.

- [x] **Step 4: Implement GPUI settings parity**

Render the same editor-only section, capture/update/clear/reset bindings, and save through the shared store without invoking global-hotkey reload.

- [x] **Step 5: Run tests and commit**

Run focused Vitest and `cargo test --manifest-path apps/desktop-gpui/Cargo.toml settings_pages`.

Expected: PASS.

Commit: `feat: configure editor shortcuts in settings`

### Task 5: Timeline wheel routing

**Files:**
- Create: `apps/desktop/src/routes/editor/timeline-wheel.ts`
- Create: `apps/desktop/src/routes/editor/timeline-wheel.test.ts`
- Modify: `apps/desktop/src/routes/editor/Timeline/index.tsx`
- Modify: `apps/desktop-gpui/src/editor_window.rs`

- [x] **Step 1: Write failing wheel resolver tests**

Test plain horizontal pan, Control zoom, macOS Command vertical track scroll, horizontal trackpad deltas, and no double handling.

- [x] **Step 2: Run focused tests and verify RED**

Expected: FAIL because the resolver is absent.

- [x] **Step 3: Implement Webview routing**

Route the outer timeline wheel to one result:

```ts
type TimelineWheelIntent =
  | { type: "zoom"; delta: number }
  | { type: "pan"; delta: number }
  | { type: "vertical"; delta: number };
```

Use `timelineScrollRef.scrollTop` for Command vertical scrolling and prevent the nested scroller from consuming plain-wheel events.

- [x] **Step 4: Implement GPUI parity**

Route Command to `timeline_scroll` vertical offset, Control to transform zoom, and plain wheel to horizontal timeline position.

- [x] **Step 5: Run tests and commit**

Commit: `feat: refine timeline wheel controls`

### Task 6: Background verification and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-30-timeline-trim-shortcuts-design.md` only if implementation revealed a corrected constraint

- [x] **Step 1: Run formatting and static checks**

```bash
pnpm biome check apps/desktop/src/routes/editor apps/desktop/src/routes/'(window-chrome)'/settings/hotkeys.tsx apps/desktop/src/utils/editor-shortcuts.ts apps/desktop/src/i18n.tsx
pnpm -F @cap/desktop exec tsc --noEmit
cargo fmt --check
cargo check --manifest-path apps/desktop-gpui/Cargo.toml
```

- [x] **Step 2: Run focused and relevant regression tests**

```bash
pnpm -F @cap/desktop exec vitest run src/utils/editor-shortcuts.test.ts src/routes/editor/timeline-commands.test.ts src/routes/editor/timeline-wheel.test.ts
cargo test --manifest-path apps/desktop-gpui/Cargo.toml editor_edits
cargo test --manifest-path apps/desktop-gpui/Cargo.toml settings_pages
```

- [x] **Step 3: Inspect the final diff and store migration**

Confirm no media/build artifacts, no GUI launch, no global Q/W/E registration, and no unrelated user files.

- [x] **Step 4: Commit verification fixes if needed**

Commit: `test: verify timeline editing controls`
