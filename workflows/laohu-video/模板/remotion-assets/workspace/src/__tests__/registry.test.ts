import {describe, expect, it} from "vitest";
import {componentRegistry} from "../registry/componentRegistry";

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
      expect(() => item.schema.parse(item.defaultProps)).not.toThrow();
    }
  });
});
