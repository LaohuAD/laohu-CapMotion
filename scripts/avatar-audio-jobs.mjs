#!/usr/bin/env node
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {expandAvatarTasks, verifyFrozenPackageFiles} from "./postproduction-package.mjs";

const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const DEFAULT_FFMPEG_BIN = existsSync("/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg")
  ? "/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg"
  : "ffmpeg";
const DEFAULT_FFPROBE_BIN = existsSync("/opt/homebrew/opt/ffmpeg@7/bin/ffprobe")
  ? "/opt/homebrew/opt/ffmpeg@7/bin/ffprobe"
  : "ffprobe";

function runProcess(command, args) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, {stdio: ["ignore", "ignore", "pipe"]});
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? accept() : reject(new Error(`AUDIO_EXPORT_FAILED:${code}:${stderr.trim()}`)));
  });
}

function probeAudioDuration(path, ffprobeBin = DEFAULT_FFPROBE_BIN) {
  return new Promise((accept, reject) => {
    const child = spawn(ffprobeBin, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      path,
    ], {stdio: ["ignore", "pipe", "pipe"]});
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      const duration = Number(stdout.trim());
      if (code === 0 && Number.isFinite(duration) && duration > 0) accept(duration);
      else reject(new Error(`AVATAR_AUDIO_PROBE_FAILED:${code}:${stderr.trim()}`));
    });
  });
}

export async function prepareAvatarAudioJobs(frozenPackage, {
  outputDir,
  ffmpegBin = process.env.FFMPEG_BIN ?? DEFAULT_FFMPEG_BIN,
  ffprobeBin = process.env.FFPROBE_BIN ?? DEFAULT_FFPROBE_BIN,
  readText = (path) => readFile(path, "utf8"),
  readBytes = readFile,
  makeDirectory = (path) => mkdir(path, {recursive: true}),
  runCommand = runProcess,
  probeDuration = (path) => probeAudioDuration(path, ffprobeBin),
  writeManifest = (path, content) => writeFile(path, content),
} = {}) {
  if (!isAbsolute(outputDir ?? "")) throw new Error("AVATAR_AUDIO_OUTPUT_DIR_MUST_BE_ABSOLUTE");
  const sourceAudioPath = frozenPackage?.sources?.finalMainAudio;
  if (!isAbsolute(sourceAudioPath ?? "")) throw new Error("FINAL_MAIN_AUDIO_MUST_BE_ABSOLUTE");

  const frozenCheck = await verifyFrozenPackageFiles(frozenPackage, {readText});
  if (!frozenCheck.ok) throw new Error(`FROZEN_MAPPING_STALE:${frozenCheck.errors.join(",")}`);

  const sourceAudioSha256 = sha256(await readBytes(sourceAudioPath));
  const tasks = expandAvatarTasks(frozenPackage.tasks).filter((task) => task.type === "AVATAR");
  await makeDirectory(outputDir);
  const jobs = [];
  for (const task of tasks) {
    const outputPath = join(outputDir, `${task.id}.wav`);
    const duration = task.finalRange.end - task.finalRange.start;
    const args = [
      "-hide_banner", "-loglevel", "error", "-n",
      "-i", sourceAudioPath,
      "-ss", String(task.finalRange.start),
      "-t", String(duration),
      "-vn", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le",
      outputPath,
    ];
    await runCommand(ffmpegBin, args);
    const actualDuration = Number(await probeDuration(outputPath));
    if (!Number.isFinite(actualDuration) || Math.abs(actualDuration - duration) > 0.1) {
      throw new Error(`AVATAR_AUDIO_DURATION_MISMATCH:${task.id}`);
    }
    jobs.push({
      id: task.id,
      parentTaskId: task.parentTaskId ?? task.id,
      start: task.finalRange.start,
      end: task.finalRange.end,
      duration,
      actualDuration,
      source: "FINAL_MAIN_AUDIO",
      sourceAudioPath,
      audioPath: outputPath,
      audioSha256: sha256(await readBytes(outputPath)),
      continuityGroup: task.continuity.group,
      order: task.continuity.order,
    });
  }

  const manifest = {
    schema: "laohu.runninghub-avatar-audio-jobs/1",
    videoId: frozenPackage.videoId,
    sourceAudioPath,
    sourceAudioSha256,
    edlSha256: frozenPackage.freeze.edlSha256,
    mappingSha256: frozenPackage.freeze.mappingSha256,
    jobs,
  };
  const manifestPath = join(outputDir, "avatar-audio-jobs.json");
  await writeManifest(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {...manifest, manifestPath};
}

async function main(argv) {
  const values = Object.fromEntries(argv.flatMap((value, index) => value.startsWith("--") ? [[value.slice(2), argv[index + 1]]] : []));
  if (!values.package || !values["output-dir"]) {
    throw new Error("用法: avatar-audio-jobs.mjs --package <frozen.json> --output-dir </absolute/task-dir>");
  }
  const frozenPackage = JSON.parse(await readFile(resolve(values.package), "utf8"));
  const result = await prepareAvatarAudioJobs(frozenPackage, {outputDir: resolve(values["output-dir"])});
  process.stdout.write(`${JSON.stringify({ok: true, manifestPath: result.manifestPath, jobs: result.jobs.length})}\n`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((failure) => {
    process.stderr.write(`${JSON.stringify({ok: false, code: String(failure.message).split(":")[0]})}\n`);
    process.exitCode = 1;
  });
}
