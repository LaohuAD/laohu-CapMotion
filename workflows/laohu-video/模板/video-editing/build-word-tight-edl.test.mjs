import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const scriptPath = fileURLToPath(new URL("./build-word-tight-edl.mjs", import.meta.url));

test("splits selected speech at long word gaps while preserving explicit visual ranges", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "word-tight-edl-test-"));
  const selectionPath = path.join(directory, "selection.json");
  const rawPath = path.join(directory, "raw.json");
  const outputPath = path.join(directory, "edl.json");
  await writeFile(selectionPath, JSON.stringify({
    source: "/tmp/source.mp4",
    fps: 30,
    sampleRate: 48000,
    maxGapMs: 150,
    handleMs: 50,
    ranges: [{startMs: 0, endMs: 1800, chapter: "speech"}],
    protectedRanges: [{startMs: 2000, endMs: 3000, chapter: "visual"}]
  }), "utf8");
  await writeFile(rawPath, JSON.stringify({result: [{utterances: [{words: [
    {start_time: 100, end_time: 500, text: "第一段"},
    {start_time: 1000, end_time: 1400, text: "第二段"}
  ]}]}]}), "utf8");

  execFileSync(process.execPath, [scriptPath, "--selection", selectionPath, "--raw", rawPath, "--output", outputPath]);
  const output = JSON.parse(await readFile(outputPath, "utf8"));

  assert.deepEqual(output.sequence.map(({startFrame, endFrame, chapter, protectedVisual}) => ({startFrame, endFrame, chapter, protectedVisual})), [
    {startFrame: 1, endFrame: 17, chapter: "speech", protectedVisual: false},
    {startFrame: 28, endFrame: 44, chapter: "speech", protectedVisual: false},
    {startFrame: 60, endFrame: 90, chapter: "visual", protectedVisual: true}
  ]);
});
