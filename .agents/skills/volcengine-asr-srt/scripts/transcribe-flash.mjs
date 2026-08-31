#!/usr/bin/env node

import {mkdir, readFile, stat, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {extname, dirname} from "node:path";
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
} from "./asr-common.mjs";

const MAX_DURATION_SECONDS = 2 * 60 * 60;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const RECOMMENDED_DIRECT_BYTES = 20 * 1024 * 1024;
const supportedFormats = new Set(["wav", "mp3", "ogg"]);
const ffprobeBin = process.env.FFPROBE_BIN
  ?? (existsSync("/opt/homebrew/opt/ffmpeg@7/bin/ffprobe") ? "/opt/homebrew/opt/ffmpeg@7/bin/ffprobe" : "ffprobe");

const options = parseArgs(process.argv.slice(2));
if (!options.file || !options.json || !options.srt) {
  console.error("Usage: transcribe-flash.mjs --file <audio> --json <raw.json> --srt <output.srt> [--format mp3] [--media source.mp4] [--speaker]");
  process.exit(2);
}

const format = String(options.format ?? extname(options.file).slice(1)).toLowerCase();
if (!supportedFormats.has(format)) {
  console.error(`Unsupported flash ASR audio format: ${format || "unknown"}. Use WAV, MP3, or OGG OPUS.`);
  process.exit(2);
}

try {
  const fileStat = await stat(options.file);
  if (!fileStat.isFile()) throw new Error(`Audio input is not a file: ${options.file}`);
  if (fileStat.size > MAX_AUDIO_BYTES) {
    throw new Error(`Audio exceeds the flash API 100MB limit: ${fileStat.size} bytes`);
  }

  const probe = spawnSync(ffprobeBin, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    options.file,
  ], {encoding: "utf8"});
  if (probe.status !== 0) throw new Error(`Unable to probe audio: ${probe.stderr.trim() || "ffprobe failed"}`);
  const durationSeconds = Number(probe.stdout.trim());
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Unable to determine a positive audio duration");
  if (durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(`Audio exceeds the flash API 2-hour limit: ${durationSeconds.toFixed(3)} seconds`);
  }

  const config = await loadConfig();
  const requestId = createTaskId();
  const audioData = (await readFile(options.file)).toString("base64");
  const request = {
    user: {uid: config.appId ?? "laohu-asr"},
    audio: {
      data: audioData,
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

  const recognized = await postJson(
    config.flashUrl,
    createHeaders(config, requestId, {submit: true, resourceId: config.flashResourceId}),
    request,
  );
  if (recognized.statusCode !== "20000000") {
    if (recognized.statusCode === "45000030") {
      throw new Error("Flash ASR resource is not granted for this application. Enable volc.bigasr.auc_turbo in the Volcengine console before retrying.");
    }
    throw new Error(`Flash recognition failed: ${recognized.statusCode || recognized.httpStatus} ${recognized.message}`.trim());
  }

  const utterances = getUtterances(recognized.payload);
  const srt = buildSrt(recognized.payload);
  await mkdir(dirname(options.json), {recursive: true});
  await mkdir(dirname(options.srt), {recursive: true});
  await writeFile(options.json, `${JSON.stringify(recognized.payload, null, 2)}\n`, "utf8");
  await writeFile(options.srt, srt, "utf8");

  const validatorArgs = [fileURLToPath(new URL("./validate-srt.mjs", import.meta.url)), options.srt];
  if (options.media) validatorArgs.push(options.media);
  const validation = spawnSync(process.execPath, validatorArgs, {encoding: "utf8"});
  if (validation.status !== 0) {
    process.stderr.write(validation.stdout || validation.stderr);
    process.exit(1);
  }

  console.log(JSON.stringify({
    mode: "flash-base64",
    requestId,
    rawJson: options.json,
    srt: options.srt,
    audioBytes: fileStat.size,
    durationSeconds: Number(durationSeconds.toFixed(3)),
    cueCount: utterances.length,
    warnings: fileStat.size > RECOMMENDED_DIRECT_BYTES
      ? ["Audio is within the 100MB hard limit but exceeds the official 20MB direct-upload recommendation"]
      : [],
    validation: JSON.parse(validation.stdout),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({error: error.message}, null, 2));
  process.exit(1);
}
