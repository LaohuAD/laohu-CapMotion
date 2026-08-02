import {z} from "zod";
import {
  communicationGoalSchema,
  contentSourceSchema,
  emotionalToneSchema,
  informationShapeSchema,
  motionIntensitySchema,
  timeRangeSchema,
} from "./director";

export const componentIds = [
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
] as const;

export const stylePresetSchema = z.enum([
  "clear",
  "editorial",
  "tech",
  "momentum",
  "warning",
]);

export const visualItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(24),
  description: z.string().max(52).optional(),
  result: z.string().max(28).optional(),
  value: z.number().optional(),
  secondaryValue: z.number().optional(),
  status: z.enum(["default", "positive", "negative", "active", "muted"]).default("default"),
  source: contentSourceSchema,
});

export const visualLinkSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().max(12).optional(),
});

const baseFields = {
  title: z.string().min(1).max(30),
  subtitle: z.string().max(60).optional(),
  conclusion: z.string().max(40).optional(),
  communicationGoal: communicationGoalSchema,
  emotionalTone: emotionalToneSchema,
  informationShape: informationShapeSchema,
  motionIntensity: motionIntensitySchema.default("medium"),
  stylePreset: stylePresetSchema.default("clear"),
  renderMode: z.enum(["standalone", "asset", "still"]).default("standalone"),
  durationInFrames: z.number().int().min(60),
  sourceTimeRange: timeRangeSchema.optional(),
  items: z.array(visualItemSchema).min(1),
  links: z.array(visualLinkSchema).default([]),
  highlightOrder: z.array(z.string()).default([]),
  supportingLabels: z.array(z.string().min(1).max(16)).max(8).default([]),
  mediaSrc: z.string().optional(),
};

export const createComponentSchema = <
  TId extends (typeof componentIds)[number],
  const TModes extends readonly [string, ...string[]],
>(id: TId, modes: TModes, maxItems: number) =>
  z.object({
    component: z.literal(id),
    mode: z.enum(modes),
    ...baseFields,
    items: baseFields.items.max(maxItems),
  });

export type VisualItem = z.infer<typeof visualItemSchema>;
export type VisualLink = z.infer<typeof visualLinkSchema>;
export type ComponentConfig = {
  component: (typeof componentIds)[number];
  mode: string;
  title: string;
  subtitle?: string;
  conclusion?: string;
  communicationGoal: z.infer<typeof communicationGoalSchema>;
  emotionalTone: z.infer<typeof emotionalToneSchema>;
  informationShape: z.infer<typeof informationShapeSchema>;
  motionIntensity: z.infer<typeof motionIntensitySchema>;
  stylePreset: z.infer<typeof stylePresetSchema>;
  renderMode: "standalone" | "asset" | "still";
  durationInFrames: number;
  sourceTimeRange?: {start: number; end: number};
  items: VisualItem[];
  links: VisualLink[];
  highlightOrder: string[];
  supportingLabels?: string[];
  mediaSrc?: string;
};
