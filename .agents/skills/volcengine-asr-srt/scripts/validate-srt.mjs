#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";

const [srtPath, mediaPath] = process.argv.slice(2);
if (!srtPath) {
  console.error("Usage: validate-srt.mjs <subtitle.srt> [media]");
  process.exit(2);
}

const parseTime = (value) => {
  const match = value.match(/^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, millis] = match.map(Number);
  if (minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
};

const raw = (await readFile(srtPath, "utf8")).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
const blocks = raw ? raw.split(/\n{2,}/) : [];
const cues = [];
const errors = [];
const warnings = [];

for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
  const lines = blocks[blockIndex].split("\n");
  const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
  if (timeLineIndex < 0) {
    errors.push(`Block ${blockIndex + 1}: missing timestamp line`);
    continue;
  }
  const [startText, endText] = lines[timeLineIndex].split("-->").map((value) => value.trim().split(/\s+/)[0]);
  const start = parseTime(startText);
  const end = parseTime(endText);
  const text = lines.slice(timeLineIndex + 1).join("\n").trim();
  if (start === null || end === null) errors.push(`Block ${blockIndex + 1}: invalid timestamp`);
  if (start !== null && end !== null && end <= start) errors.push(`Block ${blockIndex + 1}: non-positive duration`);
  if (!text) errors.push(`Block ${blockIndex + 1}: empty subtitle text`);
  if (start !== null && end !== null) cues.push({start, end, text});
}

for (let index = 1; index < cues.length; index += 1) {
  const previous = cues[index - 1];
  const current = cues[index];
  if (current.start < previous.start) errors.push(`Cue ${index + 1}: start time is earlier than the previous cue`);
  else if (current.start < previous.end) warnings.push(`Cue ${index + 1}: overlaps the previous cue by ${previous.end - current.start} ms`);
}

let mediaDurationMs = null;
if (mediaPath) {
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mediaPath], {encoding: "utf8"});
  if (probe.status !== 0) errors.push(`Unable to probe media: ${probe.stderr.trim() || "ffprobe failed"}`);
  else {
    mediaDurationMs = Math.round(Number(probe.stdout.trim()) * 1000);
    const finalEnd = cues.at(-1)?.end ?? 0;
    if (finalEnd > mediaDurationMs + 1000) errors.push(`Final cue exceeds media duration by ${finalEnd - mediaDurationMs} ms`);
  }
}

const report = {
  valid: errors.length === 0,
  file: srtPath,
  cueCount: cues.length,
  firstStartMs: cues[0]?.start ?? null,
  finalEndMs: cues.at(-1)?.end ?? null,
  mediaDurationMs,
  errors,
  warnings,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
