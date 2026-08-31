import assert from "node:assert/strict";
import {mkdtemp, mkdir, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {
  buildCapAsrSourceIndex,
  mergeSegmentTranscripts,
} from "./cap-project-asr.mjs";

const makeProject = async () => {
  const root = await mkdtemp(join(tmpdir(), "cap-project-asr-test-"));
  const project = join(root, "first-pass.cap");
  await mkdir(join(project, "content", "segments", "later-name"), {recursive: true});
  await mkdir(join(project, "content", "segments", "earlier-name"), {recursive: true});
  await writeFile(join(project, "content", "segments", "later-name", "mic.ogg"), "segment-zero");
  await writeFile(join(project, "content", "segments", "earlier-name", "mic.ogg"), "segment-one");
  await writeFile(join(project, "content", "segments", "later-name", "display.mp4"), "display-zero");
  await writeFile(join(project, "content", "segments", "earlier-name", "display.mp4"), "display-one");
  await writeFile(join(project, "recording-meta.json"), JSON.stringify({
    pretty_name: "First pass",
    segments: [
      {
        display: {path: "content/segments/later-name/display.mp4", fps: 30, start_time: 100.2},
        mic: {path: "content/segments/later-name/mic.ogg", start_time: 100.0},
      },
      {
        display: {path: "content/segments/earlier-name/display.mp4", fps: 30, start_time: 200.0},
        mic: {path: "content/segments/earlier-name/mic.ogg", start_time: 200.1},
      },
    ],
    cursors: {},
    status: {status: "Complete"},
  }, null, 2));
  await writeFile(join(project, "project-config.json"), JSON.stringify({
    projectRevision: 7,
    timeline: {
      segments: [
        {recordingSegment: 1, start: 1, end: 3, timescale: 1},
        {recordingSegment: 0, start: 0, end: 2, timescale: 1},
      ],
      zoomSegments: [],
    },
  }, null, 2));
  return project;
};

test("builds the first-pass microphone index in recording order, not filename or edited order", async () => {
  const project = await makeProject();
  const durations = new Map([
    [join(project, "content", "segments", "later-name", "display.mp4"), 5],
    [join(project, "content", "segments", "later-name", "mic.ogg"), 4.8],
    [join(project, "content", "segments", "earlier-name", "display.mp4"), 6],
    [join(project, "content", "segments", "earlier-name", "mic.ogg"), 5.9],
  ]);

  const index = await buildCapAsrSourceIndex(project, {
    probeDuration: async (path) => durations.get(path),
  });

  assert.equal(index.schema, "laohu.cap-asr-source-index/1");
  assert.equal(index.projectRevision, 7);
  assert.equal(index.orderPolicy, "recording-meta-segments");
  assert.deepEqual(index.segments.map((segment) => segment.recordingSegment), [0, 1]);
  assert.match(index.segments[0].microphonePath, /later-name\/mic\.ogg$/);
  assert.match(index.segments[1].microphonePath, /earlier-name\/mic\.ogg$/);
  assert.deepEqual(index.timeline.map((segment) => segment.recordingSegment), [1, 0]);
  assert.equal(index.segments[0].sourceTimelineOffsetSeconds, 0.2);
  assert.equal(index.segments[1].sourceTimelineOffsetSeconds, 0);
  assert.deepEqual(index.segments.map((segment) => segment.globalOffsetSeconds), [0, 5]);
});

test("merges per-segment ASR with display-based offsets and preserves source timestamps", () => {
  const sourceIndex = {
    projectPath: "/tmp/first-pass.cap",
    projectRevision: 7,
    segments: [
      {recordingSegment: 0, globalOffsetSeconds: 0, sourceTimelineOffsetSeconds: 0.2},
      {recordingSegment: 1, globalOffsetSeconds: 5, sourceTimelineOffsetSeconds: 0},
    ],
  };
  const segmentResults = [
    {
      rawJson: "/tmp/segments/000.raw.json",
      payload: {result: {utterances: [{start_time: 100, end_time: 900, text: "第一段"}]}},
    },
    {
      rawJson: "/tmp/segments/001.raw.json",
      payload: {result: {utterances: [{start_time: 250, end_time: 1250, text: "第二段"}]}},
    },
  ];

  const merged = mergeSegmentTranscripts(sourceIndex, segmentResults);

  assert.equal(merged.raw.schema, "laohu.cap-asr-transcript/1");
  assert.deepEqual(merged.raw.utterances.map((item) => item.sourceStartMs), [100, 250]);
  assert.deepEqual(merged.raw.utterances.map((item) => item.globalStartMs), [300, 5250]);
  assert.match(merged.srt, /00:00:00,300 --> 00:00:01,100/);
  assert.match(merged.srt, /00:00:05,250 --> 00:00:06,250/);
  assert.equal(merged.text, "第一段\n第二段\n");
  assert.equal(merged.captionImport.sourceTimed, true);
  assert.deepEqual(merged.captionImport.segments.map((segment) => ({
    start: segment.start,
    end: segment.end,
    text: segment.text,
  })), [
    {start: 0.3, end: 1.1, text: "第一段"},
    {start: 5.25, end: 6.25, text: "第二段"},
  ]);
});
