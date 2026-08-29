import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const scriptPath = fileURLToPath(new URL("./retime-bilingual-srt.mjs", import.meta.url));

test("retimes existing translations and inserts explicitly translated new cues", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "retime-bilingual-test-"));
  const oldPath = path.join(directory, "old.srt");
  const newPath = path.join(directory, "new.srt");
  const insertionsPath = path.join(directory, "insertions.json");
  const outputPath = path.join(directory, "output.srt");

  await writeFile(oldPath, "1\n00:00:00,000 --> 00:00:01,000\n看我只是按了一个按钮\nI only pressed one button\n\n2\n00:00:02,000 --> 00:00:03,000\n后面的内容\nThe following content\n", "utf8");
  await writeFile(newPath, "1\n00:00:00,000 --> 00:00:01,500\n看我只是干了一个按钮\n\n2\n00:00:01,500 --> 00:00:02,000\n新增内容\n\n3\n00:00:02,000 --> 00:00:04,000\n后面的内容\n", "utf8");
  await writeFile(insertionsPath, JSON.stringify({cues: {2: {zh: "新增内容", en: "New content"}}}), "utf8");

  execFileSync(process.execPath, [scriptPath, "--old-bilingual", oldPath, "--new-chinese", newPath, "--insertions", insertionsPath, "--output", outputPath]);
  const output = await readFile(outputPath, "utf8");

  assert.match(output, /00:00:00,000 --> 00:00:01,500\n看我只是按了一个按钮\nI only pressed one button/);
  assert.match(output, /00:00:01,500 --> 00:00:02,000\n新增内容\nNew content/);
  assert.match(output, /00:00:02,000 --> 00:00:04,000\n后面的内容\nThe following content/);
});
