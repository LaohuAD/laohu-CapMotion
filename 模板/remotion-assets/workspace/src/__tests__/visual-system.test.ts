import {describe, expect, it} from "vitest";
import {componentIds} from "../schemas/components";
import {componentRenderers} from "../components";
import {surfaceBaseStyle} from "../visual/layout";
import {
  compactTypography,
  contrastRatio,
  getVisualTheme,
  visualPresetNames,
} from "../visual/theme";

describe("visual system", () => {
  it("provides a renderer for every public component family", () => {
    expect(Object.keys(componentRenderers)).toEqual([...componentIds]);
    for (const id of componentIds) {
      expect(typeof componentRenderers[id]).toBe("function");
    }
  });

  it("provides all five audience-facing visual presets", () => {
    expect(visualPresetNames).toEqual([
      "clear",
      "editorial",
      "tech",
      "momentum",
      "warning",
    ]);
  });

  it("keeps primary text readable against every preset background", () => {
    for (const preset of visualPresetNames) {
      const theme = getVisualTheme(preset);
      expect(contrastRatio(theme.text, theme.background)).toBeGreaterThanOrEqual(7);
    }
  });

  it("includes padding inside declared panel dimensions", () => {
    expect(surfaceBaseStyle.boxSizing).toBe("border-box");
  });

  it("keeps compact supporting lists subordinate to core text", () => {
    expect(compactTypography.item).toBeLessThan(56);
    expect(compactTypography.body).toBeLessThan(compactTypography.item);
  });
});
