"""Compact office GLBs: JPEG opaque textures and simplify sampled animation keys.
Preserves skin/geometry and alpha textures. Quaternion error <= 0.004 radians.
Run after build.py: python3 scripts/avatars/optimize.py
"""
from pathlib import Path
import json,struct,io,math,hashlib
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]/'public/avatars'
TYPES={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def quaternion_error(a,b):
 dot=abs(sum(x*y for x,y in zip(a,b)));return 2*math.acos(min(1,dot))
def interpolate(a,b,t,rotation):
 if not rotation:return [x+(y-x)*t for x,y in zip(a,b)]
 dot=sum(x*y for x,y in zip(a,b))
 if dot<0:b=[-x for x in b];dot=-dot
 if dot>.9995:
  q=[x+(y-x)*t for x,y in zip(a,b)];n=math.sqrt(sum(x*x for x in q));return [x/n for x in q]
 angle=math.acos(min(1,dot));s=math.sin(angle)
 return [(math.sin((1-t)*angle)*x+math.sin(t*angle)*y)/s for x,y in zip(a,b)]
def simplify(times,values,rotation):
 tolerance=.004 if rotation else .0006
 error=lambda a,b:quaternion_error(a,b) if rotation else max(abs(x-y) for x,y in zip(a,b))
 if all(error(values[0],v)<tolerance for v in values):return [0]
 keep={0,len(times)-1};stack=[(0,len(times)-1)]
 while stack:
  start,end=stack.pop();worst=-1;index=0
  for i in range(start+1,end):
   sample=interpolate(values[start],values[end],(times[i]-times[start])/(times[end]-times[start]),rotation)
   e=error(values[i],sample)
   if e>worst:worst=e;index=i
  if worst>tolerance:keep.add(index);stack.extend([(start,index),(index,end)])
 return sorted(keep)
for file in ROOT.glob('*.glb'):
 raw=file.read_bytes();length=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+length]);binary=raw[28+length:]
 views=[binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for v in g['bufferViews']]
 for image in g.get('images',[]):
  if 'opacity' not in image.get('name','').lower() and image.get('mimeType') != 'image/jpeg':
   output=io.BytesIO();Image.open(io.BytesIO(views[image['bufferView']])).convert('RGB').save(output,format='JPEG',quality=86,optimize=True)
   views[image['bufferView']]=output.getvalue();image['mimeType']='image/jpeg'
 def values(index):
  accessor=g['accessors'][index];width=TYPES[accessor['type']];view=g['bufferViews'][accessor['bufferView']]
  payload=views[accessor['bufferView']];offset=accessor.get('byteOffset',0);stride=view.get('byteStride',width*4)
  return [list(struct.unpack_from('<'+'f'*width,payload,offset+i*stride)) for i in range(accessor['count'])]
 cache={}
 def add(data,type_):
  packed=struct.pack('<'+'f'*sum(len(v) for v in data),*[x for v in data for x in v]);key=(packed,type_)
  if key in cache:return cache[key]
  view=len(views);views.append(packed);g['bufferViews'].append({'buffer':0,'byteLength':len(packed)})
  accessor={'bufferView':view,'componentType':5126,'count':len(data),'type':type_}
  if type_=='SCALAR':accessor['min']=[data[0][0]];accessor['max']=[data[-1][0]]
  index=len(g['accessors']);g['accessors'].append(accessor);cache[key]=index;return index
 for animation in g.get('animations',[]):
  paths={c['sampler']:c['target']['path'] for c in animation['channels']}
  duration=0
  for i,sampler in enumerate(animation['samplers']):
   times=[v[0] for v in values(sampler['input'])];output=values(sampler['output']);duration=max(duration,times[-1])
   keep=simplify(times,output,paths[i]=='rotation')
   sampler['input']=add([[times[k]] for k in keep],'SCALAR')
   sampler['output']=add([output[k] for k in keep],g['accessors'][sampler['output']]['type'])
   sampler['interpolation']='LINEAR'
  # Constant channels can shorten a clip whose motion happens early. Retain its full duration.
  sampler=animation['samplers'][0];times=[v[0] for v in values(sampler['input'])]
  if times[-1]<duration:
   output=values(sampler['output']);sampler['input']=add([[t] for t in times]+[[duration]],'SCALAR');sampler['output']=add(output+[output[-1]],g['accessors'][sampler['output']]['type'])
 # Drop unreferenced raw animation accessors/bufferViews; keep all geometry and embedded images.
 references=[]
 for mesh in g['meshes']:
  for primitive in mesh['primitives']:
   references += [(primitive,'indices')] if 'indices' in primitive else []
   references += [(primitive['attributes'],key) for key in primitive['attributes']]
   for target in primitive.get('targets',[]):references += [(target,key) for key in target]
 for skin in g.get('skins',[]):
  if 'inverseBindMatrices' in skin:references.append((skin,'inverseBindMatrices'))
 for animation in g.get('animations',[]):
  for sampler in animation['samplers']:references += [(sampler,'input'),(sampler,'output')]
 used=sorted({d[k] for d,k in references});mapping={old:i for i,old in enumerate(used)}
 accessors=[g['accessors'][i] for i in used]
 for d,k in references:d[k]=mapping[d[k]]
 view_refs=[(a,'bufferView') for a in accessors if 'bufferView' in a]+[(image,'bufferView') for image in g.get('images',[])]
 used_views=sorted({d[k] for d,k in view_refs});mapping={old:i for i,old in enumerate(used_views)}
 new_binary=bytearray();new_views=[]
 for index in used_views:
  while len(new_binary)%4:new_binary.append(0)
  view=dict(g['bufferViews'][index]);view['byteOffset']=len(new_binary);view['byteLength']=len(views[index]);view['buffer']=0
  new_binary+=views[index];new_views.append(view)
 for d,k in view_refs:d[k]=mapping[d[k]]
 g['accessors']=accessors;g['bufferViews']=new_views;g['buffers']=[{'byteLength':len(new_binary)}]
 # Native asset heights are retained rather than recomputed from the seated loading pose.
 for node in g.get('nodes',[]):
  if node.get('name')=='Bip01':node.setdefault('extras',{})['standingHeight']=1.74
 encoded=json.dumps(g,separators=(',',':')).encode()
 encoded+=b' '*((-len(encoded))%4);new_binary+=b'\x00'*((-len(new_binary))%4)
 result=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(new_binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(new_binary),0x004e4942)+new_binary
 file.write_bytes(result);print(file.name,len(raw),'->',len(result))
manifest=json.loads((ROOT/'manifest.json').read_text())
for asset in manifest['avatars']:
 file=ROOT/(asset['name']+'.glb');asset['bytes']=file.stat().st_size;asset['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
manifest['optimization']={'quaternionToleranceRadians':.004,'translationTolerance':.0006,'opaqueTextureQuality':86}
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
