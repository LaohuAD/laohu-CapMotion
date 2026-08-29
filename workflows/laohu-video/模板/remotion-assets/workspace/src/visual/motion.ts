import {Easing, interpolate} from "remotion";

export const enterProgress = (
  frame: number,
  index: number,
  count: number,
  buildEnd: number,
) => {
  const staggerWindow = Math.max(1, buildEnd - 18);
  const start = Math.round((index / Math.max(1, count)) * staggerWindow);
  return interpolate(frame, [start, start + 18], [0, 1], {
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
