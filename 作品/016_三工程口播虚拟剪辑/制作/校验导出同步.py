import json,pathlib,copy,subprocess,sys
R=pathlib.Path(__file__).resolve().parent.parent
P=pathlib.Path('/Volumes/Laohu_Work/软件数据/Cap/录制/016_人物设计与资产提取.cap')
T=pathlib.Path('/Volumes/Laohu_Work/软件数据/Cap/任务临时/016同步修复');T.mkdir(parents=True,exist_ok=True)
Q=T/'sync-check.cap';Q.mkdir(exist_ok=True)
for folder in ['content','assets']:
 if not (Q/folder).exists():(Q/folder).symlink_to(P/folder,target_is_directory=True)
c=json.loads((P/'project-config.json').read_text());m=json.loads((P/'recording-meta.json').read_text());r=json.loads((R/'分析/预剪辑审稿.json').read_text());es=[e for e in r['plannedEdl'] if e['id'] in ['E0452','E0453','E0454','E0455']];a=es[0]['finalRange']['start'];b=es[-1]['finalRange']['end']
m['segments']=[m['segments'][13]];m['pretty_name']='同步验证';(Q/'recording-meta.json').write_text(json.dumps(m))
for k in c['timeline']:
 if k=='segments':c['timeline'][k]=[dict(c['timeline']['segments'][int(e['id'][1:])-1],recordingSegment=0) for e in es]
 elif k=='captionSegments':
  caps=[]
  for s in c['timeline'][k]:
   if s['end']>a and s['start']<b:
    z=copy.deepcopy(s);z['start']=max(a,s['start'])-a;z['end']=min(b,s['end'])-a;caps.append(z)
  c['timeline'][k]=caps
 elif isinstance(c['timeline'][k],list):c['timeline'][k]=[]
correct=next(x for x in json.loads((R/'制作/音画同步修复回执.json').read_text())['addedClips'] if x['index']==13)
label=sys.argv[1];c['clips']=[dict(copy.deepcopy(correct),index=0)] if label=='after' else [{'index':0,'offsets':{'camera':0,'mic':0,'system_audio':0},'offsetsAutoCalculated':False}]
c['projectRevision']=0;(Q/'project-config.json').write_text(json.dumps(c))
print(json.dumps({'sourceFinalStart':a,'sourceFinalEnd':b,'label':label,'duration':b-a}),flush=True)
subprocess.run(['/Applications/CapMotion.app/Contents/MacOS/cap-cli','export',str(Q),'--output',str(T/f'{label}.mp4'),'--fps','30','--resolution','960x540','--quality','social','--json'],check=True)
