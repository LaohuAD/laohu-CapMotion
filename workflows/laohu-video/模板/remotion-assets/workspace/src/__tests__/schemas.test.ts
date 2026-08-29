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
