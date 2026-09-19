export type SceneTiming = {
  introduceEnd: number;
  buildEnd: number;
  resolveEnd: number;
  finalHoldFrames: number;
};

export const DEFAULT_ACTION_DURATION_FRAMES = 18;

export type SceneTimingItem = {
  revealAtFrame?: number;
  actionDurationFrames?: number;
  holdFrames?: number;
};

/**
 * Keep the final state readable even when semantic anchors ask for an
 * explicit per-item hold. The item remains visible after its entry; delaying
 * resolve is what makes the hold a real composition contract instead of
 * metadata that only exists in a report.
 */
export const buildSceneTiming = (
  durationInFrames: number,
  items: readonly SceneTimingItem[] = [],
): SceneTiming => {
  if (durationInFrames < 60) {
    throw new Error("A readable animation needs at least 60 frames");
  }

  const defaultFinalHoldFrames = Math.max(30, Math.ceil(durationInFrames * 0.2));
  const defaultResolveEnd = durationInFrames - defaultFinalHoldFrames;
  const maximumReadableEnd = items.reduce((maximum, item, index) => {
    const revealAtFrame = item.revealAtFrame ?? Math.round(
      (index / Math.max(1, items.length)) * Math.max(1, defaultResolveEnd - DEFAULT_ACTION_DURATION_FRAMES),
    );
    const actionDurationFrames = item.actionDurationFrames ?? DEFAULT_ACTION_DURATION_FRAMES;
    const holdFrames = item.holdFrames ?? 0;
    return Math.max(maximum, revealAtFrame + actionDurationFrames + holdFrames);
  }, 0);
  const resolveEnd = Math.min(
    durationInFrames - 1,
    Math.max(defaultResolveEnd, maximumReadableEnd),
  );
  const finalHoldFrames = durationInFrames - resolveEnd;

  return {
    introduceEnd: Math.floor(resolveEnd * 0.28),
    buildEnd: Math.floor(resolveEnd * 0.72),
    resolveEnd,
    finalHoldFrames,
  };
};
