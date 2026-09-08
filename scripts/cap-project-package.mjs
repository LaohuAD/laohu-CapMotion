#!/usr/bin/env node

import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {normalizeDisplayCaptionText} from "./caption-display-track.mjs";

const EPSILON = 1e-6;

const finite = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
};

const nearlyEqual = (left, right) => Math.abs(left - right) <= EPSILON;

const sourceWindows = (timelineSegments) => {
  if (!Array.isArray(timelineSegments) || timelineSegments.length === 0) {
    throw new Error("Cap project must contain source timeline segments");
  }
  let globalCursor = 0;
  return timelineSegments.map((segment, index) => {
    const sourceStart = finite(segment.start, `timeline segment ${index} start`);
    const sourceEnd = finite(segment.end, `timeline segment ${index} end`);
    const timescale = finite(segment.timescale ?? 1, `timeline segment ${index} timescale`);
    if (!(sourceEnd > sourceStart) || !(timescale > 0)) {
      throw new Error(`invalid Cap source timeline segment ${index}`);
    }
    const duration = (sourceEnd - sourceStart) / timescale;
    const window = {
      recordingSegment: segment.recordingSegment,
      sourceStart,
      sourceEnd,
      timescale,
      globalStart: globalCursor,
      globalEnd: globalCursor + duration,
    };
    globalCursor += duration;
    return window;
  });
};

export const buildCapEdlFromFrameEdl = ({
  frameEdl,
  timelineSegments,
  sourceProjectRevision,
}) => {
  if (frameEdl?.schema !== "laohu.frame-edl/1") throw new Error("unsupported frame EDL schema");
  if (!Array.isArray(frameEdl.sequence) || frameEdl.sequence.length === 0) {
    throw new Error("frame EDL sequence is empty");
  }
  const windows = sourceWindows(timelineSegments);
  const totalSourceDuration = windows.at(-1).globalEnd;
  const sequence = [];
  let inputTargetCursor = 0;
  let outputTargetCursor = 0;

  for (const [rangeIndex, range] of frameEdl.sequence.entries()) {
    const globalStart = finite(range.sourceStart, `frame EDL range ${rangeIndex} sourceStart`);
    const globalEnd = finite(range.sourceEnd, `frame EDL range ${rangeIndex} sourceEnd`);
    const targetStart = finite(range.targetStart, `frame EDL range ${rangeIndex} targetStart`);
    const targetEnd = finite(range.targetEnd, `frame EDL range ${rangeIndex} targetEnd`);
    if (!nearlyEqual(targetStart, inputTargetCursor)) throw new Error("frame EDL target timeline must be contiguous");
    if (!(globalEnd > globalStart) || globalStart < -EPSILON || globalEnd > totalSourceDuration + EPSILON) {
      throw new Error(`frame EDL range ${rangeIndex} is outside the Cap source timeline`);
    }
    if (!nearlyEqual(globalEnd - globalStart, targetEnd - targetStart)) {
      throw new Error(`frame EDL range ${rangeIndex} source and target durations differ`);
    }

    const pieces = windows.filter((window) =>
      globalEnd > window.globalStart + EPSILON && globalStart < window.globalEnd - EPSILON,
    );
    if (pieces.length === 0) throw new Error(`frame EDL range ${rangeIndex} did not resolve to source media`);
    for (const window of pieces) {
      const pieceGlobalStart = Math.max(globalStart, window.globalStart);
      const pieceGlobalEnd = Math.min(globalEnd, window.globalEnd);
      const duration = pieceGlobalEnd - pieceGlobalStart;
      const localStart = window.sourceStart + (pieceGlobalStart - window.globalStart) * window.timescale;
      const localEnd = localStart + duration * window.timescale;
      sequence.push({
        index: sequence.length + 1,
        recordingSegment: window.recordingSegment,
        sourceStart: localStart,
        sourceEnd: localEnd,
        sourceGlobalStart: pieceGlobalStart,
        sourceGlobalEnd: pieceGlobalEnd,
        targetStart: outputTargetCursor,
        targetEnd: outputTargetCursor + duration,
      });
      outputTargetCursor += duration;
    }
    inputTargetCursor = targetEnd;
  }
  if (!nearlyEqual(outputTargetCursor, inputTargetCursor)) {
    throw new Error("converted Cap EDL duration drifted from the approved frame EDL");
  }

  return {
    schema: "laohu.cap-edl/1",
    sourceProjectRevision: finite(sourceProjectRevision, "sourceProjectRevision"),
    sourceFrameEdlSchema: frameEdl.schema,
    durationSeconds: outputTargetCursor,
    sequence,
  };
};

export const buildCapBilingualTracks = ({bilingual, durationSeconds}) => {
  if (bilingual?.schema !== "laohu.bilingual-caption-track/1") {
    throw new Error("unsupported bilingual caption schema");
  }
  if (!Array.isArray(bilingual.segments) || bilingual.segments.length === 0) {
    throw new Error("bilingual caption sequence is empty");
  }
  const duration = finite(durationSeconds, "durationSeconds");
  let previousEnd = 0;
  const normalized = bilingual.segments.map((segment, index) => {
    const start = finite(segment.targetStart ?? segment.start, `caption ${index} start`);
    const end = finite(segment.targetEnd ?? segment.end, `caption ${index} end`);
    const id = String(segment.id ?? `caption-${index + 1}`).trim();
    const text = String(segment.text ?? "").trim();
    const en = String(segment.en ?? "").trim();
    if (!id || !text || !en || !(end > start) || start < -EPSILON) {
      throw new Error(`invalid bilingual caption ${index}`);
    }
    if (start < previousEnd - EPSILON) throw new Error(`bilingual caption ${index} overlaps the previous caption`);
    if (end > duration + EPSILON) throw new Error(`bilingual caption ${index} extends past the edited timeline`);
    previousEnd = end;
    return {id, start, end, text, en};
  });

  const makeSegments = (language) => normalized.map((segment) => ({
    id: `${segment.id}-${language === "zh-CN" ? "zh" : "en"}`,
    pairId: segment.id,
    start: segment.start,
    end: segment.end,
    text: normalizeDisplayCaptionText(
      language === "zh-CN" ? segment.text : segment.en,
      language,
    ),
    words: [],
  }));

  return {
    schema: "laohu.cap-caption-tracks/1",
    tracks: [
      {
        id: "zh-CN",
        label: "中文字幕",
        language: "zh-CN",
        style: {fontSize: 64, position: "manual", manualPosition: {x: 0.5, y: 0.92}},
        segments: makeSegments("zh-CN"),
      },
      {
        id: "en",
        label: "English Captions",
        language: "en",
        style: {fontSize: 34, position: "manual", manualPosition: {x: 0.5, y: 0.972}},
        segments: makeSegments("en"),
      },
    ],
  };
};

const parseArgs = (argv) => {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument near ${key ?? "<end>"}`);
    args.set(key.slice(2), value);
  }
  return args;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const required = ["project-config", "frame-edl", "bilingual", "edl-output", "tracks-output"];
    for (const name of required) if (!args.has(name)) throw new Error(`missing --${name}`);
    const [projectConfig, frameEdl, bilingual] = await Promise.all([
      readFile(resolve(args.get("project-config")), "utf8").then(JSON.parse),
      readFile(resolve(args.get("frame-edl")), "utf8").then(JSON.parse),
      readFile(resolve(args.get("bilingual")), "utf8").then(JSON.parse),
    ]);
    const capEdl = buildCapEdlFromFrameEdl({
      frameEdl,
      timelineSegments: projectConfig.timeline?.segments,
      sourceProjectRevision: args.has("source-project-revision")
        ? args.get("source-project-revision")
        : projectConfig.projectRevision,
    });
    const tracks = buildCapBilingualTracks({bilingual, durationSeconds: capEdl.durationSeconds});
    await Promise.all([
      writeFile(resolve(args.get("edl-output")), `${JSON.stringify(capEdl, null, 2)}\n`),
      writeFile(resolve(args.get("tracks-output")), `${JSON.stringify(tracks, null, 2)}\n`),
    ]);
    console.log(JSON.stringify({
      ok: true,
      sourceProjectRevision: capEdl.sourceProjectRevision,
      durationSeconds: capEdl.durationSeconds,
      editSegmentCount: capEdl.sequence.length,
      captionTrackCount: tracks.tracks.length,
      captionPairCount: tracks.tracks[0].segments.length,
      edlOutput: resolve(args.get("edl-output")),
      tracksOutput: resolve(args.get("tracks-output")),
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
