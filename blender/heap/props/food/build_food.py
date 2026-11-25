# Builds the first two story props in the Kenney Food Kit convention, then exports each as .glb and .blend.
#   blender -b --factory-startup -P build_food.py
# Convention (read from Food Kit GLBs with uvprobe.py, 2026-11-25):
#   one material "colormap" with the 512x512 Food Kit atlas, nearest filtering.
#   each face samples the centre column of a colour's GRADIENT strip (u = pair*64 + 48);
#   v runs down the strip with the part's height (top of part = top of strip, row_top+13 .. row_top+115),
#   so every part shades light-to-dark from top to bottom. FLAT strips (u = pair*64 + 16) for single-colour details.
# Units: metres, real size. Blender -Y is the model's front (glTF +z). Origin at bottom centre.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS = os.path.join(HERE, 'colormap.png')
random.seed(7)

# colour = (u_px, row_top_px, gradient?)
C = {
    'glaze':   (496, 256, True),  # yangnyeom red     #f96a42 -> #d3554d
    'glazeDk': (464, 256, False), # flat deeper red   #cf534f
    # box: the orange of a Louisiana fried-chicken box (Popeyes ad reel), no logo or brand mark. Inside is a cream liner,
    # which keeps the red glaze readable against it; the orange outside carries the identity
    'paper':   (432, 256, True),  # orange            #ff9b44 -> #ff7444 (box outside)
    'inside':  (240, 256, True),  # cream             #fce2c3 -> #f4ca99 (box inside: darker toward the floor)
    'print':   (464, 384, False), # flat white        #ffffff (printed band)
    'bone':    (240, 256, True),  # cream             #fce2c3 -> #f4ca99
    'red':     (464, 256, False), # flat red          #cf534f
    'white':   (496, 384, True),  # white -> lilac    #f5f5f9 -> #c1c1d8
    'legs':    (240, 384, True),  # dark grey         #454753 -> #353539
    'slate':   (368, 384, True),  # slate             #525565 -> #3e414d
    'body':    (208, 384, False), # flat dark grey    #38383d
    'screen':  (16, 128, False),  # flat blue         #6794d9
}

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def material():
    m = bpy.data.materials.get('colormap')
    if m: return m
    m = bpy.data.materials.new('colormap'); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(ATLAS); tex.interpolation = 'Closest'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 1.0
    return m

# Camera culling. The room camera never goes lower than 18.4 deg above the horizon (scene.js maxPolarAngle 1.25 rad;
# the default view looks down about 33 deg). A face is never seen when it points down more steeply than the lowest
# camera looks down: horizontal/(-down) <= tan(elevation). 15 deg leaves a margin.
MIN_ELEV = math.radians(15)
def unseen(n):
    if n.z >= 0: return False
    return math.hypot(n.x, n.y) / -n.z <= math.tan(MIN_ELEV)

def part(name, build, colour, xf=Matrix(), drop=None):
    """build(bm) fills a bmesh in local space; xf moves it into place.
    colour: key of C, or fn(face_centre_world, normal_world) -> key.
    drop: fn(face_centre_world, normal_world) -> True to delete the face (hidden faces)."""
    bm = bmesh.new(); build(bm)
    bmesh.ops.transform(bm, matrix=xf, verts=bm.verts)
    bm.normal_update()
    dead = [f for f in bm.faces if unseen(f.normal) or (drop and drop(f.calc_center_median(), f.normal))]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    if os.environ.get('PARTS'): print('   part', name, sum(len(f.verts) - 2 for f in bm.faces))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(material())
    uv = me.uv_layers.new(name='UVMap')
    zs = [v.co.z for v in me.vertices]; z0, z1 = min(zs), max(zs); span = max(z1 - z0, 1e-6)
    for p in me.polygons:
        key = colour if isinstance(colour, str) else colour(p.center, p.normal)
        u, top, grad = C[key]
        for li in p.loop_indices:
            z = me.vertices[me.loops[li].vertex_index].co.z
            v = top + 13 + (1 - (z - z0) / span) * 102 if grad else top + 64
            uv.data[li].uv = (u / 512, 1 - v / 512)
        p.use_smooth = False
    return ob

def cube(w, d, h, bevel=0.0):
    def b(bm):
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
        if bevel: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=1, affect='EDGES', profile=0.5)
    return b

def cyl(r1, r2, h, sides, start_cap=True):
    """start_cap False drops the cap at z = 0, for a part whose start is buried in another part."""
    def b(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r1, radius2=r2, depth=h)
        bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
        if not start_cap:
            bm.normal_update()
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9], context='FACES')
    return b

def blob(rx, ry, rz, segs, rings, jitter=0.0):
    def b(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1)
        for v in bm.verts:
            k = 1 + random.uniform(-jitter, jitter)
            v.co = Vector((v.co.x * rx * k, v.co.y * ry * k, v.co.z * rz * k))
    return b

def T(x=0, y=0, z=0): return Matrix.Translation((x, y, z))
def R(axis, deg): return Matrix.Rotation(math.radians(deg), 4, axis)
def aim(a, b):
    """Matrix that puts a part built along +Z from the origin onto the segment a -> b (length must match)."""
    d = (Vector(b) - Vector(a)); q = d.to_track_quat('Z', 'Y')
    return T(*a) @ q.to_matrix().to_4x4()

def finish(name, out):
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    me = ob.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    zs = [v.co.z for v in me.vertices]; xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    print(f'[{name}] tris {tris}  size w {max(xs)-min(xs):.3f} d {max(ys)-min(ys):.3f} h {max(zs)-min(zs):.3f}  materials {len(me.materials)}')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, out + '.blend'))
    bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, out + '.glb'), export_format='GLB', use_selection=False, export_yup=True)
    return tris

# ---------------- yangnyeom chicken box ----------------
# Viewing distance first: at the default room camera this box is about 30 px wide (140-165 px per metre).
# What reads at that size: an open paper box (rim + dark inside), a heap of red glazed pieces, two pale bone ends.
# Everything else is cut: crust bumps, sesame, sauce drips, the lid's print.
def chicken_box():
    reset()
    W, D, H = 0.22, 0.16, 0.07       # open box; the pieces heap above the rim
    WALL, FLOOR = 0.004, 0.012
    BAND0, BAND1 = 0.030, 0.046      # printed band on the outside (1.6 cm: a colour face)
    def box(bm):
        cube(W, D, H)(bm)                                    # straight walls: a flare does not read at 30 px, and a flared
                                                             # outer wall crosses the vertical inner wall (the band showed through)
        for z in (BAND0, BAND1):                             # band cuts first, so they only split the outside walls
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
        bm.normal_update()
        top = [f for f in bm.faces if f.normal.z > 0.9]
        bmesh.ops.inset_region(bm, faces=top, thickness=WALL, depth=-(H - FLOOR))   # hollow: inner walls and a floor
    inner_x, inner_y = W / 2 - WALL - 0.002, D / 2 - WALL - 0.002
    def box_colour(c, n):
        # inside = the floor, or a wall that faces the box centre (the walls flare, so a position test misses them)
        faces_in = abs(n.z) < 0.5 and (n.x * c.x + n.y * c.y) < 0
        if faces_in or (n.z > 0.9 and c.z < H - 0.001): return 'inside'
        if abs(n.z) < 0.5 and BAND0 < c.z < BAND1: return 'print'
        return 'paper'
    part('box', box, box_colour)
    # flap: hinged on the back top edge and dropped back until its far edge rests on the table, so it stays low
    # behind the heap and never competes with it. Angle below the horizon: asin(rim height / flap length)
    down = math.degrees(math.asin((H - 0.002) / D))
    lid = T(0, D / 2, H) @ R('X', -(180 - down)) @ T(0, -D / 2, 0)
    part('lid', cube(W, D, 0.006), lambda c, n: 'inside' if n.z > 0 else 'paper', xf=lid)
    # pieces: low-facet lumps (5 x 3 sphere = 20 tris) heaped from the floor to above the rim.
    # Faces below the rim and inside the box are hidden by the walls and the other pieces: cut.
    hidden = lambda c, n: abs(c.x) < inner_x and abs(c.y) < inner_y and c.z < H - 0.012
    def drum(x, y, z, yaw, tilt):
        base = T(x, y, z) @ R('Z', yaw) @ R('X', tilt)
        part('bulb', blob(0.034, 0.05, 0.03, 5, 3, jitter=0.08), 'glaze', xf=base, drop=hidden)
        a, b = base @ Vector((0, 0.042, 0.0)), base @ Vector((0, 0.078, 0.006))
        L = (b - a).length
        part('bone', cyl(0.011, 0.010, L, 4, start_cap=False), 'bone', xf=aim(a, b))
        # knuckle: one block wider than the bone, across it. Reads as a cartoon bone end at 4-5 px
        part('knuckle', cube(0.026, 0.013, 0.014), 'bone', xf=aim(a, b) @ T(0, 0, L - 0.002) @ R('X', 90) @ T(0, 0, -0.0065))
    drum(-0.045, -0.012, H + 0.004, 25, 8)
    drum(0.052, 0.006, H + 0.002, -35, 6)
    for x, y, z, s, key in ((0.0, -0.030, H + 0.002, 1.0, 'glaze'), (-0.010, 0.035, H - 0.002, 0.9, 'glazeDk'),
                            (0.060, -0.045, H - 0.006, 0.75, 'glazeDk')):
        part('lump', blob(0.042 * s, 0.034 * s, 0.03 * s, 5, 3, jitter=0.12), key, xf=T(x, y, z), drop=hidden)
    return finish('foodYangnyeomChicken', 'food-yangnyeom-chicken')

# ---------------- phone on mini tripod ----------------
# About 35-45 px tall at the default camera. Reads as: blue screen, dark phone edge, three legs. Clamp jaws at 2-3 px stay as one block.
def phone_tripod():
    reset()
    HUB_Z = 0.075
    part('hub', cyl(0.016, 0.014, 0.024, 5), 'slate', xf=T(0, 0, HUB_Z))
    for k in range(3):                                         # three splayed legs, thickened to 1.8 cm; the top end is buried in the hub
        ang = math.radians(90 + k * 120)
        a = Vector((0, 0, HUB_Z + 0.006)); b = Vector((0.075 * math.cos(ang), 0.075 * math.sin(ang), 0.0))
        L = (b - a).length
        part('leg', cube(0.018, 0.018, L), 'legs', xf=aim(b, a) @ T(0, 0, 0),
             drop=lambda c, n: c.z > HUB_Z - 0.002)
    # phone: portrait, tilted back 8 deg, screen toward -Y (the model's front). The ball head is hidden
    # behind the clamp at this size, so it is a short neck block, not a sphere
    PW, PT, PH = 0.075, 0.014, 0.155
    part('neck', cube(0.014, 0.014, 0.024), 'slate', xf=T(0, 0.004, HUB_Z + 0.022))
    tilt = T(0, 0.004, HUB_Z + 0.044) @ R('X', 8)
    def phone(bm):
        cube(PW, PT, PH)(bm)                                   # no chamfer: 4 mm is under a pixel at room size
        bm.normal_update()
        front = [f for f in bm.faces if f.normal.y < -0.9]
        bmesh.ops.inset_region(bm, faces=front, thickness=0.006, depth=0.0)
    part('phone', phone,
         lambda c, n: 'screen' if n.y < -0.9 and abs(c.x) < PW / 2 - 0.005 and 0.006 < (c.z - tilt.translation.z) < PH - 0.006 else 'body',
         xf=tilt)
    # clamp: one bar behind the phone, wider than it, so the jaws show at both sides
    part('clamp', cube(PW + 0.016, 0.018, 0.026), 'slate', xf=tilt @ T(0, PT / 2 + 0.004, PH * 0.42))
    return finish('propPhoneTripod', 'prop-phone-tripod')

t1 = chicken_box()
t2 = phone_tripod()
print('DONE', t1, t2)
