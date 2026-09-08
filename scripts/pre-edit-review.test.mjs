import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {validateReview, renderReviewHtml} from './pre-edit-review.mjs';
const example = JSON.parse(await readFile(new URL('../workflows/laohu-video/模板/预剪辑审稿示例.json',import.meta.url),'utf8'));
const fresh = () => structuredClone(example);

test('preserves multi-source captions and protected no-caption events', () => {
  const d = fresh();
  validateReview(d);
  assert.equal(d.segments[2].sourceRanges.length, 2);
  assert.equal(d.segments[3].kind, 'EVENT');
  assert.equal(d.visuals[1].mode, 'BASE');
});
test('rejects false timeline geometry from disjoint, duplicate or omitted caption references', () => {
  for (const change of [d=>d.visuals[0].segmentIds.splice(1,1),d=>d.visuals[0].segmentIds.push('C03'),d=>d.visuals.pop()]) {
    const d=fresh();change(d);assert.throws(()=>validateReview(d));
  }
});
test('rejects source-free, overlapping and reordered timecodes', () => {
  for (const change of [d=>d.segments[0].sourceRanges=[],d=>d.segments[1].finalRange.start=173,d=>d.segments.reverse()]) {
    const d=fresh();change(d);assert.throws(()=>validateReview(d));
  }
});
test('actual animation windows cannot cover neighboring demonstrations or contain out-of-window beats', () => {
  const d=fresh();d.visuals[0].visibleRanges[0].end=190;assert.throws(()=>validateReview(d),/越界/);
  const x=fresh();x.visuals[0].visibleRanges=[{start:172,end:180}];assert.throws(()=>validateReview(x),/覆盖窗以外/);
});
test('accepts a split visibility window without erasing the intervening caption context', () => {
  const d=fresh();d.visuals[0].visibleRanges=[{start:172,end:175},{start:180,end:184}];d.visuals[0].phases=[{range:{start:172,end:175},cue:'三图',action:'展开'},{range:{start:180,end:184},cue:'结果',action:'收束'}];assert.equal(validateReview(d),d);
});
test('review approval cannot be inferred from comments or a previous revision', () => {
  const d=fresh();d.approval={status:'APPROVED',reviewRevision:1,scope:'EDIT_AND_VISUALS',reference:'real-turn'};
  assert.throws(()=>validateReview(d),/未决/);
  d.questions.forEach(q=>{q.status='RESOLVED';q.resolution='用户已解决';});d.visuals.forEach(v=>v.status='CONFIRMED');validateReview(d);
  d.revision=2;assert.throws(()=>validateReview(d),/当前修订/);
});
test('renders untrusted content as data, never executable HTML, with a revision-specific fingerprint',async()=>{
  const d=fresh();d.title='</script><script>globalThis.attacked=true</script>';
  const html=await renderReviewHtml(d);
  assert(!html.includes(d.title));
  assert(html.includes('\\u003c/script>'));
  const next=fresh();next.revision++;assert.notEqual((await renderReviewHtml(next)).match(/"fingerprint":"([a-f0-9]+)"/)[1],html.match(/"fingerprint":"([a-f0-9]+)"/)[1]);
});
test('embeds an actual local image and rejects a missing READY image',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'laohu-review-image-'));
  try{
    const path=join(dir,'one.png');await writeFile(path,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1kAAAAASUVORK5CYII=','base64'));
    const d=fresh();d.visuals[0].assets=[{id:'img',label:'用户图',status:'READY',path,use:'保留真实图'}];
    const first = await renderReviewHtml(d);
    assert(first.includes('data:image/png;base64,'));
    await writeFile(path,Buffer.concat([await readFile(path),Buffer.from('updated image metadata')]));
    const second = await renderReviewHtml(d);
    assert.notEqual(first.match(/"fingerprint":"([a-f0-9]+)"/)[1],second.match(/"fingerprint":"([a-f0-9]+)"/)[1], 'same-path image changes must invalidate old feedback drafts');
    d.visuals[0].assets[0].path=join(dir,'missing.png');await assert.rejects(()=>renderReviewHtml(d),/ENOENT/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('real reviews require source audit; cut-only reviews can keep all footage without animation',()=>{
  const d=fresh();d.isExample=false;[...d.segments,...d.sourceDecisions].forEach(s=>s.sourceRanges.forEach(r=>r.file='/media/'+r.file));d.visuals.forEach(v=>{v.mode='BASE';v.visibleRanges=[];v.phases=[];v.assets=[];});validateReview(d);
  d.sourceDecisions=[];assert.throws(()=>validateReview(d),/源素材/);
});
test('browser: layout, image preview, search, linked doubts, feedback persistence and export', {skip: !process.env.PRE_EDIT_BROWSER_TESTS}, async()=>{
  const require=createRequire(import.meta.url);const {chromium}=require('playwright');
  const dir=await mkdtemp(join(tmpdir(),'laohu-review-browser-'));
  const browser=await chromium.launch({headless:true,...(process.env.REVIEW_BROWSER_BIN?{executablePath:process.env.REVIEW_BROWSER_BIN}:{})});
  try{
    const file=join(dir,'review.html');await writeFile(file,await renderReviewHtml(fresh()));
    const page=await browser.newPage({viewport:{width:1512,height:1100},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(file).href);
    assert.equal(await page.locator('.cue').count(),7);assert.equal(await page.locator('.visual').count(),3);
    await page.getByRole('button',{name:'定位 A01',exact:true}).click();assert(await page.locator('#ref-A01').evaluate(n=>n.classList.contains('focus-item')));
    await page.getByRole('button',{name:'放大查看 图二 / 重点放大'}).click();assert(await page.locator('dialog').isVisible());await page.getByRole('button',{name:'关闭 ×'}).click();
    await page.locator('#search').fill('第二张');assert(await page.locator('.search-hit').count()>=2);await page.locator('#next').click();
    await page.locator('textarea[data-feedback="A01"]').fill('图二再停两秒');await page.reload();assert.equal(await page.locator('textarea[data-feedback="A01"]').inputValue(),'图二再停两秒');
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载修改意见'}).click()]);const feedback=await readFile(await download.path(),'utf8');assert(feedback.includes('图二再停两秒'));assert(feedback.includes('修订 1'));assert.equal(await page.locator('#approval').textContent(),'待整体确认');
    for(const width of [1512,1024,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);}
    await page.screenshot({path:join(dir,'mobile.png'),fullPage:true});
    const revised=fresh();revised.revision=2;await writeFile(file,await renderReviewHtml(revised));await page.reload();assert.equal(await page.locator('textarea[data-feedback="A01"]').inputValue(),'');assert.deepEqual(errors,[]);
  }finally{await browser.close();await rm(dir,{recursive:true,force:true});}
});
