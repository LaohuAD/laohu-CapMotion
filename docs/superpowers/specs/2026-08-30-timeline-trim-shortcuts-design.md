# Timeline Trim Shortcuts Design

**Date:** 2026-08-30

## Goal

Make Cap's timeline editing behave like the user's established Jianying workflow: three immediate trim/split actions, configurable editor-local shortcuts, and predictable wheel navigation without a persistent scissors mode.

## Confirmed interaction model

The toolbar exposes three adjacent actions:

1. **Trim previous side** — default `Q`
2. **Split** — default `W`
3. **Trim next side** — default `E`

These are commands, not modal tools. Clicking a button or pressing its shortcut performs the edit immediately.

The cut time is resolved as follows:

- While the pointer is inside the timeline and a hover preview time exists, use that preview time.
- Otherwise, use the red playback head.
- If the resolved time does not lie strictly inside an eligible selected segment, do nothing.
- When several segments are selected, only selected segments crossed by the resolved time are eligible.
- Keyboard actions do not run while an input, textarea, or content-editable control has focus.

## Edit semantics

### Main video track

- `Q` trims the selected clip's left edge to the cut time and ripple-closes the removed duration.
- `W` splits the selected clip at the cut time without deleting either side.
- `E` trims the selected clip's right edge to the cut time and ripple-closes the removed duration.
- Each command is one undoable history operation.
- Existing transitions and downstream time-bound overlays must be remapped by the established clip edit/ripple helpers.

### Overlay tracks

Caption, keyboard, text, mask, audio, motion, zoom, scene, and 3D segments use the same visible commands, but `Q` and `E` only move the selected segment's own boundary. They do not ripple unrelated tracks.

3D trimming must preserve and retime keyframes within the retained range rather than dropping the segment's motion definition.

## Toolbar

Replace the single scissors toggle with three adjacent one-shot buttons matching the Jianying mental model. The buttons use existing project icons where suitable and add focused trim-side icons only if no matching asset exists.

Each tooltip contains:

- localized action name;
- current shortcut binding, when configured;
- no shortcut badge when the action is unbound.

The old `S` scissors-mode binding and the old `C` direct-split binding are removed. The underlying pointer split mode may remain internal only if another mouse path still requires it; it is no longer exposed by this toolbar.

## Configurable editor shortcuts

The existing Shortcuts settings page gains a separate **Editor shortcuts** section. This section deliberately does not use the operating system global-hotkey registry: bare `Q`, `W`, and `E` must never intercept typing in another application.

The persisted editor bindings default to:

```text
trimPrevious = Q
splitAtCursor = W
trimNext = E
```

Users can:

- record a replacement single key or modified chord;
- clear a binding;
- restore defaults;
- see a localized conflict message if the requested chord is already assigned to another editor action.

Webview and GPUI read and write the same persisted store shape. Missing keys are backfilled with defaults so existing installations gain Q/W/E without resetting unrelated preferences.

## Wheel behavior

Within the timeline:

- plain wheel pans horizontally;
- `Control + wheel` zooms around hover preview time, falling back to playback time;
- on macOS, `Command + wheel` scrolls track rows vertically;
- trackpad horizontal deltas continue to pan horizontally;
- handled events prevent native page scrolling or accidental browser zoom.

Platform mapping is isolated behind a small modifier resolver so Windows/Linux can receive an appropriate vertical-scroll modifier later without changing edit behavior.

## Dual-editor parity

The Solid/Webview editor and native GPUI editor must implement the same:

- command resolution;
- selection/intersection guards;
- trim/split semantics;
- configurable bindings;
- toolbar ordering and labels;
- wheel modifier behavior.

Pure resolver and edit functions receive unit tests. UI-level tests cover shortcut persistence, conflict handling, command dispatch, and wheel routing where the existing harness permits it.

## 3D capability boundary

Cap's 3D track is a 2.5D virtual camera over the composed content plane, not a general AE/Blender 3D scene. It supports pose, field of view, zoom, pan, keyframes, transitions, and radial/directional/tilt-shift blur. Codex may safely generate or modify these schema-backed `.cap` fields, while Cap remains the visual preview and manual timing surface.

## Acceptance criteria

- Q/W/E defaults work immediately on a selected intersecting segment.
- Hover time takes priority; playback head is the fallback.
- Main video trims ripple; overlay trims remain local.
- No command changes the project when selection/time is invalid.
- Toolbar exposes three commands and no scissors toggle.
- Settings can edit, clear, restore, persist, and conflict-check all three bindings.
- Editor bindings never register as system-wide hotkeys.
- Plain, Control, and Command wheel gestures follow the confirmed macOS behavior.
- Webview and GPUI behavior remains equivalent.
- Automated checks pass without opening the GUI.
