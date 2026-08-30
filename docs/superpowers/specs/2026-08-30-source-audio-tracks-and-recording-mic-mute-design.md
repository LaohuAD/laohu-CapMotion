# Source Audio Tracks and Recording Mic Mute Design

## Goal

Make Cap's two recording-owned audio sources understandable and editable without treating them like freely movable imported media:

- Keep the timeline compact by default.
- Let users reveal the microphone and system-audio sources only when they need detailed audio editing.
- Preserve synchronization automatically when the parent video is split, trimmed, deleted, or reordered.
- Let users remove microphone or system audio from selected spans without changing timeline duration.
- Let users mute and restore microphone capture from the in-progress recording controls in both Studio and Instant modes.

## Current State

Cap already records the two audio sources separately:

- Microphone is written to `audio-input.m4a` or `audio-input.ogg`.
- System audio is written to `system_audio.m4a` or `system_audio.ogg`.
- Recording metadata stores them independently as `mic` and `system_audio`.
- Preview and export mix the independent sources at render time.

The editor currently draws both waveforms inside the Video row and exposes only project-wide microphone and system-audio volume controls. The in-progress recording bar already has backend sample muting and a clickable microphone control, but the UI and command deliberately restrict it to Instant mode even though Studio keeps the same recording-scoped microphone lock.

## Product Model

Microphone and system audio are **source-audio child tracks** of Video. They are not ordinary timeline tracks and are not imported audio.

This distinction establishes the following invariant:

> Source audio may be removed or silenced independently, but its timeline position is owned by its parent video clip.

Consequences:

- Source-audio clips cannot be dragged horizontally.
- Source-audio clips cannot be moved to another lane.
- There is no link or unlink command.
- Users never need to maintain synchronization manually.
- Existing `.cap` recordings remain valid because the underlying media is already separate.

## Timeline Presentation

### Collapsed Default

The timeline initially shows only the Video row. Any source audio that has not been expanded continues to draw its waveform inside the Video clips:

- microphone waveform uses the existing neutral/white treatment;
- system-audio waveform uses the existing orange treatment.

This preserves the compact default used by most editing sessions.

### Add Track Menu

The existing Add Track menu gains two conditional entries:

- **Microphone** — explanation: "Expand the microphone audio from Video for separate editing."
- **System Audio** — explanation: "Expand the system audio from Video for separate editing."

An entry is available only when the project contains that recorded source. Expanding a source does not copy media, add another mix, or create an imported audio segment. It only reveals the existing source as a child row.

Once expanded, that source's waveform no longer appears in the Video row, so the same source is never presented twice.

### Child Rows

Expanded rows appear immediately below Video in this order:

1. Microphone
2. System Audio

Each row:

- uses its own source-specific icon and waveform color;
- has a source-specific volume control;
- supports selection, splitting, and non-ripple deletion of source-audio spans;
- does not support horizontal dragging, lane dragging, transitions, speed changes, or independent placement;
- exposes **Collapse Track**, not Delete Track.

The row action label, tooltip, accessible label, and menu wording must all use the collapse meaning. Collapsing a child row is presentation-only: it restores that source's waveform to the Video row and preserves every audio edit.

## Editing Semantics

### Parent Video Operations

Video remains the authoritative timeline structure.

- Splitting Video at the playhead splits all existing source-audio spans at the same source time.
- Trimming Video clamps its source-audio spans to the retained video interval.
- Deleting Video deletes the corresponding source-audio material.
- Moving or reordering a Video clip moves its remaining source audio with it automatically.
- If microphone or system audio has already been removed from part of a clip, the absence moves with that video clip and is not recreated.

These behaviors are structural, not optional links.

### Source-Audio Operations

Source-audio editing changes audibility without changing time:

- Splitting a source-audio span creates an editable boundary but does not change playback.
- Delete removes only the selected source-audio span and leaves a silent gap of the same duration.
- Q and E may trim/delete the applicable side of the selected source-audio span, also without ripple.
- W splits only the selected source-audio span when the source row owns the selection.
- The other source and the parent video remain unchanged.
- A deleted source-audio span can be restored through normal project undo/redo.

The project stores retained source-audio spans relative to their owning video segment. Moving the parent therefore requires no secondary position calculation and cannot introduce drift.

## Project Persistence

The project configuration persists two different kinds of state:

1. **Presentation state** — whether microphone and system-audio child rows are expanded.
2. **Edit state** — which source-time spans remain audible for each source within each parent video segment.

Backward compatibility rules:

- Missing presentation state means both child rows are collapsed.
- Missing edit state means the full source interval is audible.
- A recording without a source never creates an editable row for that source.
- Legacy projects continue to render exactly as before until the user edits source audio.

## Volume and Muting

The existing project-wide microphone and system-audio gain values remain the source of truth. Expanding a child row exposes the matching control near that source but does not introduce a second gain value.

Setting a source to muted through its volume control affects the whole project source. Deleting a child segment affects only the selected time span. The interface must visually distinguish these two operations.

## Recording-Control Microphone Toggle

The microphone button in the in-progress recording bar becomes interactive in both Studio and Instant modes when:

- the recording started with a microphone;
- the microphone remains connected;
- the session is recording or paused;
- no mute request is already in flight.

Click behavior:

- First click sets recording-scoped microphone mute.
- While muted, the microphone pipeline continues emitting correctly timed silent samples.
- System audio, screen video, camera, cursor capture, and the recording clock continue unchanged.
- The icon changes to a red muted-microphone state and its accessible label changes to "Unmute microphone."
- A second click restores microphone samples into the same source file and timeline.
- Each new recording starts unmuted regardless of the previous session.
- If the backend request fails, the UI rolls back to the prior state and reports the existing command error path.

This intentionally records silence during muted periods instead of removing time. It prevents speaker playback from being captured twice while preserving exact synchronization.

## Error and Edge-Case Handling

- If a microphone disconnects, the control remains non-interactive and uses the existing disconnected state; reconnect behavior must not silently flip the requested mute state.
- If system audio was enabled but contains no audible packets, the row may still be expanded because the source exists; its waveform can be empty.
- Source-audio edits cannot extend outside the parent video's source interval.
- Zero-length spans are discarded during normalization.
- Adjacent retained spans are merged when no intentional cut boundary is needed.
- Repeated expand/collapse actions are idempotent and never modify rendered audio.
- Export and preview must use the same retained-span calculation.

## Testing

Implementation follows test-driven development.

### Project and Editing Tests

- Legacy configuration defaults both sources to fully audible and collapsed.
- Video split partitions retained microphone and system-audio spans correctly.
- Video trim clamps child spans.
- Video delete removes child spans with the parent.
- Video reorder preserves each clip's edited source-audio state.
- Deleting a microphone span leaves system audio and video duration unchanged.
- Deleting a system-audio span leaves microphone and video duration unchanged.
- Collapse/expand changes presentation only.
- Render mixing is silent only inside removed ranges and remains sample-aligned outside them.

### Recording Tests

- Studio accepts recording-scoped microphone mute.
- Instant continues to accept microphone mute.
- No active recording and no microphone still return errors.
- Muted microphone samples preserve cadence and timestamps.
- System-audio capture remains unaffected.
- UI eligibility includes Studio and rejects disconnected/no-microphone states.
- UI state rolls back after a command failure.

### UI Checks

- Add Track only offers sources that exist and are not expanded.
- Expanded waveforms disappear from Video and appear once in their child rows.
- Child clips cannot be dragged.
- The row action is named Collapse Track in English and 收起轨道 in Chinese; no destructive wording or trash icon is used.
- Recording mic state is visually and accessibly distinguishable.

## Non-Goals

- No independent movement or reordering of recording-owned audio.
- No link/unlink button.
- No conversion of source audio into imported audio.
- No source separation from an already mixed exported MP4.
- No per-clip effects, fades, ducking, or keyframed gain in this change.
- No change to system-audio capture behavior.

## Acceptance Criteria

The feature is complete when a user can keep the compact Video-only timeline, expand either recorded source from Add Track, delete selected source-audio spans without shifting time, collapse the row without losing edits, and trust every Video edit or reorder to carry the remaining source audio automatically. During recording, the user can mute and restore the microphone in Studio or Instant mode while system audio and synchronization continue uninterrupted.
