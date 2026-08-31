#!/usr/bin/env node

import {spawn} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {ffmpegBin, ffprobeBin} from "./media-binaries.mjs";

const edlPath = process.argv[2];
if (!edlPath) throw new Error("Usage: render-frame-edl-segmented.mjs EDL.json");

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {stdio: ["ignore", "pipe", "pipe"], ...options});
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => { stdout += chunk; });
  child.stderr?.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve(stdout);
    else reject(new Error(`${command} failed (${code}): ${stderr || stdout}`.trim()));
  });
});

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

const directory = await mkdtemp(path.join(os.tmpdir(), "render-frame-edl-segmented-"));
const concurrency = Math.max(1, Number(process.env.EDL_RENDER_CONCURRENCY ?? 4));

try {
  const segmentPaths = edl.sequence.map((_, index) => path.join(directory, `${String(index).padStart(4, "0")}.mkv`));
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= edl.sequence.length) return;
      const range = edl.sequence[index];
      const frameCount = range.endFrame - range.startFrame;
      await run(ffmpegBin, [
        "-y", "-v", "error",
        "-ss", (range.startFrame / fps).toFixed(9), "-i", edl.source,
        "-map", "0:v:0", "-map", "0:a:0",
        "-frames:v", String(frameCount),
        "-vf", `setpts=N/(${fps}*TB)`,
        "-af", `atrim=start_sample=0:end_sample=${frameCount * samplesPerFrame},asetpts=N/SR/TB`,
        "-c:v", edl.segmentVideoCodec ?? "libx264",
        "-preset", edl.segmentVideoPreset ?? "veryfast",
        "-crf", String(edl.segmentVideoCrf ?? 18),
        "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(fps),
        "-c:a", "pcm_s16le", "-ar", String(sampleRate),
        segmentPaths[index],
      ]);
      completed += 1;
      if (completed % 25 === 0 || completed === edl.sequence.length) process.stdout.write(`Rendered ${completed}/${edl.sequence.length}\n`);
    }
  };

  await Promise.all(Array.from({length: Math.min(concurrency, edl.sequence.length)}, worker));

  const concatPath = path.join(directory, "concat.txt");
  const escape = (value) => value.replaceAll("'", "'\\''");
  await writeFile(concatPath, `${segmentPaths.map((value) => `file '${escape(value)}'`).join("\n")}\n`, "utf8");
  await run(ffmpegBin, [
    "-y", "-v", "warning", "-f", "concat", "-safe", "0", "-i", concatPath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", edl.audioBitrate ?? "192k", "-ar", String(sampleRate),
    "-video_track_timescale", "15360", "-movflags", "+faststart", edl.output,
  ]);

  const probe = JSON.parse(await run(ffprobeBin, ["-v", "error", "-count_frames", "-show_entries", "stream=index,codec_type,start_time,duration,nb_read_frames,width,height,r_frame_rate,sample_rate,channels", "-show_entries", "format=start_time,duration,size", "-of", "json", edl.output]));
  edl.expectedFrames = expectedFrames;
  edl.expectedDurationSeconds = expectedFrames / fps;
  edl.outputProbe = probe;
  edl.renderMethod = "independent-frame-aligned-segments-with-pcm-concat";
  edl.renderedAt = new Date().toISOString();
  await writeFile(edlPath, `${JSON.stringify(edl, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({output: edl.output, rangeCount: edl.sequence.length, expectedFrames, expectedDurationSeconds: expectedFrames / fps, actualDurationSeconds: Number(probe.format?.duration)}, null, 2));
} finally {
  await rm(directory, {recursive: true, force: true});
}
