import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
const ffmpeg=process.env.FFMPEG_BIN || (existsSync('/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg')?'/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg':'ffmpeg');
const script=resolve('.agents/skills/volcengine-asr-srt/scripts/extract-audio.mjs');
test('ASR extraction supports real Unicode paths, valid JSON metadata and protects its input',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cap-audio-'));
 try {
  const source=join(dir,'源录音 & example.m4a'),output=join(dir,'语音 & output.mp3');
  const generate=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=0.3','-y',source],{encoding:'utf8'});
  assert.equal(generate.status,0,generate.error?.message||generate.stderr);
  const original=readFileSync(source);
  const result=spawnSync(process.execPath,[script,source,output],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const metadata=JSON.parse(result.stdout);
  assert.equal(metadata.audio,output);assert(metadata.durationSeconds>0);assert.equal(metadata.sizeBytes,readFileSync(output).length);
  const same=spawnSync(process.execPath,[script,source,source],{encoding:'utf8'});
  assert.notEqual(same.status,0);assert.deepEqual(readFileSync(source),original);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
