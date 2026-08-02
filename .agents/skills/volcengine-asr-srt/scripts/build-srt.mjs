#!/usr/bin/env node

import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname} from "node:path";
import {buildSrt, getUtterances} from "./asr-common.mjs";

const [jsonPath, srtPath] = process.argv.slice(2);
if (!jsonPath || !srtPath) {
  console.error("Usage: build-srt.mjs <raw.json> <output.srt>");
  process.exit(2);
}

try {
  const payload = JSON.parse(await readFile(jsonPath, "utf8"));
  const srt = buildSrt(payload);
  await mkdir(dirname(srtPath), {recursive: true});
  await writeFile(srtPath, srt, "utf8");
  console.log(JSON.stringify({
    srt: srtPath,
    cueCount: getUtterances(payload).length,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({error: error.message}, null, 2));
  process.exit(1);
}
