import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectDir = path.resolve(import.meta.dirname, '..');
const sourcePath = '/Users/a1/Movies/影视剧资产的构建.mp4';
const rawPath = path.join(projectDir, '输入', '影视剧资产的构建.raw.json');
const srtPath = path.join(projectDir, '输入', '影视剧资产的构建.srt');
const analysisDir = path.join(projectDir, '分析');
const outputDir = path.dirname(sourcePath);
const tempRoot = '/tmp/laohu_013_render';
const silenceLogPath = '/tmp/laohu_013_silence.log';
const sourceDuration = 840.866667;
const breath = 0.025;

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const cues = raw.result.utterances.map((cue, index) => ({
  id: index + 1,
  start: cue.start_time / 1000,
  end: cue.end_time / 1000,
  text: cue.text,
}));

const repairExclusions = [
  {range: [51.55, 53.51], reason: '删除“发现使用这个音频”的废弃试说'},
  {range: [88.33, 89.73], reason: '删除“做了一个测”的废弃起头'},
  {range: [260.84, 261.32], reason: '删除重复的第一个“识别”'},
  {range: [265.03, 265.23], reason: '删除独立废弃起头“那”'},
  {range: [280.79, 281.15], reason: '删除“穿上对左边”中的口误“对”'},
  {range: [285.51, 286.23], reason: '删除“我就要叫”的废弃试说'},
  {range: [300.93, 301.05], reason: '删除“或或者”中的第一个“或”'},
  {range: [388.04, 394.08], reason: '删除“各种服嗯”的中断版本并接回完整解释'},
  {range: [412.70, 416.94], reason: '删除中断的“戴一些”，接回“戴一些首饰”'},
  {range: [449.67, 451.59], reason: '删除模型名之前的废弃起头'},
  {range: [536.61, 538.69], reason: '删除场景资产段落重复的前置主语'},
  {range: [543.53, 574.91], reason: '保留第一次完整的“就是场景资产”，删除其后的“其实”和第二次重复主语，直接接“现在有一个理论”'},
  {range: [638.13, 644.29], reason: '删除第一次不完整的群像定义，保留后一次完整版本'},
  {range: [717.24, 720.20], reason: '删除“视频提示词”的口误版本，从完整的“直接用生图提示词”接回'},
  {range: [795.48, 798.76], reason: '删除色卡段落的重复起头'},
  {range: [805.86, 809.94], reason: '删除未说完的项目来源句，保留后一次完整版本'},
];

const preciseSections = [
  {chapter: '01 研究目标、工具与模型边界', firstCue: 1, lastCue: 18, reason: '建立主题、工具入口和模糊人脸会诱发模型猜测的核心问题'},
  {chapter: '02 底图参考与质量取舍', firstCue: 97, lastCue: 111, reason: '把原片结尾补讲的前置输入移动到人物资产分类之前'},
  {chapter: '03 人物资产：素体、服装、妆造', firstCue: 19, lastCue: 62, reason: '完整保留三类人物资产的职责、例子、比例和模型选择'},
  {chapter: '04 道具资产', firstCue: 73, lastCue: 76, reason: '保留道具多状态展示方法', excludedCueIds: [74]},
  {chapter: '05 场景锚点', firstCue: 77, lastCue: 89, reason: '保留固定锚点、多方向视角和距离描述方法'},
  {chapter: '06 群像资产', firstCue: 91, lastCue: 94, reason: '保留群演合照和单镜头低成本资产思路'},
  {chapter: '07 色卡、项目说明与收尾', firstCue: 112, lastCue: 118, reason: '保留视觉一致性补充、工具来源和正常结束', excludedCueIds: [113]},
];

const omittedPreciseSections = [
  {cueIds: [63, 64, 65, 66, 67, 68, 69, 70, 71, 72], reason: '尚未研究透的视频模型测试旁支，不能支持本条资产构建主线'},
  {cueIds: [95, 96], reason: '提前总结后又补漏的假结尾'},
  {cueIds: [74], reason: '“没什么好说”的低价值过渡'},
  {cueIds: [90], reason: '群像定义的第一次重复版本'},
  {cueIds: [113], reason: '未说完后立即重说的项目来源句'},
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

const activeRanges = () => {
  const silence = parseSilence();
  const active = complement(silence).map(([start, end]) => [start - breath, end + breath]);
  const exclusions = repairExclusions.map((item) => item.range);
  return mergeRanges(active).flatMap((range) => subtractRanges(range, exclusions));
};

const cueWindow = (firstCue, lastCue) => [
  Math.max(0, cues[firstCue - 1].start - breath),
  Math.min(sourceDuration, cues[lastCue - 1].end + breath),
];

const clipRanges = (ranges, [windowStart, windowEnd], cueExclusions = []) => {
  const exclusions = cueExclusions.map((id) => [cues[id - 1].start - breath, cues[id - 1].end + breath]);
  return ranges.flatMap(([start, end]) => {
    const clipped = [Math.max(start, windowStart), Math.min(end, windowEnd)];
    if (clipped[1] - clipped[0] < 0.02) return [];
    return subtractRanges(clipped, exclusions);
  });
};

const createEdl = () => {
  fs.mkdirSync(analysisDir, {recursive: true});
  const baseRanges = activeRanges();

  const roughSegments = annotateSegments(
    baseRanges,
    '原始顺序',
    '保留有效声音并把无讲话间隔压缩到约 0.1 秒；另删除可可靠分离的试说和重复',
    0,
  ).map((segment, index) => ({index: index + 1, ...segment}));

  const preciseSegments = [];
  let target = 0;
  for (const section of preciseSections) {
    const ranges = clipRanges(baseRanges, cueWindow(section.firstCue, section.lastCue), section.excludedCueIds ?? []);
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
    breathSeconds: breath,
    repairExclusions,
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
    ordering: 'directed chapter order',
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
    if (current.length >= 60 || backwardsJump || spanEnd - spanStart > 300) {
      chunks.push(current);
      current = [];
    }
    current.push(segment);
  }
  if (current.length) chunks.push(current);
  return chunks;
};

const normalizeAudio = (outputPath) => {
  const firstPass = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', outputPath, '-vn',
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
  const normalizedPath = outputPath.replace(/\.mp4$/, '.normalized.mp4');
  const secondPass = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', '-i', outputPath,
    '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
    '-af', loudnorm, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-tag:v', 'hvc1', '-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', normalizedPath,
  ], {stdio: 'inherit'});
  if (secondPass.status !== 0) throw new Error('loudness normalization failed');
  fs.renameSync(normalizedPath, outputPath);
  normalizeTimestamps(outputPath);
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
    const seekStart = Math.max(0, minStart - 0.5);
    const seekEnd = Math.min(sourceDuration, maxEnd + 0.5);
    const splitVideo = segments.map((_, index) => `[v${index}]`).join('');
    const splitAudio = segments.map((_, index) => `[a${index}]`).join('');
    const filters = [
      `[0:v]split=${segments.length}${splitVideo}`,
      `[0:a]asplit=${segments.length}${splitAudio}`,
    ];
    const concatInputs = [];
    segments.forEach((segment, index) => {
      const start = segment.sourceStart - seekStart;
      const end = segment.sourceEnd - seekStart;
      filters.push(`[v${index}]trim=start=${start.toFixed(6)}:end=${end.toFixed(6)},setpts=PTS-STARTPTS[vt${index}]`);
      filters.push(`[a${index}]atrim=start=${start.toFixed(6)}:end=${end.toFixed(6)},asetpts=PTS-STARTPTS[at${index}]`);
      concatInputs.push(`[vt${index}][at${index}]`);
    });
    filters.push(`${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[vout][aout]`);
    const filterPath = path.join(workDir, `batch_${String(batchIndex).padStart(3, '0')}.filter`);
    const partPath = path.join(partsDir, `part_${String(batchIndex).padStart(3, '0')}.mp4`);
    fs.writeFileSync(filterPath, filters.join(';\n'));
    const result = spawnSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'warning',
      '-ss', seekStart.toFixed(6), '-t', (seekEnd - seekStart).toFixed(6), '-i', sourcePath,
      '-filter_complex_script', filterPath,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'hevc_videotoolbox', '-b:v', kind === 'rough' ? '3200k' : '3600k',
      '-maxrate', kind === 'rough' ? '4400k' : '4800k', '-bufsize', '9600k',
      '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', partPath,
    ], {stdio: 'inherit'});
    if (result.status !== 0) throw new Error(`render failed at batch ${batchIndex}`);
    console.log(`${label}剪 batch ${batchIndex + 1}/${chunks.length}`);
  });

  const listPath = path.join(workDir, 'parts.txt');
  const partFiles = fs.readdirSync(partsDir).filter((name) => name.endsWith('.mp4')).sort();
  fs.writeFileSync(listPath, `${partFiles.map((name) => `file '${path.join(partsDir, name).replaceAll("'", "'\\''")}'`).join('\n')}\n`);
  const outputPath = path.join(outputDir, `影视剧资产的构建_${label}剪.mp4`);
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy', '-tag:v', 'hvc1', '-movflags', '+faststart', outputPath,
  ], {stdio: 'inherit'});
  normalizeAudio(outputPath);
  fs.rmSync(workDir, {recursive: true, force: true});
  console.log(outputPath);
};

const command = process.argv[2] ?? 'prepare';
if (command === 'prepare') createEdl();
else if (command === 'rough') render('rough');
else if (command === 'precise') render('precise');
else throw new Error('usage: node render.mjs [prepare|rough|precise]');
