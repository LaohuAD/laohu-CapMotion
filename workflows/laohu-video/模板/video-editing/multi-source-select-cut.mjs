#!/usr/bin/env node

import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {ffmpegBin, ffprobeBin} from "./media-binaries.mjs";

const [edlPath, ...flags] = process.argv.slice(2);
if (!edlPath) {
  console.error("Usage: multi-source-select-cut.mjs <edl.json> [--dry-run]");
  process.exit(2);
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {encoding: "utf8", ...options});
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`.trim());
  return result.stdout;
};

const edl = JSON.parse(await readFile(edlPath, "utf8"));
const sourceMap = new Map(edl.sources.map((source) => [source.id, source]));
if (!Array.isArray(edl.sequence) || !edl.sequence.length) throw new Error("EDL requires sequence");

const grouped = [];
for (const range of edl.sequence) {
  const source = sourceMap.get(range.source);
  if (!source) throw new Error(`Unknown source: ${range.source}`);
  const previous = grouped.at(-1);
  if (previous?.source === range.source) previous.ranges.push(range);
  else grouped.push({source: range.source, ranges: [range]});
}
const batchSize = Number(edl.batchSize ?? 80);
const batches = [];
for (const group of grouped) {
  for (let offset = 0; offset < group.ranges.length; offset += batchSize) {
    batches.push({source: group.source, ranges: group.ranges.slice(offset, offset + batchSize)});
  }
}
const expectedDurationMs = edl.sequence.reduce((sum, range) => sum + range.endMs - range.startMs, 0);

if (flags.includes("--dry-run")) {
  console.log(JSON.stringify({output: edl.output, rangeCount: edl.sequence.length, groupCount: grouped.length, batchCount: batches.length, expectedDurationMs}, null, 2));
  process.exit(0);
}

const workDir = await mkdtemp(join(tmpdir(), "laohu-select-cut-"));
try {
  const chunks = [];
  for (const [groupIndex, group] of batches.entries()) {
    const source = sourceMap.get(group.source);
    const batchStartMs = group.ranges[0].startMs;
    const batchEndMs = group.ranges.at(-1).endMs;
    const videoTerms = group.ranges.map((range) => `between(t,${((range.startMs - batchStartMs) / 1000).toFixed(3)},${((range.endMs - batchStartMs) / 1000).toFixed(3)})`);
    const audioTerms = group.ranges.map((range) => `between(t,${((range.startMs - batchStartMs) / 1000).toFixed(3)},${((range.endMs - batchStartMs) / 1000).toFixed(3)})`);
    const filterPath = join(workDir, `filter-${String(groupIndex + 1).padStart(2, "0")}.txt`);
    const chunkPath = join(workDir, `chunk-${String(groupIndex + 1).padStart(2, "0")}.mp4`);
    await writeFile(filterPath, [
      `[0:v]select='${videoTerms.join("+")}',setpts=N/(${edl.fps ?? 30}*TB),scale=${edl.width ?? 1920}:${edl.height ?? 936}:force_original_aspect_ratio=decrease,pad=${edl.width ?? 1920}:${edl.height ?? 936}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v]`,
      `[0:a]aselect='${audioTerms.join("+")}',asetpts=N/SR/TB,aresample=48000[a]`,
      `[v][a]concat=n=1:v=1:a=1[vout][aout]`,
    ].join(";\n") + "\n", "utf8");
    run(ffmpegBin, [
      "-hide_banner", "-y", "-ss", (batchStartMs / 1000).toFixed(3), "-t", ((batchEndMs - batchStartMs) / 1000).toFixed(3), "-i", source.path,
      "-filter_complex_script", filterPath,
      "-map", "[vout]", "-map", "[aout]",
      "-r", String(edl.fps ?? 30),
      "-c:v", edl.videoCodec ?? "libx264", "-preset", edl.videoPreset ?? "veryfast", "-crf", String(edl.videoCrf ?? 19), "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", edl.audioBitrate ?? "192k", "-ar", "48000", "-movflags", "+faststart", chunkPath,
    ], {stdio: "inherit", encoding: undefined});
    chunks.push(chunkPath);
  }
  const concatPath = join(workDir, "concat.txt");
  await writeFile(concatPath, chunks.map((chunk) => `file '${chunk}'`).join("\n") + "\n", "utf8");
  run(ffmpegBin, ["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", "-movflags", "+faststart", edl.output], {stdio: "inherit", encoding: undefined});
  const probe = JSON.parse(run(ffprobeBin, ["-v", "error", "-show_entries", "format=duration,size:stream=index,codec_type,start_time,duration,width,height,r_frame_rate,sample_rate,channels", "-of", "json", edl.output]));
  edl.expectedDurationMs = expectedDurationMs;
  edl.outputProbe = probe;
  edl.renderedAt = new Date().toISOString();
  await writeFile(edlPath, JSON.stringify(edl, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({output: edl.output, rangeCount: edl.sequence.length, groupCount: grouped.length, batchCount: batches.length, expectedDurationMs, actualDurationSeconds: Number(probe.format?.duration), sizeBytes: Number(probe.format?.size)}, null, 2));
} finally {
  await rm(workDir, {recursive: true, force: true});
}
