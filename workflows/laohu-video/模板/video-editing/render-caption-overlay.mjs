#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(2);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) fail(`invalid argument near ${key ?? "<end>"}`);
  values.set(key.slice(2), value);
}

const output = values.get("output");
const fontPath = values.get("font");
const chinese = values.get("zh");
const english = values.get("en");
const width = Number(values.get("width") ?? 1920);
const height = Number(values.get("height") ?? 128);
const runtimeModules = process.env.CODEX_NODE_MODULES;

if (!output || !fontPath || !chinese) fail("required: --output PATH --font PATH --zh TEXT [--en TEXT]");
if (!runtimeModules) fail("CODEX_NODE_MODULES is required");
if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) fail("invalid canvas size");

const { chromium } = require(path.join(runtimeModules, "playwright"));
const fontBase64 = (await readFile(fontPath)).toString("base64");
const bilingualClass = english ? " bilingual" : "";
const englishLine = english ? `<div class="en">${escapeHtml(english)}</div>` : "";

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
  html, body {
    width: ${width}px;
    height: ${height}px;
    margin: 0;
    overflow: hidden;
    background: #000;
  }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Source Han Sans CN Burn", sans-serif;
    color: #fff;
  }
  .caption {
    width: 100%;
    text-align: center;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1;
  }
  .zh {
    font-size: 44px;
    -webkit-text-stroke: 2.5px #000;
    paint-order: stroke fill;
    text-shadow: 3.5px 3.5px 7px rgba(0,0,0,.75);
  }
  .bilingual {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .bilingual .zh { font-size: 40px; }
  .en {
    font-size: 26px;
    font-weight: 700;
    -webkit-text-stroke: 1.5px #000;
    paint-order: stroke fill;
    text-shadow: 3.5px 3.5px 5px rgba(0,0,0,.75);
  }
</style>
<body>
  <div class="caption${bilingualClass}">
    <div class="zh">${escapeHtml(chinese)}</div>
    ${englishLine}
  </div>
</body>`;

const browserCandidates = [
  process.env.CAPTION_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);
let executablePath;
for (const candidate of browserCandidates) {
  try {
    await readFile(candidate);
    executablePath = candidate;
    break;
  } catch {}
}

const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output, type: "png", omitBackground: false });
} finally {
  await browser.close();
}
