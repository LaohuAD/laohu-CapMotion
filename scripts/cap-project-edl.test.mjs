import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {
  applyEdlToProjectConfig,
  applyEdlTransaction,
  applyCaptionTrackTransaction,
} from "./cap-project-edl.mjs";

const baseConfig = () => ({
  projectRevision: 7,
  timeline: {
    segments: [
      {recordingSegment: 0, timescale: 1, start: 0, end: 10, name: null},
      {recordingSegment: 1, timescale: 1, start: 0, end: 5, name: null},
    ],
    zoomSegments: [
      {start: 2, end: 8, amount: 2, mode: {manual: {x: 0.5, y: 0.5}}},
    ],
    keyboardSegments: [
      {id: "kb-1", start: 4.5, end: 5.5, displayText: "A", keys: []},
      {id: "kb-2", start: 11, end: 12, displayText: "B", keys: []},
    ],
    sceneSegments: [],
    maskSegments: [],
    textSegments: [],
    captionSegments: [],
    audioSegments: [],
    camera3dSegments: [],
  },
});

const edl = {
  schema: "laohu.cap-edl/1",
  sourceProjectRevision: 7,
  sequence: [
    {recordingSegment: 0, sourceStart: 0, sourceEnd: 5, targetStart: 0, targetEnd: 5},
    {recordingSegment: 0, sourceStart: 7, sourceEnd: 10, targetStart: 5, targetEnd: 8},
    {recordingSegment: 1, sourceStart: 1, sourceEnd: 5, targetStart: 8, targetEnd: 12},
  ],
};

test("applies source ranges as an editable Cap timeline", () => {
  const next = applyEdlToProjectConfig(baseConfig(), edl);

  assert.deepEqual(next.timeline.segments, [
    {recordingSegment: 0, timescale: 1, start: 0, end: 5, name: null},
    {recordingSegment: 0, timescale: 1, start: 7, end: 10, name: null},
    {recordingSegment: 1, timescale: 1, start: 1, end: 5, name: null},
  ]);
});

test("remaps and clips source-timed editor tracks instead of leaving stale times", () => {
  const next = applyEdlToProjectConfig(baseConfig(), edl);

  assert.deepEqual(next.timeline.zoomSegments.map(({start, end}) => [start, end]), [
    [2, 5],
    [5, 6],
  ]);
  assert.deepEqual(next.timeline.keyboardSegments.map(({id, start, end}) => [id, start, end]), [
    ["kb-1", 4.5, 5],
    ["kb-2", 8, 9],
  ]);
});

test("rejects a non-contiguous target timeline", () => {
  const broken = structuredClone(edl);
  broken.sequence[1].targetStart = 6;
  assert.throws(
    () => applyEdlToProjectConfig(baseConfig(), broken),
    /target timeline must be contiguous/i,
  );
});

test("transaction checks revision, increments once, and writes an audit receipt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cap-edl-test-"));
  const projectPath = join(directory, "test.cap");
  const configPath = join(projectPath, "project-config.json");
  const edlPath = join(directory, "edit.json");
  const receiptPath = join(directory, "receipt.json");
  await import("node:fs/promises").then(({mkdir}) => mkdir(projectPath));
  await writeFile(configPath, `${JSON.stringify(baseConfig(), null, 2)}\n`);
  await writeFile(join(projectPath, ".project-config.lock"), "");
  await writeFile(edlPath, `${JSON.stringify(edl, null, 2)}\n`);

  try {
    const receipt = await applyEdlTransaction({
      projectPath,
      edlPath,
      expectedRevision: 7,
      receiptPath,
    });
    const written = JSON.parse(await readFile(configPath, "utf8"));
    const writtenReceipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(written.projectRevision, 8);
    assert.equal(receipt.previousRevision, 7);
    assert.equal(receipt.newRevision, 8);
    assert.equal(writtenReceipt.newRevision, 8);
    await assert.rejects(
      applyEdlTransaction({projectPath, edlPath, expectedRevision: 7}),
      /revision mismatch/i,
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test("caption-track transaction materializes final-time captions without replacing the source master", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cap-caption-track-test-"));
  const projectPath = join(directory, "test.cap");
  const configPath = join(projectPath, "project-config.json");
  const trackPath = join(directory, "track.json");
  await import("node:fs/promises").then(({mkdir}) => mkdir(projectPath));
  const config = baseConfig();
  config.captions = {sourceTimed: true, segments: [{id: "source-1", start: 2, end: 3, text: "源字幕"}]};
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(join(projectPath, ".project-config.lock"), "");
  await writeFile(trackPath, `${JSON.stringify({segments: [{id: "source-1", start: 1, end: 2, text: "成片字幕"}]}, null, 2)}\n`);

  try {
    const receipt = await applyCaptionTrackTransaction({projectPath, trackPath, expectedRevision: 7});
    const written = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(receipt.newRevision, 8);
    assert.equal(written.captions.segments[0].text, "源字幕");
    assert.deepEqual(written.timeline.captionSegments, [{
      id: "source-1",
      start: 1,
      end: 2,
      text: "成片字幕",
      words: [],
      fadeDurationOverride: null,
      lingerDurationOverride: null,
      positionOverride: null,
      colorOverride: null,
      backgroundColorOverride: null,
      fontSizeOverride: null,
    }]);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test("caption-track transaction materializes linked Chinese and English as two editable tracks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cap-bilingual-caption-tracks-test-"));
  const projectPath = join(directory, "test.cap");
  const configPath = join(projectPath, "project-config.json");
  const trackPath = join(directory, "tracks.json");
  await import("node:fs/promises").then(({mkdir}) => mkdir(projectPath));
  const config = baseConfig();
  config.captions = {sourceTimed: true, segments: [{id: "source-1", start: 2, end: 3, text: "源字幕"}]};
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(join(projectPath, ".project-config.lock"), "");
  await writeFile(trackPath, `${JSON.stringify({
    schema: "laohu.cap-caption-tracks/1",
    tracks: [
      {
        id: "zh-CN",
        label: "中文字幕",
        language: "zh-CN",
        style: {fontSize: 64, position: "manual", manualPosition: {x: 0.5, y: 0.865}},
        segments: [{id: "caption-1", pairId: "caption-1", start: 1, end: 2, text: "成片字幕"}],
      },
      {
        id: "en",
        label: "English Captions",
        language: "en",
        style: {fontSize: 34, position: "manual", manualPosition: {x: 0.5, y: 0.93}},
        segments: [{id: "caption-1-en", pairId: "caption-1", start: 1, end: 2, text: "Final caption"}],
      },
    ],
  }, null, 2)}\n`);

  try {
    const receipt = await applyCaptionTrackTransaction({projectPath, trackPath, expectedRevision: 7});
    const written = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(receipt.captionTrackCount, 2);
    assert.equal(receipt.captionSegmentCount, 2);
    assert.equal(written.captions.segments[0].text, "源字幕");
    assert.equal(written.captions.displayMode, "materialized");
    assert.deepEqual(written.timeline.captionSegments.map((segment) => ({
      id: segment.id,
      trackId: segment.trackId,
      pairId: segment.pairId,
      fontSizeOverride: segment.fontSizeOverride,
      manualPositionOverride: segment.manualPositionOverride,
    })), [
      {
        id: "caption-1",
        trackId: "zh-CN",
        pairId: "caption-1",
        fontSizeOverride: 64,
        manualPositionOverride: {x: 0.5, y: 0.865},
      },
      {
        id: "caption-1-en",
        trackId: "en",
        pairId: "caption-1",
        fontSizeOverride: 34,
        manualPositionOverride: {x: 0.5, y: 0.93},
      },
    ]);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test("refit uses original source windows and tracks while retaining current presentation", () => {
 const original = baseConfig();
 const current = applyEdlToProjectConfig(original, edl);
 current.captions = {settings:{fontWeight:500,trackPositions:[{trackId:"en",position:"manual"}]}};
 const again = applyEdlToProjectConfig(current, {...edl, sourceTimeline: original.timeline});
 assert.deepEqual(again.timeline, applyEdlToProjectConfig(original, edl).timeline);
 assert.deepEqual(again.captions, current.captions);
});
