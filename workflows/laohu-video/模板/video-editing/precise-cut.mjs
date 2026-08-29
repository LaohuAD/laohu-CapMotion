#!/usr/bin/env node

import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";

const [edlPath, ...flags] = process.argv.slice(2);
if (!edlPath) {
  console.error("Usage: precise-cut.mjs <edl.json>");
  process.exit(2);
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {encoding: "utf8", ...options});
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result.stdout;
};

const expandCueSpec = (spec) => {
  if (Number.isInteger(spec)) return [spec];
  const match = String(spec).match(/^(\d+)-(\d+)$/);
  if (!match) throw new Error(`Invalid cue spec: ${spec}`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start) throw new Error(`Invalid descending cue range: ${spec}`);
  return Array.from({length: end - start + 1}, (_, index) => start + index);
};

const edl = JSON.parse(await readFile(edlPath, "utf8"));
const raw = JSON.parse(await readFile(edl.rawJson, "utf8"));
const result = Array.isArray(raw.result) ? raw.result[0] : raw.result;
const utterances = result?.utterances;
if (!Array.isArray(utterances) || utterances.length === 0) {
  throw new Error("Raw ASR JSON contains no utterances");
}

const probe = JSON.parse(run("ffprobe", [
  "-v", "error",
  "-show_entries", "format=duration:stream=index,codec_type,start_time,duration,width,height,r_frame_rate,sample_rate,channels",
  "-of", "json",
  edl.source,
]));
const sourceDurationMs = Math.round(Number(probe.format?.duration) * 1000);
if (!Number.isFinite(sourceDurationMs) || sourceDurationMs <= 0) {
  throw new Error("Unable to determine source duration");
}

const requested = [];
for (const item of edl.precisionSequence) {
  if (typeof item === "number" || typeof item === "string") {
    for (const cue of expandCueSpec(item)) {
      const utterance = utterances[cue - 1];
      if (!utterance) throw new Error(`Missing ASR cue ${cue}`);
      requested.push({
        startMs: Number(utterance.start_time),
        endMs: Number(utterance.end_time),
        cueIds: [cue],
        reason: "保留完整口播",
      });
    }
    continue;
  }

  if (!item || !Number.isFinite(item.startMs) || !Number.isFinite(item.endMs)) {
    throw new Error(`Invalid custom range: ${JSON.stringify(item)}`);
  }
  requested.push({
    startMs: item.startMs,
    endMs: item.endMs,
    cueIds: item.cueIds ?? (item.cue ? [item.cue] : []),
    reason: item.reason ?? "精确保留",
  });
}

const handleMs = Number(edl.handleMs ?? 50);
const mergeGapMs = Number(edl.mergeGapMs ?? 100);
const withHandles = requested.map((range) => ({
  ...range,
  startMs: Math.max(0, range.startMs - handleMs),
  endMs: Math.min(sourceDurationMs, range.endMs + handleMs),
}));

const resolved = [];
for (const range of withHandles) {
  if (!(range.endMs > range.startMs)) throw new Error(`Invalid range duration: ${JSON.stringify(range)}`);
  const previous = resolved.at(-1);
  const followsSourceOrder = previous && range.startMs >= previous.startMs;
  if (followsSourceOrder && range.startMs <= previous.endMs + mergeGapMs) {
    previous.endMs = Math.max(previous.endMs, range.endMs);
    previous.cueIds = [...new Set([...previous.cueIds, ...range.cueIds])];
    previous.reasons = [...new Set([...previous.reasons, range.reason])];
  } else {
    resolved.push({...range, reasons: [range.reason]});
  }
}

let targetCursorMs = 0;
for (const [index, range] of resolved.entries()) {
  range.index = index + 1;
  range.durationMs = range.endMs - range.startMs;
  range.targetStartMs = targetCursorMs;
  targetCursorMs += range.durationMs;
  range.targetEndMs = targetCursorMs;
  delete range.reason;
}

if (flags.includes("--dry-run")) {
  console.log(JSON.stringify({
    source: edl.source,
    output: edl.output,
    requestedRangeCount: requested.length,
    resolvedRangeCount: resolved.length,
    expectedDurationMs: targetCursorMs,
  }, null, 2));
  process.exit(0);
}

const workDir = await mkdtemp(join(tmpdir(), "laohu-precise-cut-"));
try {
  const filterPath = join(workDir, "filter.txt");
  const filterParts = [];
  const concatInputs = [];
  for (const [index, range] of resolved.entries()) {
    const start = (range.startMs / 1000).toFixed(3);
    const end = (range.endMs / 1000).toFixed(3);
    filterParts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`);
    filterParts.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`);
    concatInputs.push(`[v${index}][a${index}]`);
  }
  filterParts.push(`${concatInputs.join("")}concat=n=${resolved.length}:v=1:a=1[vout][aout]`);
  await writeFile(filterPath, `${filterParts.join(";\n")}\n`, "utf8");

  const ffmpegArgs = [
    "-hide_banner", "-y",
    "-i", edl.source,
    "-filter_complex_script", filterPath,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", edl.videoCodec ?? "libx264",
    "-preset", edl.videoPreset ?? "medium",
    "-crf", String(edl.videoCrf ?? 19),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", edl.audioBitrate ?? "128k",
    "-movflags", "+faststart",
    edl.output,
  ];
  run("ffmpeg", ffmpegArgs, {stdio: "inherit", encoding: undefined});

  const outputProbe = JSON.parse(run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=index,codec_type,start_time,duration,width,height,r_frame_rate,sample_rate,channels",
    "-of", "json",
    edl.output,
  ]));
  edl.resolvedRanges = resolved;
  edl.expectedDurationMs = targetCursorMs;
  edl.outputProbe = outputProbe;
  edl.renderedAt = new Date().toISOString();
  await writeFile(edlPath, `${JSON.stringify(edl, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    output: edl.output,
    rangeCount: resolved.length,
    expectedDurationMs: targetCursorMs,
    actualDurationSeconds: Number(outputProbe.format?.duration),
    sizeBytes: Number(outputProbe.format?.size),
  }, null, 2));
} finally {
  await rm(workDir, {recursive: true, force: true});
}
