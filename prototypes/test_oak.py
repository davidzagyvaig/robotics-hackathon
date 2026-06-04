"""
OAK-D-SR smoke test for DermaScout (depthai v3 API).

Captures:
  - one RGB frame
  - one stereo depth frame
  - one point cloud as .ply
  - device + sensor info
"""

import time
from pathlib import Path

import cv2
import depthai as dai
import numpy as np

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)


def main():
    print("== DermaScout OAK-D-SR smoke test (depthai v3) ==\n")

    available = dai.Device.getAllAvailableDevices()
    print(f"depthai version: {dai.__version__}")
    print(f"Devices visible: {len(available)}")
    for d in available:
        print(f"  - id={d.getDeviceId()}  name={d.name}  state={d.state}  protocol={d.protocol}  platform={d.platform}")
    if not available:
        print("No device. Replug USB-C. macOS may need permission grant on first connect.")
        return

    with dai.Pipeline() as pipeline:
        # OAK-D-SR layout: 2x color OV9782 at CAM_B (left) and CAM_C (right).
        # Use CAM_B as both the RGB source AND the left of the stereo pair.
        left_cam = pipeline.create(dai.node.Camera).build(dai.CameraBoardSocket.CAM_B)
        right_cam = pipeline.create(dai.node.Camera).build(dai.CameraBoardSocket.CAM_C)

        rgb_out = left_cam.requestOutput((1280, 800), dai.ImgFrame.Type.BGR888i)

        stereo = pipeline.create(dai.node.StereoDepth)
        stereo.setDefaultProfilePreset(dai.node.StereoDepth.PresetMode.FAST_DENSITY)
        stereo.setLeftRightCheck(True)
        stereo.setSubpixel(True)
        stereo.setDepthAlign(dai.CameraBoardSocket.CAM_B)
        left_cam.requestOutput((1280, 800), dai.ImgFrame.Type.NV12).link(stereo.left)
        right_cam.requestOutput((1280, 800), dai.ImgFrame.Type.NV12).link(stereo.right)

        pc = pipeline.create(dai.node.PointCloud)
        stereo.depth.link(pc.inputDepth)

        # Host output queues
        q_rgb = rgb_out.createOutputQueue(maxSize=4, blocking=False)
        q_depth = stereo.depth.createOutputQueue(maxSize=4, blocking=False)
        q_pcl = pc.outputPointCloud.createOutputQueue(maxSize=4, blocking=False)

        pipeline.start()

        # Report device info now that the pipeline is bound to one
        dev = pipeline.getDefaultDevice()
        print(f"\nConnected: id={dev.getDeviceId()}")
        try:
            print(f"USB speed: {dev.getUsbSpeed().name}")
        except Exception:
            pass
        try:
            print(f"Cameras present: {[(c.socket.name, c.name) for c in dev.getConnectedCameraFeatures()]}")
        except Exception as e:
            print(f"(camera feature query failed: {e})")

        print("\nWaiting for first frames (≤8s)...")
        t0 = time.time()
        rgb_frame = depth_frame = pts = None
        while time.time() - t0 < 8.0:
            if rgb_frame is None:
                m = q_rgb.tryGet()
                if m is not None:
                    rgb_frame = m.getCvFrame()
            if depth_frame is None:
                m = q_depth.tryGet()
                if m is not None:
                    depth_frame = m.getFrame()
            if pts is None:
                m = q_pcl.tryGet()
                if m is not None:
                    pts = m.getPoints()
            if rgb_frame is not None and depth_frame is not None and pts is not None:
                break
            time.sleep(0.01)

        if rgb_frame is None or depth_frame is None or pts is None:
            print(f"Timeout — rgb={rgb_frame is not None} depth={depth_frame is not None} pcl={pts is not None}")
            return

        valid_mask = depth_frame > 0
        d_min = int(depth_frame[valid_mask].min()) if valid_mask.any() else 0
        d_max = int(depth_frame.max())
        print(f"\nRGB     shape={rgb_frame.shape} dtype={rgb_frame.dtype}")
        print(
            f"Depth   shape={depth_frame.shape} dtype={depth_frame.dtype}  "
            f"min={d_min}mm  max={d_max}mm  valid={valid_mask.mean()*100:.1f}%"
        )
        print(f"Points  N={len(pts)}  (camera frame, mm)")

        cv2.imwrite(str(OUT / "rgb.png"), rgb_frame)
        depth_vis = cv2.applyColorMap(
            cv2.convertScaleAbs(depth_frame, alpha=255.0 / max(d_max, 1)),
            cv2.COLORMAP_JET,
        )
        cv2.imwrite(str(OUT / "depth_vis.png"), depth_vis)
        np.save(OUT / "depth_mm.npy", depth_frame)

        valid = pts[~np.isnan(pts).any(axis=1)]
        valid = valid[(valid != 0).any(axis=1)]
        if len(valid) > 0:
            with open(OUT / "cloud.ply", "w") as f:
                f.write("ply\nformat ascii 1.0\n")
                f.write(f"element vertex {len(valid)}\n")
                f.write("property float x\nproperty float y\nproperty float z\nend_header\n")
                np.savetxt(f, valid, fmt="%.3f")
            print(f"\nWrote: {OUT}/rgb.png  depth_vis.png  depth_mm.npy  cloud.ply ({len(valid)} pts)")
        else:
            print("\nNo valid 3D points. Aim camera at something 0.2–1.0 m away and re-run.")


if __name__ == "__main__":
    main()
