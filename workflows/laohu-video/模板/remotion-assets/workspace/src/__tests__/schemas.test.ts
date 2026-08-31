import {describe, expect, it} from "vitest";
import {
  animationBriefSchema,
  contentSourceSchema,
  narrativeBeatSchema,
} from "../schemas/director";

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
