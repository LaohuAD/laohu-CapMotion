import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectDir = path.resolve(import.meta.dirname, '..');
const sourcePath = '/Users/a1/Movies/codex的使用.mp4';
const rawPath = path.join(projectDir, '输入', 'Codex的使用.raw.json');
const srtPath = path.join(projectDir, '输入', 'Codex的使用.srt');
const analysisDir = path.join(projectDir, '分析');
const outputDir = path.dirname(sourcePath);
const tempRoot = '/tmp/laohu_014_render';
const silenceLogPath = '/tmp/laohu_014_silence.log';
const sourceDuration = 3565.833333;
const breath = 0.025;
const fps = 30;
const sampleRate = 48000;
const samplesPerFrame = sampleRate / fps;

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const cues = raw.result.utterances.map((cue, index) => ({
  id: index + 1,
  start: cue.start_time / 1000,
  end: cue.end_time / 1000,
  text: cue.text,
  words: (cue.words ?? [])
    .map((word) => ({text: word.text, start: word.start_time / 1000, end: word.end_time / 1000}))
    .filter((word) => word.start >= 0 && word.end > word.start),
}));

const manualRepairExclusions = [
  {range: [33.24, 33.60], reason: '删除“大大多数”中重复的第一个“大”'},
  {range: [174.71, 176.15], reason: '删除“你就差就”的废弃试说'},
  {range: [292.35, 293.15], reason: '删除“点击”前重复的“点”'},
  {range: [364.25, 366.57], reason: '删除个人 Agent 句子的第一次错误起头'},
  {range: [449.00, 450.71], reason: '删除“你可以增”的中断版本'},
  {range: [1338.45, 1340.65], reason: '删除“我们就拿栋哥的这两”的第一次重复'},
  {range: [1393.75, 1393.99], reason: '删除连续重复的第一个“这个”'},
  {range: [1488.19, 1490.95], reason: '删除“有一个十个”的错误起头'},
  {range: [1676.69, 1677.91], reason: '删除“你你我我”的错误重说'},
  {range: [1755.54, 1755.66], reason: '删除“豆豆包”中重复的第一个“豆”'},
  {range: [1843.13, 1844.20], reason: '删除“我是我觉得”的废弃起头'},
  {range: [2055.46, 2057.02], reason: '删除句尾“以及呢我会落”的中断版本'},
  {range: [2173.72, 2174.04], reason: '删除讨论过程中的独立“呃”'},
  {range: [2251.10, 2251.24], reason: '删除“只只是”中重复的第一个“只”'},
  {range: [2309.20, 2309.56], reason: '删除“再再下面”中重复的第一个“再”'},
  {range: [2354.20, 2354.68], reason: '删除可安全分离的独立“嗯”'},
  {range: [2470.14, 2470.42], reason: '删除项目介绍中的独立“呃”'},
  {range: [2533.95, 2534.95], reason: '删除“这个呢就是”的第一次重复'},
  {range: [2648.11, 2649.19], reason: '删除“真正争论的”的第一次重复'},
  {range: [2739.93, 2741.61], reason: '删除“你没有明白”的第一次重复'},
  {range: [2768.20, 2769.00], reason: '删除“不知道大家”的第一次错误起头'},
  {range: [2775.24, 2776.68], reason: '删除“说的都是人话”后的再次重复'},
  {range: [2828.30, 2829.10], reason: '删除“我去我用”的错误起头'},
  {range: [2896.24, 2897.16], reason: '删除“大家感”的第一次中断版本'},
  {range: [2961.14, 2961.90], reason: '删除“然后直接”的悬空句尾'},
  {range: [2962.26, 2963.26], reason: '删除“我基本上”的第一次重复'},
  {range: [3039.82, 3040.18], reason: '删除“这么这么多”中重复的第一个“这么”'},
  {range: [3060.22, 3061.14], reason: '删除“那么选题就”的第一次重复'},
  {range: [3204.67, 3204.75], reason: '删除“的的”中重复的第一个“的”'},
  {range: [3241.02, 3243.30], reason: '删除“跟他几张”的识别错误和废弃试说'},
  {range: [3486.38, 3487.34], reason: '删除“给它给它”中重复的第一次'},
  {range: [3559.30, 3559.46], reason: '删除“我我一讲”中重复的第一个“我”'},
  {range: [342.782, 342.816], reason: '删除个人 Agent 段落前的无语义短碎片'},
  {range: [354.061, 355.243], reason: '删除“AI 的整桌等”剪口残留'},
  {range: [364.224, 366.57], reason: '扩展个人 Agent 错误起头的删除边界，避免残留碎音'},
  {range: [514.614, 514.706], reason: '删除老胡文稿介绍前的无语义短碎片'},
  {range: [525.807, 526.356], reason: '删除“Agent 赶上”剪口残留 1'},
  {range: [530.269, 530.376], reason: '删除“Agent 赶上”剪口残留 2'},
  {range: [533.461, 533.576], reason: '删除“Agent 赶上”剪口残留 3'},
  {range: [536.165, 536.264], reason: '删除“Agent 赶上”剪口残留 4'},
  {range: [538.731, 538.876], reason: '删除“Agent 赶上”剪口残留 5'},
  {range: [551.000, 551.196], reason: '删除“下正后”剪口残留'},
  {range: [2178.860, 2179.046], reason: '删除选题句中“普”字剪口残留 1'},
  {range: [2181.634, 2181.666], reason: '删除选题句中“普”字剪口残留 2'},
  {range: [2182.858, 2183.064], reason: '删除选题句中“普”字剪口残留 3'},
  {range: [2176.12, 2183.63], reason: '删除“迸发出来了这样的一个”的第一次废弃起头及其后残留，只保留完整重说版本'},
];

const commonCueExclusions = [
  8, 26, 27, 40, 74, 94, 144, 154, 158, 170, 175, 177, 188, 208, 225, 232, 244, 293, 298, 328, 334,
];

const preciseSections = [
  {
    chapter: '01 安装前提与 Agent 定义', firstCue: 1, lastCue: 23,
    reason: '建立使用前提、替代工具和个人 Agent 的基本概念',
    excludedCueIds: [2, 3, 4, 13, 14],
  },
  {
    chapter: '02 创建属于自己的个人 Agent', firstCue: 24, lastCue: 62,
    reason: '说明共享 Agent 与个人 Agent 的区别，以及为什么需要长期打磨自己的 Agent',
    excludedCueIds: [56, 57, 58, 59, 60, 61, 62],
  },
  {
    chapter: '03 老胡文稿、内容观与自进化', firstCue: 63, lastCue: 136,
    reason: '用真实个人 Agent 展示能力、内容观、工作流和持续自进化',
  },
  {
    chapter: '04 外部输入到本地知识库', firstCue: 137, lastCue: 186,
    reason: '建立外部材料、文字识别、分析讨论和本地沉淀的完整闭环',
  },
  {
    chapter: '05 豆包输入法与分析提示词', firstCue: 187, lastCue: 223,
    reason: '演示第二种转文字路径，并把两份文稿交给 AI 进行结构分析',
  },
  {
    chapter: '06 本地项目、自进化与话题放大', firstCue: 224, lastCue: 248,
    reason: '说明本地项目如何保存上下文，以及个人 Agent 如何把教程话题提升为更大的内容主题',
  },
  {
    chapter: '07 质疑浅层回答与 skill 调用', firstCue: 249, lastCue: 315,
    reason: '展示不接受浅层输出、继续争论和调用 skill 深化内容的方法',
    excludedCueIds: [275],
  },
  {
    chapter: '08 解释一下与说人话的长期调教', firstCue: 316, lastCue: 351,
    reason: '保留通俗解释方法、长期表达调教和个人思维性格',
    excludedCueIds: [351],
  },
  {
    chapter: '09 选题案例与方法收束', firstCue: 352, lastCue: 387,
    reason: '把前述方法落到选题定义、个人痛点和内容方向的实际案例',
  },
  {
    chapter: '10 AI 剪辑闭环与结尾', firstCue: 388, lastCue: 404,
    reason: '总结 AI 介入粗剪、精剪和语序检查的个人工作流，并保留自然告别',
    excludedCueIds: [399, 400, 401, 402],
    excludedRanges: [[3509.43, 3559.23]],
  },
];

const omittedPreciseSections = [
  {cueIds: [2, 3, 4, 13, 14], reason: '训练营和头像引导属于弱推广支线，不服务本条教程主线'},
  {cueIds: [56, 57, 58, 59, 60, 61, 62], reason: '点赞、弹幕和下一期预告中重复试说较多，压缩为当前 Agent 方法主线'},
  {cueIds: [275], reason: '对自己正在说口水话的过程性说明，没有新增知识'},
  {cueIds: [351], reason: '不承担信息的“继续看吧”过渡'},
  {cueIds: [399, 400, 401, 402], reason: '结尾临时检查 GitHub 但没有形成有效结论，直接接回人格化告别'},
  {sourceRange: [3509.43, 3559.23], reason: '保留“可以再演示怎么做”，删除其后 GitHub 检查及剪口间残留声音，直接接人格化告别'},
];

const mergeRanges = (ranges, maxGap = 0.100001) => {
  const sorted = ranges
    .map(([start, end]) => [Math.max(0, start), Math.min(sourceDuration, end)])
    .filter(([start, end]) => end - start >= 0.02)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (!last || range[0] - last[1] > maxGap) merged.push([...range]);
    else last[1] = Math.max(last[1], range[1]);
  }
  return merged;
};

const quantizeRangesToFrames = (ranges) => mergeRanges(
  ranges
    .map(([start, end]) => [Math.round(start * fps) / fps, Math.round(end * fps) / fps])
    .filter(([start, end]) => end - start >= 1 / fps),
  0,
);

const subtractRanges = (range, exclusions) => {
  let pieces = [range];
  for (const [excludeStart, excludeEnd] of exclusions) {
    const next = [];
    for (const [start, end] of pieces) {
      if (excludeEnd <= start || excludeStart >= end) next.push([start, end]);
      else {
        if (excludeStart - start >= 0.02) next.push([start, excludeStart]);
        if (end - excludeEnd >= 0.02) next.push([excludeEnd, end]);
      }
    }
    pieces = next;
    if (!pieces.length) break;
  }
  return pieces;
};

const cueRange = (id) => [
  Math.max(0, cues[id - 1].start - 0.015),
  Math.min(sourceDuration, cues[id - 1].end + 0.015),
];

const safeFillerExclusions = () => {
  const fillerSet = new Set(['嗯', '呃', '额', '啊', '哎', '哦']);
  const words = cues.flatMap((cue) => cue.words).sort((a, b) => a.start - b.start);
  const output = [];
  words.forEach((word, index) => {
    if (!fillerSet.has(word.text) || word.end - word.start > 0.36) return;
    const previous = words[index - 1];
    const next = words[index + 1];
    const gapBefore = previous ? word.start - previous.end : word.start;
    const gapAfter = next ? next.start - word.end : sourceDuration - word.end;
    if (gapBefore >= 0.07 && gapAfter >= 0.07) {
      output.push({
        range: [Math.max(0, word.start - 0.018), Math.min(sourceDuration, word.end + 0.018)],
        reason: `删除可从词边界安全分离的独立语气词“${word.text}”`,
      });
    }
  });
  return output;
};

const parseSilence = () => {
  if (!fs.existsSync(silenceLogPath)) {
    const result = spawnSync('ffmpeg', [
      '-hide_banner', '-nostats', '-i', sourcePath, '-vn',
      '-af', 'silencedetect=noise=-45dB:d=0.1', '-f', 'null', '-',
    ], {encoding: 'utf8'});
    fs.writeFileSync(silenceLogPath, result.stderr);
    if (result.status !== 0) throw new Error('silencedetect failed');
  }
  const silence = [];
  let start = null;
  for (const line of fs.readFileSync(silenceLogPath, 'utf8').split('\n')) {
    const startMatch = line.match(/silence_start: ([\d.]+)/);
    if (startMatch) start = Number(startMatch[1]);
    const endMatch = line.match(/silence_end: ([\d.]+)/);
    if (endMatch && start !== null) {
      silence.push([start, Number(endMatch[1])]);
      start = null;
    }
  }
  return silence;
};

const complement = (ranges) => {
  const output = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) output.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < sourceDuration) output.push([cursor, sourceDuration]);
  return output;
};

const overlapCues = (start, end) => cues.filter((cue) => cue.end > start && cue.start < end);

const annotateSegments = (ranges, chapter, reason, targetStart) => {
  let target = targetStart;
  return ranges.map(([sourceStart, sourceEnd]) => {
    const related = overlapCues(sourceStart, sourceEnd);
    const duration = sourceEnd - sourceStart;
    const segment = {
      sourceStart,
      sourceEnd,
      targetStart: target,
      targetEnd: target + duration,
      duration,
      chapter,
      reason,
      cueIds: related.map((cue) => cue.id),
      sourceText: related.map((cue) => cue.text).join(' '),
    };
    target += duration;
    return segment;
  });
};

const allRepairExclusions = () => [
  ...manualRepairExclusions,
  ...commonCueExclusions.map((id) => ({range: cueRange(id), reason: `删除字幕 ${id} 的废弃起头、残句或相邻重复`})),
  ...safeFillerExclusions(),
];

const activeRanges = () => {
  const silence = parseSilence();
  const active = complement(silence).map(([start, end]) => [start - breath, end + breath]);
  const exclusions = mergeRanges(allRepairExclusions().map((item) => item.range), 0.01);
  return mergeRanges(active).flatMap((range) => subtractRanges(range, exclusions));
};

const cueWindow = (firstCue, lastCue) => [
  Math.max(0, cues[firstCue - 1].start - breath),
  Math.min(sourceDuration, cues[lastCue - 1].end + breath),
];

const clipRanges = (ranges, [windowStart, windowEnd], cueExclusions = [], rangeExclusions = []) => {
  const exclusions = [...cueExclusions.map(cueRange), ...rangeExclusions];
  return ranges.flatMap(([start, end]) => {
    const clipped = [Math.max(start, windowStart), Math.min(end, windowEnd)];
    if (clipped[1] - clipped[0] < 0.02) return [];
    return subtractRanges(clipped, exclusions);
  });
};

const createEdl = () => {
  fs.mkdirSync(analysisDir, {recursive: true});
  const baseRanges = activeRanges();
  const repairExclusions = allRepairExclusions();

  const roughSegments = annotateSegments(
    quantizeRangesToFrames(baseRanges),
    '原始顺序',
    '保留全部有效内容，把无讲话间隔压缩至约 0.05 秒，并删除可可靠分离的废弃试说、重复和语气词',
    0,
  ).map((segment, index) => ({index: index + 1, ...segment}));

  const preciseSegments = [];
  let target = 0;
  for (const section of preciseSections) {
    const ranges = quantizeRangesToFrames(clipRanges(
      baseRanges,
      cueWindow(section.firstCue, section.lastCue),
      section.excludedCueIds ?? [],
      section.excludedRanges ?? [],
    ));
    const annotated = annotateSegments(ranges, section.chapter, section.reason, target);
    preciseSegments.push(...annotated);
    target = preciseSegments.at(-1)?.targetEnd ?? target;
  }
  preciseSegments.forEach((segment, index) => { segment.index = index + 1; });

  const common = {
    generatedAt: new Date().toISOString(),
    sourcePath,
    rawAsrPath: rawPath,
    srtPath,
    sourceDuration,
    silenceThreshold: '-45dB / 0.1s',
    retainedBreathSecondsPerSide: breath,
    repairExclusions,
    personalImagePolicy: '保留性格、内容观、真实实践和个人工作方式；只修剪其中可分离的口水词与重复',
  };
  const rough = {
    ...common,
    editType: 'rough',
    ordering: 'original',
    segmentCount: roughSegments.length,
    targetEstimatedDuration: roughSegments.at(-1)?.targetEnd ?? 0,
    segments: roughSegments,
  };
  const precise = {
    ...common,
    editType: 'precise',
    ordering: 'original chapter order; no forced reordering',
    preciseSections,
    omittedPreciseSections,
    segmentCount: preciseSegments.length,
    targetEstimatedDuration: preciseSegments.at(-1)?.targetEnd ?? 0,
    segments: preciseSegments,
  };
  fs.writeFileSync(path.join(analysisDir, '粗剪辑清单.json'), `${JSON.stringify(rough, null, 2)}\n`);
  fs.writeFileSync(path.join(analysisDir, '精剪辑清单.json'), `${JSON.stringify(precise, null, 2)}\n`);
  console.log(`粗剪: ${rough.segmentCount} segments, ${rough.targetEstimatedDuration.toFixed(3)} seconds`);
  console.log(`精剪: ${precise.segmentCount} segments, ${precise.targetEstimatedDuration.toFixed(3)} seconds`);
};

const chunkSegments = (segments) => {
  const chunks = [];
  let current = [];
  for (const segment of segments) {
    const previous = current.at(-1);
    const backwardsJump = previous && segment.sourceStart + 0.001 < previous.sourceStart;
    const spanStart = current.length ? Math.min(...current.map((item) => item.sourceStart), segment.sourceStart) : segment.sourceStart;
    const spanEnd = current.length ? Math.max(...current.map((item) => item.sourceEnd), segment.sourceEnd) : segment.sourceEnd;
    if (current.length >= 55 || backwardsJump || spanEnd - spanStart > 260) {
      chunks.push(current);
      current = [];
    }
    current.push(segment);
  }
  if (current.length) chunks.push(current);
  return chunks;
};

const normalizeTimestamps = (outputPath) => {
  const normalizedPath = outputPath.replace(/\.mp4$/, '.timestamps.mp4');
  const result = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', '-i', outputPath,
    '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy',
    '-bsf:v', 'setts=pts=PTS-STARTPTS:dts=DTS-STARTDTS',
    '-tag:v', 'hvc1', '-movflags', '+faststart', normalizedPath,
  ], {stdio: 'inherit'});
  if (result.status !== 0) throw new Error('timestamp normalization failed');
  fs.renameSync(normalizedPath, outputPath);
};

const normalizeAudio = (inputPath, outputPath) => {
  const firstPass = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', inputPath, '-vn',
    '-af', 'loudnorm=I=-16:LRA=7:TP=-1.5:print_format=json', '-f', 'null', '-',
  ], {encoding: 'utf8', maxBuffer: 20 * 1024 * 1024});
  if (firstPass.status !== 0) throw new Error('loudness analysis failed');
  const matches = firstPass.stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!matches?.length) throw new Error('loudness statistics not found');
  const stats = JSON.parse(matches.at(-1));
  const loudnorm = [
    'loudnorm=I=-16:LRA=7:TP=-1.5',
    `measured_I=${stats.input_i}`,
    `measured_LRA=${stats.input_lra}`,
    `measured_TP=${stats.input_tp}`,
    `measured_thresh=${stats.input_thresh}`,
    `offset=${stats.target_offset}`,
    'linear=true',
    'print_format=summary',
  ].join(':');
  const secondPass = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
    '-af', loudnorm, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-tag:v', 'hvc1', '-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', outputPath,
  ], {stdio: 'inherit'});
  if (secondPass.status !== 0) throw new Error('loudness normalization failed');
  normalizeTimestamps(outputPath);
};

const render = (kind) => {
  const label = kind === 'rough' ? '粗' : '精';
  const edlPath = path.join(analysisDir, `${label}剪辑清单.json`);
  if (!fs.existsSync(edlPath)) createEdl();
  const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
  const workDir = path.join(tempRoot, kind);
  const partsDir = path.join(workDir, 'parts');
  fs.rmSync(workDir, {recursive: true, force: true});
  fs.mkdirSync(partsDir, {recursive: true});
  fs.mkdirSync(outputDir, {recursive: true});

  const chunks = chunkSegments(edl.segments);
  console.log(`${label}剪: rendering ${chunks.length} batches`);
  chunks.forEach((segments, batchIndex) => {
    const minStart = Math.min(...segments.map((segment) => segment.sourceStart));
    const maxEnd = Math.max(...segments.map((segment) => segment.sourceEnd));
    const seekFrame = Math.max(0, Math.floor(minStart * fps) - 15);
    const endFrame = Math.min(Math.round(sourceDuration * fps), Math.ceil(maxEnd * fps) + 15);
    const seekStart = seekFrame / fps;
    const seekEnd = endFrame / fps;
    const splitVideo = segments.map((_, index) => `[v${index}]`).join('');
    const splitAudio = segments.map((_, index) => `[a${index}]`).join('');
    const filters = [
      `[0:v]split=${segments.length}${splitVideo}`,
      `[0:a]asplit=${segments.length}${splitAudio}`,
    ];
    const concatInputs = [];
    segments.forEach((segment, index) => {
      const startFrame = Math.round(segment.sourceStart * fps) - seekFrame;
      const segmentEndFrame = Math.round(segment.sourceEnd * fps) - seekFrame;
      const startSample = startFrame * samplesPerFrame;
      const endSample = segmentEndFrame * samplesPerFrame;
      filters.push(`[v${index}]trim=start_frame=${startFrame}:end_frame=${segmentEndFrame},setpts=PTS-STARTPTS[vt${index}]`);
      filters.push(`[a${index}]atrim=start_sample=${startSample}:end_sample=${endSample},asetpts=PTS-STARTPTS[at${index}]`);
      concatInputs.push(`[vt${index}][at${index}]`);
    });
    filters.push(`${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[vout][aout]`);
    const filterPath = path.join(workDir, `batch_${String(batchIndex).padStart(3, '0')}.filter`);
    const partPath = path.join(partsDir, `part_${String(batchIndex).padStart(3, '0')}.mkv`);
    fs.writeFileSync(filterPath, filters.join(';\n'));
    const result = spawnSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'warning',
      '-ss', seekStart.toFixed(6), '-t', (seekEnd - seekStart).toFixed(6), '-i', sourcePath,
      '-filter_complex_script', filterPath,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'hevc_videotoolbox', '-b:v', kind === 'rough' ? '3200k' : '3600k',
      '-maxrate', kind === 'rough' ? '4400k' : '4800k', '-bufsize', '9600k',
      '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
      '-c:a', 'pcm_s16le', '-ar', String(sampleRate), '-ac', '2', partPath,
    ], {stdio: 'inherit'});
    if (result.status !== 0) throw new Error(`render failed at batch ${batchIndex}`);
    console.log(`${label}剪 batch ${batchIndex + 1}/${chunks.length}`);
  });

  const listPath = path.join(workDir, 'parts.txt');
  const partFiles = fs.readdirSync(partsDir).filter((name) => name.endsWith('.mkv')).sort();
  fs.writeFileSync(listPath, `${partFiles.map((name) => `file '${path.join(partsDir, name).replaceAll("'", "'\\''")}'`).join('\n')}\n`);
  const assembledPath = path.join(workDir, 'assembled.mkv');
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', assembledPath,
  ], {stdio: 'inherit'});
  const outputPath = path.join(outputDir, kind === 'precise' ? 'codex的使用_成片.mp4' : 'codex的使用_粗剪.mp4');
  normalizeAudio(assembledPath, outputPath);
  fs.rmSync(workDir, {recursive: true, force: true});
  console.log(outputPath);
};

const command = process.argv[2] ?? 'prepare';
if (command === 'prepare') createEdl();
else if (command === 'rough') render('rough');
else if (command === 'precise') render('precise');
else throw new Error('usage: node render.mjs [prepare|rough|precise]');
