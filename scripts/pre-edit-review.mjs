import {readFile, writeFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extname, isAbsolute, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const templatePath = fileURLToPath(new URL('../workflows/laohu-video/模板/预剪辑时间轴模板.html', import.meta.url));
const present = (v) => typeof v === 'string' && v.trim().length > 0;
const range = (v) => v && Number.isFinite(v.start) && Number.isFinite(v.end) && v.start >= 0 && v.end > v.start;
const inside = (a, b) => a.start >= b.start && a.end <= b.end;
const fail = (message) => {throw new Error(message);};
const ids = (items, label) => {
  if (!Array.isArray(items)) fail(`${label} 必须是数组`);
  const seen = new Set();
  for (const x of items) {
    if (!x || !present(x.id) || seen.has(x.id)) fail(`${label} ID 缺失或重复`);
    seen.add(x.id);
  }
  return seen;
};
function checkSources(sources, label, allowRelative = false) {
  if (!Array.isArray(sources) || !sources.length) fail(`${label} 缺源时间引用`);
  for (const source of sources) {
    if (!present(source.file) || (!allowRelative && !isAbsolute(source.file)) || !range(source)) fail(`${label} 源文件或源时间无效`);
  }
}

export function validateReview(data) {
  if (data?.schema !== 'laohu.pre-edit-review/1') fail('不支持的审稿数据 schema');
  if (!present(data.id) || !present(data.title) || !Number.isInteger(data.revision) || data.revision < 1) fail('缺作品名称、ID 或正整数修订');
  if (!range(data.scope) || !['PROVISIONAL', 'FROZEN', 'HISTORICAL'].includes(data.timing?.basis) || !present(data.timing?.reference)) fail('缺明确的时间范围与时间依据');
  if (!['PENDING', 'APPROVED'].includes(data.approval?.status)) fail('缺审稿批准状态');
  if (data.approval.status === 'APPROVED' && (!present(data.approval.reference) || data.approval.reviewRevision !== data.revision || !['EDIT_ONLY', 'EDIT_AND_VISUALS'].includes(data.approval.scope))) fail('批准必须对应当前修订、范围和真实回执');
  if (!present(data.brief?.audience) || !present(data.brief?.mainline) || !present(data.brief?.captionStyle)) fail('缺本片观众、主线或字幕样式');
  const segments = ids(data.segments, '字幕/事件');
  if (!segments.size) fail('至少需要一个字幕或无字幕事件');
  let previousEnd = data.scope.start;
  for (const s of data.segments) {
    if (!range(s.finalRange) || !inside(s.finalRange, data.scope) || s.finalRange.start < previousEnd - 0.00001) fail(`${s.id} 成片时间越界、重叠或乱序`);
    if (!['CAPTION', 'EVENT'].includes(s.kind) || !present(s.text)) fail(`${s.id} 缺最终字幕或无字幕事件正文`);
    checkSources(s.sourceRanges, s.id, data.isExample === true);
    previousEnd = s.finalRange.end;
  }
  const visualIds = ids(data.visuals, '画面单元');
  if ([...visualIds].some((id) => segments.has(id))) fail('字幕与画面 ID 不得冲突');
  const owners = new Set();
  for (const v of data.visuals) {
    if (!Array.isArray(v.segmentIds) || !v.segmentIds.length || new Set(v.segmentIds).size !== v.segmentIds.length || v.segmentIds.some((id) => !segments.has(id) || owners.has(id))) fail(`${v.id} 片段引用缺失、重复或被多个单元占用`);
    const positions = v.segmentIds.map((id) => data.segments.findIndex((s) => s.id === id));
    if (positions.some((n, i) => i && n !== positions[i - 1] + 1)) fail(`${v.id} 跨不连续片段：请拆单元，保留共同 groupId`);
    if (new Set(positions.map((i) => data.segments[i].chapter || '')).size > 1) fail(`${v.id} 跨章节单元须拆分，保留共同 groupId`);
    v.segmentIds.forEach((id) => owners.add(id));
    if (!['BASE', 'LOCAL', 'SIDE', 'FULL'].includes(v.mode) || !present(v.title) || !present(v.reason) || !present(v.summary) || !present(v.handoff) || !['PENDING', 'REVISED', 'CONFIRMED'].includes(v.status)) fail(`${v.id} 缺完整画面判断`);
    const envelope = {start: data.segments[positions[0]].finalRange.start, end: data.segments[positions.at(-1)].finalRange.end};
    if (!Array.isArray(v.visibleRanges) || (v.mode !== 'BASE' && !v.visibleRanges.length) || (v.mode === 'BASE' && v.visibleRanges.length)) fail(`${v.id} 请区分底画与实际覆盖窗口`);
    let end = envelope.start;
    for (const r of v.visibleRanges) {
      if (!range(r) || !inside(r, envelope) || r.start < end) fail(`${v.id} 可见窗口越界或重叠`);
      end = r.end;
    }
    if (!Array.isArray(v.phases) || (v.mode !== 'BASE' && !v.phases.length)) fail(`${v.id} 缺动作设计`);
    for (const p of v.phases) {
      if (!range(p.range) || !inside(p.range, envelope) || !present(p.action) || !present(p.cue)) fail(`${v.id} 动作节拍缺触发或越界`);
      if (v.mode !== 'BASE' && !v.visibleRanges.some((r) => inside(p.range, r))) fail(`${v.id} 动作发生在覆盖窗以外`);
    }
    ids(v.assets, `${v.id} 材料`);
    for (const a of v.assets) {
      if (!present(a.label) || !present(a.use) || !['READY', 'MISSING', 'PLANNED', 'SCHEMATIC'].includes(a.status)) fail(`${v.id} 材料缺用途或状态`);
      if (a.status === 'READY' && (!present(a.path) || !isAbsolute(a.path))) fail(`${v.id} 已有图片须用真实绝对路径`);
      if (a.diagram && (data.isExample !== true || a.status !== 'SCHEMATIC' || !['input', 'focus', 'result'].includes(a.diagram))) fail('示意图仅限明确标注的示例');
    }
  }
  // Every retained interval gets a visual decision, including keeping the original footage.
  if (owners.size !== segments.size) fail('存在尚未安排画面的字幕/事件；保留底画也须明确记录');
  const questions = ids(data.questions, '疑难');
  if ([...questions].some((id) => segments.has(id) || visualIds.has(id))) fail('疑难 ID 与时间轴 ID 不得冲突');
  for (const q of data.questions) {
    if (!present(q.question) || !['OPEN', 'RESOLVED'].includes(q.status) || !Array.isArray(q.targets) || q.targets.some((id) => !segments.has(id) && !visualIds.has(id))) fail(`${q.id} 疑难或定位无效`);
    if (q.status === 'RESOLVED' && !present(q.resolution)) fail(`${q.id} 已解决疑难须记录结论`);
  }
  for (const s of data.segments) if ((s.questionIds ?? []).some((id) => !questions.has(id))) fail(`${s.id} 疑难引用不存在`);
  if (data.approval.status === 'APPROVED' && (data.questions.some((q) => q.status === 'OPEN') || data.visuals.some((v) => v.status !== 'CONFIRMED' || v.assets.some((a) => a.status === 'MISSING')))) fail('仍有未决疑难、画面或缺失材料，不能标为整体批准');
  if (data.approval.status === 'APPROVED' && data.visuals.some((v) => v.mode !== 'BASE') && data.approval.scope !== 'EDIT_AND_VISUALS') fail('剪口批准不能授权画面方案');
  if (!Array.isArray(data.sourceDecisions)) fail('缺源素材审稿决定数组');
  if (!data.isExample && !data.sourceDecisions.length) fail('正式审稿须包含源素材保留/删除/疑难决定，不能只交成片片段');
  ids(data.sourceDecisions, '源决定');
  for (const d of data.sourceDecisions) {
    checkSources(d.sourceRanges, d.id, data.isExample === true);
    if (!['KEEP', 'DELETE', 'QUESTION'].includes(d.decision) || !present(d.reason) || !present(d.text)) fail(`${d.id} 缺源审稿内容或理由`);
  }
  return data;
}

export async function renderReviewHtml(data) {
  validateReview(data);
  const model = structuredClone(data);
  let bytes = 0;
  for (const v of model.visuals) for (const a of v.assets) {
    delete a.preview;
    if (a.status !== 'READY') continue;
    const types = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif'};
    const mime = types[extname(a.path).toLowerCase()];
    if (!mime) fail(`图片预览仅支持 PNG/JPEG/WebP/GIF：${a.path}`);
    bytes += (await stat(a.path)).size;
    if (bytes > 12 * 1024 * 1024) fail('审稿图片合计超过 12 MB，请提供轻量预览图并在 source 中保留原图路径');
    const buffer = await readFile(a.path);
    a.preview = `data:${mime};base64,${buffer.toString('base64')}`;
  }
  model.fingerprint = createHash('sha256').update(JSON.stringify(model)).digest('hex');
  const json = JSON.stringify(model).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  return (await readFile(templatePath, 'utf8')).replace('__REVIEW_DATA__', () => json);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {console.error('用法：node scripts/pre-edit-review.mjs <审稿数据.json> <审稿.html>'); process.exitCode = 1;}
  else {
    try {
      const data = JSON.parse(await readFile(input, 'utf8'));
      const html = await renderReviewHtml(data);
      await writeFile(output, html, 'utf8');
      console.log(JSON.stringify({ok: true, output: resolve(output), revision: data.revision, segments: data.segments.length, visuals: data.visuals.length}));
    } catch (e) {console.error(e.message); process.exitCode = 1;}
  }
}
