#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, statSync} from "node:fs";
import {dirname, resolve} from "node:path";

const [inputArg, outputArg, ...extra] = process.argv.slice(2);
if (!inputArg || !outputArg || extra.length) {
  console.error("Usage: node extract-audio.mjs <input-media> <output.mp3>");
  process.exit(2);
}
try {
  const input = resolve(inputArg), output = resolve(outputArg);
  if (!statSync(input).isFile()) throw new Error("Input media is not a file");
  if (input === output) throw new Error("Input and output must be different files");
  mkdirSync(dirname(output), {recursive: true});
  const binary = (name) => process.env[`${name.toUpperCase()}_BIN`] ||
    (process.platform === "darwin" && existsSync(`/opt/homebrew/opt/ffmpeg@7/bin/${name}`) ? `/opt/homebrew/opt/ffmpeg@7/bin/${name}` : name);
  const run = (name, args) => {
    const result = spawnSync(binary(name), args, {encoding: "utf8", windowsHide: true});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${name} failed (${result.status}): ${result.stderr}`);
    return result.stdout.trim();
  };
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", output]);
  const durationSeconds = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output]));
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Extracted audio has no positive duration");
  console.log(JSON.stringify({audio: output, durationSeconds, sizeBytes: statSync(output).size}));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
