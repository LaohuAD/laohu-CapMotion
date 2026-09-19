import {describe, expect, it} from "vitest";
import {componentRegistry} from "../registry/componentRegistry";
import {getModeAutoSelectionEligibility} from "../registry/componentRegistry";

const expectedIds = [
  "KineticStatement",
  "CompareTransform",
  "FlowNodeGraph",
  "SystemMap",
  "DecisionCanvas",
  "TimelineRoadmap",
  "DataStoryChart",
  "FunnelJourney",
  "EvidenceBoard",
  "FormTemplateBuilder",
  "ScreenExplainer",
  "RiskActionLoop",
  "EditorialOverlayShell",
];

describe("component registry", () => {
  it("registers exactly the 13 public component families", () => {
    expect(componentRegistry.map((item) => item.id)).toEqual(expectedIds);
  });

  it("covers at least 40 reusable expression modes", () => {
    const modes = componentRegistry.flatMap((item) =>
      item.modes.map((mode) => `${item.id}:${mode}`),
    );

    expect(new Set(modes).size).toBe(modes.length);
    expect(modes.length).toBeGreaterThanOrEqual(40);
  });

  it("gives every family selection and implementation metadata", () => {
    for (const item of componentRegistry) {
      expect(item.communicationGoals.length).toBeGreaterThan(0);
      expect(item.informationShapes.length).toBeGreaterThan(0);
      expect(item.emotionalTones.length).toBeGreaterThan(0);
      expect(item.minDurationSeconds).toBeGreaterThan(0);
      expect(item.maxItems).toBeGreaterThan(0);
      expect(item.specPath).toMatch(
        /^workflows\/laohu-video\/模板\/components\/.+\.md$/,
      );
      expect(item.defaultProps.component).toBe(item.id);
      expect(Object.keys(item.autoSelectionEligibility).sort()).toEqual([...item.modes].sort());
      for (const mode of item.modes) {
        expect(item.autoSelectionEligibility[mode].reasons.length).toBeGreaterThan(0);
      }
      expect(() => item.schema.parse(item.defaultProps)).not.toThrow();
    }
  });

  it("registers data-flow while preserving the artifact-flow spelling", () => {
    const flow = componentRegistry.find((item) => item.id === "FlowNodeGraph");
    expect(flow?.modes).toEqual(expect.arrayContaining([
      "linear",
      "branch",
      "loop",
      "data-flow",
      "artifact-flow",
    ]));
  });

  it("keeps unsupported modes explicit but out of automatic selection", () => {
    expect(getModeAutoSelectionEligibility("DecisionCanvas", "radar")).toMatchObject({
      eligible: false,
    });
    expect(getModeAutoSelectionEligibility("SystemMap", "network")).toMatchObject({
      eligible: false,
    });
    expect(getModeAutoSelectionEligibility("FlowNodeGraph", "artifact-flow")).toMatchObject({
      eligible: false,
    });
    expect(getModeAutoSelectionEligibility("FlowNodeGraph", "data-flow")).toMatchObject({
      eligible: true,
    });
    expect(() => componentRegistry.find((item) => item.id === "DecisionCanvas")?.schema.parse({
      ...componentRegistry.find((item) => item.id === "DecisionCanvas")?.defaultProps,
      mode: "radar",
    })).not.toThrow();
  });
});
