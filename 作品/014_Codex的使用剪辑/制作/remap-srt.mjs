import fs from 'node:fs';
import path from 'node:path';

const projectDir = path.resolve(import.meta.dirname, '..');
const rawPath = path.join(projectDir, '输入', 'Codex的使用.raw.json');
const edlPath = path.join(projectDir, '分析', '精剪辑清单.json');
const outputPath = path.join(projectDir, '分析', '精剪EDL映射.srt');
const textPath = path.join(projectDir, '分析', '精剪EDL映射.txt');

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));

const formatTime = (seconds) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
};

const mappedWords = [];
for (const utterance of raw.result.utterances) {
  for (const word of utterance.words ?? []) {
    if (word.start_time < 0 || word.end_time < 0 || !word.text.trim()) continue;
    const sourceStart = word.start_time / 1000;
    const sourceEnd = word.end_time / 1000;
    const midpoint = (sourceStart + sourceEnd) / 2;
    const segment = edl.segments.find((item) => midpoint >= item.sourceStart && midpoint <= item.sourceEnd);
    if (!segment) continue;
    mappedWords.push({
      text: word.text,
      start: segment.targetStart + Math.max(0, sourceStart - segment.sourceStart),
      end: segment.targetStart + Math.min(segment.duration, sourceEnd - segment.sourceStart),
      chapter: segment.chapter,
      sourceStart,
      sourceEnd,
    });
  }
}
mappedWords.sort((a, b) => a.start - b.start);

const groups = [];
for (const word of mappedWords) {
  let group = groups.at(-1);
  const shouldSplit = !group || group.chapter !== word.chapter || word.start - group.end > 0.8 || group.text.length >= 34;
  if (shouldSplit) {
    group = {start: word.start, end: word.end, chapter: word.chapter, text: word.text};
    groups.push(group);
  } else {
    group.end = Math.max(group.end, word.end);
    const needsSpace = /[A-Za-z0-9]$/.test(group.text) && /^[A-Za-z0-9]/.test(word.text);
    group.text += `${needsSpace ? ' ' : ''}${word.text}`;
  }
}

const srt = groups.map((group, index) => [
  index + 1,
  `${formatTime(group.start)} --> ${formatTime(group.end)}`,
  `[${group.chapter}] ${group.text}`,
].join('\n')).join('\n\n');

fs.writeFileSync(outputPath, `${srt}\n`);
fs.writeFileSync(textPath, `${mappedWords.map((word) => word.text).join('')}\n`);
console.log(JSON.stringify({cueCount: groups.length, wordCount: mappedWords.length, outputPath, textPath}, null, 2));
