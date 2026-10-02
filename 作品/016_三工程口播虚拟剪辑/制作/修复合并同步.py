"""Field-scoped, revision-locked repair of missing reindexed clip offsets."""
import pathlib,json,copy,fcntl,os,hashlib,argparse
R=pathlib.Path(__file__).resolve().parent.parent

def expected_clips(assembly):
 result=[]
 for m in assembly['segmentMap']:
  c=json.loads((pathlib.Path(m['sourceProject'])/'project-config.json').read_text())
  matches=[x for x in c['clips'] if x['index']==m['sourceRecordingSegment']]
  if len(matches)!=1:raise ValueError('source clip timing missing or ambiguous')
  n=copy.deepcopy(matches[0]);n['index']=m['workingRecordingSegment'];result.append(n)
 return result

def repair(config,clips,revision):
 if config['projectRevision']!=revision:raise ValueError('revision changed')
 out=copy.deepcopy(config);present={x['index']:x for x in config['clips']}
 missing=[x for x in clips if x['index'] not in present]
 out['clips']=config['clips']+missing
 if missing:out['projectRevision']+=1
 for key in config:
  if key not in ['clips','projectRevision']:assert out[key]==config[key]
 return out,missing

if __name__=='__main__':
 args=argparse.ArgumentParser();args.add_argument('--apply',action='store_true');args.add_argument('--expected-revision',type=int,default=45);a=args.parse_args()
 assembly=json.loads((R/'制作/工程组装回执.json').read_text());p=pathlib.Path(assembly['workProject']);expected=expected_clips(assembly)
 with (p/'.project-config.lock').open('a+') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  before=json.loads((p/'project-config.json').read_text());after,missing=repair(before,expected,a.expected_revision)
  receipt={'status':'PLANNED','previousRevision':before['projectRevision'],'newRevision':after['projectRevision'],'project':str(p),'addedClips':missing,'previousClips':before['clips'],'timelineSha256':hashlib.sha256(json.dumps(before['timeline'],sort_keys=True).encode()).hexdigest(),'unchangedFields':[k for k in before if k not in ['clips','projectRevision']],'reason':'merged recording indices12-17 lacked source audio/camera offsets; playback/export defaulted to zero'}
  if a.apply:
   temp=p/'.project-config.sync-repair.tmp'
   with temp.open('w') as f:json.dump(after,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
   os.replace(temp,p/'project-config.json');receipt['status']='APPLIED'
  (R/'制作/音画同步修复回执.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
 print(json.dumps(receipt,ensure_ascii=False))
