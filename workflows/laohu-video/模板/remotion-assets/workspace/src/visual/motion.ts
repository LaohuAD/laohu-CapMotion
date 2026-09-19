import {Easing, interpolate} from "remotion";
import {DEFAULT_ACTION_DURATION_FRAMES} from "../utils/timing";

export const enterProgress = (
  frame: number,
  index: number,
  count: number,
  buildEnd: number,
  revealAtFrame?: number,
  actionDurationFrames = DEFAULT_ACTION_DURATION_FRAMES,
) => {
  const staggerWindow = Math.max(1, buildEnd - 18);
  const start = revealAtFrame ?? Math.round((index / Math.max(1, count)) * staggerWindow);
  return interpolate(frame, [start, start + actionDurationFrames], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

export const drawProgress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const editorialRevealProgress = (
  frame: number,
  index: number,
  count: number,
  buildEnd: number,
  revealAtFrame?: number,
  actionDurationFrames = DEFAULT_ACTION_DURATION_FRAMES,
) => {
  const progress = enterProgress(
    frame,
    index,
    count,
    buildEnd,
    revealAtFrame,
    actionDurationFrames,
  );
  return {
    opacity: progress,
    translateX: interpolate(progress, [0, 1], [-24, 0]),
    scale: interpolate(progress, [0, 1], [0.98, 1]),
  };
};
