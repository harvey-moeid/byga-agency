"""Blender 4.3: convert pinned MIT Rocketbox avatars into self-contained office GLBs.
Run: blender -b -t 2 --python scripts/avatars/build.py -- /tmp/byga-avatars/source
Source archive paths and commit are recorded in sources.json; no network fetch during builds.
"""
import bpy, sys, json, math, pathlib, hashlib
from mathutils import Quaternion, Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=pathlib.Path(sys.argv[sys.argv.index('--')+1])
SPEC=json.loads((ROOT/'scripts/avatars/sources.json').read_text())
OUTPUT=ROOT/'public/avatars'
OUTPUT.mkdir(parents=True,exist_ok=True)
MODELS={'aria':'Female_Adult_03','nova':'Female_Adult_08','kai':'Male_Adult_03','leo':'Male_Adult_08','iris':'Female_Adult_01'}
# Sample absolute bone orientations, independent of skeleton proportions and rest pose.
clips={}
for name,file in SPEC['clips'].items():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.fbx(filepath=str(SOURCE/'Assets/Animations'/file),ignore_leaf_bones=True)
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
 action=rig.animation_data.action
 first,last=map(int,action.frame_range)
 samples=[]
 for frame in range(first,last+1):
  bpy.context.scene.frame_set(frame)
  samples.append({'rotation':rig.rotation_euler.copy(),'height':rig.location.z,'bones':{b.name:b.matrix.to_quaternion().copy() for b in rig.pose.bones}})
 clips[name]=samples
manifest=[]
for name,model in MODELS.items():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 folder=SOURCE/'Assets/Avatars/Adults'/model
 bpy.ops.import_scene.fbx(filepath=str(folder/'Export'/f'{model}.fbx'),ignore_leaf_bones=True)
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
 original_location=rig.location.copy(); original_rotation=rig.rotation_euler.copy()
 # Remove helper objects and imported two-frame placeholder actions.
 for obj in list(bpy.data.objects):
  if obj.type not in {'ARMATURE','MESH'}:bpy.data.objects.remove(obj,do_unlink=True)
 for action in list(bpy.data.actions):bpy.data.actions.remove(action)
 meshes=[o for o in bpy.data.objects if o.type=='MESH']
 # Keep the highest available mesh only; do not accidentally render multiple LODs.
 selected=max(meshes,key=lambda o:len(o.data.vertices))
 for obj in meshes:
  if obj != selected:bpy.data.objects.remove(obj,do_unlink=True)
 for material in selected.data.materials:
  diffuse=next((n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and '_color' in n.image.filepath),None)
  if not diffuse:raise RuntimeError('Missing diffuse for '+material.name)
  path=folder/'Textures'/pathlib.Path(diffuse.filepath).name
  image=bpy.data.images.load(str(path),check_existing=True)
  # 1024 body / 512 face and hair balance close-up quality and mobile memory.
  size=1024 if 'body' in material.name else 512
  image.scale(min(image.size[0],size),min(image.size[1],size))
  image.file_format='PNG' if 'opacity' in material.name else 'JPEG'
  image.pack()
  material.use_nodes=True;nodes=material.node_tree.nodes;nodes.clear()
  output=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');texture=nodes.new('ShaderNodeTexImage');texture.image=image
  material.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
  shader.inputs['Roughness'].default_value=0.78 if 'body' in material.name else 0.62
  shader.inputs['Metallic'].default_value=0
  if 'head' in material.name:shader.inputs['Subsurface Weight'].default_value=.055
  material.node_tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
  if 'opacity' in material.name:
   material.node_tree.links.new(texture.outputs['Alpha'],shader.inputs['Alpha'])
   material.surface_render_method='DITHERED';material.use_backface_culling=False
 rig.animation_data_create(); rig.animation_data.action=None
 base_height=original_location.z
 for clip_name in ['Idle','Walk','Read','Present','Type']:
  samples=clips['Seated' if clip_name=='Type' else clip_name]
  action=bpy.data.actions.new(clip_name);rig.animation_data.action=action
  for i,sample in enumerate(samples):
   frame=i+1
   rig.location=Vector((0,0,sample['height']*base_height/.895))
   rig.rotation_euler=sample['rotation']
   rig.keyframe_insert('location',frame=frame);rig.keyframe_insert('rotation_euler',frame=frame)
   for bone in rig.pose.bones:
    bone.rotation_mode='QUATERNION';bone.location=(0,0,0);bone.scale=(1,1,1)
    source_rotation=sample['bones'].get(bone.name)
    if source_rotation is None:bone.rotation_quaternion=Quaternion();continue
    target_rest=bone.bone.matrix_local.to_quaternion()
    if bone.parent:
     parent_rest=bone.parent.bone.matrix_local.to_quaternion()
     parent_pose=sample['bones'].get(bone.parent.name,parent_rest)
     q=target_rest.inverted() @ parent_rest @ parent_pose.inverted() @ source_rotation
    else:q=target_rest.inverted() @ source_rotation
    if clip_name=='Type':
     # Small wrist/finger alternation over the seated pose, rather than a whole-body bob.
     if 'Hand' in bone.name:q=q@Quaternion((1,0,0),math.sin(i*.9+(1 if ' L ' in bone.name else 0))*.075)
     if 'Finger' in bone.name:q=q@Quaternion((0,0,1),math.sin(i*1.1)*.055)
    bone.rotation_quaternion=q
    bone.keyframe_insert('rotation_quaternion',frame=frame)
  for fcurve in action.fcurves:
   for key in fcurve.keyframe_points:key.interpolation='LINEAR'
  track=rig.animation_data.nla_tracks.new();track.name=clip_name
  track.strips.new(clip_name,1,action)
 rig.animation_data.action=None
 rig.location=original_location;rig.rotation_euler=original_rotation
 for bone in rig.pose.bones:bone.rotation_quaternion=Quaternion();bone.location=(0,0,0);bone.scale=(1,1,1)
 bpy.context.scene.render.fps=30
 bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=max(len(s) for s in clips.values())
 for obj in bpy.context.scene.objects:obj.select_set(obj in [selected,rig])
 bpy.context.view_layer.objects.active=rig
 target=OUTPUT/f'{name}.glb'
 bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_anim_slide_to_zero=True,export_image_format='AUTO',export_materials='EXPORT',export_extras=True)
 manifest.append({'name':name,'source':model,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'clips':['Idle','Walk','Read','Present','Type']})
 print('GENERATED',name,target.stat().st_size)
(OUTPUT/'manifest.json').write_text(json.dumps({'repository':SPEC['repository'],'commit':SPEC['commit'],'license':'MIT','avatars':manifest},indent=2)+'\n')
