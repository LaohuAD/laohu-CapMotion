export type SceneTiming = {
  introduceEnd: number;
  buildEnd: number;
  resolveEnd: number;
  finalHoldFrames: number;
};

export const buildSceneTiming = (durationInFrames: number): SceneTiming => {
  if (durationInFrames < 60) {
    throw new Error("A readable animation needs at least 60 frames");
  }

  const finalHoldFrames = Math.max(30, Math.ceil(durationInFrames * 0.2));
  const resolveEnd = durationInFrames - finalHoldFrames;

  return {
    introduceEnd: Math.floor(resolveEnd * 0.28),
    buildEnd: Math.floor(resolveEnd * 0.72),
    resolveEnd,
    finalHoldFrames,
  };
};
