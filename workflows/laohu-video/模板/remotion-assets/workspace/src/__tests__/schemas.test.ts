import {describe, expect, it} from "vitest";
import {
  animationBriefSchema,
  contentSourceSchema,
  narrativeBeatSchema,
} from "../schemas/director";
import {componentIds} from "../schemas/components";
import {getComponentManifest} from "../registry/componentRegistry";

const knowledgeVisual = {
  contractId: "kvc-001",
  segmentId: "remotion-001",
  spokenClaim: "第一遍发现内容 第二遍决定成片",
  viewerBefore: "观众以为两遍录制是重复劳动",
  viewerAfter: "观众能分清两遍录制的职责",
  knowledgeType: "COMPARE" as const,
  entities: ["第一遍录制", "第二遍录制", "成片"],
  initialState: "两条时间轴并列",
  interaction: "第一遍输出脚本 第二遍连接成片",
  stateChanges: ["第一遍转成脚本", "第二遍连接成片"],
  resultState: "只有第二遍与成片保持映射",
  viewerInference: "两遍录制服务不同阶段",
  semanticAnchors: [
    {spokenCue: "第一遍", visualEvent: "左侧时间轴转成脚本卡"},
    {spokenCue: "第二遍", visualEvent: "右侧时间轴连接成片"},
  ],
  labelPlan: [
    {text: "发现内容", target: "第一遍录制", responsibility: "身份" as const},
    {text: "决定成片", target: "第二遍录制", responsibility: "结果" as const},
  ],
  cameraPurpose: "固定视窗显示分流与汇合",
  carrierDecision: "REMOTION_OVERLAY" as const,
  silentTest: "静音仍能看出职责差异",
  audioSyncTest: "口播说到对应语义时才触发变化",
};

const overlayContinuity = {
  groupId: "chapter-two-pass",
  order: 1,
  role: "EXPLANATION" as const,
  hostCarrier: "BASE" as const,
  persistence: "SEGMENT" as const,
  stateBefore: "两遍录制还没有被区分",
  stateUpdate: "分别标出两遍录制的职责",
  stateAfter: "两遍录制的职责已经区分",
  contrastMode: "NONE" as const,
  contrastReason: "底画足够暗，亮色动画已经具备可读对比",
  attentionPlan: [{
    spokenCue: "第一遍",
    focusOwner: "OVERLAY" as const,
    target: "第一遍职责标签",
    reason: "先让观众认清内容发现职责",
  }],
  protectedRegions: [{target: "SUBTITLES" as const, description: "底部双语字幕安全区"}],
  handoff: "收束后交给第二遍成片映射",
};

const aiHostCompatibility = {
  visualAnchor: "沿输入轨道进入处理装置并停在结果仓的知识路径",
  stableNegativeSpace: "结果停稳后左上角保持低运动暗区",
  luminanceProfile: "起始暗，过程动态，结果暗",
  motionLoad: "过程高，结果低",
  forbiddenOverlayWindows: ["高速穿越处理装置"],
  attentionHandoff: "结果锁定后交给结论叠层",
  actualPixelReview: "PENDING" as const,
};

describe("animation director schemas", () => {
  it("accepts a traceable ASR animation brief", () => {
    const result = animationBriefSchema.parse({
      asrPath: "/project/input/talk.srt",
      timeRange: {start: 120, end: 138},
      userRequest: "解释这段完整流程",
      outputMode: "standalone",
      referenceDocs: ["/project/input/source.md"],
      narrative: {
        purpose: "UNDERSTAND",
        viewerBefore: "观众容易把两遍录制误解成重复劳动",
        viewerAfter: "观众能说清第一遍找内容 第二遍建成片",
        whyThisMedium: "需要同时看到两条时间轴的分流与汇合 口播难以独立呈现关系",
        handoffIn: "承接口播中的两次录制",
        handoffOut: "交给最终成片结果",
      },
      knowledgeVisual,
      overlayContinuity,
      annotation: {
        object: "第一遍与第二遍时间轴",
        relationship: "第一遍供内容重建 第二遍决定成片",
        entrance: "两条时间轴从左右进入",
        change: "第一遍退场 第二遍汇入最终线",
        resolutionFrame: "第二遍到成片的单一路径",
        materials: ["/project/input/source.md"],
        acceptance: ["静音时仍能看懂职责差异"],
      },
    });

    expect(result.outputMode).toBe("standalone");
    expect(result.timeRange.end - result.timeRange.start).toBe(18);
  });

  it("rejects a reversed source time range", () => {
    expect(() =>
      animationBriefSchema.parse({
        asrPath: "/project/input/talk.srt",
        timeRange: {start: 20, end: 10},
        userRequest: "做一个动画",
        outputMode: "asset",
        narrative: {},
        annotation: {},
      }),
    ).toThrow();
  });

  it("rejects a vague REMOTION label without executable visual relations", () => {
    expect(() =>
      animationBriefSchema.parse({
        asrPath: "/project/input/talk.srt",
        timeRange: {start: 20, end: 30},
        userRequest: "这里做动画",
        outputMode: "asset",
        narrative: {
          purpose: "UNDERSTAND",
          viewerBefore: "只听见结论",
          viewerAfter: "看懂流程",
          whyThisMedium: "需要同时看见步骤",
          handoffIn: "承接问题",
          handoffOut: "交给结论",
        },
        annotation: {object: "流程"},
      }),
    ).toThrow();
  });

  it("rejects a Remotion brief without a host-aware overlay continuity contract", () => {
    expect(() =>
      animationBriefSchema.parse({
        asrPath: "/project/input/talk.srt",
        timeRange: {start: 20, end: 30},
        userRequest: "在深色数字人底画上持续显示章节进度",
        outputMode: "asset",
        narrative: {
          purpose: "TRANSITION",
          viewerBefore: "观众知道上一项刚完成",
          viewerAfter: "观众知道当前进入第二项",
          whyThisMedium: "需要跨底画保留章节方向",
          handoffIn: "承接上一项完成态",
          handoffOut: "把当前项交给下一段解释",
        },
        annotation: {
          object: "章节进度轨",
          relationship: "已完成项与当前项",
          entrance: "沿用上一镜位置",
          change: "第二项从待处理变为当前",
          resolutionFrame: "第二项高亮且第一项保持完成",
          materials: ["chapter-state"],
          acceptance: ["跨底画切换时状态不重置"],
        },
      }),
    ).toThrow(/overlay continuity/i);
  });

  it("registers a reusable editorial overlay shell with persistent modes", () => {
    expect(componentIds).toContain("EditorialOverlayShell");
    const manifest = getComponentManifest("EditorialOverlayShell" as never);
    expect(manifest.modes).toEqual(expect.arrayContaining([
      "progress-rail",
      "evidence-dock",
      "label-stack",
      "value-callout",
      "bridge",
    ]));
  });

  it("requires a KnowledgeVisualContract when Remotion is responsible for understanding", () => {
    expect(() =>
      animationBriefSchema.parse({
        asrPath: "/project/input/talk.srt",
        timeRange: {start: 20, end: 30},
        userRequest: "解释两条时间轴的职责差异",
        outputMode: "asset",
        narrative: {
          purpose: "UNDERSTAND",
          viewerBefore: "只听见结论",
          viewerAfter: "看懂关系",
          whyThisMedium: "需要同时看见分流与汇合",
          handoffIn: "承接问题",
          handoffOut: "交给结论",
        },
        overlayContinuity,
        annotation: {
          object: "两条时间轴",
          relationship: "不同职责",
          entrance: "左右进入",
          change: "分流后只有第二条汇入成片",
          resolutionFrame: "职责分离",
          materials: ["source-to-final.json"],
          acceptance: ["静音可读"],
        },
      }),
    ).toThrow(/KnowledgeVisualContract/);
  });

  it("allows transition-only Remotion without inventing a knowledge explanation", () => {
    expect(() => animationBriefSchema.parse({
      asrPath: "/project/input/talk.srt",
      timeRange: {start: 20, end: 24},
      userRequest: "用章节标题承接下一段",
      outputMode: "asset",
      narrative: {
        purpose: "TRANSITION",
        viewerBefore: "上一章刚结束",
        viewerAfter: "观众进入下一章",
        whyThisMedium: "需要清楚的章节停点",
        handoffIn: "承接上一章结论",
        handoffOut: "引出新问题",
      },
      overlayContinuity,
      annotation: {
        object: "章节标题",
        relationship: "新旧章节交接",
        entrance: "标题从下方进入",
        change: "旧标题退出 新标题停留",
        resolutionFrame: "新章节标题稳定可读",
        materials: ["chapter-title"],
        acceptance: ["标题清楚不遮挡"],
      },
    })).not.toThrow();
  });

  it("requires AI host compatibility when the overlay sits on AI video", () => {
    const input = {
      asrPath: "/project/input/talk.srt",
      timeRange: {start: 20, end: 24},
      userRequest: "在AI视频上延续章节进度",
      outputMode: "asset" as const,
      narrative: {
        purpose: "TRANSITION" as const,
        viewerBefore: "步骤一刚完成",
        viewerAfter: "观众知道正在进入步骤二",
        whyThisMedium: "需要让同一进度状态跨底画继续存在",
        handoffIn: "承接步骤一",
        handoffOut: "进入步骤二",
      },
      overlayContinuity: {...overlayContinuity, hostCarrier: "AI_VIDEO_FULL" as const},
      annotation: {
        object: "章节进度",
        relationship: "步骤一到步骤二",
        entrance: "原位置持续",
        change: "当前步骤向前推进",
        resolutionFrame: "步骤二高亮",
        materials: ["chapter-progress"],
        acceptance: ["进度状态不断裂"],
      },
    };
    expect(() => animationBriefSchema.parse(input)).toThrow(/AI host compatibility/i);
    expect(() => animationBriefSchema.parse({
      ...input,
      overlayContinuity: {...input.overlayContinuity, hostCompatibility: aiHostCompatibility},
    })).not.toThrow();
  });

  it("requires provenance for factual source content", () => {
    expect(() =>
      contentSourceSchema.parse({
        type: "source-doc",
        confidence: "confirmed",
      }),
    ).toThrow();
  });

  it("accepts a beat with editorial explanatory text", () => {
    const result = narrativeBeatSchema.parse({
      id: "beat-1",
      start: 0,
      end: 4,
      spokenSummary: "四个模块组成完整流程",
      visualMessage: "先看到全貌，再逐个解释",
      onScreenText: [
        {
          text: "每一步都留下可复用产物",
          source: {type: "editorial", confidence: "inferred"},
        },
      ],
    });

    expect(result.onScreenText[0].source.type).toBe("editorial");
  });
});

describe("editorial overlay schema", () => {
  it("keeps overlay presentation fields after validation", () => {
    const manifest = getComponentManifest("KineticStatement");
    const result = manifest.schema.parse({
      ...manifest.defaultProps,
      stylePreset: "editorial-dark",
      presentation: "overlay",
      placement: "left",
      accentRole: "success",
      kicker: "FOUR LAYERS / 能力进化",
      titleLines: [
        {text: "声音定路", tone: "primary"},
        {text: "画面作证", tone: "accent"},
      ],
      overlayContinuity,
    }) as Record<string, unknown>;

    expect(result).toMatchObject({
      stylePreset: "editorial-dark",
      presentation: "overlay",
      placement: "left",
      accentRole: "success",
      kicker: "FOUR LAYERS / 能力进化",
      titleLines: [
        {text: "声音定路", tone: "primary"},
        {text: "画面作证", tone: "accent"},
      ],
    });
  });

  it("keeps per-item semantic reveal frames for speech-synchronised builds", () => {
    const manifest = getComponentManifest("FlowNodeGraph");
    const firstItem = manifest.defaultProps.items[0];
    const result = manifest.schema.parse({
      ...manifest.defaultProps,
      items: [
        {...firstItem, revealAtFrame: 36},
        {...firstItem, id: "second", label: "第二个语义点", revealAtFrame: 92},
      ],
    }) as {items: Array<{revealAtFrame?: number}>};

    expect(result.items.map((item) => item.revealAtFrame)).toEqual([36, 92]);
  });

  it("rejects semantic reveal frames outside the composition", () => {
    const manifest = getComponentManifest("FlowNodeGraph");
    const firstItem = manifest.defaultProps.items[0];

    expect(() => manifest.schema.parse({
      ...manifest.defaultProps,
      durationInFrames: 120,
      items: [{...firstItem, revealAtFrame: 120}],
    })).toThrow(/revealAtFrame/);
  });
});
