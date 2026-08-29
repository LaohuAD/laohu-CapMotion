#!/usr/bin/env node

import {spawnSync} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const edlPath = process.argv[2];
if (!edlPath) throw new Error("Usage: render-frame-edl.mjs EDL.json");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {encoding: "utf8", ...options});
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`.trim());
  return result.stdout;
};

const edl = JSON.parse(await readFile(edlPath, "utf8"));
const fps = Number(edl.fps);
const sampleRate = Number(edl.sampleRate);
const samplesPerFrame = Number(edl.samplesPerFrame);
if (!edl.source || !edl.output || !Array.isArray(edl.sequence) || edl.sequence.length === 0) throw new Error("EDL requires source, output and sequence");
if (!Number.isFinite(fps) || !Number.isInteger(samplesPerFrame) || samplesPerFrame !== sampleRate / fps) throw new Error("Invalid frame/audio alignment");

let expectedFrames = 0;
for (const range of edl.sequence) {
  if (!Number.isInteger(range.startFrame) || !Number.isInteger(range.endFrame) || range.endFrame <= range.startFrame) throw new Error(`Invalid frame range ${JSON.stringify(range)}`);
  expectedFrames += range.endFrame - range.startFrame;
}

const directory = await mkdtemp(path.join(os.tmpdir(), "render-frame-edl-"));
try {
  const filterPath = path.join(directory, "filter.txt");
  const filters = [];
  const inputs = [];
  for (const [index, range] of edl.sequence.entries()) {
    filters.push(`[0:v]trim=start_frame=${range.startFrame}:end_frame=${range.endFrame},setpts=PTS-STARTPTS[v${index}]`);
    filters.push(`[0:a]atrim=start_sample=${range.startFrame * samplesPerFrame}:end_sample=${range.endFrame * samplesPerFrame},asetpts=PTS-STARTPTS[a${index}]`);
    inputs.push(`[v${index}][a${index}]`);
  }
  filters.push(`${inputs.join("")}concat=n=${edl.sequence.length}:v=1:a=1[vout][aout]`);
  await writeFile(filterPath, `${filters.join(";\n")}\n`, "utf8");

  run("ffmpeg", [
    "-y", "-v", "warning", "-i", edl.source,
    "-filter_complex_script", filterPath,
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", edl.videoCodec ?? "libx264", "-preset", edl.videoPreset ?? "medium", "-crf", String(edl.videoCrf ?? 18),
    "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p", "-r", String(fps), "-video_track_timescale", "15360",
    "-c:a", "aac", "-b:a", edl.audioBitrate ?? "192k", "-ar", String(sampleRate),
    "-movflags", "+faststart", edl.output,
  ], {stdio: "inherit", encoding: undefined});

  const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=index,codec_type,start_time,duration,nb_frames,width,height,r_frame_rate,sample_rate,channels", "-show_entries", "format=start_time,duration,size", "-of", "json", edl.output]));
  edl.expectedFrames = expectedFrames;
  edl.expectedDurationSeconds = expectedFrames / fps;
  edl.outputProbe = probe;
  edl.renderedAt = new Date().toISOString();
  await writeFile(edlPath, `${JSON.stringify(edl, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({output: edl.output, rangeCount: edl.sequence.length, expectedFrames, expectedDurationSeconds: expectedFrames / fps, actualDurationSeconds: Number(probe.format?.duration)}, null, 2));
} finally {
  await rm(directory, {recursive: true, force: true});
}
