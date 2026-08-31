#!/usr/bin/env node
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {expandAvatarTasks, verifyFrozenPackageFiles} from "./postproduction-package.mjs";

const DEFAULT_FFPROBE = process.env.FFPROBE_BIN
  ?? (existsSync("/opt/homebrew/opt/ffmpeg@7/bin/ffprobe") ? "/opt/homebrew/opt/ffmpeg@7/bin/ffprobe" : "ffprobe");

const frameRate = (value) => {
  const [numerator, denominator = "1"] = String(value ?? "0").split("/").map(Number);
  return denominator ? numerator / denominator : 0;
};

export function evaluateGeneratedAssetProbe(task, probe, {durationToleranceSeconds = 0.1} = {}) {
  const errors = [];
  const video = probe?.streams?.find((stream) => stream.codec_type === "video");
  if (!video) errors.push("VIDEO_STREAM_MISSING");
  const width = Number(video?.width);
  const height = Number(video?.height);
  const duration = Number(video?.duration ?? probe?.format?.duration);
  const expectedDuration = task.finalRange.end - task.finalRange.start;
  if (!Number.isFinite(duration) || Math.abs(duration - expectedDuration) > durationToleranceSeconds) {
    errors.push("ASSET_DURATION_MISMATCH");
  }
  if (task.type === "AVATAR" && (width !== 1280 || height !== 720 || width <= height)) {
    errors.push("AVATAR_NOT_720P_HORIZONTAL");
  }
  if (["AI_VIDEO", "SCREEN_RECORDING", "EVIDENCE"].includes(task.type)) {
    const ratio = width / height;
    if (!(width > height) || !Number.isFinite(ratio) || Math.abs(ratio - 16 / 9) > 0.01) {
      errors.push("OVERLAY_NOT_16_9_HORIZONTAL");
    }
  }
  const manualChecks = task.type === "AVATAR"
    ? ["lipSync", "characterConsistency", "firstLastPose", "continuityHandoff"]
    : task.type === "SCREEN_RECORDING"
      ? ["operationState", "framing", "cursorReadability", "continuityHandoff"]
      : task.type === "EVIDENCE"
        ? ["sourceLegibility", "claimSupport", "focus", "continuityHandoff"]
        : ["purpose", "focus", "firstLastFrame", "continuityHandoff"];
  return {
    hardStatus: errors.length === 0 ? "PASS" : "FAIL",
    manualStatus: "OBSERVE",
    errors,
    width,
    height,
    fps: frameRate(video?.r_frame_rate),
    duration,
    manualChecks,
  };
}

function probeMedia(path, ffprobeBin = DEFAULT_FFPROBE) {
  return new Promise((accept, reject) => {
    const child = spawn(ffprobeBin, ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], {stdio: ["ignore", "pipe", "pipe"]});
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`ASSET_PROBE_FAILED:${stderr.trim()}`));
      else accept(JSON.parse(stdout));
    });
  });
}

export async function verifyGeneratedAssets(frozenPackage, assets, {
  readText = (path) => readFile(path, "utf8"),
  probe = probeMedia,
} = {}) {
  const frozenCheck = await verifyFrozenPackageFiles(frozenPackage, {readText});
  if (!frozenCheck.ok) throw new Error(`FROZEN_MAPPING_STALE:${frozenCheck.errors.join(",")}`);
  const verified = structuredClone(assets);
  for (const task of expandAvatarTasks(frozenPackage.tasks)) {
    if (!["AVATAR", "AI_VIDEO", "SCREEN_RECORDING", "EVIDENCE"].includes(task.type)) continue;
    const asset = verified[task.id];
    if (!asset?.artifactPath) throw new Error(`GENERATED_ASSET_MISSING:${task.id}`);
    const qa = evaluateGeneratedAssetProbe(task, await probe(asset.artifactPath));
    verified[task.id] = {
      ...asset,
      width: qa.width,
      height: qa.height,
      fps: qa.fps,
      qa: {...qa, mappingSha256: frozenPackage.freeze.mappingSha256},
    };
  }
  return verified;
}

async function main(argv) {
  const [frozenPath, assetsPath, outputPath] = argv;
  if (!frozenPath || !assetsPath || !outputPath) {
    throw new Error("用法: generated-asset-qa.mjs <frozen.json> <assets.json> <verified-assets.json>");
  }
  const [frozenPackage, assets] = await Promise.all([
    readFile(resolve(frozenPath), "utf8").then(JSON.parse),
    readFile(resolve(assetsPath), "utf8").then(JSON.parse),
  ]);
  const verified = await verifyGeneratedAssets(frozenPackage, assets);
  await writeFile(resolve(outputPath), `${JSON.stringify(verified, null, 2)}\n`);
  const hardFailures = Object.entries(verified).filter(([, asset]) => asset.qa?.hardStatus === "FAIL").map(([id]) => id);
  process.stdout.write(`${JSON.stringify({ok: hardFailures.length === 0, hardFailures, manualStatus: "OBSERVE"})}\n`);
  if (hardFailures.length) process.exitCode = 2;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((failure) => {
    process.stderr.write(`${JSON.stringify({ok: false, code: String(failure.message).split(":")[0]})}\n`);
    process.exitCode = 1;
  });
}
