"""
Convert a point-cloud / mesh PLY to a web-ready GLB, and emit a lesion-pin JSON.

The dashboard loads the GLB in React Three Fiber and renders pins at the
exported coordinates. We also normalize the mesh to fit a unit-ish box centered
at origin so the camera framing in the browser is predictable.

Usage:
  python tools/ply_to_glb.py out/analysis/snap_005_mesh.ply public/mesh.glb
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import open3d as o3d
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def load_as_mesh(path: Path) -> o3d.geometry.TriangleMesh:
    mesh = o3d.io.read_triangle_mesh(str(path))
    if len(mesh.triangles) > 0:
        mesh.compute_vertex_normals()
        return mesh
    # it's a point cloud -> Poisson reconstruct
    pcd = o3d.io.read_point_cloud(str(path))
    pcd = pcd.voxel_down_sample(3.0)
    pcd.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=10.0, max_nn=30))
    pcd.orient_normals_towards_camera_location(np.array([0.0, 0.0, 0.0]))
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd, depth=8)
    densities = np.asarray(densities)
    if len(densities):
        mesh.remove_vertices_by_mask(densities < np.quantile(densities, 0.05))
    mesh.compute_vertex_normals()
    return mesh


def normalize(verts: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    center = verts.mean(axis=0)
    v = verts - center
    scale = float(np.abs(v).max()) or 1.0
    return v / scale, center, scale


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ply")
    ap.add_argument("glb")
    ap.add_argument("--pins", default=None, help="optional lesion-pins JSON output")
    ap.add_argument("--session", default=None)
    args = ap.parse_args()

    mesh = load_as_mesh(Path(args.ply))
    verts = np.asarray(mesh.vertices)
    faces = np.asarray(mesh.triangles)
    if len(verts) == 0:
        print("empty mesh; aborting")
        return
    nverts, center, scale = normalize(verts)

    # paint a skin-ish color
    tm = trimesh.Trimesh(vertices=nverts, faces=faces, process=False)
    tm.visual.vertex_colors = np.tile(np.array([224, 191, 173, 255], np.uint8), (len(nverts), 1))
    out_glb = Path(args.glb)
    out_glb.parent.mkdir(parents=True, exist_ok=True)
    tm.export(str(out_glb))
    print(f"wrote {out_glb}  ({len(nverts)} verts, {len(faces)} faces)")

    if args.pins:
        from shared import config
        from shared.lesions import LesionDB

        db = LesionDB(config.LESION_DB)
        sid = args.session or db.latest_session()
        pins = []
        if sid:
            for les in db.lesions(sid):
                p = (np.array([les["x_mm"], les["y_mm"], les["z_mm"]]) - center) / scale
                pins.append({
                    "id": les["id"], "position": p.tolist(),
                    "flag": bool(les["flag"]), "tds": les["abcd_tds"],
                    "label": les["classifier_label"], "explanation": les["explanation"],
                    "macro": les["macro_image"], "region": les["region"],
                })
        Path(args.pins).write_text(json.dumps({"session": sid, "pins": pins}, indent=2))
        print(f"wrote {args.pins}  ({len(pins)} pins)")


if __name__ == "__main__":
    main()
