// Natural phrase refit. Always starts from the approved semantic edit, never from
// the already subdivided timeline. The baseline is immutable.
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url), read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8')), save=async(p,j)=>writeFile(new URL(p,root),JSON.stringify(j,null,2)+'\n');
const review=await read('分析/预剪辑审稿.json'), baseline=await read('制作/返修前剪辑映射.json'), assembly=await read('制作/工程组装回执.json'), previous=await read('制作/冻结剪辑清单.json'), tracks=await read('制作/双语展示字幕.json'), master=await read('制作/源字幕主稿.json');
const project='/Volumes/Laohu_Work/软件数据/Cap/录制/016_人物设计与资产提取.cap';
const config=JSON.parse(await readFile(`${project}/project-config.json`,'utf8'));
const evidence=[], planned=[], sequence=[], changes=[];let cursor=0;
for(const m of assembly.segmentMap){
 if(!baseline.plannedEdl.some(e=>e.tag===m.tag&&e.recordingSegment===m.sourceRecordingSegment))continue;
 const file=`${m.sourceProject}/content/segments/segment-${m.sourceRecordingSegment}/audio-input.ogg`;
 const r=spawnSync('/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg',['-hide_banner','-i',file,'-af','silencedetect=noise=-55dB:d=0.08','-f','null','-'],{encoding:'utf8',maxBuffer:12e6});if(r.status)throw Error(r.stderr);
 let a=null;const silences=[];for(const line of r.stderr.split('\n')){const s=line.match(/silence_start: ([\d.]+)/),e=line.match(/silence_end: ([\d.]+)/);if(s)a=+s[1];if(e&&a!==null){silences.push({start:a,end:+e[1]});a=null;}}
 const words=master.segments.filter(s=>s.id.startsWith(`${m.tag}-${m.sourceRecordingSegment}-`)).flatMap(s=>s.words).map(w=>({start:w.start-m.workingGlobalStart+m.micOffset,end:w.end-m.workingGlobalStart+m.micOffset,text:w.text}));
 evidence.push({m,silences,words});
}
for(const original of baseline.plannedEdl){
 const ev=evidence.find(x=>x.m.tag===original.tag&&x.m.sourceRecordingSegment===original.recordingSegment),m=ev.m;
 const old=original.microphoneRange;
 const retained=ev.words.filter(w=>w.end>old.start+1e-5&&w.start<old.end-1e-5);
 let start=old.start,end=old.end;
 if(retained.length){
  const first=retained[0],last=retained.at(-1);
  // Locate actual onset/decay around ASR, not ASR timestamps alone. Never
  // encroach on a discarded neighbouring word, or shorten a retained word.
  const lead=ev.silences.findLast(s=>s.start<first.start-.015&&s.end>=old.start-.12&&s.end<=first.start+.025);
  if(lead)start=Math.max(old.start-.10,Math.min(first.start-.045,lead.end-.04));
  const tail=ev.silences.find(s=>s.start>=last.end-.045&&s.start<=last.end+.18&&s.end-s.start>=.06);
  if(tail)end=Math.min(old.end+.15,Math.max(last.end+.055,tail.start+.045));
  const prior=ev.words.filter(w=>w.end<=old.start+1e-5).at(-1),next=ev.words.find(w=>w.start>=old.end-1e-5);
  start=Math.max(0,prior?prior.end+.025:0,Math.min(start,old.start>first.start?old.start:first.start));
  end=Math.min(m.duration+m.micOffset,next?next.start-.025:Infinity,Math.max(end,Math.min(old.end,last.end)));
 }
 const explicit=review.segments.filter(s=>s.blockId===original.blockId).flatMap(s=>s.spokenWords??[]).filter(w=>w.e>old.start&&w.a<old.end).map(w=>({start:Math.max(old.start,w.a),end:Math.min(old.end,w.e),text:w.text}));
 for(const w of explicit){if(w.end<=start)start=Math.max(old.start,w.start);if(w.start>=end)end=Math.min(old.end,w.end);}
 // B audition accepted: remove hesitation gaps within and between phrases.
 // Keep ~10ms on each side of measured quiet cores. No speed change.
 const cuts=ev.silences.filter(q=>q.end-q.start>=.18&&q.end>start&&q.start<end).map(q=>({start:Math.max(start,q.start+.01),end:Math.min(end,q.end-.01),reason:'B approved: -55dB quiet core; 20ms total remainder'})).filter(c=>c.end-c.start>.025);
 // ASR can include silence inside word bounds. Partial quiet-only overlap is
 // expected, but never erase an entire recognized word automatically.
 for(const cut of cuts){
  for(const w of [...retained,...explicit].map(w=>({...w,start:Math.max(start,w.start),end:Math.min(end,w.end)})).filter(w=>w.end>w.start)){if(w.start>=cut.start&&w.end<=cut.end+.025){
   const left=w.start-.01-cut.start,right=cut.end-w.end-.01;
   if(left>=right)cut.end=w.start-.01;else cut.start=w.end+.01;
  }}
 }
 const pieces=[];let pos=start;
 for(const c of cuts.sort((a,b)=>a.start-b.start)){
  if(c.end<=pos||c.end-c.start<.025)continue;
  if(c.start>pos+.001)pieces.push({start:pos,end:c.start});
  pos=Math.max(pos,c.end);
 }
 if(end>pos+.001)pieces.push({start:pos,end});
 changes.push({id:original.id,blockId:original.blockId,before:old,after:{start,end},phraseCuts:cuts});
 for(const piece of pieces){
  if(piece.end-piece.start<.001)throw Error('invalid piece');
  const local={start:piece.start-m.micOffset,end:piece.end-m.micOffset},duration=piece.end-piece.start,finalRange={start:cursor,end:cursor+duration};
  planned.push({...original,id:`E${String(planned.length+1).padStart(4,'0')}`,microphoneRange:piece,displayRange:local,sourceRange:{...original.sourceRange,start:original.sourceRange.start+piece.start-old.start,end:original.sourceRange.start+piece.end-old.start,microphoneRange:piece},finalRange});
  sequence.push({index:sequence.length,recordingSegment:m.workingRecordingSegment,sourceStart:local.start,sourceEnd:local.end,targetStart:cursor,targetEnd:cursor+duration,blockId:original.blockId,sourceProject:m.sourceProject,sourceRecordingSegment:original.recordingSegment});cursor+=duration;
 }
}
const lostWords=[];
for(const s of review.segments)for(const w of s.spokenWords??[]){const overlap=entries=>entries.filter(e=>e.blockId===s.blockId).reduce((v,e)=>v+Math.max(0,Math.min(w.e,e.microphoneRange.end)-Math.max(w.a,e.microphoneRange.start)),0);if(overlap(planned)+1e-5<overlap(baseline.plannedEdl))lostWords.push({caption:s.id,word:w.text,a:w.a,e:w.e});}
const completelyLostWords=lostWords.filter(w=>!planned.some(e=>e.blockId===review.segments.find(s=>s.id===w.caption).blockId&&Math.min(w.e,e.microphoneRange.end)-Math.max(w.a,e.microphoneRange.start)>.001));
if(completelyLostWords.length)throw Error(JSON.stringify(completelyLostWords.slice(0,20)));
function atSource(block,time){const es=planned.filter(e=>e.blockId===block);for(const e of es){if(time<e.microphoneRange.start)return e.finalRange.start;if(time<=e.microphoneRange.end)return e.finalRange.start+time-e.microphoneRange.start;}return es.at(-1).finalRange.end;}
const oldPlanned=review.plannedEdl;
function remap(t){const e=oldPlanned.find(e=>t<=e.finalRange.end+1e-7)??oldPlanned.at(-1);return atSource(e.blockId,e.microphoneRange.start+Math.max(0,t-e.finalRange.start));}
function walk(x){if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')for(const [k,v]of Object.entries(x)){if(k==='finalRange'&&v&&'start'in v){v.start=remap(v.start);v.end=remap(v.end);}else walk(v);}}
// Map other review events before replacing EDL; caption times come from words.
const mapped=structuredClone(review);walk(mapped);
for(const row of mapped.segments){const words=row.spokenWords??[];if(words.length){row.finalRange={start:atSource(row.blockId,words[0].a),end:atSource(row.blockId,words.at(-1).e)};}
 row.sourceRanges=[];for(const e of planned.filter(e=>e.blockId===row.blockId)){const a=Math.max(row.finalRange.start,e.finalRange.start),b=Math.min(row.finalRange.end,e.finalRange.end);if(b<=a)continue;row.sourceRanges.push({...e.sourceRange,start:e.sourceRange.start+a-e.finalRange.start,end:e.sourceRange.start+b-e.finalRange.start,microphoneRange:{start:e.microphoneRange.start+a-e.finalRange.start,end:e.microphoneRange.start+b-e.finalRange.start}});}}
for(const block of mapped.editorialBlocks){const es=planned.filter(e=>e.blockId===block.id);block.finalRange={start:es[0].finalRange.start,end:es.at(-1).finalRange.end};}
for(const track of tracks.tracks)for(const s of track.segments){const row=mapped.segments.find(r=>r.id===s.pairId);if(!row)throw Error(s.id);s.start=row.finalRange.start;s.end=row.finalRange.end;if(s.end<=s.start)throw Error('caption empty');}
const edl={...previous,sourceProjectRevision:config.projectRevision,durationSeconds:cursor,sequence};
mapped.plannedEdl=planned;mapped.scope.end=cursor;mapped.audit.proposedSeconds=cursor;mapped.audit.removedSeconds=mapped.audit.sourceSeconds-cursor;mapped.rhythmRefinement={method:'user-approved B: waveform quiet core reduced to approximately 20ms within and between phrases',previousDuration:previous.durationSeconds,newDuration:cursor,previousPieces:oldPlanned.length,newPieces:planned.length,completelyLostWords:0,quietOnlyWordTimestampOverlaps:lostWords.length,quality:'requires listening judgement; no human listening claimed'};
mapped.timing.reference='用户授权自然语流返修；按用户确认B档收紧句内与句间犹豫静音，保留实际发声。源与成片映射为当前权威。';
await save('制作/冻结剪辑清单.json',edl);await save('制作/气口返修映射.json',{plannedEdl:planned,changes,oldDuration:previous.durationSeconds,newDuration:cursor,quietOnlyWordTimestampOverlaps:lostWords,completelyLostWords,method:mapped.rhythmRefinement,parameters:{noiseDb:-55,minDetectionSilence:.08,candidateMinimum:.18,retainedQuietSeconds:.02,unit:'hesitation gaps inside and between phrases; actual voiced sound protected'}});await save('分析/紧凑气口波形证据.json',evidence.map(({m,silences})=>({workingRecordingSegment:m.workingRecordingSegment,silences})));
await save('分析/预剪辑审稿.json',mapped);await save('制作/双语展示字幕.json',tracks);await save('制作/源到成片映射.json',{schema:'laohu.source-to-final/1',durationSeconds:cursor,segments:planned,assemblySegments:assembly.segmentMap});
console.log(JSON.stringify({revision:config.projectRevision,previousPieces:oldPlanned.length,pieces:planned.length,duration:cursor,quietOnlyWordTimestampOverlaps:lostWords.length,completelyLostWords:completelyLostWords.length,internalPhraseCuts:changes.reduce((n,c)=>n+c.phraseCuts.length,0)}));
