#!/usr/bin/env node

import {mkdir, writeFile} from "node:fs/promises";
import {dirname} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  buildSrt,
  createHeaders,
  createTaskId,
  getUtterances,
  loadConfig,
  parseArgs,
  postJson,
  sleep,
} from "./asr-common.mjs";

const options = parseArgs(process.argv.slice(2));
if (!options.url || !options.json || !options.srt) {
  console.error("Usage: transcribe-url.mjs --url <https-url> --json <raw.json> --srt <output.srt> [--format mp3] [--media source.mp4] [--speaker]");
  process.exit(2);
}

const pollSeconds = Math.max(1, Number(options.poll ?? 2));
const timeoutSeconds = Math.max(30, Number(options.timeout ?? 1800));
const format = String(options.format ?? "mp3").toLowerCase();
if (!new Set(["raw", "wav", "mp3", "ogg"]).has(format)) {
  console.error(`Unsupported ASR audio format: ${format}`);
  process.exit(2);
}

try {
  const config = await loadConfig();
  const taskId = createTaskId();
  const request = {
    user: {uid: "laohu-asr"},
    audio: {
      url: options.url,
      format,
      language: options.language ?? "zh-CN",
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      enable_ddc: false,
      show_utterances: true,
      ...(options.speaker ? {enable_speaker_info: true} : {}),
    },
  };

  const submitted = await postJson(config.submitUrl, createHeaders(config, taskId, {submit: true}), request);
  if (submitted.statusCode !== "20000000") {
    throw new Error(`Submit failed: ${submitted.statusCode || submitted.httpStatus} ${submitted.message}`.trim());
  }

  const deadline = Date.now() + timeoutSeconds * 1000;
  let completed = null;
  while (Date.now() < deadline) {
    await sleep(pollSeconds * 1000);
    const queried = await postJson(config.queryUrl, createHeaders(config, taskId), {});
    if (queried.statusCode === "20000000") {
      completed = queried;
      break;
    }
    if (!new Set(["20000001", "20000002"]).has(queried.statusCode)) {
      throw new Error(`Query failed: ${queried.statusCode || queried.httpStatus} ${queried.message}`.trim());
    }
  }

  if (!completed) throw new Error(`ASR task timed out after ${timeoutSeconds} seconds`);
  const utterances = getUtterances(completed.payload);
  await mkdir(dirname(options.json), {recursive: true});
  await mkdir(dirname(options.srt), {recursive: true});
  await writeFile(options.json, `${JSON.stringify(completed.payload, null, 2)}\n`, "utf8");
  const srt = buildSrt(completed.payload);
  await writeFile(options.srt, srt, "utf8");

  const validatorArgs = [fileURLToPath(new URL("./validate-srt.mjs", import.meta.url)), options.srt];
  if (options.media) validatorArgs.push(options.media);
  const validation = spawnSync(process.execPath, validatorArgs, {encoding: "utf8"});
  if (validation.status !== 0) {
    process.stderr.write(validation.stdout || validation.stderr);
    process.exit(1);
  }

  console.log(JSON.stringify({
    taskId,
    rawJson: options.json,
    srt: options.srt,
    cueCount: utterances.length,
    validation: JSON.parse(validation.stdout),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({error: error.message}, null, 2));
  process.exit(1);
}
