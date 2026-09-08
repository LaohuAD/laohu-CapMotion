#!/usr/bin/env node

import {spawnSync} from "node:child_process";
import {readFile, writeFile} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildDisplayCaptionSegments} from "../../../scripts/caption-display-track.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const workRoot = resolve(here, "..");
const asrRoot = join(workRoot, "输入", "ASR");
const analysisRoot = join(workRoot, "分析");
const sourceIndex = JSON.parse(await readFile(join(asrRoot, "source-index.json"), "utf8"));
const raw = JSON.parse(await readFile(join(asrRoot, "cap-asr.raw.json"), "utf8"));

const deletionReasons = new Map([
  [4, "未完成的开场试说，后一句完整重说"], [6, "口误后立即完整重说"],
  [9, "未完成句，后一句完整承接"], [25, "区域讲解的失败起头"],
  [36, "孤立的失败起头"], [38, "时长输入讲解的重复起头"],
  [40, "两阶段采样讲解的重复起头"], [44, "动作清单中的口误问句"],
  [53, "2.0 参数说明的失败起头"], [54, "2.0 参数说明的重复起头"],
  [67, "章节承接的失败起头"], [117, "底模说明的重复起头"],
  [134, "随后立即否定的错误表述"], [135, "随后立即否定的错误表述"],
  [154, "孤立语气词"], [165, "锤子画面解释的未完成句"],
  [176, "提示词原因总结的重复起头"], [179, "数字人章节的悬空起头"],
  [186, "模型选择问题的重复试说"], [193, "模型情绪优点的失败起头"],
  [194, "模型情绪优点的重复失败起头"], [208, "孤立过渡词"],
  [220, "孤立过渡词"], [227, "模型对比的失败起头"],
]);

// 同一条可包含多个保留区间，只裁掉词级时间和上下文都能证明的口吃、语气词或重说。
const retainedSourceRanges = new Map([
  [28, [[262.032, 262.952]]], [42, [[400.592, 405.512]]],
  [59, [[498.972, 503.012]]], [60, [[503.812, 507.052]]],
  [61, [[507.612, 509.812]]], [63, [[523.662, 527.622]]],
  [65, [[537.452, 540.772]]], [90, [[786.002, 787.922]]],
  [99, [[894.402, 896.882], [898.002, 899.842]]],
  [102, [[914.912, 919.032]]], [105, [[933.532, 936.572]]],
  [132, [[1147.042, 1151.962]]], [145, [[1241.882, 1244.202]]],
  [150, [[1291.252, 1296.852]]],
  [184, [[1547.252, 1549.612], [1550.132, 1550.932]]],
  [196, [[1626.902, 1627.662]]], [198, [[1644.702, 1649.902]]],
  [203, [[1680.672, 1683.832]]], [212, [[1740.432, 1742.352]]],
  [216, [[1831.422, 1833.822], [1834.262, 1838.972]]],
  [218, [[1847.372, 1849.572]]],
]);

const protectedVisuals = [
  [0, 4.422, "开头真实结果演示"],
  [1203, 1217.1, "真实结果播放，含系统声音证据"],
  [1237.4, 1247.3, "锤子穿模真实结果，含系统声音证据"],
  [1383.5, 1386.5, "提示词原文证据"], [1398.5, 1401.5, "穿模结果定格证据"],
  [1742.2, 1750.2, "模型对比建立镜头"], [1768, 1773, "模型对比结果 A"],
  [1783, 1788, "模型对比结果 B"], [1888, 1894.2, "下期资产制作预告"],
  [1900.8, 1904, "下期资产画布承接"],
];

const chapterPauseBefore = new Map([
  [13, 0.55], [15, 0.5], [24, 0.45], [30, 0.35], [50, 0.4],
  [68, 0.45], [69, 0.45], [71, 0.35], [77, 0.45], [88, 0.4],
  [94, 0.3], [111, 0.35], [115, 0.3], [139, 0.35], [146, 0.35],
  [178, 0.55], [180, 0.3], [213, 0.55], [215, 0.45], [225, 0.4], [231, 0.45],
]);

const correctionRules = [
  [/Minimax/g, "MiniMax"], [/(一踩|伊采|伊踩|一彩|伊彩)/g, "一采"],
  [/(二踩|二彩|二，采)/g, "二采"], [/西格玛/g, "Sigma"],
  [/Lora/g, "LoRA"], [/双十中/g, "双时钟"], [/浅空间/g, "潜空间"],
  [/伊莱(?=的?Sigma)/g, "一采"], [/画画幅/g, "画幅"], [/来来到/g, "来到"],
  [/表表示/g, "表示"], [/叫好的/g, "较好的"], [/看你这个我整个画面呢/g, "整个画面"],
  [/我最现在/g, "我现在"], [/还要更要更好/g, "还要更好"], [/再再下下期/g, "再下期"],
  [/的这相关的/g, "的相关"], [/这是可能下一期/g, "这可能是下一期"],
];
const correctText = (input) => correctionRules.reduce(
  (text, [pattern, replacement]) => text.replace(pattern, replacement), String(input ?? ""),
);

const isPunctuation = (value) => /^[，。！？；：、,.!?;:\s]+$/u.test(value);
const joinWords = (words) => {
  let text = "";
  for (const word of words) {
    const value = String(word.text ?? "").trim();
    if (!value) continue;
    if (text && /[A-Za-z0-9]$/u.test(text) && /^[A-Za-z0-9]/u.test(value)) text += " ";
    text += value;
  }
  return correctText(text);
};
const validWords = (utterance) => (utterance.words ?? []).filter((word) => {
  const text = String(word.text ?? "").trim();
  return text && !isPunctuation(text)
    && Number.isFinite(word.globalStartMs) && Number.isFinite(word.globalEndMs)
    && word.globalEndMs > word.globalStartMs
    && word.globalStartMs >= utterance.globalStartMs - 500
    && word.globalEndMs <= utterance.globalEndMs + 500;
});

const selectedPieces = [];
const excludedWords = [];
for (const [zeroIndex, utterance] of raw.utterances.entries()) {
  const utteranceId = zeroIndex + 1;
  const words = validWords(utterance);
  if (deletionReasons.has(utteranceId)) {
    excludedWords.push(...words.map((word) => ({utteranceId, reason: deletionReasons.get(utteranceId), ...word})));
    continue;
  }
  const requestedRanges = retainedSourceRanges.get(utteranceId)
    ?? [[utterance.globalStartMs / 1000, utterance.globalEndMs / 1000]];
  const selectedForUtterance = new Set();
  for (const [rangeIndex, [rangeStart, rangeEnd]] of requestedRanges.entries()) {
    const selectedWords = words.filter((word) => word.globalEndMs / 1000 > rangeStart - 1e-6
      && word.globalStartMs / 1000 < rangeEnd + 1e-6);
    if (selectedWords.length === 0) continue;
    selectedWords.forEach((word) => selectedForUtterance.add(word));
    selectedPieces.push({
      utteranceId, rangeIndex, words: selectedWords,
      sourceStart: selectedWords[0].globalStartMs / 1000,
      sourceEnd: selectedWords.at(-1).globalEndMs / 1000,
      text: joinWords(selectedWords), originalText: utterance.text,
    });
  }
  excludedWords.push(...words.filter((word) => !selectedForUtterance.has(word)).map((word) => ({
    utteranceId, reason: "句内可证明的口吃、语气词或被后半句替代的试说", ...word,
  })));
}

const ffmpegBin = process.env.FFMPEG_BIN ?? "/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg";
const detectSilences = (segment) => {
  const result = spawnSync(ffmpegBin, [
    "-hide_banner", "-nostats", "-i", segment.microphonePath,
    "-af", "silencedetect=noise=-35dB:d=0.08", "-f", "null", "-",
  ], {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`silence detection failed for ${segment.microphonePath}`);
  const intervals = [];
  let start = null;
  for (const line of result.stderr.split("\n")) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) start = Number(startMatch[1]);
    const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
    if (endMatch && start !== null) {
      intervals.push({start: segment.globalOffsetSeconds + start, end: segment.globalOffsetSeconds + Number(endMatch[1])});
      start = null;
    }
  }
  return intervals;
};
const silenceIntervals = sourceIndex.segments.flatMap(detectSilences);
const overlapDuration = (aStart, aEnd, bStart, bEnd) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
const silenceRatio = (start, end) => {
  if (end <= start) return 0;
  const covered = silenceIntervals.reduce((sum, silence) => sum + overlapDuration(start, end, silence.start, silence.end), 0);
  return Math.min(1, covered / (end - start));
};
const pauseFor = (previous, next) => {
  if (previous.utteranceId === next.utteranceId) return 0.1;
  if (chapterPauseBefore.has(next.utteranceId)) return chapterPauseBefore.get(next.utteranceId);
  if ([45, 46, 47, 48, 49].includes(next.utteranceId)) return 0.14;
  if (!/[。！？!?]$/u.test(String(previous.originalText ?? ""))) return 0.2;
  return 0.3;
};

const speechRanges = [];
for (const piece of selectedPieces.sort((a, b) => a.sourceStart - b.sourceStart)) {
  const previous = speechRanges.at(-1);
  if (!previous) {
    speechRanges.push({...piece, words: [...piece.words]});
    continue;
  }
  const gap = piece.sourceStart - previous.sourceEnd;
  const desiredPause = pauseFor(previous, piece);
  if (gap <= desiredPause + 0.08 || silenceRatio(previous.sourceEnd, piece.sourceStart) < 0.65) {
    previous.sourceEnd = Math.max(previous.sourceEnd, piece.sourceEnd);
    previous.words.push(...piece.words);
    previous.text += piece.text;
    previous.originalText += piece.originalText;
    previous.utteranceIds = [...new Set([...(previous.utteranceIds ?? [previous.utteranceId]), piece.utteranceId])];
  } else {
    previous.sourceEnd += desiredPause * 0.45;
    speechRanges.push({
      ...piece,
      words: [...piece.words],
      sourceStart: Math.max(previous.sourceEnd, piece.sourceStart - desiredPause * 0.55),
    });
  }
}

const requested = [
  ...speechRanges.map((range) => ({start: range.sourceStart, end: range.sourceEnd, kinds: ["speech"], reasons: [], sourceTexts: [range.text]})),
  ...protectedVisuals.map(([start, end, reason]) => ({start, end, kinds: ["protected-visual"], reasons: [reason], sourceTexts: []})),
].sort((a, b) => a.start - b.start || a.end - b.end);
const merged = [];
for (const range of requested) {
  const previous = merged.at(-1);
  if (previous && range.start <= previous.end + 1e-6) {
    previous.end = Math.max(previous.end, range.end);
    previous.kinds = [...new Set([...previous.kinds, ...range.kinds])];
    previous.reasons.push(...range.reasons);
    previous.sourceTexts.push(...range.sourceTexts);
  } else merged.push(structuredClone(range));
}

const recordingWindows = sourceIndex.segments.map((segment, index) => ({
  recordingSegment: segment.recordingSegment,
  globalStart: segment.globalOffsetSeconds,
  globalEnd: segment.globalOffsetSeconds + sourceIndex.timeline[index].end,
}));
let targetCursor = 0;
const sequence = [];
for (const range of merged) {
  for (const window of recordingWindows) {
    const sourceGlobalStart = Math.max(range.start, window.globalStart);
    const sourceGlobalEnd = Math.min(range.end, window.globalEnd);
    if (sourceGlobalEnd <= sourceGlobalStart) continue;
    const sourceStart = sourceGlobalStart - window.globalStart;
    const sourceEnd = sourceGlobalEnd - window.globalStart;
    const duration = sourceEnd - sourceStart;
    sequence.push({
      index: sequence.length + 1, recordingSegment: window.recordingSegment,
      sourceStart, sourceEnd, sourceGlobalStart, sourceGlobalEnd,
      targetStart: targetCursor, targetEnd: targetCursor + duration,
      kinds: range.kinds, reasons: range.reasons, sourceText: range.sourceTexts.join(""),
    });
    targetCursor += duration;
  }
}

const mapSourceRange = (sourceStart, sourceEnd) => sequence.flatMap((range) => {
  const overlapStart = Math.max(sourceStart, range.sourceGlobalStart);
  const overlapEnd = Math.min(sourceEnd, range.sourceGlobalEnd);
  if (overlapEnd <= overlapStart) return [];
  return [{
    sourceStart: overlapStart, sourceEnd: overlapEnd,
    targetStart: range.targetStart + overlapStart - range.sourceGlobalStart,
    targetEnd: range.targetStart + overlapEnd - range.sourceGlobalStart,
  }];
});

// ASR 偶尔会返回起止时码和文本完全相同的重复句。这是识别产物重复，
// 不是用户在原音中说了两遍；如果不在源时间权威处去重，映射后会产生重叠字幕。
const uniqueCaptionUtterances = new Map();
for (const piece of selectedPieces) {
  const key = `${piece.sourceStart.toFixed(3)}:${piece.sourceEnd.toFixed(3)}:${piece.text}`;
  if (!uniqueCaptionUtterances.has(key)) {
    uniqueCaptionUtterances.set(key, {
      text: piece.text, words: piece.words,
      globalStartMs: piece.sourceStart * 1000, globalEndMs: piece.sourceEnd * 1000,
    });
  }
}
const selectedCaptionUtterances = [...uniqueCaptionUtterances.values()];
const sourceCaptions = buildDisplayCaptionSegments(selectedCaptionUtterances, {
  correctText, minChars: 8, maxChars: 18, maxDurationSeconds: 4,
});
const displayText = (text) => correctText(text)
  .replace(/[，。！？；：、,!?;:]/gu, "")
  .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, "$1")
  .replace(/\s{2,}/gu, " ").trim();
const mappedCaptions = sourceCaptions.flatMap((caption) => mapSourceRange(caption.start, caption.end).flatMap((mapped, index) => {
  const words = (caption.words ?? []).filter((word) => word.end > mapped.sourceStart && word.start < mapped.sourceEnd);
  if (words.length === 0) return [];
  const sourceWordStart = Math.max(mapped.sourceStart, words[0].start);
  const sourceWordEnd = Math.min(mapped.sourceEnd, words.at(-1).end);
  return [{
    id: index === 0 ? caption.id : `${caption.id}::edl${index}`,
    start: mapped.targetStart + sourceWordStart - mapped.sourceStart,
    end: mapped.targetStart + sourceWordEnd - mapped.sourceStart,
    text: displayText(joinWords(words)),
    words: [],
  }];
})).filter((caption) => caption.text && caption.end > caption.start)
  .sort((a, b) => a.start - b.start || a.end - b.end);
const finalCaptionKeys = new Set();
const finalCaptions = mappedCaptions.filter((caption) => {
  const key = `${caption.start.toFixed(3)}:${caption.end.toFixed(3)}:${caption.text}`;
  if (finalCaptionKeys.has(key)) return false;
  finalCaptionKeys.add(key);
  return true;
});
const finalForwardFragment = /^(?:然后|所以|但是|如果|他|她|它|我拿|放到|参考图|正常的)/u;
for (let index = 0; index < finalCaptions.length; index += 1) {
  const current = finalCaptions[index];
  if ([...current.text].length >= 4) continue;
  const previous = finalCaptions[index - 1];
  const next = finalCaptions[index + 1];
  const canMerge = (left, right) => left && right && right.start - left.end <= 0.6
    && [...`${left.text}${right.text}`].length <= 19 && right.end - left.start <= 5.2;
  if ((finalForwardFragment.test(current.text) || !previous) && canMerge(current, next)) {
    current.text = `${current.text}${next.text}`;
    current.end = next.end;
    finalCaptions.splice(index + 1, 1);
    index -= 1;
  } else if (canMerge(previous, current)) {
    previous.text = `${previous.text}${current.text}`;
    previous.end = current.end;
    finalCaptions.splice(index, 1);
    index -= 2;
  } else if (canMerge(current, next)) {
    current.text = `${current.text}${next.text}`;
    current.end = next.end;
    finalCaptions.splice(index + 1, 1);
    index -= 1;
  }
}
finalCaptions.forEach((caption, index) => { caption.id = `final-caption-${index + 1}`; });
for (let index = 0; index < finalCaptions.length - 1; index += 1) {
  if (finalCaptions[index].end > finalCaptions[index + 1].start) finalCaptions[index].end = finalCaptions[index + 1].start;
}

const keptWords = selectedPieces.flatMap((piece) => piece.words);
const uncoveredWords = keptWords.filter((word) => !sequence.some((range) =>
  word.globalEndMs / 1000 > range.sourceGlobalStart && word.globalStartMs / 1000 < range.sourceGlobalEnd,
));
if (uncoveredWords.length) throw new Error(`content preservation failed: ${JSON.stringify(uncoveredWords.slice(0, 12))}`);

const edl = {
  schema: "laohu.cap-edl/1", purpose: "second-pass-postproduction",
  sourceProjectPath: sourceIndex.projectPath, sourceProjectRevision: sourceIndex.projectRevision,
  sourceTimeAuthority: join(asrRoot, "cap-asr.raw.json"),
  editPolicy: "semantic duplicate removal plus waveform-confirmed context-sensitive pause compression",
  deletions: [...deletionReasons].map(([utteranceId, reason]) => ({utteranceId, reason})),
  partialRetentions: Object.fromEntries(retainedSourceRanges),
  protectedVisuals: protectedVisuals.map(([start, end, reason]) => ({start, end, reason})),
  pausePolicy: {
    correctionSeamSeconds: 0.1, listItemSeconds: 0.14, clauseContinuationSeconds: 0.2,
    sentenceBoundarySeconds: 0.3, chapterBoundarySeconds: "0.3-0.55",
    waveformRule: "compress only when at least 65% of the candidate gap is below -35dB",
  },
  sequence, expectedDurationSeconds: targetCursor,
};
const mapping = {
  schema: "laohu.source-to-final-map/1", purpose: "second-pass-final-timeline-authority",
  sourceProjectPath: sourceIndex.projectPath, sourceProjectRevision: sourceIndex.projectRevision,
  finalDurationSeconds: targetCursor,
  sequence: sequence.map(({index, recordingSegment, sourceStart, sourceEnd, sourceGlobalStart, sourceGlobalEnd, targetStart, targetEnd}) => ({
    index, recordingSegment, sourceStart, sourceEnd, sourceGlobalStart, sourceGlobalEnd, targetStart, targetEnd,
  })),
};
const captionImport = {
  schema: "laohu.cap-captions-import/1", sourceTimed: true, language: "zh-CN",
  sourceProjectRevision: sourceIndex.projectRevision, segments: sourceCaptions,
};

const pad = (value, size = 2) => String(value).padStart(size, "0");
const srtTime = (seconds) => {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  return `${pad(Math.floor(totalMs / 3600000))}:${pad(Math.floor((totalMs % 3600000) / 60000))}:${pad(Math.floor((totalMs % 60000) / 1000))},${pad(totalMs % 1000, 3)}`;
};
const makeSrt = (segments) => `${segments.map((segment, index) =>
  `${index + 1}\n${srtTime(segment.start)} --> ${srtTime(segment.end)}\n${segment.text}`,
).join("\n\n")}\n`;
const correctionRecord = `# 字幕修正记录\n\n- 术语统一：MiniMax、Sigma、Latent、LoRA、一采、二采、双时钟、潜空间。\n- 展示字幕删除停顿标点，保留小数点、版本号和英文词义符号。\n- 已随音视频一并删除：失败起头、紧邻自我纠正、独立语气词和可证明的重复试说。\n- 句内文字只清理明确口吃，不把老胡的个人表达改成另一篇文稿。\n- 中文词级 token 重新拼接时不插入字符空格。\n`;
const doubtList = `# 字幕疑难清单\n\n以下内容证据不足，当前保留接近原声的写法，不凭上下文硬猜：\n\n1. 源时码 00:04.422：\`C012\` 的准确模型名称与版本。\n2. 源时码 12:30.992：一采 Sigma 起止值，ASR 把关键数字识别成“4不到了0.2 / 9231”，需结合节点画面回听。\n3. 源时码 17:46.622—18:12.872：融合模型的层数与具体模型名。\n4. 源时码 25:38.792：数字人章节“两个 c 个码”的准确节点名称。\n5. 源时码 32:09.792：对比模型名称，当前 ASR 为“C零十二点五 / One三 / MiniMax X三”。\n`;

await Promise.all([
  writeFile(join(here, "final.edl.json"), `${JSON.stringify(edl, null, 2)}\n`),
  writeFile(join(here, "source-to-final.json"), `${JSON.stringify(mapping, null, 2)}\n`),
  writeFile(join(here, "captions.source-corrected.import.json"), `${JSON.stringify(captionImport, null, 2)}\n`),
  writeFile(join(here, "captions.source-corrected.srt"), makeSrt(sourceCaptions)),
  writeFile(join(here, "captions.final-corrected.srt"), makeSrt(finalCaptions)),
  writeFile(join(here, "captions.final-track.json"), `${JSON.stringify({schema: "laohu.cap-caption-track/1", segments: finalCaptions}, null, 2)}\n`),
  writeFile(join(here, "caption-corrections.json"), `${JSON.stringify({rules: correctionRules.map(([pattern, replacement]) => ({pattern: String(pattern), replacement}))}, null, 2)}\n`),
  writeFile(join(here, "content-preservation-audit.json"), `${JSON.stringify({
    status: "PASS", totalRecognizedWords: raw.utterances.reduce((sum, utterance) => sum + validWords(utterance).length, 0),
    keptWords: keptWords.length, explicitlyRemovedWords: excludedWords.length, uncoveredKeptWords: [],
  }, null, 2)}\n`),
  writeFile(join(analysisRoot, "字幕修正记录.md"), correctionRecord),
  writeFile(join(analysisRoot, "字幕疑难清单.md"), doubtList),
]);

console.log(JSON.stringify({
  sourceUtterances: raw.utterances.length, deletedUtterances: deletionReasons.size,
  partialUtterances: retainedSourceRanges.size, keptWords: keptWords.length, removedWords: excludedWords.length,
  timelineSegments: sequence.length, expectedDurationSeconds: targetCursor,
  sourceCaptionSegments: sourceCaptions.length, finalCaptionSegments: finalCaptions.length,
}, null, 2));
