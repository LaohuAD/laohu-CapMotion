#!/usr/bin/env node

import {readFile} from "node:fs/promises";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "<end>"}`);
  args.set(key.slice(2), value);
}

const rawPath = args.get("raw");
const srtPath = args.get("srt");
const excludeRangesPath = args.get("exclude-ranges");
if (!rawPath || !srtPath) throw new Error("Required: --raw PATH --srt PATH");

const parseTime = (value) => {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) throw new Error(`Invalid SRT time: ${value}`);
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
};

const cues = (await readFile(srtPath, "utf8")).trim().split(/\r?\n\s*\r?\n/).map((block) => {
  const lines = block.split(/\r?\n/);
  const timing = lines[1]?.match(/^(\S+)\s+-->\s+(\S+)$/);
  if (!timing) throw new Error(`Invalid SRT block: ${block.slice(0, 80)}`);
  return {startMs: parseTime(timing[1]), endMs: parseTime(timing[2])};
});

const raw = JSON.parse(await readFile(rawPath, "utf8"));
const result = Array.isArray(raw.result) ? raw.result[0] : raw.result;
const allWords = (result?.utterances ?? []).flatMap((utterance) => utterance.words ?? []).filter((word) =>
  String(word.text ?? "").trim() && Number.isFinite(Number(word.start_time)) && Number(word.end_time) > Number(word.start_time)
);
const exclusionDocument = excludeRangesPath ? JSON.parse(await readFile(excludeRangesPath, "utf8")) : null;
const exclusions = (exclusionDocument?.events ?? exclusionDocument?.ranges ?? []).map((range) => ({
  startMs: Number(range.targetStart ?? range.start ?? range[0]) * 1000,
  endMs: Number(range.targetEnd ?? range.end ?? range[1]) * 1000,
})).filter((range) => Number.isFinite(range.startMs) && range.endMs > range.startMs);
const isExcluded = (word) => exclusions.some((range) =>
  Number(word.end_time) > range.startMs && Number(word.start_time) < range.endMs
);
const excludedWords = allWords.filter(isExcluded);
const words = allWords.filter((word) => !isExcluded(word));

const uncovered = words.filter((word) => !cues.some((cue) => Number(word.end_time) > cue.startMs && Number(word.start_time) < cue.endMs));
const report = {
  raw: rawPath,
  srt: srtPath,
  excludeRanges: excludeRangesPath ?? null,
  timedWordCount: allWords.length,
  excludedWordCount: excludedWords.length,
  requiredWordCount: words.length,
  coveredWordCount: words.length - uncovered.length,
  uncoveredWordCount: uncovered.length,
  uncovered: uncovered.slice(0, 20).map((word) => ({text: word.text, startMs: Number(word.start_time), endMs: Number(word.end_time)})),
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (uncovered.length > 0) {
  process.stderr.write(output);
  process.exit(1);
}
process.stdout.write(output);
