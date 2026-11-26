# Review sheet for every story prop in public/heap/models/cmms-story/, beside four Kenney Food Kit pieces when the kit is on
# this machine. Three renders, written to <repo>/.claude/prop-sheets/ (git-ignored; SHEET_DIR overrides):
#   sheet-close.png   close-up (about 1300 px per metre)
#   sheet-room.png    room size (140 px per metre, the room camera's mid-room scale), upscaled x6 nearest for viewing
#   sheet-black.png   room size, every face flat black on white: the silhouette (identity) test
# Props render at catalogue size (real size x 1.45, as in the room), Kenney pieces at 0.3 x their file size (style only).
#   blender -b --factory-startup -P render_sheet.py
import bpy, math, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
STORY = os.path.join(ROOT, 'public', 'heap', 'models', 'cmms-story')
OUT = os.environ.get('SHEET_DIR') or os.path.join(ROOT, '.claude', 'prop-sheets')
os.makedirs(OUT, exist_ok=True)
KIT = 'G:/workspaceCareer/CMMS/.claude/session-artifacts/heap-poc/assets/kenney/food-kit/Models/GLB format'
PROP_SCALE, KIT_SCALE, STEP = 1.45, 0.3 * 1.45, 0.34

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try: sc.render.engine = eng; break
    except TypeError: pass
sc.view_settings.view_transform = 'Standard'

def load(path, x, scale):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in bpy.data.objects:
        if o not in before and o.parent is None:
            o.scale = (scale,) * 3; o.location.x = x

row = [(os.path.join(STORY, f), PROP_SCALE) for f in sorted(os.listdir(STORY)) if f.endswith('.glb')]
if os.path.isdir(KIT):
    row += [(os.path.join(KIT, f + '.glb'), KIT_SCALE) for f in ('chinese', 'bowl', 'meat-cooked', 'soda-can')]
x0 = -(len(row) - 1) * STEP / 2
for i, (p, s) in enumerate(row):
    load(p, x0 + i * STEP, s)
print('ROW', ' | '.join(os.path.basename(p) for p, _ in row))

bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0)); plane = bpy.context.active_object
plane.scale = (len(row) * STEP + 0.6, 0.9, 1)
pm = bpy.data.materials.new('table'); pm.use_nodes = True
pm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.30, 0.16, 1)
pm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
plane.data.materials.append(pm)

sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; sun.angle = math.radians(8)
so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(-35))
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.72, 0.68, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9

# orthographic, from the front and above at the room camera's default pitch (about 35 deg down)
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = len(row) * STEP + 0.2
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
target = Vector((0.0, 0.0, 0.08)); el, az = math.radians(35), math.radians(-20)
d = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
co.location = target + 6 * d
co.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()

def shot(name, px_per_m):
    w = int(round(cam.ortho_scale * px_per_m)); sc.render.resolution_x = w; sc.render.resolution_y = max(1, int(w * 0.3))
    sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)

def upscale(name, k=6):
    img = bpy.data.images.load(os.path.join(OUT, name + '-raw.png'))
    img.scale(img.size[0] * k, img.size[1] * k)   # bilinear in Blender; good enough to view a 140 px/m render
    img.filepath_raw = os.path.join(OUT, name + '.png'); img.save()

shot('sheet-close.png', 1000)
shot('sheet-room-raw.png', 140)
def flat(rgb):
    m = bpy.data.materials.new('flat'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*rgb, 1); nt.links.new(em.outputs[0], out.inputs[0]); return m
blk, wht = flat((0, 0, 0)), flat((1, 1, 1))
for o in bpy.data.objects:
    if o.type == 'MESH':
        for i in range(len(o.data.materials)): o.data.materials[i] = wht if o is plane else blk
world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
shot('sheet-black-raw.png', 140)
upscale('sheet-room'); upscale('sheet-black')
print('SHEETS', OUT)
