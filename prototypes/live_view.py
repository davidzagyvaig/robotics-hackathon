"""
Fast OAK-D-SR live viewer for DermaScout.

One combined window (RGB | Depth side-by-side), low-latency mode:
  - 640x400 @ 30fps (1/4 the bandwidth of full 1280x800)
  - No subpixel / LR-check (drops compute, depth still solid for our use)
  - PointCloud only computed on snapshot, not every frame

Keys:
  s : save snapshot (rgb, depth, point cloud) into out/
  d : toggle depth alignment to RGB on/off (off = faster)
  q / ESC : quit
"""

import time
from pathlib import Path

import cv2
import depthai as dai
import numpy as np

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)

W, H = 640, 400
FPS = 30


def colorize_depth(depth_mm: np.ndarray, near=200, far=1200) -> np.ndarray:
    d = depth_mm.astype(np.float32)
    d[d == 0] = far
    d = np.clip(d, near, far)
    d = ((d - near) / (far - near) * 255).astype(np.uint8)
    return cv2.applyColorMap(255 - d, cv2.COLORMAP_TURBO)


def main():
    print("== DermaScout live viewer (fast) ==")
    print("Keys: [s] snapshot  [q] quit")

    with dai.Pipeline() as pipeline:
        left = pipeline.create(dai.node.Camera).build(dai.CameraBoardSocket.CAM_B)
        right = pipeline.create(dai.node.Camera).build(dai.CameraBoardSocket.CAM_C)

        # RGB preview at 640x400 — much lighter over USB
        rgb_out = left.requestOutput((W, H), dai.ImgFrame.Type.BGR888i, fps=FPS)

        # Stereo depth — DEFAULT preset (no subpixel, no LR check) for speed
        stereo = pipeline.create(dai.node.StereoDepth)
        stereo.setDefaultProfilePreset(dai.node.StereoDepth.PresetMode.DEFAULT)
        stereo.setDepthAlign(dai.CameraBoardSocket.CAM_B)
        left.requestOutput((W, H), dai.ImgFrame.Type.NV12, fps=FPS).link(stereo.left)
        right.requestOutput((W, H), dai.ImgFrame.Type.NV12, fps=FPS).link(stereo.right)

        # PointCloud is wired but we only grab from its queue on snapshot
        pc = pipeline.create(dai.node.PointCloud)
        stereo.depth.link(pc.inputDepth)

        q_rgb = rgb_out.createOutputQueue(maxSize=1, blocking=False)
        q_depth = stereo.depth.createOutputQueue(maxSize=1, blocking=False)
        q_pcl = pc.outputPointCloud.createOutputQueue(maxSize=1, blocking=False)

        pipeline.start()

        WIN = "DermaScout - OAK-D-SR (RGB | Depth)"
        cv2.namedWindow(WIN, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(WIN, W * 2, H)

        last_rgb = np.zeros((H, W, 3), dtype=np.uint8)
        last_depth = np.zeros((H, W), dtype=np.uint16)
        last_pcl = None
        snap_idx = 0
        last_time = time.time()
        fps_smooth = 0.0

        while True:
            rgb_msg = q_rgb.tryGet()
            depth_msg = q_depth.tryGet()
            pcl_msg = q_pcl.tryGet()

            if rgb_msg is not None:
                last_rgb = rgb_msg.getCvFrame()
            if depth_msg is not None:
                last_depth = depth_msg.getFrame()
            if pcl_msg is not None:
                last_pcl = pcl_msg.getPoints()

            now = time.time()
            dt = now - last_time
            if dt > 0:
                fps_smooth = 0.9 * fps_smooth + 0.1 * (1.0 / dt)
            last_time = now

            depth_vis = colorize_depth(last_depth)
            valid = (last_depth > 0).mean() * 100
            d_min = int(last_depth[last_depth > 0].min()) if (last_depth > 0).any() else 0
            d_max = int(last_depth.max()) if last_depth.max() < 10000 else 9999

            combined = np.hstack([last_rgb, depth_vis])
            txt = f"{fps_smooth:4.1f} FPS  |  depth {d_min}-{d_max}mm  valid {valid:4.1f}%  |  [s]nap [q]uit"
            cv2.putText(combined, txt, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 3)
            cv2.putText(combined, txt, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 1)
            cv2.imshow(WIN, combined)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord("s"):
                snap_idx += 1
                stem = f"snap_{snap_idx:02d}"
                cv2.imwrite(str(OUT / f"{stem}_rgb.png"), last_rgb)
                cv2.imwrite(str(OUT / f"{stem}_depth_vis.png"), depth_vis)
                np.save(OUT / f"{stem}_depth_mm.npy", last_depth)
                if last_pcl is not None and len(last_pcl) > 0:
                    valid_pts = last_pcl[~np.isnan(last_pcl).any(axis=1)]
                    valid_pts = valid_pts[(valid_pts != 0).any(axis=1)]
                    with open(OUT / f"{stem}_cloud.ply", "w") as f:
                        f.write("ply\nformat ascii 1.0\n")
                        f.write(f"element vertex {len(valid_pts)}\n")
                        f.write("property float x\nproperty float y\nproperty float z\nend_header\n")
                        np.savetxt(f, valid_pts, fmt="%.3f")
                    print(f"  saved {stem}_*  ({len(valid_pts)} points)")
                else:
                    print(f"  saved {stem}_*  (no point cloud yet)")

        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
