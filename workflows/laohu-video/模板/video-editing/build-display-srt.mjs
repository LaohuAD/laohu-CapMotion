#!/usr/bin/env node

import {readFile, writeFile} from "node:fs/promises";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) {
    throw new Error(`Invalid argument near ${key ?? "<end>"}`);
  }
  args.set(key.slice(2), value);
}

const srtPath = args.get("srt");
const rawPath = args.get("raw");
const outputPath = args.get("output");
const overridesPath = args.get("overrides");
if (!srtPath || !rawPath || !outputPath) {
  throw new Error("Usage: build-display-srt.mjs --srt corrected.srt --raw raw.json --output display.srt [--overrides overrides.json]");
}

const parseTime = (value) => {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) throw new Error(`Invalid SRT time: ${value}`);
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
};

const formatTime = (milliseconds) => {
  const value = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1000);
  const millis = value % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const parseSrt = (source) => source.trim().split(/\r?\n\s*\r?\n/).map((block) => {
  const lines = block.split(/\r?\n/);
  const id = Number(lines[0]);
  const timing = lines[1]?.match(/^(\S+)\s+-->\s+(\S+)$/);
  if (!Number.isInteger(id) || !timing) throw new Error(`Invalid SRT block: ${block.slice(0, 80)}`);
  return {id, startMs: parseTime(timing[1]), endMs: parseTime(timing[2]), text: lines.slice(2).join(" ")};
});

const correctedCues = parseSrt(await readFile(srtPath, "utf8"));
const raw = JSON.parse(await readFile(rawPath, "utf8"));
const result = Array.isArray(raw.result) ? raw.result[0] : raw.result;
const utterances = result?.utterances;
if (!Array.isArray(utterances) || utterances.length !== correctedCues.length) {
  throw new Error(`Cue mismatch: corrected=${correctedCues.length}, raw=${utterances?.length ?? 0}`);
}

const overrideData = overridesPath ? JSON.parse(await readFile(overridesPath, "utf8")) : {};
const overrides = new Map(Object.entries(overrideData.cues ?? {}).map(([id, text]) => [Number(id), String(text)]));
const segmenter = new Intl.Segmenter("zh-CN", {granularity: "word"});

const cleanText = (source) => source
  .replace(/\s+/g, " ")
  .replace(/然后呢/g, "然后")
  .replace(/所以呢/g, "所以")
  .replace(/这个呢/g, "这个")
  .replace(/这里呢/g, "这里")
  .replace(/在在/g, "在")
  .replace(/也也就是/g, "也就是")
  .replace(/我们我们/g, "我们")
  .replace(/不不不知道/g, "不知道")
  .replace(/点点击/g, "点击")
  .replace(/文文字/g, "文字")
  .replace(/大大概/g, "大概")
  .replace(/我的的/g, "我的")
  .replace(/录制录了/g, "录了")
  .replace(/这个这个/g, "这个")
  .replace(/其实就是其实就是/g, "其实就是")
  .replace(/对吧(?=[，。！？；、：,.!?;:]|$)/g, "")
  .replace(/(^|[，。！？；、：,.!?;:]\s*)(?:啊|嗯|呃|哈|呀)+(?:\s*)(?=[，。！？；、：,.!?;:]|$)/g, "$1")
  .replace(/(?:啊|嗯|呃|哈|呀)+(?=[，。！？；、：,.!?;:]|$)/g, "")
  .replace(/呢(?=[，。！？；、：,.!?;:]|$)/g, "")
  .replace(/吧(?=[，。！？；、]|$)/g, "")
  .replace(/\s+([，。！？；、：])/g, "$1")
  .replace(/([，。！？；、：])\s+/g, "$1")
  .trim();

const isPunctuation = (value) => /^[，。！？；、：,.!?;:]$/u.test(value);
const isAsciiWord = (value) => /^[A-Za-z0-9][A-Za-z0-9.+#'’/_:-]*$/u.test(value);
const normalize = (value) => value.toLocaleLowerCase("en-US").replace(/[\s'’_-]+/g, "");

const correctedTokens = (text) => {
  const tokens = [];
  for (const part of segmenter.segment(text)) {
    const value = part.segment.trim();
    if (!value) continue;
    if (isPunctuation(value)) {
      if (tokens.length > 0) tokens.at(-1).breakAfter = /[。！？；.!?;]/u.test(value) ? 2 : 1;
      continue;
    }
    tokens.push({text: value, norm: normalize(value), breakAfter: 0});
  }
  return tokens;
};

const rawTokens = (utterance) => {
  const timedWords = utterance.words.filter((word) => Number(word.start_time) >= 0 && Number(word.end_time) > Number(word.start_time) && word.text.trim());
  const combined = timedWords.map((word) => word.text.trim()).join("");
  const characterMap = [];
  for (const word of timedWords) {
    for (const _character of [...word.text.trim()]) characterMap.push(word);
  }
  const tokens = [];
  for (const part of segmenter.segment(combined)) {
    const value = part.segment.trim();
    if (!value || isPunctuation(value)) continue;
    const charactersBefore = [...combined.slice(0, part.index)].length;
    const characterLength = [...part.segment].length;
    const covered = characterMap.slice(charactersBefore, charactersBefore + characterLength);
    const first = covered[0];
    const last = covered.at(-1);
    if (!first || !last) continue;
    tokens.push({text: value, norm: normalize(value), startMs: Number(first.start_time), endMs: Number(last.end_time)});
  }
  return tokens;
};

const alignTokens = (rawItems, displayItems, fallbackStart, fallbackEnd) => {
  const rows = rawItems.length + 1;
  const columns = displayItems.length + 1;
  const costs = Array.from({length: rows}, () => new Float64Array(columns));
  const moves = Array.from({length: rows}, () => new Uint8Array(columns));
  for (let row = 1; row < rows; row++) { costs[row][0] = row; moves[row][0] = 1; }
  for (let column = 1; column < columns; column++) { costs[0][column] = column; moves[0][column] = 2; }
  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      const same = rawItems[row - 1].norm === displayItems[column - 1].norm;
      const diagonal = costs[row - 1][column - 1] + (same ? 0 : 1.2);
      const deletion = costs[row - 1][column] + 1;
      const insertion = costs[row][column - 1] + 1;
      if (diagonal <= deletion && diagonal <= insertion) { costs[row][column] = diagonal; moves[row][column] = 0; }
      else if (deletion <= insertion) { costs[row][column] = deletion; moves[row][column] = 1; }
      else { costs[row][column] = insertion; moves[row][column] = 2; }
    }
  }

  const mapped = new Array(displayItems.length).fill(null);
  let row = rawItems.length;
  let column = displayItems.length;
  while (row > 0 || column > 0) {
    const move = moves[row][column];
    if (row > 0 && column > 0 && move === 0) {
      mapped[column - 1] = rawItems[row - 1];
      row -= 1;
      column -= 1;
    } else if (row > 0 && (column === 0 || move === 1)) row -= 1;
    else column -= 1;
  }

  for (let index = 0; index < mapped.length; index++) {
    if (mapped[index]) continue;
    const previous = mapped.slice(0, index).findLast(Boolean);
    const next = mapped.slice(index + 1).find(Boolean);
    if (previous && next) mapped[index] = {startMs: previous.endMs, endMs: next.startMs};
    else if (previous) mapped[index] = {startMs: previous.endMs, endMs: Math.min(fallbackEnd, previous.endMs + 160)};
    else if (next) mapped[index] = {startMs: Math.max(fallbackStart, next.startMs - 160), endMs: next.startMs};
    else mapped[index] = {startMs: fallbackStart, endMs: fallbackEnd};
  }
  return mapped;
};

const displayWidth = (token) => isAsciiWord(token.text) ? Math.max(2, token.text.length * 0.56) : [...token.text].length;
const joinTokens = (tokens) => {
  let output = "";
  for (const token of tokens) {
    const needsSpace = output && (isAsciiWord(token.text) || /[A-Za-z0-9]$/u.test(output));
    output += `${needsSpace ? " " : ""}${token.text}`;
  }
  return output.trim();
};

const splitCue = (cue, utterance) => {
  const override = overrides.get(cue.id);
  const source = override === undefined || !override.trim() ? cue.text : override;
  const text = cleanText(source);
  const display = correctedTokens(text);
  const rawItems = rawTokens(utterance);
  const mapped = alignTokens(rawItems, display, cue.startMs, cue.endMs);
  const indexed = display.map((token, index) => ({...token, index}));
  const clauses = [];
  let clause = [];
  for (const token of indexed) {
    clause.push(token);
    if (token.breakAfter > 0) {
      clauses.push(clause);
      clause = [];
    }
  }
  if (clause.length) clauses.push(clause);

  const badEnds = new Set(["的", "地", "得", "和", "与", "或", "把", "被", "在", "是", "有", "一个", "这个", "这些", "那些", "进行", "可以", "能够", "需要", "使用", "帮助", "对应", "直接", "包括", "比如", "如果", "因为", "但是", "以及", "然后", "属于"]);
  const badStarts = new Set(["的", "地", "得", "了", "着", "吗", "吧", "以及", "中", "上", "下", "内", "外"]);
  const connectors = new Set(["然后", "但是", "所以", "因为", "包括", "比如", "以及", "或者", "并且", "那么", "如果", "只不过", "当然", "其实", "就是", "也就是", "而且"]);
  const goodEnds = new Set(["时候", "过程", "内容", "问题", "方式", "方法", "结果", "部分", "原因", "地方", "方面", "里面", "以后", "之前", "之后", "一下", "完成", "选择", "使用", "管理", "研究", "复盘", "原则"]);

  const groups = [];
  for (const tokens of clauses) {
    const count = tokens.length;
    const best = new Array(count + 1).fill(Number.POSITIVE_INFINITY);
    const previous = new Array(count + 1).fill(-1);
    best[0] = 0;
    for (let end = 1; end <= count; end++) {
      let width = 0;
      for (let start = end - 1; start >= 0; start--) {
        width += displayWidth(tokens[start]);
        const duration = mapped[tokens[end - 1].index].endMs - mapped[tokens[start].index].startMs;
        if ((width > 24 || duration > 6_500) && start < end - 1) break;
        const segmentLength = end - start;
        let cost = best[start];
        cost += 12;
        cost += Math.pow(width - 14, 2) * 0.08;
        cost += Math.pow((duration / 1000) - 2.8, 2) * 0.35;
        if (width < 5 && count > segmentLength) cost += 10;
        if (end < count) {
          const left = tokens[end - 1].text;
          const right = tokens[end].text;
          const pause = mapped[tokens[end].index].startMs - mapped[tokens[end - 1].index].endMs;
          if (badEnds.has(left)) cost += 35;
          if (badStarts.has(right)) cost += 35;
          if (connectors.has(right)) cost -= 10;
          if (goodEnds.has(left)) cost -= 6;
          if (isAsciiWord(right) && /(?:的|个人|一个|这个|我的|你的|他的)$/u.test(left)) cost += 40;
          cost -= Math.min(12, Math.max(0, pause) / 35);
        }
        if (cost < best[end]) {
          best[end] = cost;
          previous[end] = start;
        }
      }
    }
    if (previous[count] < 0) {
      groups.push(tokens);
      continue;
    }
    const local = [];
    let cursor = count;
    while (cursor > 0) {
      const start = previous[cursor];
      local.push(tokens.slice(start, cursor));
      cursor = start;
    }
    groups.push(...local.reverse());
  }

  const prefixFragments = new Set(["然后", "首先", "这个", "所以", "因为", "但是", "而且", "并且", "那么", "其实", "这里", "下面", "就是"]);
  for (let index = 0; index < groups.length - 1;) {
    const text = joinTokens(groups[index]);
    if (!prefixFragments.has(text)) {
      index += 1;
      continue;
    }
    const merged = [...groups[index], ...groups[index + 1]];
    const width = merged.reduce((sum, token) => sum + displayWidth(token), 0);
    const duration = mapped[merged.at(-1).index].endMs - mapped[merged[0].index].startMs;
    if (width <= 24 && duration <= 6_500) groups.splice(index, 2, merged);
    else index += 1;
  }
  const suffixFragments = new Set(["的话", "之类的"]);
  for (let index = 1; index < groups.length; index++) {
    const text = joinTokens(groups[index]);
    if (!suffixFragments.has(text)) continue;
    const merged = [...groups[index - 1], ...groups[index]];
    const width = merged.reduce((sum, token) => sum + displayWidth(token), 0);
    const duration = mapped[merged.at(-1).index].endMs - mapped[merged[0].index].startMs;
    if (width <= 24 && duration <= 6_500) {
      groups.splice(index - 1, 2, merged);
      index -= 1;
    }
  }

  const output = groups.map((group) => ({
    sourceCue: cue.id,
    startMs: mapped[group[0].index].startMs,
    endMs: mapped[group.at(-1).index].endMs,
    text: joinTokens(group),
  })).filter((item) => item.text && item.endMs > item.startMs);

  if (output.length > 0) {
    output[0].startMs = cue.startMs;
    output.at(-1).endMs = cue.endMs;
    for (let index = 0; index < output.length - 1; index++) {
      const current = output[index];
      const next = output[index + 1];
      const midpoint = Math.round((current.endMs + next.startMs) / 2);
      const boundary = Math.max(current.startMs + 1, Math.min(next.endMs - 1, midpoint));
      current.endMs = boundary;
      next.startMs = boundary;
    }
  }

  return output;
};

const outputCues = correctedCues.flatMap((cue, index) => splitCue(cue, utterances[index]));

const output = outputCues.map((cue, index) => `${index + 1}\n${formatTime(cue.startMs)} --> ${formatTime(cue.endMs)}\n${cue.text}`).join("\n\n") + "\n";
await writeFile(outputPath, output, "utf8");

const durations = outputCues.map((cue) => cue.endMs - cue.startMs);
const widths = outputCues.map((cue) => [...cue.text.replace(/[A-Za-z0-9.+#'’/_:-]+/gu, "AA")].length);
console.log(JSON.stringify({
  inputCueCount: correctedCues.length,
  outputCueCount: outputCues.length,
  overrideCount: overrides.size,
  firstStartMs: outputCues[0]?.startMs,
  lastEndMs: outputCues.at(-1)?.endMs,
  maxDurationMs: Math.max(...durations),
  maxApproxWidth: Math.max(...widths),
}, null, 2));
