#!/usr/bin/env node

import {readFile, writeFile} from "node:fs/promises";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "<end>"}`);
  args.set(key.slice(2), value);
}
const selectionPath = args.get("selection");
const rawPath = args.get("raw");
const outputPath = args.get("output");
if (!selectionPath || !rawPath || !outputPath) throw new Error("Required: --selection PATH --raw PATH --output PATH");

const selection = JSON.parse(await readFile(selectionPath, "utf8"));
const raw = JSON.parse(await readFile(rawPath, "utf8"));
const result = Array.isArray(raw.result) ? raw.result[0] : raw.result;
const words = (result?.utterances ?? []).flatMap((utterance) => utterance.words ?? []).map((word) => ({
  startMs: Number(word.start_time),
  endMs: Number(word.end_time),
  text: String(word.text ?? "").trim(),
})).filter((word) => Number.isFinite(word.startMs) && word.endMs > word.startMs && word.text);
if (words.length === 0) throw new Error("Raw ASR JSON contains no timed words");

const fps = Number(selection.fps ?? 30);
const sampleRate = Number(selection.sampleRate ?? 48000);
const maxGapMs = Number(selection.maxGapMs ?? 150);
const handleMs = Number(selection.handleMs ?? 50);
if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("Invalid frame or sample rate");
const samplesPerFrame = sampleRate / fps;
if (!Number.isInteger(samplesPerFrame)) throw new Error("Sample rate must divide evenly by fps");

const toStartFrame = (milliseconds) => Math.max(0, Math.floor(milliseconds * fps / 1000));
const toEndFrame = (milliseconds) => Math.max(1, Math.ceil(milliseconds * fps / 1000));
const sequence = [];
for (const range of selection.ranges ?? []) {
  const selectedWords = words.filter((word) => word.endMs > range.startMs && word.startMs < range.endMs);
  if (selectedWords.length === 0) throw new Error(`No timed words in selected range ${range.startMs}-${range.endMs}`);
  const clusters = [];
  for (const word of selectedWords) {
    const previous = clusters.at(-1);
    if (previous && word.startMs - previous.endMs <= maxGapMs) {
      previous.endMs = Math.max(previous.endMs, word.endMs);
      previous.text += word.text;
    } else clusters.push({startMs: word.startMs, endMs: word.endMs, text: word.text});
  }
  for (const cluster of clusters) {
    sequence.push({
      chapter: range.chapter ?? "speech",
      reason: range.reason ?? "保留词级讲话并压缩内部气口",
      protectedVisual: false,
      startFrame: toStartFrame(Math.max(range.startMs, cluster.startMs - handleMs)),
      endFrame: toEndFrame(Math.min(range.endMs, cluster.endMs + handleMs)),
      sourceText: cluster.text,
    });
  }
}
for (const range of selection.protectedRanges ?? []) {
  sequence.push({
    chapter: range.chapter ?? "visual",
    reason: range.reason ?? "明确保护的无讲话画面",
    protectedVisual: true,
    startFrame: toStartFrame(range.startMs),
    endFrame: toEndFrame(range.endMs),
    sourceText: "",
  });
}
sequence.sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame);

const resolved = [];
for (const range of sequence) {
  if (range.endFrame <= range.startFrame) throw new Error(`Invalid frame range ${JSON.stringify(range)}`);
  const previous = resolved.at(-1);
  if (previous && range.startFrame <= previous.endFrame && previous.chapter === range.chapter && previous.protectedVisual === range.protectedVisual) {
    previous.endFrame = Math.max(previous.endFrame, range.endFrame);
    previous.sourceText += range.sourceText;
  } else {
    if (previous && range.startFrame < previous.endFrame) throw new Error(`Overlapping ranges ${JSON.stringify(previous)} ${JSON.stringify(range)}`);
    resolved.push({...range});
  }
}

let targetFrame = 0;
for (const [index, range] of resolved.entries()) {
  range.index = index + 1;
  range.sourceStart = range.startFrame / fps;
  range.sourceEnd = range.endFrame / fps;
  range.targetStartFrame = targetFrame;
  targetFrame += range.endFrame - range.startFrame;
  range.targetEndFrame = targetFrame;
  range.targetStart = range.targetStartFrame / fps;
  range.targetEnd = range.targetEndFrame / fps;
}

const output = {
  source: selection.source,
  output: selection.output,
  rawJson: rawPath,
  fps,
  sampleRate,
  samplesPerFrame,
  maxGapMs,
  handleMs,
  expectedFrames: targetFrame,
  expectedDurationSeconds: targetFrame / fps,
  sequence: resolved,
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({rangeCount: resolved.length, expectedFrames: targetFrame, expectedDurationSeconds: targetFrame / fps}, null, 2));
