#!/usr/bin/env node

import {createRequire} from "node:module";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "<end>"}`);
  args.set(key.slice(2), value);
}

const srtPath = args.get("srt");
const fontPath = args.get("font");
const outputDir = args.get("output-dir");
const concatListPath = args.get("concat-list");
const totalDurationMs = Math.round(Number(args.get("duration")) * 1000);
const canvasHeight = Number(args.get("height") ?? 128);
const background = args.get("background") ?? "black";
const position = args.get("position") ?? "center";
const bottomOffset = Number(args.get("bottom-offset") ?? 0);
const runtimeModules = process.env.CODEX_NODE_MODULES;
if (!srtPath || !fontPath || !outputDir || !concatListPath || !Number.isFinite(totalDurationMs)) {
  throw new Error("Required: --srt PATH --font PATH --output-dir DIR --concat-list PATH --duration SECONDS");
}
if (!runtimeModules) throw new Error("CODEX_NODE_MODULES is required");
if (!Number.isInteger(canvasHeight) || canvasHeight <= 0) throw new Error("Invalid --height");
if (!["black", "transparent"].includes(background)) throw new Error("--background must be black or transparent");
if (!["center", "bottom"].includes(position)) throw new Error("--position must be center or bottom");
if (!Number.isFinite(bottomOffset) || bottomOffset < 0) throw new Error("Invalid --bottom-offset");

const parseTime = (value) => {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) throw new Error(`Invalid SRT time: ${value}`);
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
};

const cues = (await readFile(srtPath, "utf8")).trim().split(/\r?\n\s*\r?\n/).map((block) => {
  const lines = block.split(/\r?\n/);
  const timing = lines[1]?.match(/^(\S+)\s+-->\s+(\S+)$/);
  if (!timing || lines.length < 4) throw new Error(`Invalid bilingual SRT block: ${block.slice(0, 80)}`);
  return {
    id: Number(lines[0]),
    startMs: parseTime(timing[1]),
    endMs: parseTime(timing[2]),
    chinese: lines[2].trim(),
    english: lines.slice(3).join(" ").trim(),
  };
});

for (let index = 0; index < cues.length; index++) {
  const cue = cues[index];
  const previous = cues[index - 1];
  if (cue.id !== index + 1 || !cue.chinese || !cue.english || cue.endMs <= cue.startMs || (previous && cue.startMs < previous.endMs)) {
    throw new Error(`Invalid cue ${cue.id}`);
  }
}
if (cues.at(-1)?.endMs > totalDurationMs) throw new Error("Last cue exceeds total duration");

await mkdir(outputDir, {recursive: true});
const {chromium} = require(path.join(runtimeModules, "playwright"));
const fontBase64 = (await readFile(fontPath)).toString("base64");
const html = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: "Source Han Sans CN Burn";
    src: url(data:font/otf;base64,${fontBase64}) format("opentype");
    font-style: normal;
    font-weight: 400 900;
  }
  * { box-sizing: border-box; }
  html, body { width: 1920px; height: ${canvasHeight}px; margin: 0; overflow: hidden; background: ${background === "transparent" ? "transparent" : "#000"}; }
  body { display: flex; align-items: ${position === "bottom" ? "flex-end" : "center"}; justify-content: center; padding-bottom: ${position === "bottom" ? bottomOffset : 0}px; font-family: "Source Han Sans CN Burn", sans-serif; color: #fff; }
  .caption { width: 100%; text-align: center; font-weight: 700; letter-spacing: 0; line-height: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
  .zh { font-size: 40px; -webkit-text-stroke: 2.5px #000; paint-order: stroke fill; text-shadow: 3.5px 3.5px 7px rgba(0,0,0,.75); }
  .en { font-size: 26px; font-weight: 700; -webkit-text-stroke: 1.5px #000; paint-order: stroke fill; text-shadow: 3.5px 3.5px 5px rgba(0,0,0,.75); }
</style>
<body><div class="caption"><div class="zh"></div><div class="en"></div></div></body>`;

const browserCandidates = [
  process.env.CAPTION_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);
let executablePath;
for (const candidate of browserCandidates) {
  try { await readFile(candidate); executablePath = candidate; break; } catch {}
}

const browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
try {
  const page = await browser.newPage({viewport: {width: 1920, height: canvasHeight}, deviceScaleFactor: 1});
  await page.setContent(html, {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    document.querySelector(".zh").textContent = "";
    document.querySelector(".en").textContent = "";
  });
  const blankPath = path.join(outputDir, "blank.png");
  await page.screenshot({path: blankPath, type: "png", omitBackground: background === "transparent"});
  for (let index = 0; index < cues.length; index++) {
    const cue = cues[index];
    await page.evaluate(({chinese, english}) => {
      document.querySelector(".zh").textContent = chinese;
      document.querySelector(".en").textContent = english;
    }, cue);
    const dimensions = await page.evaluate(() => ({
      chineseWidth: document.querySelector(".zh").getBoundingClientRect().width,
      englishWidth: document.querySelector(".en").getBoundingClientRect().width,
      captionHeight: document.querySelector(".caption").getBoundingClientRect().height,
    }));
    if (dimensions.chineseWidth > 1880 || dimensions.englishWidth > 1880 || dimensions.captionHeight > 124) {
      throw new Error(`Caption overflow at cue ${cue.id}: ${JSON.stringify(dimensions)}`);
    }
    await page.screenshot({path: path.join(outputDir, `cue-${String(cue.id).padStart(4, "0")}.png`), type: "png", omitBackground: background === "transparent"});
    if ((index + 1) % 50 === 0 || index + 1 === cues.length) process.stderr.write(`rendered ${index + 1}/${cues.length}\n`);
  }

  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const entries = ["ffconcat version 1.0"];
  let cursorMs = 0;
  const add = (file, durationMs) => {
    if (durationMs <= 0) return;
    entries.push(`file ${quote(file)}`);
    entries.push(`duration ${(durationMs / 1000).toFixed(3)}`);
  };
  for (const cue of cues) {
    add(blankPath, cue.startMs - cursorMs);
    add(path.join(outputDir, `cue-${String(cue.id).padStart(4, "0")}.png`), cue.endMs - cue.startMs);
    cursorMs = cue.endMs;
  }
  add(blankPath, totalDurationMs - cursorMs);
  entries.push(`file ${quote(blankPath)}`);
  await writeFile(concatListPath, `${entries.join("\n")}\n`, "utf8");
} finally {
  await browser.close();
}

console.log(JSON.stringify({cueCount: cues.length, totalDurationMs, outputDir, concatListPath}, null, 2));
