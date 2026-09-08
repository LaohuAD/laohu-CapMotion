import {readdirSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {componentIds} from "../schemas/components";
import {componentRenderers} from "../components";
import {getStageScrimStyle, surfaceBaseStyle} from "../visual/layout";
import {
  compactTypography,
  contrastRatio,
  fontFamilies,
  getVisualTheme,
  splitBilingualLabel,
  typeStyles,
  visualPresetNames,
} from "../visual/theme";

describe("visual system", () => {
  it("provides a renderer for every public component family", () => {
    expect(Object.keys(componentRenderers)).toEqual([...componentIds]);
    for (const id of componentIds) {
      expect(typeof componentRenderers[id]).toBe("function");
    }
  });

  it("provides all six audience-facing visual presets", () => {
    expect(visualPresetNames).toEqual([
      "clear",
      "editorial",
      "tech",
      "momentum",
      "warning",
      "editorial-dark",
    ]);
  });

  it("provides semantic accent roles without changing the neutral surface", async () => {
    const themeModule = await import("../visual/theme");
    const resolveSemanticAccent = (
      themeModule as unknown as {
        resolveSemanticAccent?: (preset: string, role: string) => string;
      }
    ).resolveSemanticAccent;

    expect(typeof resolveSemanticAccent).toBe("function");
    expect(resolveSemanticAccent?.("editorial-dark", "info")).toBe("#2F80FF");
    expect(resolveSemanticAccent?.("editorial-dark", "success")).toBe("#39E75F");
    expect(resolveSemanticAccent?.("editorial-dark", "danger")).toBe("#FF4D5E");
    expect(resolveSemanticAccent?.("editorial-dark", "technical")).toBe("#A96BFF");
  });

  it("keeps overlay panels inside a side safe-zone", async () => {
    const layoutModule = await import("../visual/layout");
    const getOverlayGeometry = (
      layoutModule as unknown as {
        getOverlayGeometry?: (placement: string) => {
          left?: number;
          right?: number;
          top: number;
          bottom: number;
          width: number;
        };
      }
    ).getOverlayGeometry;

    expect(typeof getOverlayGeometry).toBe("function");
    expect(getOverlayGeometry?.("left")).toEqual({
      left: 88,
      top: 76,
      bottom: 150,
      width: 760,
    });
    expect(getOverlayGeometry?.("right")).toEqual({
      right: 88,
      top: 76,
      bottom: 150,
      width: 760,
    });
  });

  it("dims the full host frame for approved full-scrim asset overlays", () => {
    expect(getStageScrimStyle("asset", "FULL_SCRIM")).toEqual({
      position: "absolute",
      inset: 0,
      background: "rgba(4, 7, 12, 0.62)",
    });
    expect(getStageScrimStyle("asset", "LOCAL_BACKPLATE")).toBeNull();
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

  it("uses separate, reproducible type roles instead of one synthesized system bold", () => {
    expect(fontFamilies.display).toContain("Arial Black");
    expect(fontFamilies.display).toContain("Noto Sans CJK SC");
    expect(fontFamilies.body).toContain("Noto Sans CJK SC");
    expect(fontFamilies.number).toContain("DIN Condensed");
    expect(typeStyles.hero.fontWeight).toBe(900);
    expect(typeStyles.hero.letterSpacing).toBe("-0.035em");
    expect(typeStyles.hero.lineHeight).toBeLessThan(1);
    expect(typeStyles.number.fontVariantNumeric).toBe("tabular-nums");
    expect(typeStyles.microLabel.letterSpacing).toBe("0.2em");
    expect(typeStyles.body.lineHeight).toBeGreaterThanOrEqual(1.35);
  });

  it("splits bilingual eyebrow labels into an editorial English line and a Chinese line", () => {
    expect(splitBilingualLabel("GEO · MUST DO / 必须做")).toEqual({
      primary: "GEO · MUST DO",
      secondary: "必须做",
    });
    expect(splitBilingualLabel("DATA / PROOF")).toEqual({
      primary: "DATA / PROOF",
      secondary: undefined,
    });
  });

  it("does not request synthetic intermediate font weights from any public component", () => {
    const componentDirectory = new URL("../components/", import.meta.url);
    const offenders = readdirSync(componentDirectory)
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) =>
        /fontWeight:\s*(?:550|650|850|950)\b/u.test(
          readFileSync(new URL(file, componentDirectory), "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
