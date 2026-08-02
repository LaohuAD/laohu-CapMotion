export type AudienceEffect =
  | "understand"
  | "trust"
  | "cool"
  | "action"
  | "memory"
  | "choice"
  | "warning"
  | "review";

export type TimeRange = {
  start: number;
  end: number;
};

export type ComponentImplementation = {
  engine: "Remotion" | "HyperFrames" | "双引擎";
  output: "png" | "png-sequence" | "webm" | "mp4" | "html";
  mountInHyperFrames: boolean;
};

export type ComponentQa = {
  mobileReadable: boolean;
  avoidEmptyArea: boolean;
  noTextOverlap: boolean;
  mustScreenshotCheck: boolean;
};
