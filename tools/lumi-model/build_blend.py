"""Build lumi.blend from the robot's URDF and STL meshes.

Run:  blender -b -P tools/lumi-model/build_blend.py

Each URDF link becomes an empty, joints become parent empties with the URDF origin,
and every mesh gets material slots (Shell, Visor, Trim, Sensor, Metal, Rubber, Red,
Green, Logo) with a first colouring from simple rules. Fix the rest by hand in
Blender: Edit Mode, select faces (L picks a connected part), Material tab, Assign.
"""
import math
import os
import xml.etree.ElementTree as ET

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import convex_hull_2d

HERE = os.path.dirname(os.path.abspath(__file__))
DESC = os.path.expanduser("~/Documents/PROJECTS/JakaLumi_simulation/sim/lumi_description")
URDF = os.path.join(DESC, "urdf", "jaka_lumi.urdf")
MESHES = os.path.join(DESC, "meshes")
# The arm's links from JAKA's MiniCobo STEP (jaka.com download centre, "MiniCobo&Mini2 2023-03-03"), each fitted
# onto the URDF link it replaces (median gap 0.4-0.8 mm) and written in that link's frame, in metres; link_a4 keeps
# JAKA's own placement (the URDF's a4 mesh was turned half a turn). The URDF's own arm meshes are simplified.
ARM_MESHES = os.path.join(HERE, "assets", "minicobo")
# The URDF puts link_a5 on the wrong side of link_a4's J5 face: in JAKA's assembly (and on the robot) it sits
# 36.75 mm further along the J5 axis, so the flange's link meets the wrist from the other side. The axis is unchanged.
JOINT_SHIFT = {"l_a5": (0.0, 0.03675, 0.0)}  # in the parent link's frame, m
OUT = os.path.join(HERE, "work", "lumi.blend")
FONT = "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"

# a viewing pose; the app sets the live pose itself
POSE = {"l_a2": 1.0, "l_a3": 0.5, "l_a5": 1.57}  # close to the photo Jaka_lumi.jpg

MATS = {
    #  name     colour (sRGB hex)  rough  metal  coat
    "Shell":  ("f2f4f6", 0.32, 0.0, 0.9),
    "Visor":  ("08090b", 0.12, 0.2, 1.0),
    "Trim":   ("16181b", 0.45, 0.1, 0.3),
    "Sensor": ("050607", 0.10, 0.3, 1.0),
    "Metal":  ("b9c0c7", 0.25, 0.9, 0.0),
    "Rubber": ("111316", 0.70, 0.0, 0.0),
    "Red":    ("d7262e", 0.40, 0.0, 0.3),
    "Green":  ("48e08a", 0.30, 0.0, 0.3),
    "Logo":   ("c8131f", 0.40, 0.0, 0.3),
    "Light":  ("3fe6d6", 0.30, 0.0, 0.0),
    "Matte":  ("0b0c0e", 0.60, 0.0, 0.0),
    "Lamp":   ("8fd8ff", 0.25, 0.0, 0.0),
}
GLOW = {"Green": 1.5, "Light": 4.0, "Lamp": 3.0}
EXTRA = ("Logo", "Light", "Lamp")  # materials of added parts, not mesh slots


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def make_materials():
    out = {}
    for name, (hexc, rough, metal, coat) in MATS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = srgb(hexc)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.15
        if name in GLOW:
            b.inputs["Emission Color"].default_value = srgb(hexc)
            b.inputs["Emission Strength"].default_value = GLOW[name]
        m.diffuse_color = srgb(hexc)  # solid view shows the real colour
        out[name] = m
    return out


def origin_matrix(el):
    if el is None:
        return Matrix.Identity(4)
    xyz = [float(v) for v in el.get("xyz", "0 0 0").split()]
    rpy = [float(v) for v in el.get("rpy", "0 0 0").split()]
    return Matrix.Translation(xyz) @ Euler(rpy, "XYZ").to_matrix().to_4x4()


# ---------------------------------------------------------------- first colouring rules
# rule(centroid, normal, area) -> material name or None (Shell); coordinates are mesh-local
def base_rule(c, n, a):
    if c.z < -0.2475:
        return "Rubber"                                  # black rubber bumper and the underside
    if c.y < -0.15 and abs(c.x) < 0.045 and -0.132 < c.z < -0.110:
        # flat black window with the three front sensors; the sensors inside are glossy glass
        return "Matte" if c.y < -0.2025 else "Sensor"
    if c.y > 0.29 and n.y > 0.3 and abs(c.x) < 0.068 and -0.208 < c.z < -0.127:
        return "Trim"                                    # charging port panel at the back
    if 0.21 < c.y < 0.25 and 0.10 < c.z < 0.16 and min((c.x - x) ** 2 for x in (-0.038, 0, 0.038)) + (c.z - 0.1295) ** 2 < 0.018 ** 2:
        return "Sensor"                                  # three round sensors in the back recess
    return None


def stadium(p, a, b, r):
    """Is 2D point p inside the capsule of segment a-b with radius r?"""
    ax, az = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((p[0] - a[0]) * ax + (p[1] - a[1]) * az) / (ax * ax + az * az)))
    dx, dz = p[0] - a[0] - t * ax, p[1] - a[1] - t * az
    return dx * dx + dz * dz <= r * r


def column_rule(c, n, a):
    # torso camera: only the engraved capsule with the lenses is black, the handle stays white
    if n.y < -0.7 and c.y < -0.010 and stadium((c.x, c.z), (0.077, 0.0285), (0.174, 0.0285), 0.0148):
        return "Sensor"
    return None


RULES = {"base_link": base_rule, "link_2": column_rule}
# plane cuts made before colouring, so colour borders run straight: link -> [(point, normal)]
CUTS = {"base_link": [((0, 0, -0.2475), (0, 0, 1))]}

# (link, centre inside the part, side it faces, reading direction, width m), link frame
LOGOS = [
    ("base_link", (0, 0, -0.176), (0, -1, 0), (1, 0, 0), 0.112),    # lower body front, the lamp sits under it
    ("link_a1", (0, 0, 0.156), (0, 1, 0), (0, 0, 1), 0.075),        # J2 housing cap, upside down in the photo
    # the two on the arm's front (photos 2026-11-16): along the arm, read from the wrist toward the shoulder
    ("link_a2", (0.015, 0, 0), (0, 0, 1), (-1, 0, 0), 0.075),        # J2 housing at the bottom of the upper arm
    ("link_a4", (0, 0, 0.065), (0, 1, 0), (0, 0, -1), 0.065),        # J5 housing's flat cover under the flange's link
]
WHOLE = {"wheel_l": "Rubber", "wheel_r": "Rubber", "link_a6": "Metal", "link_at": "Metal"}


# ---------------------------------------------------------------- region tools
def flood(seed, max_angle):
    """Faces reachable from seed without crossing an edge sharper than max_angle (deg)."""
    lim = math.radians(max_angle)
    region, stack = {seed}, [seed]
    while stack:
        f = stack.pop()
        for e in f.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(10) <= lim:
                for g in e.link_faces:
                    if g not in region:
                        region.add(g)
                        stack.append(g)
    return region


def ray_face(bm, origin, direction):
    hit = BVHTree.FromBMesh(bm).ray_cast(Vector(origin), Vector(direction).normalized())
    return bm.faces[hit[2]] if hit[0] is not None else None


def inside_hull(pts):
    """2D convex hull of pts -> point test."""
    hull = [pts[i] for i in convex_hull_2d(pts)]

    def test(p):
        s = None
        for i in range(len(hull)):
            a, b = hull[i], hull[(i + 1) % len(hull)]
            cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
            if abs(cr) < 1e-12:
                continue
            if s is None:
                s = cr > 0
            elif (cr > 0) != s:
                return False
        return True
    return test


def paint_head(bm, idx):
    """Visor: only the camera pill in the middle of the face; the face round it stays white.

    The pill is its own part (head front is -y, x is up, z is across)."""
    parts = islands(bm)
    main = max(parts, key=len)
    pill = [p for p in parts if p is not main and min(v.co.y for f in p for v in f.verts) < -0.066
            and len(p) > 300]
    pill = max(pill, key=len)
    test = inside_hull([(v.co.x, v.co.z) for f in pill for v in f.verts])
    n = 0
    for f in pill:
        f.material_index = idx["Visor"]
        n += 1
    for f in main:
        c = f.calc_center_median()
        if c.y < -0.060 and test((c.x, c.z)):
            f.material_index = idx["Visor"]
            n += 1
    print("visor faces", n)


def islands(bm):
    seen, out = set(), []
    for f in bm.faces:
        if f in seen:
            continue
        stack, part = [f], []
        seen.add(f)
        while stack:
            g = stack.pop()
            part.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h)
                        stack.append(h)
        out.append(part)
    return out


def paint_base(bm, idx):
    """Whole small parts: sensor pods round the belt, the round lidar column in the gap,
    the three round sensors on the back, metal charging contacts."""
    n = {"pods": 0, "column": 0, "back": 0, "contacts": 0}
    for part in islands(bm):
        vs = [v.co for f in part for v in f.verts]
        xs, ys, zs = [v.x for v in vs], [v.y for v in vs], [v.z for v in vs]
        name = None
        if 300 < len(part) < 3000 and min(zs) > -0.045 and max(zs) < -0.010:
            name, key = "Sensor", "pods"
        elif max(map(abs, xs)) < 0.035 and -0.16 < min(ys) and max(ys) < -0.07 and -0.13 < min(zs) and max(zs) < -0.03:
            name, key = "Trim", "column"
        elif max(map(abs, xs)) < 0.06 and min(ys) > 0.21 and max(ys) < 0.235 and min(zs) > 0.11 and max(zs) < 0.15:
            name, key = "Sensor", "back"
        elif max(map(abs, xs)) < 0.02 and min(ys) > 0.27 and -0.19 < min(zs) and max(zs) < -0.15:
            name, key = "Metal", "contacts"
        if name:
            for f in part:
                f.material_index = idx[name]
            n[key] += 1
    print("base parts", n)
    add_pod_bezels(bm, idx)


def part_frame(part):
    """Centre and long-axis angle (radians, in xy) of a part."""
    vs = list({v for f in part for v in f.verts})
    cx = sum(v.co.x for v in vs) / len(vs)
    cy = sum(v.co.y for v in vs) / len(vs)
    cz = sum(v.co.z for v in vs) / len(vs)
    sxx = sum((v.co.x - cx) ** 2 for v in vs)
    syy = sum((v.co.y - cy) ** 2 for v in vs)
    sxy = sum((v.co.x - cx) * (v.co.y - cy) for v in vs)
    return Vector((cx, cy, cz)), 0.5 * math.atan2(2 * sxy, sxx - syy)


def add_pod_bezels(bm, idx):
    """The two front corner sensor pods lack the dark bezel the other pods sit in, so they
    look stuck on. Copy the front centre bezel onto them, turned and moved like the pod."""
    pods, bezels = [], []
    for part in islands(bm):
        zs = [v.co.z for f in part for v in f.verts]
        if min(zs) > -0.045 and max(zs) < -0.010:
            if 700 < len(part) < 900:
                pods.append(part)
            elif 2000 < len(part) < 2400:
                bezels.append(part)
    centre_pod = min(pods, key=lambda p: abs(part_frame(p)[0].x) + part_frame(p)[0].y)
    centre_bezel = min(bezels, key=lambda p: part_frame(p)[0].y)
    c0, a0 = part_frame(centre_pod)
    for pod in pods:
        c, a = part_frame(pod)
        if not (abs(c.x) > 0.15 and c.y < -0.12):  # the two front corners only
            continue
        turn = a - a0
        # the long axis has no sign: pick the turn that keeps the pod facing outwards
        out = Vector((c.x, c.y + 0.05, 0)).normalized()
        face = Matrix.Rotation(turn, 3, "Z") @ Vector((0, -1, 0))
        if face.dot(out) < 0:
            turn += math.pi
        rot = Matrix.Rotation(turn, 4, "Z")
        dup = bmesh.ops.duplicate(bm, geom=centre_bezel)["geom"]
        verts = [g for g in dup if isinstance(g, bmesh.types.BMVert)]
        for v in verts:
            v.co = rot @ (v.co - c0) + c
        for g in dup:
            if isinstance(g, bmesh.types.BMFace):
                g.material_index = idx["Sensor"]
        print("pod bezel at", tuple(round(x, 3) for x in c), "turn", round(math.degrees(turn), 1))


PAINTERS = {"link_4": paint_head, "base_link": paint_base}


def import_stl(path):
    bpy.ops.wm.stl_import(filepath=path)
    return bpy.context.selected_objects[0]


def prepare_mesh(obj, link, mats):
    me = obj.data
    for name in MATS:
        if name not in EXTRA:
            me.materials.append(mats[name])
    idx = {m.name: i for i, m in enumerate(me.materials)}
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)  # STL faces share no verts
    for co, no in CUTS.get(link, []):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    rule = RULES.get(link)
    whole = WHOLE.get(link)
    for f in bm.faces:
        name = whole or (rule(f.calc_center_median(), f.normal, f.calc_area()) if rule else None)
        f.material_index = idx[name or "Shell"]
    if link in PAINTERS:
        PAINTERS[link](bm, idx)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    try:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    except Exception:
        pass


def add_band(parent, radius, width, z, mat, name):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=width, end_fill_type="NOTHING")
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    o.parent = parent
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.location = (0, 0, z)
    return o


def add_ring(parent, radius, tube, z, mat, name):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=tube, major_segments=96, minor_segments=12)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    o.parent = parent
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.location = (0, 0, z)
    return o


BRAND_LOGO = os.path.join(HERE, "assets", "cutshion_logo.png")  # teal and yellow, transparent


def add_brand_logo(parent):
    """Cutshion logo on the front of the waist column, centred just under the upper red band.
    A thin curved patch round the column (radius 0.0632, front is -y) with the logo as texture."""
    img = bpy.data.images.load(BRAND_LOGO, check_existing=True)
    aspect = img.size[0] / img.size[1]
    R, width, top = 0.0636, 0.092, 0.290              # a little under band_high (0.312..0.324)
    height = width / aspect
    zc = top - height / 2
    span = width / R
    nu, nv = 32, 2
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    grid = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            a = -math.pi / 2 + (u - 0.5) * span          # centred on -y, reading left to right from the front
            row.append(bm.verts.new((R * math.cos(a), R * math.sin(a), zc + (v - 0.5) * height)))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for loop, (du, dv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                loop[uv].uv = ((i + du) / nu, (j + dv) / nv)
    bm.normal_update()
    me = bpy.data.meshes.new("brand_logo")
    bm.to_mesh(me)
    bm.free()
    if me.polygons[0].normal.y > 0:                     # must face out of the column
        me.flip_normals()
    m = bpy.data.materials.new("BrandLogo")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.4
    bsdf.inputs["Coat Weight"].default_value = 0.3
    m.blend_method = "BLEND"
    me.materials.append(m)
    o = bpy.data.objects.new("brand_logo", me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    o.matrix_parent_inverse = Matrix.Identity(4)
    return o


def add_box(parent, name, mat, loc, size, bevel):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.name = o.data.name = name
    o.data.materials.append(mat)
    o.parent = parent
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.location = loc
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bev = o.modifiers.new("Round", "BEVEL")
    bev.width, bev.segments = bevel, 3
    return o


def add_front_sensors(parent, mats):
    """Front sensor module under the lidar, as on the JAKA photos: a flat black glass window
    with two camera lenses and a sensor between them. It sits flush in the notch and covers
    the bare holes of the STL (centres x = -0.027, 0.0005, 0.028, z = -0.120)."""
    y, z = -0.2046, -0.1205
    add_box(parent, "front_window", mats["Visor"], (0, y, z), (0.090, 0.0016, 0.0215), 0.006)
    yf = y - 0.0008                                   # front face of the window
    for i, (x, cam) in enumerate(((-0.0270, True), (0.0005, False), (0.0280, True))):
        r = 0.0062 if cam else 0.0042
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r, depth=0.0010)
        lens = bpy.context.object
        lens.name = lens.data.name = ("front_cam_%d" if cam else "front_sensor_%d") % i
        lens.data.materials.append(mats["Sensor"] if cam else mats["Trim"])
        lens.parent = parent
        lens.matrix_parent_inverse = Matrix.Identity(4)
        lens.rotation_euler = (math.pi / 2, 0, 0)
        lens.location = (x, yf - 0.0004, z)
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.0007, major_segments=48, minor_segments=8)
        ring = bpy.context.object
        ring.name = ring.data.name = lens.name + "_ring"
        ring.data.materials.append(mats["Metal"])
        ring.parent = parent
        ring.matrix_parent_inverse = Matrix.Identity(4)
        ring.rotation_euler = (math.pi / 2, 0, 0)
        ring.location = (x, yf - 0.0006, z)
        if cam:                                       # small bright pupil so it reads as a camera
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r * 0.35, depth=0.0006)
            pupil = bpy.context.object
            pupil.name = pupil.data.name = lens.name + "_pupil"
            pupil.data.materials.append(mats["Visor"])
            pupil.parent = parent
            pupil.matrix_parent_inverse = Matrix.Identity(4)
            pupil.rotation_euler = (math.pi / 2, 0, 0)
            pupil.location = (x, yf - 0.0010, z)


def add_lamp(parent, mats):
    """Status lamp under the front JAKA logo: one light blue bar in a thin dark frame.
    The app keeps it on, and lets it breathe while charging (node lamp)."""
    y, z = -0.2050, -0.2215          # front face of the lower body, under the logo
    add_box(parent, "lamp_frame", mats["Matte"], (0, y - 0.0007, z), (0.066, 0.0020, 0.0135), 0.0055)
    add_box(parent, "lamp", mats["Lamp"], (0, y - 0.0019, z), (0.060, 0.0012, 0.0085), 0.0040)


def add_logo(link, target, center, normal, reading, width, mat, name):  # noqa: C901
    """JAKA as real geometry on a link's surface.

    center: a point inside the part (link frame); normal: the side the logo faces;
    reading: the direction the text reads in. A ray from outside finds the surface,
    then a Shrinkwrap modifier lays the letters onto curved shells.
    """
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = "JAKA"
    curve.font = bpy.data.fonts.load(FONT, check_existing=True)
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.resolution_u = 6
    tmp = bpy.data.objects.new(name + "_txt", curve)
    bpy.context.scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp)
    bm = bmesh.new()
    bm.from_mesh(me)
    xs = [v.co.x for v in bm.verts]
    k = width / (max(xs) - min(xs))
    bmesh.ops.scale(bm, vec=(k, k, k), verts=bm.verts)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()

    bpy.context.view_layer.update()
    Wl, Wt = link.matrix_world, target.matrix_world
    N = (Wl.to_3x3() @ Vector(normal)).normalized()
    R = (Wl.to_3x3() @ Vector(reading)).normalized()
    U = N.cross(R)
    P = Wl @ Vector(center)
    Ti = Wt.inverted()
    tbm = bmesh.new()
    tbm.from_mesh(target.data)
    hit = BVHTree.FromBMesh(tbm).ray_cast(Ti @ (P + N * 0.3), (Ti.to_3x3() @ -N).normalized())
    tbm.free()
    if hit[0] is None:
        raise RuntimeError(f"{name}: no surface found")
    m = Matrix((R, U, N)).transposed().to_4x4()
    m.translation = Wt @ hit[0] + N * 0.0004
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    o.parent = link
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.matrix_world = m
    sw = o.modifiers.new("Wrap", "SHRINKWRAP")
    sw.target = target
    sw.wrap_method = "NEAREST_SURFACEPOINT"
    sw.offset = 0.0004
    return o


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    root = ET.parse(URDF).getroot()

    links, meshes = {}, {}
    for l in root.findall("link"):
        name = l.get("name")
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.03
        bpy.context.scene.collection.objects.link(e)
        links[name] = e
        mesh_el = l.find("visual/geometry/mesh")
        if mesh_el is not None:
            cad = os.path.join(ARM_MESHES, name + ".stl")
            own = os.path.exists(cad)
            o = import_stl(cad if own else os.path.join(MESHES, os.path.basename(mesh_el.get("filename"))))
            o.name = o.data.name = name + "_mesh"
            o.parent = e
            o.matrix_parent_inverse = Matrix.Identity(4)
            o.matrix_basis = Matrix.Identity(4) if own else origin_matrix(l.find("visual/origin"))
            prepare_mesh(o, name, mats)
            meshes[name] = o

    for j in root.findall("joint"):
        name, parent, child = j.get("name"), j.find("parent").get("link"), j.find("child").get("link")
        je = bpy.data.objects.new("joint_" + name, None)
        je.empty_display_size = 0.02
        bpy.context.scene.collection.objects.link(je)
        je.parent = links[parent]
        je.matrix_basis = origin_matrix(j.find("origin"))
        if name in JOINT_SHIFT:
            je.matrix_basis = Matrix.Translation(JOINT_SHIFT[name]) @ je.matrix_basis
        je["urdf_type"] = j.get("type")
        c = links[child]
        c.parent = je
        c.matrix_parent_inverse = Matrix.Identity(4)
        v = POSE.get(name, 0.0)
        if j.get("type") == "prismatic":
            c.location.z = v
        else:
            c.rotation_euler.z = v

    # the base's lowest point sits on the floor (URDF base origin is 0.289 m up)
    links["world"].location.z = 0.289

    # details the STL files lack
    add_band(links["link_2"], 0.0632, 0.012, 0.012, mats["Red"], "band_low")
    add_band(links["link_2"], 0.0632, 0.012, 0.318, mats["Red"], "band_high")
    add_ring(links["link_a1"], 0.05, 0.0045, 0.012, mats["Green"], "ring_shoulder")
    add_lamp(links["base_link"], mats)
    add_brand_logo(links["link_2"])
    add_front_sensors(links["base_link"], mats)

    # JAKA logos where the real robot has them (photos in JakaLumi_simulation)
    for link, center, normal, reading, width in LOGOS:
        add_logo(links[link], meshes[link], center, normal, reading, width, mats["Logo"], "logo_" + link)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    for n, o in meshes.items():
        print(f"{n:10s} faces={len(o.data.polygons)}")
    print("saved", OUT)


main()
