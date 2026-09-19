import { describe, expect, it } from "vitest";
import {
  SemanticAnchorError,
  applySemanticAnchors,
} from "../semantic/semantic-anchors";
import { getComponentManifest } from "../registry/componentRegistry";

const config = {
  component: "FlowNodeGraph",
  mode: "linear",
  title: "确定性流程",
  communicationGoal: "explain",
  emotionalTone: "clear",
  informationShape: "sequence",
  motionIntensity: "medium",
  stylePreset: "clear",
  renderMode: "standalone",
  presentation: "stage",
  placement: "left",
  accentRole: "info",
  durationInFrames: 180,
  items: [
    {
      id: "first",
      label: "第一步",
      source: { type: "editorial", confidence: "confirmed" },
    },
    {
      id: "second",
      label: "第二步",
      source: { type: "editorial", confidence: "confirmed" },
    },
  ],
  links: [],
  highlightOrder: [],
};

const mapping = {
  schema: "laohu.source-to-final-map/1",
  mappingId: "map-7",
  revision: 7,
  source: { mediaId: "capture-01", fingerprint: "source-sha" },
  fps: 30,
  sequence: [
    {
      id: "seg-a",
      sourceStart: 0,
      sourceEnd: 10,
      targetStart: 0,
      targetEnd: 4,
    },
    {
      id: "seg-b",
      sourceStart: 10,
      sourceEnd: 20,
      targetStart: 8,
      targetEnd: 18,
    },
  ],
  words: [
    { id: "w-first", index: 0, start: 11, end: 11.5, segmentId: "seg-b" },
    { id: "w-second", index: 1, start: 12, end: 12.5, segmentId: "seg-b" },
  ],
};

const anchors = {
  schema: "laohu.semantic-anchors/1",
  source: {
    mediaId: "capture-01",
    fingerprint: "source-sha",
    projectRevision: 7,
  },
  mapping: { id: "map-7", revision: 7 },
  composition: { targetStartSeconds: 8, fps: 30 },
  anchors: [
    {
      id: "anchor-second",
      itemId: "second",
      segmentId: "seg-b",
      wordIds: ["w-second"],
      timing: { actionDurationFrames: 12, holdFrames: 6 },
    },
  ],
};

describe("deterministic semantic anchors", () => {
  it("maps a retained word through S2→T2 to a composition-relative reveal frame", () => {
    const result = applySemanticAnchors(config, anchors, mapping);

    expect(result.config.items.map((item) => item.revealAtFrame)).toEqual([
      undefined,
      60,
    ]);
    expect(result.resolved[0]).toMatchObject({
      anchorId: "anchor-second",
      itemId: "second",
      triggerAtFrame: 60,
      actionDurationFrames: 12,
      holdFrames: 6,
      actionEndFrame: 72,
      holdEndFrame: 78,
      mappingSegmentId: "seg-b",
      sourceWordIds: ["w-second"],
    });
    expect(result.config.durationInFrames).toBe(180);
    const parsed = getComponentManifest("FlowNodeGraph").schema.parse(
      result.config,
    ) as { items: Array<{ revealAtFrame?: number }> };
    expect(parsed.items[1].revealAtFrame).toBe(60);
  });

  it("uses the first retained target word when source words are reordered in T2", () => {
    const reversed = {
      ...mapping,
      sequence: [
        {
          id: "seg-a",
          sourceStart: 0,
          sourceEnd: 10,
          targetStart: 8,
          targetEnd: 10,
        },
        {
          id: "seg-b",
          sourceStart: 10,
          sourceEnd: 20,
          targetStart: 0,
          targetEnd: 2,
        },
      ],
      words: [
        { id: "w-first", index: 0, start: 1, end: 1.5, segmentId: "seg-a" },
        { id: "w-second", index: 1, start: 11, end: 11.5, segmentId: "seg-b" },
      ],
    };
    const result = applySemanticAnchors(
      { ...config, durationInFrames: 120 },
      {
        ...anchors,
        composition: { targetStartSeconds: 0, fps: 30 },
        anchors: [
          {
            ...anchors.anchors[0],
            segmentId: undefined,
            segmentIds: ["seg-a", "seg-b"],
            wordIds: ["w-first", "w-second"],
          },
        ],
      },
      reversed,
    );

    expect(result.resolved[0].triggerAtFrame).toBe(6);
  });

  it("maps speed changes without stretching the entry to the spoken span", () => {
    const fast = {
      ...mapping,
      sequence: [
        {
          id: "seg-a",
          sourceStart: 0,
          sourceEnd: 10,
          targetStart: 0,
          targetEnd: 5,
        },
      ],
      words: [{ id: "w-fast", index: 0, start: 4, end: 8, segmentId: "seg-a" }],
    };
    const result = applySemanticAnchors(
      { ...config, durationInFrames: 180 },
      {
        ...anchors,
        mapping: { id: "map-7", revision: 7 },
        composition: { targetStartSeconds: 0, fps: 30 },
        anchors: [
          {
            id: "anchor-fast",
            itemId: "first",
            segmentId: "seg-a",
            wordIds: ["w-fast"],
            timing: { actionDurationFrames: 9, holdFrames: 4 },
          },
        ],
      },
      { ...fast, source: mapping.source },
    );

    expect(result.resolved[0].triggerAtFrame).toBe(60);
    expect(result.resolved[0].actionDurationFrames).toBe(9);
    expect(result.resolved[0].holdFrames).toBe(4);
  });

  it("uses global EDL coordinates when local segment coordinates are also present", () => {
    const result = applySemanticAnchors(
      config,
      {
        ...anchors,
        composition: { targetStartSeconds: 0, fps: 30 },
        anchors: [
          {
            id: "global-word",
            itemId: "first",
            segmentId: "recording-2",
            wordIds: ["global-word-1"],
          },
        ],
      },
      {
        ...mapping,
        sequence: [
          {
            id: "recording-2",
            sourceStart: 0,
            sourceEnd: 10,
            sourceGlobalStart: 100,
            sourceGlobalEnd: 110,
            targetStart: 0,
            targetEnd: 10,
          },
        ],
        words: [
          {
            id: "global-word-1",
            index: 0,
            globalStartMs: 102000,
            globalEndMs: 102500,
            segmentId: "recording-2",
          },
        ],
      },
    );

    expect(result.resolved[0].triggerAtFrame).toBe(60);
  });

  it("maps an exact retained source range only within its pinned segment", () => {
    const result = applySemanticAnchors(
      config,
      {
        ...anchors,
        composition: { targetStartSeconds: 0, fps: 30 },
        anchors: [
          {
            id: "range-anchor",
            itemId: "first",
            segmentId: "seg-a",
            sourceRange: { start: 2, end: 3 },
            timing: { actionDurationFrames: 6, holdFrames: 3 },
          },
        ],
      },
      mapping,
    );
    expect(result.resolved[0]).toMatchObject({
      sourceRange: { start: 2, end: 3 },
      triggerAtFrame: 24,
    });
    expect(() =>
      applySemanticAnchors(
        config,
        {
          ...anchors,
          anchors: [
            {
              id: "cross-cut",
              itemId: "first",
              segmentIds: ["seg-a", "seg-b"],
              sourceRange: { start: 9, end: 11 },
            },
          ],
        },
        mapping,
      ),
    ).toThrowError(/RANGE_SPANS_SEGMENTS/);
  });

  it("rejects a deleted or cut-prior word instead of rebinding by text", () => {
    expect(() =>
      applySemanticAnchors(
        config,
        {
          ...anchors,
          anchors: [
            {
              id: "deleted",
              itemId: "first",
              segmentId: "seg-a",
              wordIds: ["deleted-word"],
              spokenCue: "重复的词",
            },
          ],
        },
        mapping,
      ),
    ).toThrowError(/DELETED_ANCHOR|WORD_NOT_FOUND/);
  });

  it("rejects ambiguous repeated indices and stale mapping revisions clearly", () => {
    const duplicateIndex = {
      ...mapping,
      words: [
        { id: "w-a", index: 4, start: 11, end: 11.5, segmentId: "seg-b" },
        { id: "w-b", index: 4, start: 12, end: 12.5, segmentId: "seg-b" },
      ],
    };
    expect(() =>
      applySemanticAnchors(
        config,
        {
          ...anchors,
          anchors: [
            { ...anchors.anchors[0], wordIds: undefined, wordIndices: [4] },
          ],
        },
        duplicateIndex,
      ),
    ).toThrowError(/AMBIGUOUS_WORD/);

    expect(() =>
      applySemanticAnchors(
        config,
        { ...anchors, mapping: { id: "map-7", revision: 6 } },
        mapping,
      ),
    ).toThrowError(/STALE_MAPPING/);
  });

  it("rejects an entry whose action and hold exceed a short composition", () => {
    expect(() =>
      applySemanticAnchors(
        { ...config, durationInFrames: 30 },
        {
          ...anchors,
          anchors: [
            {
              ...anchors.anchors[0],
              timing: { actionDurationFrames: 20, holdFrames: 10 },
            },
          ],
        },
        mapping,
      ),
    ).toThrowError(/FRAME_BOUNDS/);
  });

  it("requires explicit word or range references instead of using a spoken cue", () => {
    try {
      applySemanticAnchors(
        config,
        {
          ...anchors,
          anchors: [
            {
              id: "cue-only",
              itemId: "first",
              segmentId: "seg-b",
              spokenCue: "不要自动搜索",
            },
          ],
        },
        mapping,
      );
      throw new Error("expected semantic anchor validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SemanticAnchorError);
      expect(String(error)).toMatch(/EXPLICIT_REFERENCE_REQUIRED/);
    }
  });
});
