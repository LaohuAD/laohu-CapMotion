import {z} from "zod";

export const communicationGoalSchema = z.enum([
  "explain",
  "compare",
  "prove",
  "choose",
  "guide",
  "warn",
  "review",
  "remember",
]);

export const emotionalToneSchema = z.enum([
  "clear",
  "calm",
  "confident",
  "energetic",
  "futuristic",
  "urgent",
  "satisfying",
]);

export const informationShapeSchema = z.enum([
  "sequence",
  "hierarchy",
  "comparison",
  "network",
  "timeline",
  "quantitative",
  "transformation",
]);

export const motionIntensitySchema = z.enum(["low", "medium", "high"]);

export const timeRangeSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().positive(),
  })
  .refine(({start, end}) => end > start, {
    message: "timeRange.end must be greater than timeRange.start",
  });

export const contentSourceSchema = z
  .object({
    type: z.enum(["asr", "context", "source-doc", "editorial", "illustrative"]),
    confidence: z.enum(["confirmed", "inferred", "illustrative"]),
    ref: z.string().min(1).optional(),
  })
  .refine(({type, ref}) => type !== "source-doc" || Boolean(ref), {
    message: "source-doc content requires a source reference",
    path: ["ref"],
  });

export const sourcedTextSchema = z.object({
  text: z.string().min(1),
  source: contentSourceSchema,
});

export const animationBriefSchema = z.object({
  asrPath: z.string().min(1),
  timeRange: timeRangeSchema,
  userRequest: z.string().min(1),
  outputMode: z.enum(["standalone", "asset", "both"]),
  referenceDocs: z.array(z.string().min(1)).default([]),
  preferredComponent: z.string().min(1).optional(),
});

export const narrativeBeatSchema = z
  .object({
    id: z.string().min(1),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    spokenSummary: z.string().min(1),
    visualMessage: z.string().min(1),
    onScreenText: z.array(sourcedTextSchema).min(1),
  })
  .refine(({start, end}) => end > start, {
    message: "beat.end must be greater than beat.start",
  });

export type AnimationBrief = z.infer<typeof animationBriefSchema>;
export type NarrativeBeat = z.infer<typeof narrativeBeatSchema>;
export type ContentSource = z.infer<typeof contentSourceSchema>;
export type CommunicationGoal = z.infer<typeof communicationGoalSchema>;
export type EmotionalTone = z.infer<typeof emotionalToneSchema>;
export type InformationShape = z.infer<typeof informationShapeSchema>;
export type MotionIntensity = z.infer<typeof motionIntensitySchema>;
