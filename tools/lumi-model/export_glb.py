"""Export lumi.blend to one GLB for the app.

Run:  blender -b work/lumi.blend -P export_glb.py

The node tree keeps the URDF: joint_<name> nodes carry the joint origin, and the link
node under each one turns about its local Z (revolute) or moves along Z (prismatic).
Heavy meshes get a Decimate modifier on export only; the .blend keeps full detail.
"""
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "lumi.glb")

# target face counts for the phone; parts not listed are exported as they are
TARGET = {"link_4": 30000}  # collapse wrecks base_link (CAD mesh), so it stays full
# details the decimation must not touch, in the mesh's own frame
KEEP = {"link_4": lambda co: co.y < -0.055}  # the whole visor front with its lenses


def protect(o, keep):
    """Vertex group of everything that is not plain Shell (colour borders) plus keep()."""
    me = o.data
    shell = [m.name for m in me.materials].index("Shell")
    ids = set()
    for p in me.polygons:
        if p.material_index != shell:
            ids.update(p.vertices)
    if keep:
        ids.update(v.index for v in me.vertices if keep(v.co))
    # widen by one ring so borders between colours stay sharp
    ring = set()
    for e in me.edges:
        a, b = e.vertices
        if a in ids or b in ids:
            ring.update((a, b))
    g = o.vertex_groups.new(name="keep")
    g.add(list(ids | ring), 1.0, "REPLACE")
    return g, len(ids | ring)


def main():
    # neutral pose: the app sets the live one
    for o in bpy.data.objects:
        if o.name.startswith("joint_") and o.children:
            c = o.children[0]
            c.location.z = 0
            c.rotation_euler.z = 0
    # bake logos onto the full-detail shells first, so decimation cannot move them
    for o in bpy.data.objects:
        if o.name.startswith("logo_"):
            bpy.context.view_layer.objects.active = o
            for m in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=m.name)
    for name, target in TARGET.items():
        o = bpy.data.objects[name + "_mesh"]
        n = len(o.data.polygons)
        if n > target:
            d = o.modifiers.new("Lighter", "DECIMATE")
            d.ratio = target / n
            if name in KEEP:  # only where plain collapse broke details (head visor)
                g, kept = protect(o, KEEP[name])
                d.vertex_group = g.name
                d.invert_vertex_group = True
                print(name, n, "faces, protected verts", kept)
            d.use_collapse_triangulate = True
            # keep auto smooth last so normals are computed on the lighter mesh
            if len(o.modifiers) > 1:
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.modifier_move_to_index(modifier="Lighter", index=0)
    for o in bpy.data.objects:
        if o.type == "CAMERA":
            bpy.data.objects.remove(o)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")


main()
