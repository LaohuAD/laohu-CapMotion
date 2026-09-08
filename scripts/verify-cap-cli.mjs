#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const binary=resolve(process.argv[2]||'');
if(!process.argv[2]) throw Error('Usage: node scripts/verify-cap-cli.mjs <installed-cap-cli>');
const dir=mkdtempSync(join(tmpdir(),'cap-installed-cli-'));
const run=(args)=>{
 const result=spawnSync(binary,args,{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.error?.message||result.stderr);
 return JSON.parse(result.stdout);
};
try{
 const update=run(['update','--json']);
 assert.equal(update.started,false);assert.equal(update.completed,false);
 assert.equal(update.manualUpdateRequired,true);
 assert.equal(update.downloadUrl,'https://github.com/LaohuAD/laohu-CapMotion/releases/latest');
 const project=join(dir,'中文 & project.cap');mkdirSync(project);
 const config=join(project,'project-config.json');
 writeFileSync(config,JSON.stringify({projectRevision:0,timeline:{segments:[{recordingSegment:0,timescale:1,start:0,end:1,name:null}],zoomSegments:[]}}));
 const patch=join(dir,'presentation.json');writeFileSync(patch,JSON.stringify({aspectRatio:'wide'}));
 const args=['project','presentation',project,'--expected-revision','0','--patch-json',patch,'--json'];
 assert.equal(run(args).revision,1);
 const before=readFileSync(config);
 const stale=spawnSync(binary,args,{encoding:'utf8',windowsHide:true});
 assert.notEqual(stale.status,0,'Stale revision must be rejected');assert.deepEqual(readFileSync(config),before);
 const tracks=join(dir,'tracks.json');writeFileSync(tracks,JSON.stringify({schema:'laohu.cap-caption-tracks/1',tracks:[
  {id:'zh',label:'中文',language:'zh-CN',style:{fontSize:40,position:'bottom',manualPosition:{x:0.5,y:0.8}},segments:[{id:'zh1',pairId:'p1',start:0,end:1,text:'你好 Windows'}]},
  {id:'en',label:'English',language:'en',style:{fontSize:30,position:'bottom',manualPosition:{x:0.5,y:0.9}},segments:[{id:'en1',pairId:'p1',start:0,end:1,text:'Hello Windows'}]}
 ]}));
 assert.equal(run(['project','captions','materialize',project,'--expected-revision','1','--tracks-json',tracks,'--json']).revision,2);
 const result=run(['project','config','get',project,'--json']);
 assert.equal(result.projectRevision,2);assert.equal(result.aspectRatio,'wide');
 assert.equal(result.timeline.captionSegments.length,2);assert.equal(result.timeline.captionSegments[0].text,'你好 Windows');
 assert.notDeepEqual(result.timeline.captionSegments[0].manualPositionOverride,result.timeline.captionSegments[1].manualPositionOverride);
 console.log(JSON.stringify({status:'PASS',checks:['installed CLI launch','CapMotion manual update route','Unicode and space paths','presentation transaction','stale revision protection','editable bilingual tracks','independent caption positions','config read after write']}));
}finally{rmSync(dir,{recursive:true,force:true});}
