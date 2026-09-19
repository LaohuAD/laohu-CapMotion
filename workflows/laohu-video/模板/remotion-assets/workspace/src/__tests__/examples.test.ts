import {describe, expect, it} from "vitest";
import {scene001Examples} from "../configs/examples/scene001Examples";
import {flowNodeGraphExamples} from "../configs/examples/flowNodeGraphExamples";
import {getComponentManifest} from "../registry/componentRegistry";
import {getRiskRows} from "../components/RiskActionLoop";
import {h3TutorialConfigs} from "../configs/works/h3Tutorial";

describe("spoken-video acceptance examples", () => {
  it("covers the six planned Remotion acceptance scenes", () => {
    expect(Object.keys(scene001Examples)).toEqual([
      "scene07",
      "scene08",
      "scene10",
      "scene12",
      "scene14",
      "scene16",
    ]);
  });

  it("validates every example against its component schema", () => {
    for (const config of Object.values(scene001Examples)) {
      const manifest = getComponentManifest(config.component);
      expect(() => manifest.schema.parse(config)).not.toThrow();
      for (const item of config.items) {
        expect(item.source.type).toBe("source-doc");
        expect(item.source.ref).toContain("source-material.md#场景-");
      }
    }
  });

  it("keeps every compliance risk mapped to an action and proof file", () => {
    const rows = getRiskRows(scene001Examples.scene16.items);
    expect(rows[0]).toEqual({
      risk: "免费工具授权",
      action: "核验商用范围",
      proof: "授权记录",
    });
    expect(rows.every((row) => row.action && row.proof)).toBe(true);
  });

  it("keeps review metrics separate from observation windows", () => {
    expect(scene001Examples.scene12.supportingLabels).toEqual([
      "完播",
      "互动",
      "收藏",
      "评论关键词",
    ]);
  });
});

describe("editorial overlay examples", () => {
  it("provides reusable transparent overlays plus the five continuity modes", async () => {
    const module = await import("../configs/examples/editorialOverlayExamples");
    const examples = module.editorialOverlayExamples;

    expect(Object.keys(examples)).toEqual([
      "fourLayerAnchor",
      "evolutionProof",
      "fourLayerStack",
      "surfaceVsSystem",
      "beforeAfter",
      "chapterProgress",
      "evidenceCheckpoint",
      "conceptLabels",
      "headlineValue",
      "carrierBridge",
    ]);

    expect(Object.values(examples)
      .filter((config) => config.component === "EditorialOverlayShell")
      .map((config) => config.mode))
      .toEqual(["progress-rail", "evidence-dock", "label-stack", "value-callout", "bridge"]);

    for (const config of Object.values(examples)) {
      const manifest = getComponentManifest(config.component);
      expect(() => manifest.schema.parse(config)).not.toThrow();
      expect(config.renderMode).toBe("asset");
      expect(config.presentation).toBe("overlay");
      expect(config.stylePreset).toBe("editorial-dark");
      expect(config.items.every((item) => item.source.type !== "illustrative")).toBe(true);
    }
  });
});

describe("flow topology examples", () => {
  it("covers workflow, branch comparison, loop, and data-flow overlay examples", () => {
    expect(Object.keys(flowNodeGraphExamples)).toEqual(["workflow", "branch", "loop", "overlay"]);

    expect(flowNodeGraphExamples.workflow.mode).toBe("linear");
    expect(flowNodeGraphExamples.branch.mode).toBe("branch");
    expect(flowNodeGraphExamples.loop.mode).toBe("loop");
    expect(flowNodeGraphExamples.overlay.mode).toBe("data-flow");
    expect(flowNodeGraphExamples.overlay.presentation).toBe("overlay");
  });

  it("validates every topology example against the registered schema", () => {
    for (const config of Object.values(flowNodeGraphExamples)) {
      const manifest = getComponentManifest(config.component);
      expect(() => manifest.schema.parse(config)).not.toThrow();
      expect(config.items.every((item) => item.source.ref?.includes("source-material.md#"))).toBe(true);
    }
  });

  it("keeps the existing H3 FlowNodeGraph work configs valid", () => {
    for (const config of Object.values(h3TutorialConfigs).filter(
      (candidate) => candidate.component === "FlowNodeGraph",
    )) {
      const manifest = getComponentManifest(config.component);
      expect(() => manifest.schema.parse(config)).not.toThrow();
    }
  });
});
