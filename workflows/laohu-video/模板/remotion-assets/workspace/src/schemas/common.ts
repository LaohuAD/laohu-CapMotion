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
  engine: "Remotion";
  output: "png" | "png-sequence" | "webm" | "mp4";
  integration: "standalone" | "cap-motion-overlay";
};

export type ComponentQa = {
  mobileReadable: boolean;
  avoidEmptyArea: boolean;
  noTextOverlap: boolean;
  mustScreenshotCheck: boolean;
};
