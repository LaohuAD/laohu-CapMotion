import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {ffmpegBin, ffprobeBin} from "./media-binaries.mjs";

const scriptPath = fileURLToPath(new URL("./render-frame-edl.mjs", import.meta.url));

test("renders paired frame and audio-sample ranges without duration drift", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "render-frame-edl-test-"));
  const sourcePath = path.join(directory, "source.mp4");
  const outputPath = path.join(directory, "output.mp4");
  const edlPath = path.join(directory, "edl.json");
  execFileSync(ffmpegBin, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=size=192x108:rate=30:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", sourcePath]);
  await writeFile(edlPath, JSON.stringify({
    source: sourcePath,
    output: outputPath,
    fps: 30,
    sampleRate: 48000,
    samplesPerFrame: 1600,
    sequence: [
      {startFrame: 0, endFrame: 6},
      {startFrame: 15, endFrame: 24}
    ]
  }), "utf8");

  execFileSync(process.execPath, [scriptPath, edlPath]);
  const probe = JSON.parse(execFileSync(ffprobeBin, ["-v", "error", "-show_entries", "stream=codec_type,duration,nb_frames", "-show_entries", "format=duration", "-of", "json", outputPath], {encoding: "utf8"}));
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");

  assert.equal(Number(video.nb_frames), 15);
  assert.equal(Number(video.duration), 0.5);
  assert.ok(Math.abs(Number(audio.duration) - 0.5) <= 1 / 48000);
});
