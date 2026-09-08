import {fontFamilies} from "../visual/theme";

export const laohuPresets = {
  default: {
    fontFamily: fontFamilies.body,
    colors: {
      background: "#101216",
      panel: "#171B22",
      text: "#F6F7F9",
      mutedText: "#AAB2C0",
      accent: "#4FC3F7",
      warning: "#FFCC66",
      line: "rgba(255, 255, 255, 0.14)",
    },
    radius: {
      panel: 8,
      node: 8,
    },
    motion: {
      enterFrames: 24,
      staggerFrames: 10,
    },
  },
  cool: {
    colors: {
      background: "#080B10",
      panel: "#111827",
      text: "#F8FBFF",
      mutedText: "#B3C1D6",
      accent: "#58E6FF",
      warning: "#FFE082",
      line: "rgba(88, 230, 255, 0.28)",
    },
  },
  understand: {
    colors: {
      background: "#101216",
      panel: "#181C23",
      text: "#FFFFFF",
      mutedText: "#C4CAD4",
      accent: "#7DDC91",
      warning: "#FFD166",
      line: "rgba(255, 255, 255, 0.18)",
    },
  },
} as const;
