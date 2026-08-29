import {describe, expect, it} from "vitest";
import {buildSceneTiming} from "../utils/timing";

describe("buildSceneTiming", () => {
  it("keeps at least 20 percent for the final readable state", () => {
    const timing = buildSceneTiming(300);
    expect(timing.finalHoldFrames).toBeGreaterThanOrEqual(60);
    expect(timing.resolveEnd).toBeLessThanOrEqual(240);
  });

  it("keeps at least one second at 30fps when the scene is short", () => {
    const timing = buildSceneTiming(120);
    expect(timing.finalHoldFrames).toBe(30);
    expect(timing.resolveEnd).toBe(90);
  });

  it("rejects scenes too short for a readable animation", () => {
    expect(() => buildSceneTiming(59)).toThrow(/at least 60 frames/);
  });
});
