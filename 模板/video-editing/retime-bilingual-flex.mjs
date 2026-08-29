#!/usr/bin/env node

import {readFile, writeFile} from "node:fs/promises";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index].replace(/^--/, ""), process.argv[index + 1]);
const oldPath = args.get("old-bilingual");
const newPath = args.get("new-chinese");
const translationsPath = args.get("translations");
const outputPath = args.get("output");
const missingPath = args.get("missing-output");
const threshold = Number(args.get("similarity-threshold") ?? 0.5);
if (!oldPath || !newPath || !translationsPath || !outputPath) throw new Error("Required: --old-bilingual --new-chinese --translations --output [--missing-output]");

const parseSrt = (source, bilingual) => source.trim().split(/\r?\n\s*\r?\n/).map((block) => {
  const lines = block.split(/\r?\n/);
  return {timing: lines[1], zh: lines[2].trim(), en: bilingual ? lines.slice(3).join(" ").trim() : ""};
});

const distance = (left, right) => {
  const previous = new Uint32Array(right.length + 1);
  for (let index = 0; index <= right.length; index++) previous[index] = index;
  for (let row = 1; row <= left.length; row++) {
    const current = new Uint32Array(right.length + 1);
    current[0] = row;
    for (let column = 1; column <= right.length; column++) current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    previous.set(current);
  }
  return previous[right.length];
};

const oldCues = parseSrt(await readFile(oldPath, "utf8"), true);
const newCues = parseSrt(await readFile(newPath, "utf8"), false);
const translationData = JSON.parse(await readFile(translationsPath, "utf8"));
const translations = new Map(Object.entries(translationData.cues ?? {}).map(([id, value]) => [Number(id), value]));
const gapCost = 0.75;
const costs = Array.from({length: oldCues.length + 1}, () => new Float64Array(newCues.length + 1));
const moves = Array.from({length: oldCues.length + 1}, () => new Uint8Array(newCues.length + 1));
for (let row = 1; row <= oldCues.length; row++) { costs[row][0] = row * gapCost; moves[row][0] = 1; }
for (let column = 1; column <= newCues.length; column++) { costs[0][column] = column * gapCost; moves[0][column] = 2; }
for (let row = 1; row <= oldCues.length; row++) {
  for (let column = 1; column <= newCues.length; column++) {
    const similarityCost = distance(oldCues[row - 1].zh, newCues[column - 1].zh) / Math.max(oldCues[row - 1].zh.length, newCues[column - 1].zh.length, 1);
    const pair = costs[row - 1][column - 1] + similarityCost;
    const oldOnly = costs[row - 1][column] + gapCost;
    const newOnly = costs[row][column - 1] + gapCost;
    if (pair <= oldOnly && pair <= newOnly) { costs[row][column] = pair; moves[row][column] = 0; }
    else if (oldOnly <= newOnly) { costs[row][column] = oldOnly; moves[row][column] = 1; }
    else { costs[row][column] = newOnly; moves[row][column] = 2; }
  }
}

const aligned = new Array(newCues.length).fill(null);
let row = oldCues.length;
let column = newCues.length;
let ignoredOldCueCount = 0;
while (row > 0 || column > 0) {
  const move = moves[row][column];
  if (row > 0 && column > 0 && move === 0) {
    const oldCue = oldCues[row - 1];
    const newCue = newCues[column - 1];
    const similarity = 1 - (distance(oldCue.zh, newCue.zh) / Math.max(oldCue.zh.length, newCue.zh.length, 1));
    if (similarity >= threshold) aligned[column - 1] = {en: oldCue.en, source: "reused", similarity};
    row -= 1;
    column -= 1;
  } else if (row > 0 && (column === 0 || move === 1)) {
    ignoredOldCueCount += 1;
    row -= 1;
  } else column -= 1;
}

const missing = [];
for (let index = 0; index < newCues.length; index++) {
  if (aligned[index]) continue;
  const translated = translations.get(index + 1);
  if (translated?.en) aligned[index] = {en: String(translated.en), source: "translated"};
  else missing.push({id: index + 1, zh: newCues[index].zh});
}
if (missingPath) await writeFile(missingPath, `${JSON.stringify({cues: missing}, null, 2)}\n`, "utf8");
if (missing.length) throw new Error(`Missing ${missing.length} translations${missingPath ? `; see ${missingPath}` : ""}`);

const output = newCues.map((cue, index) => `${index + 1}\n${cue.timing}\n${cue.zh}\n${aligned[index].en}`).join("\n\n") + "\n";
await writeFile(outputPath, output, "utf8");
console.log(JSON.stringify({oldCueCount: oldCues.length, newCueCount: newCues.length, reusedCueCount: aligned.filter((item) => item.source === "reused").length, translatedCueCount: aligned.filter((item) => item.source === "translated").length, ignoredOldCueCount}, null, 2));
