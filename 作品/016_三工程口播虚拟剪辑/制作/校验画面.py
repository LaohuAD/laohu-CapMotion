import subprocess,os,json,base64
from pathlib import Path
root=Path(__file__).resolve().parent.parent
settings={'fps':30,'resolution_base':{'x':1920,'y':1080},'compression_bpp':0.15}
(root/'制作/预览设置.json').write_text(json.dumps(settings,indent=2))
env=dict(os.environ,TMPDIR='/Volumes/Laohu_Work/软件数据/Cap/任务临时/016实际剪辑')
results=[]
for t in [24,810,1230,1340,1720]:
 r=subprocess.run(['/Applications/CapMotion.app/Contents/MacOS/cap-cli','export-preview','/Volumes/Laohu_Work/软件数据/Cap/录制/016_人物设计与资产提取.cap','--frame-time',str(t),'--settings-json',json.dumps(settings),'--json'],env=env,text=True,capture_output=True)
 try: j=json.loads(r.stdout)
 except Exception: j={'error':r.stdout[-1500:]+r.stderr[-1500:]}
 if 'jpeg_base64' in j:
  image=Path('/Volumes/Laohu_Work/软件数据/Cap/录制/016_人物设计与资产提取.cap/screenshots')/f'edit-review-{t}.jpg'
  image.write_bytes(base64.b64decode(j.pop('jpeg_base64')));j['image']=str(image)
 j['time']=t;j['exitCode']=r.returncode;results.append(j)
 print(json.dumps(j,ensure_ascii=False),flush=True)
 (root/'输出/画面预览回执.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 if r.returncode:break
