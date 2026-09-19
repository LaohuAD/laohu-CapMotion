import importlib.util,json,tempfile,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('native',Path(__file__).with_name('cap-project-native-tracks.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class TransactionTest(unittest.TestCase):
 def test_preserves_content_and_rejects_stale_write(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'project-config.json';original={'projectRevision':3,'clips':[{'index':0}],'captions':{'segments':[{'text':'保留'}]},'audio':{'mute':False},'timeline':{'segments':[{'start':1,'end':3}],'maskSegments':[],'textSegments':[]},'motion':{'segments':[{'id':'local'},{'id':'keep'}],'artifacts':[{'segmentId':'local'},{'segmentId':'keep'}]}};p.write_text(json.dumps(original))
   patch={'masks':[{'start':0,'end':1,'track':0,'maskType':'highlight','center':{'x':.5,'y':.5},'size':{'x':.3,'y':.3},'darkness':.7,'opacity':1}],'texts':[],'removeMotionIds':['local']}
   result=m.apply(d,patch,3);now=json.loads(p.read_text());self.assertEqual(result['newRevision'],4)
   for key in ['clips','captions','audio']:self.assertEqual(now[key],original[key])
   self.assertEqual(now['motion']['segments'],[{'id':'keep'}]);before=p.read_bytes()
   with self.assertRaisesRegex(ValueError,'Stale'):m.apply(d,patch,3)
   self.assertEqual(p.read_bytes(),before)
   with self.assertRaises(ValueError):m.apply(d,{'masks':patch['masks'],'texts':[]},4)
   self.assertEqual(p.read_bytes(),before)
 def test_exact_native_removal_preserves_other_segments(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'project-config.json';keep={'start':3,'end':4,'track':0,'content':'保留'};drop={'start':0,'end':1,'track':0,'content':'删除'};p.write_text(json.dumps({'projectRevision':1,'timeline':{'textSegments':[drop,keep]}}))
   m.apply(d,{'removeTexts':[{'start':0,'end':1,'track':0}]},1)
   self.assertEqual(json.loads(p.read_text())['timeline']['textSegments'],[keep]);before=p.read_bytes()
   with self.assertRaisesRegex(ValueError,'exactly one'):m.apply(d,{'removeTexts':[{'start':0,'end':1,'track':0}]},2)
   self.assertEqual(p.read_bytes(),before)
 def test_rejects_invalid_geometry_and_unknown_fields(self):
  with self.assertRaises(ValueError):m.validate_segment({'start':0,'end':1,'track':0,'center':{'x':2,'y':.5},'size':{'x':.3,'y':.3}},'mask')
  with self.assertRaises(ValueError):m.validate_segment({'config':{}},'mask')
if __name__=='__main__':unittest.main()
