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

export const knowledgeVisualContractSchema = z.object({
  contractId: z.string().min(1),
  segmentId: z.string().min(1),
  spokenClaim: z.string().min(1),
  viewerBefore: z.string().min(1),
  viewerAfter: z.string().min(1),
  knowledgeType: z.enum(["DEFINITION", "CAUSE", "PROCESS", "COMPARE", "HIERARCHY", "FEEDBACK", "BOUNDARY"]),
  entities: z.array(z.string().min(1)).min(1),
  initialState: z.string().min(1),
  interaction: z.string().min(1),
  stateChanges: z.array(z.string().min(1)).min(1),
  resultState: z.string().min(1),
  viewerInference: z.string().min(1),
  semanticAnchors: z.array(z.object({
    spokenCue: z.string().min(1),
    visualEvent: z.string().min(1),
  })).min(1),
  labelPlan: z.array(z.object({
    text: z.string().min(1),
    target: z.string().min(1),
    responsibility: z.enum(["身份", "动作", "结果", "边界"]),
  })),
  cameraPurpose: z.string().min(1),
  carrierDecision: z.enum(["REMOTION_OVERLAY", "AI_VIDEO_FULL", "SCREEN_RECORDING", "EVIDENCE", "BASE"]),
  silentTest: z.string().min(1),
  audioSyncTest: z.string().min(1),
});

export const aiHostCompatibilitySchema = z.object({
  visualAnchor: z.string().min(1),
  stableNegativeSpace: z.string().min(1),
  luminanceProfile: z.string().min(1),
  motionLoad: z.string().min(1),
  forbiddenOverlayWindows: z.array(z.string().min(1)),
  attentionHandoff: z.string().min(1),
  actualPixelReview: z.enum(["PENDING", "PASS", "FAIL"]),
});

export const overlayContinuitySchema = z.object({
  groupId: z.string().min(1),
  order: z.number().int().positive(),
  role: z.enum(["NAVIGATION", "EXPLANATION", "EVIDENCE", "CONCLUSION", "BRIDGE"]),
  hostCarrier: z.enum(["BASE", "SCREEN_RECORDING", "AVATAR", "EVIDENCE", "AI_VIDEO_FULL"]),
  persistence: z.enum(["SEGMENT", "ACROSS_CUT", "UNTIL_SECTION_END"]),
  stateBefore: z.string().min(1),
  stateUpdate: z.string().min(1),
  stateAfter: z.string().min(1),
  contrastMode: z.enum(["NONE", "LOCAL_BACKPLATE", "REGIONAL_SCRIM", "FULL_SCRIM"]),
  contrastReason: z.string().min(1),
  attentionPlan: z.array(z.object({
    spokenCue: z.string().min(1),
    focusOwner: z.enum(["HOST", "OVERLAY", "EVIDENCE"]),
    target: z.string().min(1),
    reason: z.string().min(1),
  })).min(1),
  protectedRegions: z.array(z.object({
    target: z.enum(["FACE", "HANDS", "SUBTITLES", "SOURCE_UI", "AI_VISUAL_ANCHOR"]),
    description: z.string().min(1),
  })),
  hostCompatibility: aiHostCompatibilitySchema.optional(),
  handoff: z.string().min(1),
}).superRefine((value, ctx) => {
  if (value.hostCarrier === "AI_VIDEO_FULL" && !value.hostCompatibility) {
    ctx.addIssue({
      code: "custom",
      path: ["hostCompatibility"],
      message: "AI host compatibility contract is required for AI_VIDEO_FULL",
    });
  }
});

export const animationBriefSchema = z.object({
  asrPath: z.string().min(1),
  timeRange: timeRangeSchema,
  userRequest: z.string().min(1),
  outputMode: z.enum(["standalone", "asset", "both"]),
  referenceDocs: z.array(z.string().min(1)).default([]),
  preferredComponent: z.string().min(1).optional(),
  narrative: z.object({
    purpose: z.enum(["UNDERSTAND", "TRUST", "ACT", "FEEL", "TRANSITION"]),
    viewerBefore: z.string().min(1),
    viewerAfter: z.string().min(1),
    whyThisMedium: z.string().min(1),
    handoffIn: z.string().min(1),
    handoffOut: z.string().min(1),
  }),
  knowledgeVisual: knowledgeVisualContractSchema.optional(),
  overlayContinuity: overlayContinuitySchema.optional(),
  annotation: z.object({
    object: z.string().min(1),
    relationship: z.string().min(1),
    entrance: z.string().min(1),
    change: z.string().min(1),
    resolutionFrame: z.string().min(1),
    materials: z.array(z.string().min(1)).min(1),
    acceptance: z.array(z.string().min(1)).min(1),
  }),
}).superRefine((value, ctx) => {
  if (!value.overlayContinuity) {
    ctx.addIssue({
      code: "custom",
      path: ["overlayContinuity"],
      message: "overlay continuity contract is required for Remotion",
    });
  }
  if (value.narrative.purpose !== "UNDERSTAND") return;
  if (!value.knowledgeVisual) {
    ctx.addIssue({
      code: "custom",
      path: ["knowledgeVisual"],
      message: "KnowledgeVisualContract is required for UNDERSTAND Remotion",
    });
    return;
  }
  if (value.knowledgeVisual.carrierDecision !== "REMOTION_OVERLAY") {
    ctx.addIssue({
      code: "custom",
      path: ["knowledgeVisual", "carrierDecision"],
      message: "Remotion knowledge explanation requires REMOTION_OVERLAY",
    });
  }
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
export type KnowledgeVisualContract = z.infer<typeof knowledgeVisualContractSchema>;
export type OverlayContinuity = z.infer<typeof overlayContinuitySchema>;
export type AIHostCompatibility = z.infer<typeof aiHostCompatibilitySchema>;
export type NarrativeBeat = z.infer<typeof narrativeBeatSchema>;
export type ContentSource = z.infer<typeof contentSourceSchema>;
export type CommunicationGoal = z.infer<typeof communicationGoalSchema>;
export type EmotionalTone = z.infer<typeof emotionalToneSchema>;
export type InformationShape = z.infer<typeof informationShapeSchema>;
export type MotionIntensity = z.infer<typeof motionIntensitySchema>;
