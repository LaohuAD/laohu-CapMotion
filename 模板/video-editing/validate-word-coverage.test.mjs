import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const script = fileURLToPath(new URL("./validate-word-coverage.mjs", import.meta.url));

test("fails when a timed spoken word has no display subtitle coverage", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "word-coverage-"));
  const raw = path.join(dir, "raw.json");
  const srt = path.join(dir, "display.srt");
  await writeFile(raw, JSON.stringify({result: {utterances: [{words: [
    {text: "你", start_time: 0, end_time: 100},
    {text: "好", start_time: 100, end_time: 200}
  ]}]}}));
  await writeFile(srt, "1\n00:00:00,000 --> 00:00:00,100\n你\n");
  assert.throws(() => execFileSync(process.execPath, [script, "--raw", raw, "--srt", srt]), /uncoveredWordCount/);
});

test("passes when every timed spoken word is covered", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "word-coverage-"));
  const raw = path.join(dir, "raw.json");
  const srt = path.join(dir, "display.srt");
  await writeFile(raw, JSON.stringify({result: {utterances: [{words: [
    {text: "你", start_time: 0, end_time: 100},
    {text: "好", start_time: 100, end_time: 200}
  ]}]}}));
  await writeFile(srt, "1\n00:00:00,000 --> 00:00:00,200\n你好\nHello\n");
  const result = JSON.parse(execFileSync(process.execPath, [script, "--raw", raw, "--srt", srt], {encoding: "utf8"}));
  assert.equal(result.uncoveredWordCount, 0);
  assert.equal(result.coveredWordCount, 2);
});
