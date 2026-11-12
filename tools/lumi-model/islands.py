"""List the connected parts (islands) of a mesh in lumi.blend.

Run:  blender -b work/lumi.blend -P islands.py -- link_4 [min_faces]
"""
import sys

import bmesh
import bpy


def islands(bm):
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, part = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            part.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        out.append(part)
    return out


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    name, min_faces = args[0], int(args[1]) if len(args) > 1 else 0
    me = bpy.data.objects[name + "_mesh"].data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    parts = islands(bm)
    print(f"{name}: {len(parts)} islands")
    rows = []
    for i, p in enumerate(parts):
        vs = {v for f in p for v in f.verts}
        xs, ys, zs = zip(*[(v.co.x, v.co.y, v.co.z) for v in vs])
        mats = {}
        for f in p:
            mats[me.materials[f.material_index].name] = mats.get(me.materials[f.material_index].name, 0) + 1
        rows.append((len(p), i, min(xs), max(xs), min(ys), max(ys), min(zs), max(zs), mats))
    for r in sorted(rows, reverse=True):
        if r[0] < min_faces:
            continue
        print("faces=%6d id=%4d x[% .3f % .3f] y[% .3f % .3f] z[% .3f % .3f] %s" % r)


main()
