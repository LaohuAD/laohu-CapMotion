import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectDir = path.resolve(import.meta.dirname, '..');
const sourcePath = '/Users/a1/Movies/2026-07-26-19-07-52.mp4';
const srtPath = '/Users/a1/Movies/jiabing.srt';
const analysisDir = path.join(projectDir, '分析');
const outputDir = path.join(projectDir, '输出');
const tempRoot = '/tmp/laohu_012_render';
const silenceLogPath = '/tmp/laohu_012_silence_45_010.log';
const sourceDuration = 6210.266667;
const breath = 0.05;

const parseTime = (value) => {
  const match = value.match(/(\d+):(\d+):(\d+),(\d+)/);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
};

const parseSrt = () => fs.readFileSync(srtPath, 'utf8').replace(/\r/g, '').trim().split(/\n\n+/).map((block) => {
  const lines = block.split('\n');
  const [start, end] = lines[1].split(' --> ');
  return {id: Number(lines[0]), start: parseTime(start), end: parseTime(end), text: lines.slice(2).join(' ')};
});

const mergeRanges = (ranges, maxGap = 0.1) => {
  const sorted = ranges
    .map(([start, end]) => [Math.max(0, start), Math.min(sourceDuration, end)])
    .filter(([start, end]) => end - start >= 0.02)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (!last || range[0] - last[1] > maxGap + 1e-6) merged.push([...range]);
    else last[1] = Math.max(last[1], range[1]);
  }
  return merged;
};

const clipRange = ([start, end], [windowStart, windowEnd]) => {
  const clipped = [Math.max(start, windowStart), Math.min(end, windowEnd)];
  return clipped[1] - clipped[0] >= 0.02 ? clipped : null;
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

const addTargets = (ranges) => {
  let target = 0;
  return ranges.map(([sourceStart, sourceEnd], index) => {
    const duration = sourceEnd - sourceStart;
    const item = {index: index + 1, sourceStart, sourceEnd, targetStart: target, targetEnd: target + duration, duration};
    target += duration;
    return item;
  });
};

const cueInRanges = (id, ranges) => ranges.some(([start, end]) => id >= start && id <= end);

const createEdl = () => {
  fs.mkdirSync(analysisDir, {recursive: true});
  const cues = parseSrt();
  const silence = parseSilence();
  const activeAudio = complement(silence).filter(([start, end]) => end - start >= 0.04);

  // This is a played reference clip. Keep its natural internal rests intact.
  const protectedMedia = [[666.5, 694.8]];
  const roughRanges = mergeRanges([
    ...activeAudio.map(([start, end]) => [start - breath, end + breath]),
    ...protectedMedia,
  ]);

  const semanticCueRanges = [
    [40, 331],
    [332, 350],
    [368, 650],
    [715, 1500],
    [1507, 2540],
    [2648, 2678],
    [2683, 2729],
    [2747, 2838],
    [2886, 2888],
  ];
  const explicitExcludedCueRanges = [
    [1984, 1998],
    [2053, 2061],
    [2156, 2157],
    [2174, 2177],
    [2232, 2244],
    [2334, 2339],
  ];
  const fillerPattern = /^(嗯+|啊+|呃+|哦+|唉+|哎+|诶+|额+|好+|对+|是+|行+|可以+|没问题|哈哈+|呵呵+|嗯?好吧|啊?好|嗯?对|对吧|懂|拜拜)+$/;
  const normalized = (text) => text.replace(/[，。！？、\s]/g, '');
  const keptCues = cues.filter((cue) =>
    cueInRanges(cue.id, semanticCueRanges) &&
    !cueInRanges(cue.id, explicitExcludedCueRanges) &&
    !fillerPattern.test(normalized(cue.text))
  );
  const semanticWindows = semanticCueRanges.map(([startId, endId]) => {
    const first = cues.find((cue) => cue.id === startId);
    const last = cues.find((cue) => cue.id === endId);
    return [first.start - breath, last.end + breath];
  });

  const keptCueIds = new Set(keptCues.map((cue) => cue.id));
  const forbiddenCueWindows = cues
    .filter((cue) => cueInRanges(cue.id, semanticCueRanges) && !keptCueIds.has(cue.id))
    .map((cue) => [cue.start - 0.02, cue.end + 0.02]);
  const allowedActiveAudio = [];
  for (const active of activeAudio) {
    for (const window of semanticWindows) {
      const clipped = clipRange(active, window);
      if (!clipped) continue;
      for (const piece of subtractRanges(clipped, forbiddenCueWindows)) {
        allowedActiveAudio.push([piece[0] - breath, piece[1] + breath]);
      }
    }
  }

  const preciseRanges = mergeRanges([
    ...allowedActiveAudio,
    ...protectedMedia,
  ]);

  const write = (name, ranges, extra) => {
    const segments = addTargets(ranges);
    const payload = {
      generatedAt: new Date().toISOString(),
      sourcePath,
      srtPath,
      sourceDuration,
      targetEstimatedDuration: segments.at(-1)?.targetEnd ?? 0,
      segmentCount: segments.length,
      ...extra,
      segments,
    };
    fs.writeFileSync(path.join(analysisDir, `${name}剪辑清单.json`), JSON.stringify(payload, null, 2) + '\n');
    console.log(`${name}: ${segments.length} segments, ${payload.targetEstimatedDuration.toFixed(3)} seconds`);
  };

  write('粗', roughRanges, {
    cueCount: cues.length,
    silenceCount: silence.length,
    waveformThreshold: '-45dB',
    protectedMedia,
  });
  write('精', preciseRanges, {
    selectedCueCount: keptCues.length,
    excludedCueCount: cues.length - keptCues.length,
    waveformThreshold: '-45dB',
    semanticCueRanges,
    explicitExcludedCueRanges,
    protectedMedia,
  });
};

const chunkSegments = (segments) => {
  const chunks = [];
  let current = [];
  for (const segment of segments) {
    const exceedsCount = current.length >= 60;
    const exceedsSpan = current.length && segment.sourceEnd - current[0].sourceStart > 300;
    if (exceedsCount || exceedsSpan) {
      chunks.push(current);
      current = [];
    }
    current.push(segment);
  }
  if (current.length) chunks.push(current);
  return chunks;
};

const render = (kind) => {
  const isRough = kind === 'rough';
  const label = isRough ? '粗' : '精';
  const edlPath = path.join(analysisDir, `${label}剪辑清单.json`);
  if (!fs.existsSync(edlPath)) createEdl();
  const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
  const workDir = path.join(tempRoot, kind);
  const partsDir = path.join(workDir, 'parts');
  fs.rmSync(workDir, {recursive: true, force: true});
  fs.mkdirSync(partsDir, {recursive: true});
  fs.mkdirSync(outputDir, {recursive: true});

  const chunks = chunkSegments(edl.segments);
  const bitrate = isRough ? '1800k' : '2300k';
  const maxrate = isRough ? '2600k' : '3300k';
  console.log(`${label}剪: rendering ${chunks.length} batches`);

  chunks.forEach((segments, batchIndex) => {
    const seekStart = Math.max(0, segments[0].sourceStart - 0.5);
    const seekEnd = Math.min(sourceDuration, segments.at(-1).sourceEnd + 0.5);
    const splitVideo = segments.map((_, i) => `[v${i}]`).join('');
    const splitAudio = segments.map((_, i) => `[a${i}]`).join('');
    const filters = [
      `[0:v]split=${segments.length}${splitVideo}`,
      `[0:a]asplit=${segments.length}${splitAudio}`,
    ];
    const concatInputs = [];
    segments.forEach((segment, i) => {
      const start = Math.max(0, segment.sourceStart - seekStart);
      const end = segment.sourceEnd - seekStart;
      filters.push(`[v${i}]trim=start=${start.toFixed(6)}:end=${end.toFixed(6)},setpts=PTS-STARTPTS[vt${i}]`);
      filters.push(`[a${i}]atrim=start=${start.toFixed(6)}:end=${end.toFixed(6)},asetpts=PTS-STARTPTS[at${i}]`);
      concatInputs.push(`[vt${i}][at${i}]`);
    });
    filters.push(`${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[vout][aout]`);
    const filterPath = path.join(workDir, `batch_${String(batchIndex).padStart(3, '0')}.filter`);
    const partPath = path.join(partsDir, `part_${String(batchIndex).padStart(3, '0')}.mp4`);
    fs.writeFileSync(filterPath, filters.join(';\n'));
    const args = [
      '-y', '-hide_banner', '-loglevel', 'warning',
      '-ss', seekStart.toFixed(6), '-t', (seekEnd - seekStart).toFixed(6), '-i', sourcePath,
      '-filter_complex_script', filterPath,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'hevc_videotoolbox', '-b:v', bitrate, '-maxrate', maxrate,
      '-bufsize', '6600k', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', partPath,
    ];
    const result = spawnSync('ffmpeg', args, {stdio: 'inherit'});
    if (result.status !== 0) throw new Error(`render failed at batch ${batchIndex}`);
    console.log(`${label}剪 batch ${batchIndex + 1}/${chunks.length}`);
  });

  const listPath = path.join(workDir, 'parts.txt');
  const partFiles = fs.readdirSync(partsDir).filter((name) => name.endsWith('.mp4')).sort();
  fs.writeFileSync(listPath, partFiles.map((name) => `file '${path.join(partsDir, name).replaceAll("'", "'\\''")}'`).join('\n') + '\n');
  const outputName = isRough ? '嘉宾直播复盘_粗剪.mp4' : '嘉宾直播复盘_精剪.mp4';
  const outputPath = path.join(outputDir, outputName);
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy', '-tag:v', 'hvc1', '-movflags', '+faststart', outputPath,
  ], {stdio: 'inherit'});
  normalizeAudio(outputPath);
  fs.rmSync(workDir, {recursive: true, force: true});
  console.log(outputPath);
};

const normalizeAudio = (outputPath) => {
  const leveling = 'dynaudnorm=f=500:g=31:p=0.95:m=3:s=3';
  const firstPass = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', outputPath, '-vn',
    '-af', `${leveling},loudnorm=I=-16:LRA=7:TP=-1.5:print_format=json`,
    '-f', 'null', '-',
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
    '-af', `${leveling},${loudnorm}`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-tag:v', 'hvc1', '-movflags', '+faststart', normalizedPath,
  ], {stdio: 'inherit'});
  if (secondPass.status !== 0) throw new Error('loudness normalization failed');
  fs.renameSync(normalizedPath, outputPath);
  normalizeTimestamps(outputPath);
  console.log(`normalized audio to -16 LUFS: ${JSON.stringify(stats)}`);
};

const normalizeTimestamps = (outputPath) => {
  const probe = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,start_time', '-of', 'json', outputPath,
  ], {encoding: 'utf8'}));
  const videoStart = Number(probe.streams.find((stream) => stream.codec_type === 'video')?.start_time ?? 0);
  const audioStart = Number(probe.streams.find((stream) => stream.codec_type === 'audio')?.start_time ?? 0);
  const delta = videoStart - audioStart;
  if (Math.abs(delta) < 0.001) return;
  const normalizedPath = outputPath.replace(/\.mp4$/, '.timestamps.mp4');
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-itsoffset', (-delta).toFixed(6), '-i', outputPath, '-i', outputPath,
    '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-tag:v', 'hvc1',
    '-movflags', '+faststart', normalizedPath,
  ], {stdio: 'inherit'});
  fs.renameSync(normalizedPath, outputPath);
};

const command = process.argv[2] ?? 'prepare';
if (command === 'prepare') createEdl();
else if (command === 'rough') render('rough');
else if (command === 'precise') render('precise');
else if (command === 'normalize-rough') normalizeAudio(path.join(outputDir, '嘉宾直播复盘_粗剪.mp4'));
else if (command === 'fix-timestamps') {
  normalizeTimestamps(path.join(outputDir, '嘉宾直播复盘_粗剪.mp4'));
  normalizeTimestamps(path.join(outputDir, '嘉宾直播复盘_精剪.mp4'));
}
else throw new Error('usage: node render.mjs [prepare|rough|precise|normalize-rough|fix-timestamps]');
