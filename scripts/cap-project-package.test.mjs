import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCapEdlFromFrameEdl,
  buildCapBilingualTracks,
} from "./cap-project-package.mjs";

test("converts a global frame EDL across recording segment boundaries", () => {
  const result = buildCapEdlFromFrameEdl({
    frameEdl: {
      schema: "laohu.frame-edl/1",
      sequence: [
        {sourceStart: 8, sourceEnd: 12, targetStart: 0, targetEnd: 4},
      ],
    },
    timelineSegments: [
      {recordingSegment: 0, timescale: 1, start: 0, end: 10, name: null},
      {recordingSegment: 1, timescale: 1, start: 0, end: 5, name: null},
    ],
    sourceProjectRevision: 12,
  });

  assert.equal(result.schema, "laohu.cap-edl/1");
  assert.equal(result.sourceProjectRevision, 12);
  assert.deepEqual(result.sequence, [
    {
      index: 1,
      recordingSegment: 0,
      sourceStart: 8,
      sourceEnd: 10,
      sourceGlobalStart: 8,
      sourceGlobalEnd: 10,
      targetStart: 0,
      targetEnd: 2,
    },
    {
      index: 2,
      recordingSegment: 1,
      sourceStart: 0,
      sourceEnd: 2,
      sourceGlobalStart: 10,
      sourceGlobalEnd: 12,
      targetStart: 2,
      targetEnd: 4,
    },
  ]);
});

test("rejects frame EDL target drift before it can reach a Cap project", () => {
  assert.throws(() => buildCapEdlFromFrameEdl({
    frameEdl: {
      schema: "laohu.frame-edl/1",
      sequence: [
        {sourceStart: 1, sourceEnd: 2, targetStart: 0, targetEnd: 1},
        {sourceStart: 3, sourceEnd: 4, targetStart: 1.1, targetEnd: 2.1},
      ],
    },
    timelineSegments: [
      {recordingSegment: 0, timescale: 1, start: 0, end: 10, name: null},
    ],
    sourceProjectRevision: 4,
  }), /contiguous/i);
});

test("builds paired Chinese and English editable caption tracks", () => {
  const result = buildCapBilingualTracks({
    bilingual: {
      schema: "laohu.bilingual-caption-track/1",
      segments: [
        {id: "caption-1", start: 0.1, end: 2.5, text: "中文", en: "English"},
      ],
    },
    durationSeconds: 3,
  });

  assert.equal(result.schema, "laohu.cap-caption-tracks/1");
  assert.equal(result.tracks.length, 2);
  assert.deepEqual(result.tracks.map(({id, style}) => ({id, style})), [
    {
      id: "zh-CN",
      style: {fontSize: 64, position: "manual", manualPosition: {x: 0.5, y: 0.92}},
    },
    {
      id: "en",
      style: {fontSize: 34, position: "manual", manualPosition: {x: 0.5, y: 0.972}},
    },
  ]);
  assert.deepEqual(result.tracks[0].segments[0], {
    id: "caption-1-zh",
    pairId: "caption-1",
    start: 0.1,
    end: 2.5,
    text: "中文",
    words: [],
  });
  assert.deepEqual(result.tracks[1].segments[0], {
    id: "caption-1-en",
    pairId: "caption-1",
    start: 0.1,
    end: 2.5,
    text: "English",
    words: [],
  });
});

test("normalizes Chinese phrase separators without collapsing English words", () => {
  const result = buildCapBilingualTracks({
    bilingual: {
      schema: "laohu.bilingual-caption-track/1",
      segments: [
        {
          id: "caption-1",
          start: 0.1,
          end: 2.5,
          text: "人物的停顿 情绪和重音",
          en: "The character's pauses emotions and emphasis",
        },
      ],
    },
    durationSeconds: 3,
  });

  assert.equal(result.tracks[0].segments[0].text, "人物的停顿情绪和重音");
  assert.equal(
    result.tracks[1].segments[0].text,
    "The character's pauses emotions and emphasis",
  );
});

test("rejects captions extending past the edited timeline", () => {
  assert.throws(() => buildCapBilingualTracks({
    bilingual: {
      schema: "laohu.bilingual-caption-track/1",
      segments: [
        {id: "caption-1", start: 0, end: 3.1, text: "中文", en: "English"},
      ],
    },
    durationSeconds: 3,
  }), /edited timeline/i);
});
