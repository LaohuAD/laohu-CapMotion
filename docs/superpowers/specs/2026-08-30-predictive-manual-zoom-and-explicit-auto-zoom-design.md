# Predictive Manual Zoom and Explicit Auto Zoom Design

## Goal

Make manual recording zoom feel responsive to viewers without making the live framing unstable, and stop mouse clicks from silently creating zooms after a recording.

The approved behavior is:

- The live manual-zoom frame uses causal velocity prediction so it starts reframing as soon as fast cursor motion is detected.
- The final renderer uses a short real cursor look-ahead so the frame can begin moving before the cursor reaches the next target.
- Slow cursor motion inside the comfort zone keeps the frame stable.
- Fast cursor motion cannot leave the visible frame, even when prediction or smoothing would otherwise lag.
- Recording completion preserves only explicitly toggled manual zoom segments.
- Click-derived automatic zooms are created only when the user explicitly requests them in the editor.

## Why the Current Behavior Feels Late

The current manual-follow algorithm samples the live cursor at about 30 Hz, allows the cursor to travel through 60% of the zoomed viewport before reacting, and then exponentially smooths the frame toward the safe-zone boundary with response `14`.

That design prevents jitter, but every step is causal and intentionally delayed. During a fast cross-screen movement, the cursor and narration reach the next target before the crop center catches up. Increasing only the response would reduce some lag but would also make reversals and small movements visibly twitchy.

## Motion Model

### Shared concepts

Both the live overlay and final renderer use the same parameter contract:

```text
comfort-zone ratio: 0.35 of viewport half-size
outer guard ratio: 0.75 of viewport half-size
slow response: 18
fast response: 32
prediction horizon: 0.10 seconds
maximum lead: 0.20 of viewport width or height per axis
```

The values are defaults and remain explicit in the project model so later tuning does not require changing the algorithm.

For each axis:

1. Estimate cursor velocity from adjacent cursor samples.
2. Project the cursor forward by the prediction horizon.
3. Clamp projected lead to the maximum lead distance.
4. Keep the frame fixed while both actual and projected cursor remain inside the comfort zone.
5. Move toward a target that contains the projected cursor inside the comfort zone.
6. Increase response continuously with cursor speed.
7. Apply an outer guard correction using the actual cursor so smoothing can never allow it to leave the usable viewport.
8. Clamp the frame center to the recorded source bounds.

Direction reversals replace the previous velocity estimate quickly instead of carrying old momentum into an overshoot.

### Live recording overlay

The overlay remains click-through, non-focusable, always on top, and dims the non-recorded area. Cursor position is sampled up to about 60 Hz without overlapping Tauri calls.

Because a live process cannot know future input, the overlay uses filtered cursor velocity to predict approximately 100 ms ahead. This gives the operator a close preview of the final framing while keeping the system causal.

### Final rendering

The renderer already owns the complete recorded cursor event stream. For manual-follow segments it reads the real cursor position approximately 100 ms in the future, rather than guessing from velocity. The current cursor remains the safety input, while the future cursor is the framing target.

Only the crop center changes. Cursor event timing, microphone audio, system audio and source frames are not shifted. The result is an anticipatory camera move without changing audiovisual synchronization.

Near the end of a recording or segment, where no future sample exists, the renderer clamps look-ahead to the last available cursor position.

## Automatic Zoom Lifecycle

### Recording

Mouse clicks and cursor movement continue to be captured as source metadata. They do not automatically create zoom segments when the recording is finalized.

The recording timeline is initialized with only manual zoom segments created by the explicit manual-zoom shortcut.

The existing `autoZoomOnClicks` setting is removed from the recording settings UI and ignored when finalizing new recordings. Its serialized field is retained temporarily for backward compatibility with existing preferences.

### Editor

The existing zoom track remains the single zoom model. It already supports `Auto`, fixed `Manual`, and `ManualFollow` segments, so a second competing track type is unnecessary.

The editor exposes an explicit `Auto Zoom` action on the zoom track. Invoking it reads the stored click metadata and generates editable `Auto` segments. The user can then move, resize, split, delete or tune those segments like other zoom items.

Existing projects that already contain automatic zoom segments continue to render unchanged.

## Data and Compatibility

- Extend `ManualFollowConfig` with prediction, response-range and guard parameters using serde defaults.
- Old `ManualFollow` project JSON receives the new defaults.
- Old fixed `Manual` zoom segments remain fixed.
- Existing `Auto` segments remain valid.
- Existing stored `autoZoomOnClicks: true` values no longer affect recording finalization.
- Cursor metadata remains available even when the recording produces no automatic zoom segments.

## Testing

Pure Rust tests cover:

- slow movement inside the comfort zone remains stable;
- fast motion produces forward lead;
- actual cursor cannot escape the outer guard;
- direction reversal does not retain stale lead;
- final render samples the configured future cursor time;
- missing future data clamps safely;
- recording finalization does not generate automatic zooms from clicks;
- explicit editor generation still produces automatic segments;
- old project JSON receives compatible defaults.

TypeScript tests cover:

- the live predictor uses velocity and clamps maximum lead;
- slow movement remains stable;
- fast movement raises the response;
- outer guard correction prevents cursor escape;
- live viewport projection stays inside the capture source.

After automated tests pass, the running Tauri development app is restarted once for manual verification of rapid movement, reversal, boundary motion, shortcut-only manual zoom, and explicit editor auto-zoom generation.

## Out of Scope

- Shifting audio, cursor events or source video in time.
- Automatically deciding semantic emphasis from speech.
- Creating a second zoom-track data model.
- Removing automatic zoom segments from existing projects.
- Replacing the user-configurable manual-zoom shortcut.
