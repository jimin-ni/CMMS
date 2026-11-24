# Builds minimi.blend: the minimi concept figure (short hair, cardigan) as separate named parts,
# with Kenney furniture beside it for scale. Same shapes and sizes as the spike in
# src/components/heap/engine/figure.js (2026-11-24).
#
#   blender --background --python blender/heap/characters/build_minimi.py
#
# Units are metres, as in the engine. The engine is Y-up and the figure faces +Z there;
# Blender is Z-up, so here the figure faces -Y (Front view, numpad 1, looks at its face).
import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
KENNEY = os.path.join(REPO, "public", "heap", "models", "kenney-furniture")
OUT = os.path.join(HERE, "minimi.blend")


def T(x, y, z):
    """engine (x, y-up, z-front) -> Blender (x, -y front, z-up)"""
    return Vector((x, -z, y))


# ---------- scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"


def collection(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c


COL = collection("minimi")
REF = collection("reference (Kenney CC0, engine scale)")


# ---------- materials (flat colour, named by the part they colour) ----------
def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


def material(name, hexcol, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = srgb(hexcol)
    bsdf.inputs["Roughness"].default_value = rough
    m.diffuse_color = srgb(hexcol)  # viewport solid colour
    return m


MAT = {
    "skin": material("skin", "#efcdb2"),
    "hair": material("hair", "#3a2a22"),
    "top": material("top (cardigan)", "#A6613C"),
    "placket": material("cardigan placket", "#e9dcc6"),
    "button": material("button", "#6e4a30", 0.5),
    "bottom": material("bottom (trousers)", "#565344"),
    "shoe": material("shoe", "#4a3426", 0.6),
    "eye": material("eye", "#2a2230", 0.3),
    "blush": material("blush", "#e58f7c"),
}


# ---------- mesh helpers ----------
def obj(name, bm, mat, loc=(0, 0, 0), parent=None, rot=(0, 0, 0), scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    COL.objects.link(o)
    o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    o.scale = scale
    return o


def ico(r, subdiv=2):  # subdiv 2 = 80 faces = three.js IcosahedronGeometry(r, 1)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    return bm


def uvsphere(r, u, v):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    return bm


def cone(r1, r2, depth, seg):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth)
    return bm


def box(x, y, z):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((x, y, z)), verts=bm.verts)
    return bm


def lathe(profile, seg):
    """profile: [(radius, height)] bottom to top, spun around Z"""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, h)) for r, h in profile]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=seg, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def keep_faces(bm, keep):
    """delete every face whose centre fails keep(centre)"""
    gone = [f for f in bm.faces if not keep(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    return bm


# ---------- the figure ----------
root = bpy.data.objects.new("minimi", None)  # move this empty to move the whole figure
root.empty_display_type = "PLAIN_AXES"
root.empty_display_size = 0.3
COL.objects.link(root)

# legs swing from the hip (origin at 0.18); the foot is a child of its leg
for side, x in (("L", 0.085), ("R", -0.085)):
    bm = cone(0.062, 0.058, 0.13, 7)
    bmesh.ops.translate(bm, vec=Vector((0, 0, -0.065)), verts=bm.verts)
    leg = obj(f"leg.{side}", bm, MAT["bottom"], T(x, 0.18, 0), root)
    obj(f"foot.{side}", uvsphere(0.075, 7, 5), MAT["shoe"], T(0, -0.14, 0.03), leg, scale=(1, 1.35, 0.6))

# body: a soft bell
prof = [(0.0, 0.17), (0.15, 0.17), (0.185, 0.19), (0.2, 0.25), (0.18, 0.36), (0.14, 0.44), (0.07, 0.47), (0.0, 0.475)]
body = obj("body", lathe(prof, 9), MAT["top"], (0, 0, 0), root)
obj("cardigan.placket", box(0.05, 0.02, 0.27), MAT["placket"], T(0, 0.31, 0.19), body, rot=(-0.12, 0, 0))
for i, y in enumerate((0.24, 0.31, 0.38)):
    obj(f"cardigan.button.{i + 1}", uvsphere(0.014, 5, 4), MAT["button"], T(0, y, 0.205 - (y - 0.24) * 0.12), body)

# arms hang from the shoulder (origin at 0.42), tilted out; the hand is a child of its arm
for side, s in (("L", 1), ("R", -1)):
    bm = uvsphere(0.048, 7, 6)  # a stretched sphere stands in for three.js CapsuleGeometry
    bmesh.ops.scale(bm, vec=Vector((1, 1, 2.25)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, -0.09)), verts=bm.verts)
    arm = obj(f"arm.{side}", bm, MAT["top"], T(0.17 * s, 0.42, 0), root, rot=(0, -0.32 * s, 0))
    obj(f"hand.{side}", ico(0.05, 1), MAT["skin"], (0, -0.005, -0.19), arm)

# head
HY, HR = 0.70, 0.265
head = obj("head", ico(HR), MAT["skin"], T(0, HY, 0), root, scale=(1.04, 0.96, 0.97))
for side, x in (("L", 0.088), ("R", -0.088)):
    obj(f"eye.{side}", uvsphere(0.026, 6, 5), MAT["eye"], T(x, HY - 0.025, HR * 0.9), root, scale=(1, 0.6, 1.25))
    obj(f"blush.{side}", uvsphere(0.034, 6, 4), MAT["blush"], T(x * 1.62, HY - 0.085, HR * 0.8), root, scale=(1, 0.35, 0.55))
obj("mouth", uvsphere(0.012, 5, 4), MAT["eye"], T(0, HY - 0.1, HR * 0.92), root)

# hair: a top cap, plus sides and back with the face left open
hr = HR + 0.022
cap = keep_faces(uvsphere(hr, 14, 10), lambda c: c.z > hr * math.cos(0.4 * math.pi) * 0.98)
obj("hair.top", cap, MAT["hair"], T(0, HY + 0.01, -0.01), root)
def sides(c):
    if c.z < hr * math.cos(0.62 * math.pi):
        return False
    a = math.atan2(c.x, -c.y)  # 0 = straight at the face
    return abs(a) > math.pi * 0.25
obj("hair.sides", keep_faces(uvsphere(hr, 14, 10), sides), MAT["hair"], T(0, HY, -0.005), root)
for o in (bpy.data.objects["hair.top"], bpy.data.objects["hair.sides"]):
    m = o.modifiers.new("thickness", "SOLIDIFY")  # open shells need a back face to look solid from inside
    m.thickness = 0.012
    m.offset = 1

# ---------- Kenney furniture for scale (engine MODEL_SCALE 2.0) ----------
def kenney(name, x):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(KENNEY, name + ".glb"))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in o.users_collection:
            c.objects.unlink(o)
        REF.objects.link(o)
    roots = [o for o in new if o.parent is None]
    holder = bpy.data.objects.new(name, None)
    REF.objects.link(holder)
    for o in roots:
        o.parent = holder
    holder.scale = (2, 2, 2)
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(v) for o in new if o.type == "MESH" for v in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    holder.location += Vector((x - (lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    return holder

kenney("chair", 0.75)
kenney("loungeSofa", 2.25)
kenney("desk", -1.35)

# ---------- light and camera for a quick look ----------
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
scene.collection.objects.link(sun)
cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
cam.data.type = "ORTHO"
cam.data.ortho_scale = 5.2
cam.location = (0.3, -6.0, 2.6)
cam.rotation_euler = (math.radians(76), 0, 0)
scene.collection.objects.link(cam)
scene.camera = cam
world = bpy.data.worlds.new("world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = srgb("#f3eadb")
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
scene.world = world

bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("saved", OUT)
