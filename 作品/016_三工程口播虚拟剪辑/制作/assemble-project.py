"""Initialize one new editable Cap package from three read-only recordings.
Never runs against an existing project; all subsequent edits use revision-safe interfaces.
Uses APFS clones (no hardlinks). Preserves source clocks and reindexes cursor assets.
"""
import pathlib,json,copy,subprocess,os,hashlib
W=pathlib.Path(__file__).resolve().parents[1]; D=json.loads((W/'分析/预剪辑审稿.json').read_text()); CLI='/Applications/CapMotion.app/Contents/MacOS/cap-cli'
DEST=pathlib.Path('/Volumes/Laohu_Work/软件数据/Cap/录制/016_人物设计与资产提取.cap');STAGE=DEST.with_name('.016_人物设计与资产提取.assembling.cap')
assert not DEST.exists() and not STAGE.exists(),'Refuse to replace existing workspace'
assert D['approval']['status']=='APPROVED'
STAGE.mkdir();(STAGE/'content/segments').mkdir(parents=True);(STAGE/'content/cursors').mkdir()
meta=None;config=None;segment_map=[];duration=0;media=[]
def clone(a,b):
 b.parent.mkdir(parents=True,exist_ok=True);subprocess.run(['cp','-c',str(a),str(b)],check=True)
 media.append({'source':str(a),'destination':str(DEST/b.relative_to(STAGE)),'bytes':a.stat().st_size,'sourceMtimeNs':a.stat().st_mtime_ns,'method':'APFS clone'})
def remap_cursor(obj,ids):
 if isinstance(obj,dict):
  for k,v in list(obj.items()):
   if k=='cursor_id':obj[k]=ids.get(str(v),str(v))
   else:remap_cursor(v,ids)
 elif isinstance(obj,list):
  for v in obj:remap_cursor(v,ids)
for tag,srcs in D['provenance']['sourceProjects'].items():
 src=pathlib.Path(srcs)
 for f,h in D['provenance']['sourceHashes'][tag].items():assert hashlib.sha256((src/f).read_bytes()).hexdigest()==h,(tag,f,'source changed')
 m=json.loads((src/'recording-meta.json').read_text());c=json.loads((src/'project-config.json').read_text())
 v=json.loads(subprocess.check_output([CLI,'project','validate',str(src),'--json']));assert v['valid']
 if meta is None:
  meta=copy.deepcopy(m);meta['segments']=[];meta['cursors']={};meta['pretty_name']='016 人物设计与资产提取'
  config=copy.deepcopy(c);config['projectRevision']=0;config['clips']=[]
  for k in config['timeline']:
   if isinstance(config['timeline'][k],list):config['timeline'][k]=[]
  for folder in ['assets','screenshots']:
   for f in (src/folder).glob('*'):
    if f.is_file():clone(f,STAGE/folder/f.name)
 base=len(meta['segments']);pbase=duration
 ids={old:str(len(meta['cursors'])+i) for i,old in enumerate(m['cursors'])}
 for old,val in m['cursors'].items():
  new=ids[old];v=copy.deepcopy(val);f=src/v['imagePath'];rel=f'content/cursors/cursor_{new}{f.suffix}';clone(f,STAGE/rel);v['imagePath']=rel;meta['cursors'][new]=v
 for n,s in enumerate(m['segments']):
  nn=base+n
  source_clip=next((v for v in c['clips'] if v['index']==n),None)
  assert source_clip is not None, 'Missing source sync parameters'
  clip=copy.deepcopy(source_clip);clip['index']=nn;config['clips'].append(clip)
  rel=f'content/segments/segment-{nn}';old=src/f'content/segments/segment-{n}'
  for f in old.iterdir():
   if f.is_file():clone(f,STAGE/rel/f.name)
  z=copy.deepcopy(s)
  for k in ['display','camera','mic','audio','system_audio']:
   if z.get(k):z[k]['path']=rel+'/'+pathlib.Path(z[k]['path']).name
  for k in ['cursor','keyboard']:
   if z.get(k):z[k]=rel+'/'+pathlib.Path(z[k]).name
  if z.get('cursor'):
   f=STAGE/z['cursor'];events=json.loads(f.read_text());remap_cursor(events,ids);f.write_text(json.dumps(events))
  meta['segments'].append(z)
  segs=[x for x in c['timeline']['segments'] if x['recordingSegment']==n];assert len(segs)==1 and segs[0]['start']==0 and segs[0].get('timescale',1)==1
  x=copy.deepcopy(segs[0]);x['recordingSegment']=nn;config['timeline']['segments'].append(x)
  offset=max(z[k]['start_time'] for k in ['display','camera','mic','system_audio'] if z.get(k))-z['mic']['start_time']
  segment_map.append({'tag':tag,'sourceRecordingSegment':n,'workingRecordingSegment':nn,'sourceProject':str(src),'workingGlobalStart':duration,'duration':x['end'],'micOffset':offset})
  duration+=x['end']
 for k,items in c['timeline'].items():
  if k=='segments' or not isinstance(items,list):continue
  for x0 in items:
   x=copy.deepcopy(x0)
   if 'id' in x:x['id']=tag+'-'+x['id']
   for field in ['start','end']:
    if field in x:x[field]+=pbase
   config['timeline'][k].append(x)
assert sorted(x['index'] for x in config['clips'])==list(range(len(meta['segments']))), 'Every merged recording needs sync parameters'
for name,value in [('recording-meta.json',meta),('project-config.json',config)]:
 (STAGE/name).write_text(json.dumps(value,ensure_ascii=False,indent=2))
validation=json.loads(subprocess.check_output([CLI,'project','validate',str(STAGE),'--json']));assert validation['valid']
os.rename(STAGE,DEST)
receipt={'schema':'laohu.project-assembly/1','workProject':str(DEST),'status':'initialized','revision':0,'sources':D['provenance']['sourceProjects'],'sourceHashes':D['provenance']['sourceHashes'],'segmentMap':segment_map,'mediaClones':media,'sourceSeconds':duration,'boundary':'New package initialization only; no pre-existing configuration replaced. Subsequent editing through approved revision-safe interfaces.'}
(W/'制作/工程组装回执.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
print(json.dumps({'project':str(DEST),'segments':len(meta['segments']),'clonedFiles':len(media),'logicalBytes':sum(x['bytes'] for x in media),'validated':True},ensure_ascii=False))
