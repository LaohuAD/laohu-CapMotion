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
}).strict();

/**
 * Standalone work has no speech clock or host video. Its contract therefore
 * records authored composition-relative events and the visual state change
 * directly, rather than inventing spoken cues or overlay-carrier fields.
 */
export const standaloneKnowledgeVisualContractSchema = z.object({
  contractId: z.string().min(1),
  claim: z.string().min(1),
  viewerBefore: z.string().min(1),
  viewerAfter: z.string().min(1),
  knowledgeType: z.enum(["DEFINITION", "CAUSE", "PROCESS", "COMPARE", "HIERARCHY", "FEEDBACK", "BOUNDARY"]),
  entities: z.array(z.string().min(1)).min(1),
  initialState: z.string().min(1),
  interaction: z.string().min(1),
  stateChanges: z.array(z.string().min(1)).min(1),
  resultState: z.string().min(1),
  viewerInference: z.string().min(1),
  relativeEvents: z.array(z.object({
    atFrame: z.number().int().nonnegative(),
    event: z.string().min(1),
  }).strict()).min(1),
  labelPlan: z.array(z.object({
    text: z.string().min(1),
    target: z.string().min(1),
    responsibility: z.enum(["身份", "动作", "结果", "边界"]),
  }).strict()),
  cameraPurpose: z.string().min(1),
  silentTest: z.string().min(1),
}).strict();

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

/**
 * `outputMode` describes where Remotion will be delivered. It does not say
 * whether the animation is driven by speech. That distinction belongs here.
 */
export const animationContentModeSchema = z.enum(["narrated", "standalone"]);
export const animationTimingModeSchema = z.enum(["source", "relative"]);

export const animationBriefSchema = z.object({
  contentMode: animationContentModeSchema.optional(),
  timingMode: animationTimingModeSchema.optional(),
  asrPath: z.string().min(1).optional(),
  timeRange: timeRangeSchema.optional(),
  durationInFrames: z.number().int().positive().optional(),
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
  }).strict(),
  knowledgeVisual: z.union([
    knowledgeVisualContractSchema,
    standaloneKnowledgeVisualContractSchema,
  ]).optional(),
  overlayContinuity: overlayContinuitySchema.optional(),
  annotation: z.object({
    object: z.string().min(1),
    relationship: z.string().min(1),
    entrance: z.string().min(1),
    change: z.string().min(1),
    resolutionFrame: z.string().min(1),
    materials: z.array(z.string().min(1)).min(1),
    acceptance: z.array(z.string().min(1)).min(1),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const contentMode = value.contentMode ?? "narrated";
  const timingMode = value.timingMode ?? "source";
  const narratedKnowledgeVisual = value.knowledgeVisual
    ? knowledgeVisualContractSchema.safeParse(value.knowledgeVisual)
    : undefined;
  const standaloneKnowledgeVisual = value.knowledgeVisual
    ? standaloneKnowledgeVisualContractSchema.safeParse(value.knowledgeVisual)
    : undefined;

  if (contentMode === "narrated") {
    if (!value.asrPath) {
      ctx.addIssue({
        code: "custom",
        path: ["asrPath"],
        message: "narrated animation requires asrPath",
      });
    }
    if (!value.timeRange) {
      ctx.addIssue({
        code: "custom",
        path: ["timeRange"],
        message: "narrated animation requires a source timeRange",
      });
    }
    if (timingMode !== "source") {
      ctx.addIssue({
        code: "custom",
        path: ["timingMode"],
        message: "narrated animation must use source timing",
      });
    }
    if (!value.overlayContinuity) {
      ctx.addIssue({
        code: "custom",
        path: ["overlayContinuity"],
        message: "narrated Remotion requires an overlay continuity contract",
      });
    }
    if (
      value.narrative.purpose === "UNDERSTAND" &&
      (!value.knowledgeVisual || !narratedKnowledgeVisual?.success)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["knowledgeVisual"],
        message: "narrated UNDERSTAND Remotion requires the narrated KnowledgeVisualContract",
      });
    }
    if (
      value.narrative.purpose === "UNDERSTAND" &&
      narratedKnowledgeVisual?.success &&
      narratedKnowledgeVisual.data.carrierDecision !== "REMOTION_OVERLAY"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["knowledgeVisual", "carrierDecision"],
        message: "Remotion knowledge explanation requires REMOTION_OVERLAY",
      });
    }
  } else {
    if (!value.timingMode || timingMode !== "relative") {
      ctx.addIssue({
        code: "custom",
        path: ["timingMode"],
        message: "standalone animation must explicitly use relative timing",
      });
    }
    if (!value.durationInFrames) {
      ctx.addIssue({
        code: "custom",
        path: ["durationInFrames"],
        message: "standalone relative animation requires durationInFrames",
      });
    }
    if (value.asrPath || value.timeRange) {
      ctx.addIssue({
        code: "custom",
        path: ["asrPath"],
        message: "standalone animation cannot carry narrated ASR or source time fields",
      });
    }
    if (value.overlayContinuity) {
      ctx.addIssue({
        code: "custom",
        path: ["overlayContinuity"],
        message: "standalone animation has no host-overlay continuity contract",
      });
    }
    if (
      value.narrative.purpose === "UNDERSTAND" &&
      (!value.knowledgeVisual || !standaloneKnowledgeVisual?.success)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["knowledgeVisual"],
        message: "standalone UNDERSTAND requires a relative knowledge visual contract",
      });
    }
    if (
      value.narrative.purpose === "UNDERSTAND" &&
      standaloneKnowledgeVisual?.success &&
      value.durationInFrames
    ) {
      const lastEvent = Math.max(...standaloneKnowledgeVisual.data.relativeEvents.map((event) => event.atFrame));
      if (lastEvent >= value.durationInFrames) {
        ctx.addIssue({
          code: "custom",
          path: ["knowledgeVisual", "relativeEvents"],
          message: "standalone relative events must be inside durationInFrames",
        });
      }
    }
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
export type StandaloneKnowledgeVisualContract = z.infer<typeof standaloneKnowledgeVisualContractSchema>;
export type OverlayContinuity = z.infer<typeof overlayContinuitySchema>;
export type AIHostCompatibility = z.infer<typeof aiHostCompatibilitySchema>;
export type NarrativeBeat = z.infer<typeof narrativeBeatSchema>;
export type ContentSource = z.infer<typeof contentSourceSchema>;
export type CommunicationGoal = z.infer<typeof communicationGoalSchema>;
export type EmotionalTone = z.infer<typeof emotionalToneSchema>;
export type InformationShape = z.infer<typeof informationShapeSchema>;
export type MotionIntensity = z.infer<typeof motionIntensitySchema>;
