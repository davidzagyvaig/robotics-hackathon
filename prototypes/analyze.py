"""
Read out/snapshots/index.json, run analysis on each snap, and try a Poisson
surface reconstruction on the densest point cloud to prove the mesh pipeline.

Outputs go into out/analysis/.
"""

import json
from pathlib import Path

import cv2
import numpy as np
import open3d as o3d

OUT = Path(__file__).parent / "out"
SNAPS = OUT / "snapshots"
ANALYSIS = OUT / "analysis"
ANALYSIS.mkdir(parents=True, exist_ok=True)


def load_ply_xyz(path: Path) -> np.ndarray:
    pcd = o3d.io.read_point_cloud(str(path))
    return np.asarray(pcd.points, dtype=np.float32)


def analyze_one(snap_dir: Path) -> dict:
    info = json.loads((snap_dir / "info.json").read_text())
    pts = load_ply_xyz(snap_dir / "cloud.ply")
    if len(pts) == 0:
        return {**info, "analysis": {"empty": True}}

    # Foreground = closest cluster: take everything within +20 cm of the nearest point
    z = pts[:, 2]
    z_near = z[z > 0].min() if (z > 0).any() else 0
    fg_mask = (z > 0) & (z < z_near + 200.0)
    fg = pts[fg_mask]

    bbox_fg_mm = {
        "x": [float(fg[:, 0].min()), float(fg[:, 0].max())] if len(fg) else [0, 0],
        "y": [float(fg[:, 1].min()), float(fg[:, 1].max())] if len(fg) else [0, 0],
        "z": [float(fg[:, 2].min()), float(fg[:, 2].max())] if len(fg) else [0, 0],
    }
    width_mm = bbox_fg_mm["x"][1] - bbox_fg_mm["x"][0]
    height_mm = bbox_fg_mm["y"][1] - bbox_fg_mm["y"][0]
    depth_mm = bbox_fg_mm["z"][1] - bbox_fg_mm["z"][0]

    return {
        "id": info["id"],
        "label": info["label"],
        "folder": info["folder"],
        "total_points": int(len(pts)),
        "foreground_points": int(len(fg)),
        "foreground_bbox_mm": bbox_fg_mm,
        "foreground_dims_mm": {
            "width": round(width_mm, 1),
            "height": round(height_mm, 1),
            "depth": round(depth_mm, 1),
        },
        "z_near_mm": round(float(z_near), 1),
    }


def try_mesh(snap_folder: Path, out_path: Path) -> dict:
    """Poisson surface reconstruction on the foreground of one snapshot."""
    pcd = o3d.io.read_point_cloud(str(snap_folder / "cloud.ply"))
    pts = np.asarray(pcd.points)
    if len(pts) == 0:
        return {"ok": False, "reason": "empty cloud"}

    # Foreground only (closest 20 cm slab)
    z = pts[:, 2]
    z_near = z[z > 0].min()
    fg = pts[(z > 0) & (z < z_near + 200.0)]
    if len(fg) < 5000:
        return {"ok": False, "reason": f"only {len(fg)} foreground points"}

    fg_pcd = o3d.geometry.PointCloud()
    fg_pcd.points = o3d.utility.Vector3dVector(fg)

    # Voxel downsample so Poisson doesn't choke
    down = fg_pcd.voxel_down_sample(voxel_size=3.0)  # 3mm voxels
    down.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=10.0, max_nn=30)
    )
    down.orient_normals_towards_camera_location(camera_location=np.array([0.0, 0.0, 0.0]))

    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        down, depth=8, scale=1.1, linear_fit=False
    )
    densities = np.asarray(densities)
    if len(densities) > 0:
        # Trim low-density vertices (mesh extrapolated past the data)
        keep = densities > np.quantile(densities, 0.05)
        mesh.remove_vertices_by_mask(~keep)

    mesh.compute_vertex_normals()
    o3d.io.write_triangle_mesh(str(out_path), mesh)

    return {
        "ok": True,
        "input_points": int(len(fg)),
        "downsampled_points": int(len(down.points)),
        "vertices": int(len(mesh.vertices)),
        "triangles": int(len(mesh.triangles)),
        "output": str(out_path.name),
    }


def render_mesh(mesh_path: Path, out_png: Path) -> bool:
    """Off-screen render of the mesh from 3 angles → composite PNG."""
    mesh = o3d.io.read_triangle_mesh(str(mesh_path))
    if len(mesh.vertices) == 0:
        return False
    mesh.compute_vertex_normals()
    mesh.paint_uniform_color([0.85, 0.75, 0.7])  # skin-ish tone

    images = []
    angles = [0.0, np.pi / 3, -np.pi / 3]  # front, slight right, slight left
    for ang in angles:
        R = mesh.get_rotation_matrix_from_xyz((0, ang, 0))
        m = o3d.geometry.TriangleMesh(mesh)
        m.rotate(R, center=mesh.get_center())
        vis = o3d.visualization.Visualizer()
        vis.create_window(visible=False, width=512, height=512)
        vis.add_geometry(m)
        opt = vis.get_render_option()
        opt.background_color = np.array([0.08, 0.08, 0.1])
        vis.poll_events()
        vis.update_renderer()
        img = np.asarray(vis.capture_screen_float_buffer(do_render=True))
        vis.destroy_window()
        images.append((img * 255).astype(np.uint8))

    composite = np.hstack(images)
    cv2.imwrite(str(out_png), cv2.cvtColor(composite, cv2.COLOR_RGB2BGR))
    return True


def main():
    index_path = SNAPS / "index.json"
    if not index_path.exists():
        print("No index.json — run the app and take snapshots first.")
        return
    index = json.loads(index_path.read_text())

    print(f"\n=== Per-snapshot analysis ({len(index['snapshots'])} snaps) ===\n")
    analyses = []
    for entry in index["snapshots"]:
        snap_dir = SNAPS / entry["folder"]
        a = analyze_one(snap_dir)
        analyses.append(a)
        if "analysis" in a and a["analysis"].get("empty"):
            print(f"  {a['id']}  {a['label']:<16}  (empty)")
            continue
        dims = a["foreground_dims_mm"]
        print(
            f"  {a['id']}  {a['label']:<16}  "
            f"foreground {a['foreground_points']:>7,} pts  "
            f"size ~{dims['width']:.0f}×{dims['height']:.0f}×{dims['depth']:.0f} mm  "
            f"at z={a['z_near_mm']:.0f} mm"
        )

    (ANALYSIS / "stats.json").write_text(json.dumps(analyses, indent=2))

    # Pick the snap with the most foreground points for mesh reconstruction
    best = max(analyses, key=lambda a: a.get("foreground_points", 0))
    print(f"\n=== Poisson mesh on {best['id']} ({best['label']}) ===")
    mesh_out = ANALYSIS / f"{best['id']}_mesh.ply"
    mesh_info = try_mesh(SNAPS / best["folder"], mesh_out)
    print(json.dumps(mesh_info, indent=2))

    if mesh_info.get("ok"):
        render_out = ANALYSIS / f"{best['id']}_mesh_render.png"
        try:
            ok = render_mesh(mesh_out, render_out)
            print(f"\nMesh render: {'wrote ' + str(render_out.name) if ok else 'render skipped (empty mesh)'}")
        except Exception as e:
            print(f"\nMesh render failed (headless GL not available): {e}")


if __name__ == "__main__":
    main()
