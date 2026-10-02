import json,subprocess,os,base64,copy
from pathlib import Path
r=Path(__file__).resolve().parent.parent
cli=str(Path('target/debug/cap').resolve());work=Path('/Volumes/Laohu_Work/软件数据/Cap/录制/016_人物设计与资产提取.cap');tmp=Path('/Volumes/Laohu_Work/软件数据/Cap/任务临时/016实际剪辑');qa=tmp/'subtitle-qa.cap';qa.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text())
log=[]
def run(args):
 x=subprocess.run([cli,*args,'--json'],text=True,capture_output=True,env=dict(os.environ,TMPDIR=str(tmp)))
 assert x.returncode==0,(args,x.stderr,x.stdout)
 j=json.loads(x.stdout);log.append({'command':args[:3],'result':{k:v for k,v in j.items() if k not in ['jpeg_base64','meta','config']}});return j
c=read(work/'project-config.json');c['projectRevision']=0;c['timeline']=read(r/'制作/冻结剪辑清单.json')['sourceTimeline'];c['captions']['settings']['trackStyles']=[]
(qa/'project-config.json').write_text(json.dumps(c));(qa/'recording-meta.json').write_text((work/'recording-meta.json').read_text())
for name in ['content','assets']:
 if not (qa/name).exists():(qa/name).symlink_to(work/name,target_is_directory=True)
run(['project','validate',str(qa)])
run(['project','preset','apply',str(qa),'--name','Laohu','--expected-revision','0'])
run(['project','captions','import',str(qa),'--expected-revision','1','--captions-json',str(r/'制作/源字幕主稿.json')])
edl=read(r/'制作/冻结剪辑清单.json');edl['sourceProjectRevision']=2;(tmp/'qa-edl.json').write_text(json.dumps(edl))
x=subprocess.run(['node','scripts/cap-project-edl.mjs','--project',str(qa),'--edl',str(tmp/'qa-edl.json'),'--expected-revision','2'],text=True,capture_output=True);assert x.returncode==0,x.stderr
tracks=read(r/'制作/双语展示字幕.json');pos=read(r/'制作/老胡字幕预设.json')['trackPositions']
for t in tracks['tracks']:t['style']={'fontSize':64 if t['id']=='zh-CN' else 34,'position':'bottom-center','manualPosition':{'x':.5,'y':.85}}
(tmp/'qa-captions.json').write_text(json.dumps(tracks))
run(['project','captions','materialize',str(qa),'--expected-revision','3','--tracks-json',str(tmp/'qa-captions.json')])
j=run(['project','inspect',str(qa)])['config'];assert len(j['captions']['segments'])==591 and len(j['timeline']['captionSegments'])==998
assert j['captions']['settings']['trackPositions']==pos
sizes={s['trackId']:s['fontSize'] for s in j['captions']['settings']['trackStyles']};assert sizes=={'zh-CN':52,'en':34}
assert all(s['fontSizeOverride'] is None and s['positionOverride'] is None for s in j['timeline']['captionSegments'])
(tmp/'qa-style.json').write_text(json.dumps({'trackStyles':[{'trackId':'zh-CN','fontSize':48},{'trackId':'en','fontSize':31}]}))
run(['project','captions','style',str(qa),'--expected-revision','4','--style-json',str(tmp/'qa-style.json')])
store=tmp/'qa-preset-store.json';store.write_text('{}')
run(['presets','save','Test',str(qa),'--expected-revision','0','--store-path',str(store)])
preset=run(['presets','inspect','Test','--store-path',str(store)])['preset'];assert {s['trackId']:s['fontSize'] for s in preset['config']['captions']['settings']['trackStyles']}=={'zh-CN':48,'en':31}
assert preset['config']['captions']['segments']==[] and preset['config']['timeline'] is None
j=run(['project','inspect',str(qa)])['config'];assert j['projectRevision']==5
settings=json.dumps({'fps':30,'resolution_base':{'x':1920,'y':1080},'compression_bpp':.15})
x=run(['export-preview',str(qa),'--frame-time','22','--settings-json',settings]);image=tmp/'developer-subtitle-preview.jpg';image.write_bytes(base64.b64decode(x['jpeg_base64']))
(r/'输出/开发版字幕回归.json').write_text(json.dumps({'status':'PASS_CLI_RELOAD_RENDER','guiInteraction':'not run; no visible app launched','windows':'shared contract tested; Windows native run pending','image':str(image),'checks':['source import','EDL write from original timeline','bilingual materialization preserves user track preferences','independent sizes','preset save and fresh reload','actual preview render'],'log':log},ensure_ascii=False,indent=2))
print(str(image))
