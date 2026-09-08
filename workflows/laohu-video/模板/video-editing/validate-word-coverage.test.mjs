import assert from "node:assert/strict";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("./validate-word-coverage.mjs", import.meta.url));

test("explicit system-audio ranges are excluded while every microphone word remains mandatory", () => {
  const dir = mkdtempSync(join(tmpdir(), "caption-coverage-"));
  try {
    const raw = join(dir, "raw.json");
    const srt = join(dir, "captions.srt");
    const excluded = join(dir, "system.json");
    writeFileSync(raw, JSON.stringify({result: {utterances: [{words: [
      {text: "人物", start_time: 100, end_time: 500},
      {text: "系统", start_time: 1200, end_time: 1600},
    ]}]}}));
    writeFileSync(srt, "1\n00:00:00,000 --> 00:00:00,800\n人物讲话\n");
    writeFileSync(excluded, JSON.stringify({events: [{targetStart: 1, targetEnd: 2}]}));

    const passed = spawnSync(process.execPath, [cli, "--raw", raw, "--srt", srt, "--exclude-ranges", excluded], {encoding: "utf8"});
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(JSON.parse(passed.stdout).excludedWordCount, 1);

    const failed = spawnSync(process.execPath, [cli, "--raw", raw, "--srt", srt], {encoding: "utf8"});
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(failed.stderr).uncoveredWordCount, 1);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
