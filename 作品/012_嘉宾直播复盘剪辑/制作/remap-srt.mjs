import fs from 'node:fs';
import path from 'node:path';

const projectDir = path.resolve(import.meta.dirname, '..');
const sourceSrtPath = '/Users/a1/Movies/jiabing.srt';
const edlPath = path.join(projectDir, '分析', '精剪辑清单.json');
const outputSrtPath = path.join(projectDir, '输出', '嘉宾直播复盘_精剪_原始字幕.srt');
const reportPath = path.join(projectDir, '分析', '精剪字幕映射.json');

const parseTime = (value) => {
  const match = value.match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) throw new Error(`Invalid SRT timestamp: ${value}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
};

const formatTime = (seconds) => {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
};

const parseSrt = (input) => input
  .replace(/^\uFEFF/, '')
  .replace(/\r/g, '')
  .trim()
  .split(/\n\n+/)
  .map((block) => {
    const lines = block.split('\n');
    const timestampIndex = lines.findIndex((line) => line.includes('-->'));
    if (timestampIndex < 0) throw new Error(`Missing timestamp in block: ${block.slice(0, 80)}`);
    const [start, end] = lines[timestampIndex].split('-->').map((value) => value.trim().split(/\s+/)[0]);
    return {
      sourceCueId: Number(lines[0]),
      sourceStart: parseTime(start),
      sourceEnd: parseTime(end),
      text: lines.slice(timestampIndex + 1).join(' ').trim(),
    };
  });

const sourceCues = parseSrt(fs.readFileSync(sourceSrtPath, 'utf8'));
const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
const segments = [...edl.segments].sort((a, b) => a.sourceStart - b.sourceStart);
const mappedCues = [];

for (const cue of sourceCues) {
  const fragments = [];
  for (const segment of segments) {
    if (segment.sourceEnd <= cue.sourceStart) continue;
    if (segment.sourceStart >= cue.sourceEnd) break;
    const sourceStart = Math.max(cue.sourceStart, segment.sourceStart);
    const sourceEnd = Math.min(cue.sourceEnd, segment.sourceEnd);
    if (sourceEnd - sourceStart < 0.02) continue;
    fragments.push({
      sourceStart,
      sourceEnd,
      targetStart: segment.targetStart + sourceStart - segment.sourceStart,
      targetEnd: segment.targetStart + sourceEnd - segment.sourceStart,
    });
  }
  if (!fragments.length) continue;

  const groups = [];
  for (const fragment of fragments) {
    const previous = groups.at(-1);
    if (previous && fragment.targetStart - previous.targetEnd <= 0.12) {
      previous.sourceEnd = fragment.sourceEnd;
      previous.targetEnd = Math.max(previous.targetEnd, fragment.targetEnd);
      previous.coveredDuration += fragment.sourceEnd - fragment.sourceStart;
      previous.fragmentCount += 1;
    } else {
      groups.push({...fragment, coveredDuration: fragment.sourceEnd - fragment.sourceStart, fragmentCount: 1});
    }
  }

  const cueDuration = cue.sourceEnd - cue.sourceStart;
  for (const group of groups) {
    mappedCues.push({
      ...cue,
      ...group,
      coverageRatio: Math.min(1, group.coveredDuration / cueDuration),
      clippedStart: group.sourceStart - cue.sourceStart > 0.08,
      clippedEnd: cue.sourceEnd - group.sourceEnd > 0.08,
      splitIntoMultipleTargetCues: groups.length > 1,
    });
  }
}

mappedCues.sort((a, b) => a.targetStart - b.targetStart || a.targetEnd - b.targetEnd);
let previousEnd = 0;
for (const [index, cue] of mappedCues.entries()) {
  cue.targetCueId = index + 1;
  if (cue.targetStart < previousEnd) {
    cue.targetStart = previousEnd;
    cue.timestampAdjusted = true;
  }
  if (cue.targetEnd <= cue.targetStart) cue.targetEnd = cue.targetStart + 0.02;
  previousEnd = cue.targetEnd;
}

fs.mkdirSync(path.dirname(outputSrtPath), {recursive: true});
const srt = mappedCues.map((cue) => [
  cue.targetCueId,
  `${formatTime(cue.targetStart)} --> ${formatTime(cue.targetEnd)}`,
  cue.text,
].join('\n')).join('\n\n') + '\n';
fs.writeFileSync(outputSrtPath, srt);

const report = {
  generatedAt: new Date().toISOString(),
  sourceSrtPath,
  edlPath,
  outputSrtPath,
  sourceCueCount: sourceCues.length,
  mappedCueCount: mappedCues.length,
  targetDuration: edl.targetEstimatedDuration,
  clippedCueCount: mappedCues.filter((cue) => cue.clippedStart || cue.clippedEnd).length,
  splitCueCount: mappedCues.filter((cue) => cue.splitIntoMultipleTargetCues).length,
  timestampAdjustmentCount: mappedCues.filter((cue) => cue.timestampAdjusted).length,
  cues: mappedCues,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  outputSrtPath,
  reportPath,
  mappedCueCount: report.mappedCueCount,
  clippedCueCount: report.clippedCueCount,
  splitCueCount: report.splitCueCount,
  timestampAdjustmentCount: report.timestampAdjustmentCount,
}, null, 2));
