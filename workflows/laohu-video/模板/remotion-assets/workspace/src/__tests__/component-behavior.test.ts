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
});
