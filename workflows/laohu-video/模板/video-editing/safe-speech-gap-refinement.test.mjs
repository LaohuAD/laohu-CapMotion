import assert from "node:assert/strict";
import test from "node:test";

import {
  findSafeSilenceCore,
  trimSilentSequenceEdges,
} from "./safe-speech-gap-refinement.mjs";

test("a retained word crossing the silence midpoint is always a no-cut interval", () => {
  const cut = findSafeSilenceCore({
    silence: {start: 10, end: 11.2},
    words: [
      {start: 9.8, end: 10.08, text: "上"},
      {start: 10.48, end: 10.72, text: "保留词"},
      {start: 11.06, end: 11.3, text: "下"},
    ],
  });

  assert.ok(cut);
  assert.equal(
    [
      {start: 9.8, end: 10.08},
      {start: 10.48, end: 10.72},
      {start: 11.06, end: 11.3},
    ].some((word) => cut.end > word.start && cut.start < word.end),
    false,
  );
});

test("the opening pause keeps the previous release and the next consonant preroll", () => {
  const cut = findSafeSilenceCore({
    silence: {start: 8.45, end: 9.64},
    words: [
      {start: 8.55, end: 8.77, text: "12"},
      {start: 9.49, end: 9.65, text: "做"},
    ],
  });

  assert.ok(cut);
  assert.ok(cut.start >= 8.8 - 1e-9);
  assert.ok(cut.end <= 9.35 + 1e-9);
  assert.ok(cut.end - cut.start >= 0.12);
});

test("speech segment edges lose acoustic blank space without touching word guards", () => {
  const trimmed = trimSilentSequenceEdges({
    sequence: {start: 20, end: 24},
    words: [
      {start: 20.9, end: 21.2, text: "大家"},
      {start: 22.5, end: 22.9, text: "测试"},
    ],
    silences: [
      {start: 20, end: 20.84},
      {start: 23, end: 24},
    ],
  });

  assert.ok(Math.abs(trimmed.start - 20.76) < 1e-9);
  assert.ok(Math.abs(trimmed.end - 23) < 1e-9);
  assert.ok(trimmed.start <= 20.9 - 0.14 + Number.EPSILON);
  assert.ok(trimmed.end >= 22.9 + 0.1 - Number.EPSILON);
});

test("tight waveform cuts remove short blank cores without touching retained words", () => {
  const words = [{start:0,end:.4},{start:.7,end:1}];
  const core = findSafeSilenceCore({silence:{start:.41,end:.69},words,
    silenceHeadGuardSeconds:.025,silenceTailGuardSeconds:.025,
    keepTailSeconds:.02,keepPrerollSeconds:.025,minCutSeconds:.08});
  assert.ok(core);
  assert.ok(core.start >= .4 && core.end <= .7);
  assert.ok(core.end-core.start > .2);
});
