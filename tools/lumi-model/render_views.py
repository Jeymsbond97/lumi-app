"""Render check views of lumi.blend.

Run:  blender -b work/lumi.blend -P render_views.py -- [view ...]
A pose JSON may be passed too, and ad hoc views as view=name:x,y,z:x,y,z:lens. Views: front, left, right, back, three, head, base, arm. PNGs land in work/views/.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "work", "views")

# name: (camera position, look-at point, focal length mm)
VIEWS = {
    "front": ((0, -4.2, 0.95), (0, 0, 0.85), 85),
    "back":  ((0, 4.2, 0.95), (0, 0, 0.85), 50),
    "left":  ((-4.2, 0, 0.95), (0, 0, 0.85), 50),
    "right": ((4.2, 0, 0.95), (0, 0, 0.85), 50),
    "three": ((2.6, -3.2, 1.6), (0, 0, 0.8), 80),
    "head":  ((0.35, -0.9, 1.5), (0, 0, 1.4), 85),
    "base":  ((0.9, -1.5, 0.55), (0, 0, 0.25), 60),
    "arm":   ((-0.3, -1.6, 1.2), (-0.3, 0, 1.0), 70),
    "photo": ((-0.9, -1.7, 1.5), (-0.2, 0, 1.15), 55),
    "pod":   ((0.06, -0.55, 0.30), (0, -0.2, 0.26), 120),
    "logos": ((-0.55, -1.0, 1.25), (-0.3, 0, 1.15), 70),
    "headf": ((0.0, -0.9, 1.36), (0, 0, 1.36), 135),
    "torso": ((0.45, -0.75, 1.0), (0.17, 0, 0.98), 120),
    "basef": ((0.0, -1.3, 0.2), (0, 0, 0.17), 75),
    "baseb": ((0.0, 1.4, 0.45), (0, 0, 0.3), 70),
    "baselow": ((0.7, -1.1, 0.06), (0, 0, 0.1), 70),
    "inner": ((0.25, -0.75, 0.55), (0, 0, 0.42), 60),
    "j5": ((-0.39, -0.35, 1.38), (-0.39, 0, 1.38), 120),
}


def setup():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_specular_highlight = True
    sh.show_cavity = True
    sh.cavity_type = "WORLD"
    sc.render.resolution_x, sc.render.resolution_y = 1000, 1000
    sc.render.film_transparent = False
    sc.world = sc.world or bpy.data.worlds.new("w")
    sh.background_type = "VIEWPORT"
    sh.background_color = (0.55, 0.6, 0.65)
    for o in sc.objects:
        if o.type == "EMPTY":
            o.hide_render = True
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def main():
    names = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for n in names:
        if n.startswith("{"):  # a pose: {"l_a2": 0.6, ...}
            for k, v in json.loads(n).items():
                bpy.data.objects["joint_" + k].children[0].rotation_euler.z = v
    for n in names:
        if n.startswith("view="):  # view=name:x,y,z:x,y,z:lens  (camera, look-at, mm)
            k, cam_, at_, lens_ = n[5:].split(":")
            VIEWS[k] = (tuple(map(float, cam_.split(","))), tuple(map(float, at_.split(","))), float(lens_))
    names = [n.split(":")[0][5:] if n.startswith("view=") else n for n in names if not n.startswith("{")]
    names = names or ["front", "three", "head", "base", "arm"]
    sc, cam = setup()
    os.makedirs(OUT, exist_ok=True)
    for n in names:
        pos, at, lens = VIEWS[n]
        cam.location = pos
        d = Vector(at) - Vector(pos)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens
        sc.render.filepath = os.path.join(OUT, n + ".png")
        bpy.ops.render.render(write_still=True)
        print("wrote", sc.render.filepath)


main()
