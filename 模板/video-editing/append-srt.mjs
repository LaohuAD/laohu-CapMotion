#!/usr/bin/env node

import {readFile, writeFile} from "node:fs/promises";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "<end>"}`);
  args.set(key.slice(2), value);
}

const basePath = args.get("base");
const appendPath = args.get("append");
const outputPath = args.get("output");
const offsetMs = Number(args.get("offset-ms"));
if (!basePath || !appendPath || !outputPath || !Number.isFinite(offsetMs) || offsetMs < 0) {
  throw new Error("Required: --base PATH --append PATH --offset-ms NUMBER --output PATH");
}

const parseTime = (value) => {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) throw new Error(`Invalid SRT time: ${value}`);
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
};

const formatTime = (milliseconds) => {
  const value = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1000);
  const millis = value % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const parseSrt = (source) => source.trim().split(/\r?\n\s*\r?\n/).map((block) => {
  const lines = block.split(/\r?\n/);
  const timing = lines[1]?.match(/^(\S+)\s+-->\s+(\S+)$/);
  if (!timing || lines.length < 3) throw new Error(`Invalid SRT block: ${block.slice(0, 80)}`);
  return {startMs: parseTime(timing[1]), endMs: parseTime(timing[2]), lines: lines.slice(2)};
});

const base = parseSrt(await readFile(basePath, "utf8"));
const appended = parseSrt(await readFile(appendPath, "utf8")).map((cue) => ({
  ...cue,
  startMs: cue.startMs + offsetMs,
  endMs: cue.endMs + offsetMs,
}));
const cues = [...base, ...appended];
for (let index = 0; index < cues.length; index++) {
  const cue = cues[index];
  const previous = cues[index - 1];
  if (cue.endMs <= cue.startMs || (previous && cue.startMs < previous.endMs)) throw new Error(`Overlapping or invalid cue ${index + 1}`);
}

const output = cues.map((cue, index) => [
  String(index + 1),
  `${formatTime(cue.startMs)} --> ${formatTime(cue.endMs)}`,
  ...cue.lines,
].join("\n")).join("\n\n");
await writeFile(outputPath, `${output}\n`, "utf8");
console.log(JSON.stringify({baseCueCount: base.length, appendCueCount: appended.length, outputCueCount: cues.length, offsetMs}, null, 2));
