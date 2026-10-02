import json,pathlib,subprocess,wave,array
r=pathlib.Path(__file__).resolve().parent.parent
out=pathlib.Path('/Volumes/Laohu_Work/软件数据/Cap/录制/016_人物设计与资产提取.cap/assets')
tmp=pathlib.Path('/Volumes/Laohu_Work/软件数据/Cap/任务临时/016实际剪辑');tmp.mkdir(parents=True,exist_ok=True)
ff='/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg'
src='/Volumes/Laohu_Work/软件数据/Cap/录制/Mi Monitor (Area) 2026-09-10 01.56 PM.cap/content/segments/segment-0/audio-input.ogg'
subprocess.run([ff,'-v','error','-i',src,'-t','105','-ar','48000','-ac','1','-c:a','pcm_s16le','-y',str(tmp/'pause-source.wav')],check=True)
with wave.open(str(tmp/'pause-source.wav'),'rb') as w:pcm=w.readframes(w.getnframes())
# Source clock. Quiet cores measured at -55 dBFS; audition candidates, not
# automatic global rules. Onset and trailing voiced material remain unchanged.
cases=[dict(id='六个部分',ranges=[(99.685,103.905)],gaps=[(102.615625,103.324042)]),dict(id='从原理到提示词到效果',ranges=[(50.96,53.157271),(53.6,61.155)],gaps=[(53.139958,53.870083),(55.371062,56.008542),(57.687750,57.883354),(58.561854,58.931396),(59.717458,60.059250)])]
report={'status':'AUDITION_ONLY','projectUnchanged':True,'method':'-55dB quiet-core trimming, no time stretch, no word deletion; 60ms and20ms are audition targets only','cases':[]}
for case in cases:
 item={'id':case['id'],'sourceRanges':case['ranges'],'quietCores':case['gaps'],'variants':[]}
 for label,keep in [('当前版',None),('A_60ms',.060),('B_20ms',.020)]:
  pieces=[]
  # Restore the source quiet core across an existing cut before replacing it.
  ranges=case['ranges'] if keep is None else [(case['ranges'][0][0],case['ranges'][-1][1])]
  for start,end in ranges:
   pos=start
   if keep is not None:
    for a,b in case['gaps']:
     a+=keep/2;b-=keep/2
     if a>pos and b<end:pieces.append((pos,a));pos=b
   pieces.append((pos,end))
  data=b''.join(pcm[round(a*48000)*2:round(b*48000)*2] for a,b in pieces)
  wav=tmp/'pause-result.wav'
  with wave.open(str(wav),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(data)
  dst=out/f'气口试听_{case["id"]}_{label}.mp3'
  subprocess.run([ff,'-v','error','-i',str(wav),'-c:a','libmp3lame','-b:a','192k','-y',str(dst)],check=True)
  # Cut edges must lie inside measured quiet cores, not voiced material.
  edge_max=[]
  if keep is not None:
   for a,b in case['gaps']:
    for t in [a+keep/2,b-keep/2]:
     n=round(t*48000);v=array.array('h',pcm[max(0,n-48)*2:(n+48)*2]);edge_max.append(max(map(abs,v),default=0)/32768)
  item['variants'].append({'label':label,'file':str(dst),'duration':len(data)/96000,'retainedRanges':pieces,'maxCutEdgeAmplitude':max(edge_max,default=0)})
 report['cases'].append(item)
(r/'分析/气口试听对照.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
for x in ['pause-source.wav','pause-result.wav']:(tmp/x).unlink()
print(json.dumps(report,ensure_ascii=False))
