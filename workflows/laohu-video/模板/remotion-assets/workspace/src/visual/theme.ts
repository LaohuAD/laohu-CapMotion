import type {ComponentConfig} from "../schemas/components";

export const visualPresetNames = [
  "clear",
  "editorial",
  "tech",
  "momentum",
  "warning",
] as const;

export type VisualPresetName = (typeof visualPresetNames)[number];

export type VisualTheme = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  danger: string;
  success: string;
  line: string;
  shadow: string;
};

const themes: Record<VisualPresetName, VisualTheme> = {
  clear: {
    background: "#F3F6F5",
    surface: "#FFFFFF",
    surfaceAlt: "#E7EEEB",
    text: "#101513",
    muted: "#52605B",
    accent: "#13705C",
    accent2: "#C95F19",
    danger: "#B93535",
    success: "#247A45",
    line: "#BBC9C3",
    shadow: "rgba(16, 21, 19, 0.14)",
  },
  editorial: {
    background: "#F5F6F7",
    surface: "#FFFFFF",
    surfaceAlt: "#E8EAED",
    text: "#111214",
    muted: "#565C64",
    accent: "#C93632",
    accent2: "#176B86",
    danger: "#A82B28",
    success: "#24724A",
    line: "#C8CCD1",
    shadow: "rgba(17, 18, 20, 0.16)",
  },
  tech: {
    background: "#07110F",
    surface: "#0F1E1B",
    surfaceAlt: "#17302B",
    text: "#F4FAF8",
    muted: "#AAC6BE",
    accent: "#2DD4BF",
    accent2: "#F3C64F",
    danger: "#FF6B62",
    success: "#57DC8B",
    line: "#315A51",
    shadow: "rgba(0, 0, 0, 0.38)",
  },
  momentum: {
    background: "#101112",
    surface: "#1B1D1F",
    surfaceAlt: "#2A2D30",
    text: "#FFFFFF",
    muted: "#C6CBD0",
    accent: "#FFD447",
    accent2: "#42D99C",
    danger: "#FF5B55",
    success: "#42D99C",
    line: "#41464B",
    shadow: "rgba(0, 0, 0, 0.34)",
  },
  warning: {
    background: "#17110F",
    surface: "#261B17",
    surfaceAlt: "#38251E",
    text: "#FFF8F3",
    muted: "#E1C4B7",
    accent: "#FFB000",
    accent2: "#F0644F",
    danger: "#FF5C50",
    success: "#58CF87",
    line: "#684135",
    shadow: "rgba(0, 0, 0, 0.38)",
  },
};

export const getVisualTheme = (preset: ComponentConfig["stylePreset"]) =>
  themes[preset];

const channel = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = channel((value >> 16) & 255);
  const green = channel((value >> 8) & 255);
  const blue = channel(value & 255);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
};

export const contrastRatio = (foreground: string, background: string) => {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};

export const typography = {
  title: 82,
  subtitle: 38,
  hero: 118,
  item: 56,
  body: 36,
  label: 30,
  conclusion: 44,
} as const;

export const compactTypography = {
  item: 42,
  body: 28,
} as const;
