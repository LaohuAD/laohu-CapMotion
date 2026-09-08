import {describe, expect, it} from "vitest";
import {getDecisionGridColumns} from "../components/DecisionCanvas";
import {
  getDataPresentation,
  shouldRenderChartAxisLabels,
} from "../components/DataStoryChart";

describe("component information behavior", () => {
  it("uses three columns so six decision options remain visible", () => {
    expect(getDecisionGridColumns(4)).toBe(2);
    expect(getDecisionGridColumns(6)).toBe(3);
  });

  it("does not present review windows as quantitative bars", () => {
    expect(getDataPresentation("dashboard")).toBe("dashboard");
    expect(getDataPresentation("trend")).toBe("trend");
    expect(getDataPresentation("bars")).toBe("bars");
  });

  it("does not repeat dashboard windows as chart axis labels", () => {
    expect(shouldRenderChartAxisLabels("dashboard")).toBe(false);
    expect(shouldRenderChartAxisLabels("trend")).toBe(true);
  });

  it("switches four semantic families to compact overlay layouts", async () => {
    const [statement, chart, compare, flow] = await Promise.all([
      import("../components/KineticStatement"),
      import("../components/DataStoryChart"),
      import("../components/CompareTransform"),
      import("../components/FlowNodeGraph"),
    ]);

    expect(
      (statement as unknown as {getStatementLayout?: (value: string) => string})
        .getStatementLayout?.("overlay"),
    ).toBe("overlay");
    expect(
      (chart as unknown as {getChartHeight?: (value: string) => number})
        .getChartHeight?.("overlay"),
    ).toBe(300);
    expect(
      (compare as unknown as {getCompareLayout?: (value: string) => string})
        .getCompareLayout?.("overlay"),
    ).toBe("stacked");
    expect(
      (flow as unknown as {getFlowColumns?: (value: string, count: number) => number})
        .getFlowColumns?.("overlay", 4),
    ).toBe(1);
  });

  it("keeps an overlay flow conclusion hidden until the structure is built", async () => {
    const flow = await import("../components/FlowNodeGraph");
    const getFlowConclusionOpacity = (
      flow as unknown as {
        getFlowConclusionOpacity?: (
          frame: number,
          timing: {buildEnd: number; resolveEnd: number},
        ) => number;
      }
    ).getFlowConclusionOpacity;

    expect(typeof getFlowConclusionOpacity).toBe("function");
    expect(getFlowConclusionOpacity?.(30, {buildEnd: 170, resolveEnd: 240})).toBe(0);
    expect(getFlowConclusionOpacity?.(205, {buildEnd: 170, resolveEnd: 240})).toBeCloseTo(0.5);
    expect(getFlowConclusionOpacity?.(240, {buildEnd: 170, resolveEnd: 240})).toBe(1);
  });
});
