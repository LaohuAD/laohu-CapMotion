import json, subprocess, wave, concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent
review=json.loads((root/'分析/预剪辑审稿.json').read_text())
tmp=Path('/Volumes/Laohu_Work/软件数据/Cap/任务临时/016实际剪辑');tmp.mkdir(parents=True,exist_ok=True)
ff='/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg'
files=list(dict.fromkeys(x['sourceRange']['microphoneFile'] for x in review['plannedEdl']))
def decode(v):
 i,src=v;dst=tmp/f'source-{i}.wav'
 subprocess.run([ff,'-v','error','-i',src,'-ar','16000','-ac','1','-c:a','pcm_s16le','-y',str(dst)],check=True)
 return src,dst
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: paths=dict(pool.map(decode,enumerate(files)))
audio={}
for src,path in paths.items():
 with wave.open(str(path),'rb') as w: audio[src]=w.readframes(w.getnframes())
frames=0
with wave.open(str(tmp/'assembled.wav'),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000)
 for e in review['plannedEdl']:
  n=round(e['finalRange']['end']*16000)-frames
  a=round(e['microphoneRange']['start']*16000)
  data=audio[e['sourceRange']['microphoneFile']][a*2:(a+n)*2]
  assert len(data)==n*2
  w.writeframesraw(data);frames+=n
out=Path('/Volumes/Laohu_Work/软件数据/Cap/录制/016_人物设计与资产提取.cap/assets/edited-main-audio.mp3')
# Same work artifact is regenerated after the explicitly authorized EDL refit.
if out.exists(): out.unlink()
subprocess.run([ff,'-v','error','-i',str(tmp/'assembled.wav'),'-c:a','libmp3lame','-b:a','64k',str(out)],check=True)
report={'audio':str(out),'samples':frames,'duration':frames/16000,'edlDuration':review['plannedEdl'][-1]['finalRange']['end'],'source':'approved EDL microphone ranges; source system audio verified silent','temporaryFiles':[str(x) for x in paths.values()]+[str(tmp/'assembled.wav')]}
(root/'输出/主音频生成回执.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
