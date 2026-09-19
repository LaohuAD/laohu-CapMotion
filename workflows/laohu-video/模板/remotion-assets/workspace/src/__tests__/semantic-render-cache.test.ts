import { describe, expect, it } from "vitest";
import {
  cacheKeyMaterial,
  isCacheReceiptValid,
} from "../semantic/semantic-render-cache";

const base = {
  sourceTreeFingerprint: "tree-a",
  dependencyFingerprint: "deps-a",
  assetFingerprints: { "public/logo.png": "asset-a" },
  params: { component: "FlowNodeGraph", title: "流程" },
  localTiming: { fps: 30, durationInFrames: 120, startFrame: 0 },
  outputSpec: { width: 1920, height: 1080, codec: "prores", quality: "final" },
  placement: { x: 100, y: 40, scale: 0.8 },
};

describe("safe local render cache key", () => {
  it("reuses a rendered asset when only the later placement changes", () => {
    expect(cacheKeyMaterial(base)).toBe(
      cacheKeyMaterial({
        ...base,
        placement: { x: 800, y: 300, scale: 0.5 },
      }),
    );
  });

  it("includes source, dependency, asset, parameter, local timing, and output changes", () => {
    for (const change of [
      { sourceTreeFingerprint: "tree-b" },
      { dependencyFingerprint: "deps-b" },
      { assetFingerprints: { "public/logo.png": "asset-b" } },
      { params: { component: "FlowNodeGraph", title: "变化" } },
      { localTiming: { fps: 30, durationInFrames: 121, startFrame: 0 } },
      {
        outputSpec: {
          width: 960,
          height: 540,
          codec: "vp8",
          quality: "preview",
        },
      },
    ]) {
      expect(cacheKeyMaterial({ ...base, ...change })).not.toBe(
        cacheKeyMaterial(base),
      );
    }
  });

  it("requires a receipt to match both output size and digest", () => {
    const receipt = {
      schema: "laohu.remotion-render-receipt/1",
      cacheKey: "key-a",
      output: { sizeBytes: 12, sha256: "sha-a" },
    };
    expect(
      isCacheReceiptValid(receipt, { sizeBytes: 12, sha256: "sha-a" }),
    ).toBe(true);
    expect(
      isCacheReceiptValid(receipt, { sizeBytes: 12, sha256: "sha-b" }),
    ).toBe(false);
    expect(
      isCacheReceiptValid(receipt, { sizeBytes: 13, sha256: "sha-a" }),
    ).toBe(false);
  });
});
