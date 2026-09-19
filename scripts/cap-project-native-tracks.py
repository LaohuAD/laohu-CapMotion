#!/usr/bin/env python3
"""Narrow native highlight/text migration, with the same lock as Cap.
No caller-supplied full project document is accepted. Unknown fields rejected.
"""
import argparse, fcntl, hashlib, json, math, os
from pathlib import Path

def validate_segment(x, kind):
    fields = {'start','end','track','enabled','center','size'} | ({'maskType','feather','opacity','pixelation','darkness','fadeDuration','keyframes'} if kind=='mask' else {'content','fontFamily','fontSize','fontWeight','color','fadeDuration','align','letterSpacing','lineHeight','opacity','shadow','animationIn','animationOut','animationInDuration','animationOutDuration','layout','layoutTransition'})
    if set(x)-fields: raise ValueError('Unknown native segment fields')
    if not all(isinstance(x[k],(int,float)) and math.isfinite(x[k]) for k in ['start','end']) or not 0<=x['start']<x['end']: raise ValueError('Invalid time')
    if not isinstance(x.get('track'),int) or x['track']<0:raise ValueError('Invalid track')
    for k in ['center','size']:
        if set(x[k])!={'x','y'} or not all(isinstance(v,(int,float)) and math.isfinite(v) and 0<=v<=1 for v in x[k].values()):raise ValueError('Invalid normalized geometry')
    if min(x['size'].values())<=0:raise ValueError('Empty size')
    if kind=='mask':
        if x.get('maskType')!='highlight':raise ValueError('Only native highlight is accepted')
        for k in ['opacity','darkness','feather']:
            if not 0<=x.get(k,0)<=1:raise ValueError('Invalid highlight intensity')
    elif not x.get('content','').strip():raise ValueError('Empty text')

def apply(project, patch, expected):
    if set(patch)-{'masks','texts','removeMotionIds','removeMasks','removeTexts'}:raise ValueError('Unknown patch fields')
    for x in patch.get('masks',[]):validate_segment(x,'mask')
    for x in patch.get('texts',[]):validate_segment(x,'text')
    root=Path(project);path=root/'project-config.json';temp=root/f'.project-config.{os.getpid()}.tmp'
    with (root/'.project-config.lock').open('a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        original=path.read_bytes();c=json.loads(original)
        if c['projectRevision']!=expected:raise ValueError('Stale project revision')
        ids=set(patch.get('removeMotionIds',[]));oldmotion=c.get('motion',{});segments=oldmotion.get('segments',[])
        if not ids<={x['id'] for x in segments}:raise ValueError('Unknown motion instance')
        for field,items in [('maskSegments',patch.get('masks',[])),('textSegments',patch.get('texts',[]))]:
            existing=c['timeline'].get(field,[])
            selectors=patch.get('removeMasks' if field=='maskSegments' else 'removeTexts',[])
            for selector in selectors:
                if set(selector)!={'start','end','track'}:raise ValueError('Invalid native removal selector')
                matches=[y for y in existing if all(y.get(k)==v for k,v in selector.items())]
                if len(matches)!=1:raise ValueError('Native removal must match exactly one segment')
                existing=[y for y in existing if y is not matches[0]]
            for x in items:
                if any(x['track']==y.get('track',0) and x['start']<y['end'] and y['start']<x['end'] for y in existing):raise ValueError('Native track overlap; select a free track')
            c['timeline'][field]=sorted(existing+items,key=lambda x:(x['track'],x['start']))
        oldmotion['segments']=[x for x in segments if x['id'] not in ids]
        oldmotion['artifacts']=[x for x in oldmotion.get('artifacts',[]) if x['segmentId'] not in ids]
        # Definitions remain harmless reusable source references; removal is instance-scoped.
        c['projectRevision']+=1
        try:
            with temp.open('w') as f:json.dump(c,f,ensure_ascii=False,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
            os.replace(temp,path)
        finally:
            if temp.exists():temp.unlink()
        return {'schema':'laohu.native-track-receipt/1','previousRevision':expected,'newRevision':c['projectRevision'],'beforeSHA256':hashlib.sha256(original).hexdigest(),'afterSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'addedHighlights':len(patch.get('masks',[])),'addedTexts':len(patch.get('texts',[])),'removedMotionIds':sorted(ids)}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--project',required=True);p.add_argument('--patch',required=True);p.add_argument('--expected-revision',required=True,type=int);p.add_argument('--receipt',required=True);a=p.parse_args();r=apply(a.project,json.loads(Path(a.patch).read_text()),a.expected_revision);Path(a.receipt).write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False))
