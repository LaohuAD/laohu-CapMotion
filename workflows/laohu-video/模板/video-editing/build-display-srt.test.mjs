import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const scriptPath = fileURLToPath(new URL("./build-display-srt.mjs", import.meta.url));

const parseTime = (value) => {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
};

test("cleaned display text keeps the complete source cue time coverage", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "display-srt-test-"));
  const correctedPath = path.join(directory, "corrected.srt");
  const rawPath = path.join(directory, "raw.json");
  const overridesPath = path.join(directory, "overrides.json");
  const outputPath = path.join(directory, "display.srt");

  await writeFile(correctedPath, "1\n00:00:00,000 --> 00:00:04,000\n啊现在开始讲解啊\n", "utf8");
  await writeFile(rawPath, JSON.stringify({result: [{utterances: [{
    start_time: 0,
    end_time: 4000,
    text: "啊现在开始讲解啊",
    words: [
      {start_time: 0, end_time: 500, text: "啊"},
      {start_time: 500, end_time: 1000, text: "现"},
      {start_time: 1000, end_time: 1500, text: "在"},
      {start_time: 1500, end_time: 2000, text: "开"},
      {start_time: 2000, end_time: 2500, text: "始"},
      {start_time: 2500, end_time: 2750, text: "讲"},
      {start_time: 2750, end_time: 3000, text: "解"},
      {start_time: 3500, end_time: 4000, text: "啊"}
    ]
  }]}]}), "utf8");
  await writeFile(overridesPath, JSON.stringify({cues: {1: "现在开始讲解"}}), "utf8");

  execFileSync(process.execPath, [scriptPath, "--srt", correctedPath, "--raw", rawPath, "--overrides", overridesPath, "--output", outputPath]);
  const output = await readFile(outputPath, "utf8");
  const timing = output.split(/\r?\n/)[1].match(/^(\S+) --> (\S+)$/);

  assert.equal(parseTime(timing[1]), 0);
  assert.equal(parseTime(timing[2]), 4000);
});

test("an empty display override cannot silently remove a spoken source cue", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "display-srt-empty-test-"));
  const correctedPath = path.join(directory, "corrected.srt");
  const rawPath = path.join(directory, "raw.json");
  const overridesPath = path.join(directory, "overrides.json");
  const outputPath = path.join(directory, "display.srt");

  await writeFile(correctedPath, "1\n00:00:00,000 --> 00:00:02,000\n只会满足合格要求\n", "utf8");
  await writeFile(rawPath, JSON.stringify({result: [{utterances: [{
    start_time: 0,
    end_time: 2000,
    text: "只会满足合格要求",
    words: [
      {start_time: 0, end_time: 400, text: "只"},
      {start_time: 400, end_time: 800, text: "会"},
      {start_time: 800, end_time: 1200, text: "满足"},
      {start_time: 1200, end_time: 1600, text: "合格"},
      {start_time: 1600, end_time: 2000, text: "要求"}
    ]
  }]}]}), "utf8");
  await writeFile(overridesPath, JSON.stringify({cues: {1: ""}}), "utf8");

  execFileSync(process.execPath, [scriptPath, "--srt", correctedPath, "--raw", rawPath, "--overrides", overridesPath, "--output", outputPath]);
  const output = await readFile(outputPath, "utf8");

  assert.match(output, /只会满足合格要求/);
});
