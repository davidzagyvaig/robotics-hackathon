"""
DermaScout desktop app — OAK-D-SR live viewer with start/stop button.

Run:  python app.py
"""

import sys
import time
from pathlib import Path

import cv2
import depthai as dai
import numpy as np
from PySide6 import QtCore, QtGui, QtWidgets

from snapshot import colorize_depth, save_snapshot

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)

W, H = 640, 400
FPS = 30


def gentle_color_fix(bgr: np.ndarray) -> np.ndarray:
    """Push the OV9782's muted colors toward something less alien."""
    out = bgr.astype(np.float32)
    # white-balance: rough gray-world on the mean
    means = out.reshape(-1, 3).mean(axis=0) + 1e-6
    gray = means.mean()
    out *= gray / means
    # bump saturation
    hsv = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.35, 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


class CameraWorker(QtCore.QThread):
    """Runs the depthai pipeline in a background thread, emits frames."""

    frame_ready = QtCore.Signal(np.ndarray, np.ndarray, np.ndarray, float)  # rgb, depth, pcl, fps
    error = QtCore.Signal(str)
    status = QtCore.Signal(str)

    def __init__(self):
        super().__init__()
        self._running = False

    def stop(self):
        self._running = False

    def run(self):
        self._running = True
        try:
            with dai.Pipeline() as pipeline:
                left = pipeline.create(dai.node.Camera).build(dai.CameraBoardSocket.CAM_B)
                right = pipeline.create(dai.node.Camera).build(dai.CameraBoardSocket.CAM_C)

                rgb_out = left.requestOutput((W, H), dai.ImgFrame.Type.BGR888i, fps=FPS)

                stereo = pipeline.create(dai.node.StereoDepth)
                stereo.setDefaultProfilePreset(dai.node.StereoDepth.PresetMode.DEFAULT)
                stereo.setDepthAlign(dai.CameraBoardSocket.CAM_B)
                left.requestOutput((W, H), dai.ImgFrame.Type.NV12, fps=FPS).link(stereo.left)
                right.requestOutput((W, H), dai.ImgFrame.Type.NV12, fps=FPS).link(stereo.right)

                pc = pipeline.create(dai.node.PointCloud)
                stereo.depth.link(pc.inputDepth)

                q_rgb = rgb_out.createOutputQueue(maxSize=1, blocking=False)
                q_depth = stereo.depth.createOutputQueue(maxSize=1, blocking=False)
                q_pcl = pc.outputPointCloud.createOutputQueue(maxSize=1, blocking=False)

                pipeline.start()
                self.status.emit("Connected — streaming")

                last_rgb = np.zeros((H, W, 3), dtype=np.uint8)
                last_depth = np.zeros((H, W), dtype=np.uint16)
                last_pcl = np.zeros((0, 3), dtype=np.float32)
                t_prev = time.time()
                fps_s = 0.0

                while self._running:
                    rm = q_rgb.tryGet()
                    dm = q_depth.tryGet()
                    pm = q_pcl.tryGet()
                    if rm is not None:
                        last_rgb = rm.getCvFrame()
                    if dm is not None:
                        last_depth = dm.getFrame()
                    if pm is not None:
                        last_pcl = pm.getPoints()

                    now = time.time()
                    dt = now - t_prev
                    if dt > 0:
                        fps_s = 0.9 * fps_s + 0.1 * (1.0 / dt)
                    t_prev = now

                    self.frame_ready.emit(last_rgb.copy(), last_depth.copy(), last_pcl, fps_s)
                    self.msleep(5)

            self.status.emit("Camera stopped")
        except Exception as e:
            self.error.emit(str(e))
            self.status.emit(f"Error: {e}")


def ndarray_to_qpixmap(bgr: np.ndarray) -> QtGui.QPixmap:
    h, w = bgr.shape[:2]
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    img = QtGui.QImage(rgb.data, w, h, 3 * w, QtGui.QImage.Format.Format_RGB888).copy()
    return QtGui.QPixmap.fromImage(img)


class MainWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("DermaScout — OAK-D-SR")
        self.resize(1320, 540)

        self.worker: CameraWorker | None = None
        self.last_rgb = np.zeros((H, W, 3), dtype=np.uint8)
        self.last_depth = np.zeros((H, W), dtype=np.uint16)
        self.last_pcl = np.zeros((0, 3), dtype=np.float32)
        self.snap_idx = 0
        self.color_fix = True

        central = QtWidgets.QWidget()
        self.setCentralWidget(central)
        root = QtWidgets.QVBoxLayout(central)

        # Top toolbar
        bar = QtWidgets.QHBoxLayout()
        self.btn_toggle = QtWidgets.QPushButton("Start Camera")
        self.btn_toggle.setMinimumHeight(40)
        self.btn_toggle.setStyleSheet("font-weight:600; font-size:14px;")
        self.btn_toggle.clicked.connect(self.toggle_camera)
        bar.addWidget(self.btn_toggle)

        self.lbl_label = QtWidgets.QLabel("Label:")
        bar.addWidget(self.lbl_label)
        self.txt_label = QtWidgets.QLineEdit()
        self.txt_label.setPlaceholderText("e.g. right forearm")
        self.txt_label.setMaximumWidth(220)
        bar.addWidget(self.txt_label)

        self.btn_snap = QtWidgets.QPushButton("Snapshot")
        self.btn_snap.setMinimumHeight(40)
        self.btn_snap.setEnabled(False)
        self.btn_snap.clicked.connect(self.snapshot)
        bar.addWidget(self.btn_snap)

        self.chk_color_fix = QtWidgets.QCheckBox("Color fix")
        self.chk_color_fix.setChecked(True)
        self.chk_color_fix.toggled.connect(lambda v: setattr(self, "color_fix", v))
        bar.addWidget(self.chk_color_fix)

        bar.addStretch()
        self.lbl_status = QtWidgets.QLabel("Idle")
        self.lbl_status.setStyleSheet("color:#888;")
        bar.addWidget(self.lbl_status)
        root.addLayout(bar)

        # Two image panes side by side
        panes = QtWidgets.QHBoxLayout()
        self.lbl_rgb = QtWidgets.QLabel()
        self.lbl_rgb.setMinimumSize(W, H)
        self.lbl_rgb.setStyleSheet("background:#111; color:#666;")
        self.lbl_rgb.setAlignment(QtCore.Qt.AlignCenter)
        self.lbl_rgb.setText("RGB feed will appear here\n(click Start Camera)")
        panes.addWidget(self.lbl_rgb)

        self.lbl_depth = QtWidgets.QLabel()
        self.lbl_depth.setMinimumSize(W, H)
        self.lbl_depth.setStyleSheet("background:#111; color:#666;")
        self.lbl_depth.setAlignment(QtCore.Qt.AlignCenter)
        self.lbl_depth.setText("Depth map will appear here")
        panes.addWidget(self.lbl_depth)

        root.addLayout(panes)

        # Footer status
        self.lbl_info = QtWidgets.QLabel("—")
        self.lbl_info.setStyleSheet("font-family: ui-monospace, Menlo, monospace; color:#bbb;")
        root.addWidget(self.lbl_info)

    def toggle_camera(self):
        if self.worker is None:
            self.start_camera()
        else:
            self.stop_camera()

    def start_camera(self):
        self.btn_toggle.setText("Stop Camera")
        self.btn_snap.setEnabled(True)
        self.lbl_status.setText("Connecting…")
        self.worker = CameraWorker()
        self.worker.frame_ready.connect(self.on_frame)
        self.worker.status.connect(self.lbl_status.setText)
        self.worker.error.connect(self.on_error)
        self.worker.finished.connect(self.on_worker_done)
        self.worker.start()

    def stop_camera(self):
        if self.worker is not None:
            self.worker.stop()
            self.worker.wait(2000)
        self.worker = None
        self.btn_toggle.setText("Start Camera")
        self.btn_snap.setEnabled(False)
        self.lbl_status.setText("Stopped")
        self.lbl_rgb.setText("RGB feed will appear here\n(click Start Camera)")
        self.lbl_depth.setText("Depth map will appear here")

    def on_worker_done(self):
        # Worker thread exited (e.g. on error). Reset UI.
        if self.worker is not None:
            self.worker.deleteLater()
        self.worker = None
        self.btn_toggle.setText("Start Camera")
        self.btn_snap.setEnabled(False)

    def on_error(self, msg: str):
        QtWidgets.QMessageBox.critical(self, "Camera error", msg)

    def on_frame(self, rgb: np.ndarray, depth: np.ndarray, pcl: np.ndarray, fps: float):
        self.last_rgb = rgb
        self.last_depth = depth
        self.last_pcl = pcl

        display_rgb = gentle_color_fix(rgb) if self.color_fix else rgb
        self.lbl_rgb.setPixmap(ndarray_to_qpixmap(display_rgb).scaled(
            self.lbl_rgb.size(), QtCore.Qt.KeepAspectRatio, QtCore.Qt.SmoothTransformation))

        depth_vis = colorize_depth(depth)
        self.lbl_depth.setPixmap(ndarray_to_qpixmap(depth_vis).scaled(
            self.lbl_depth.size(), QtCore.Qt.KeepAspectRatio, QtCore.Qt.SmoothTransformation))

        valid_mask = depth > 0
        valid_pct = valid_mask.mean() * 100
        d_min = int(depth[valid_mask].min()) if valid_mask.any() else 0
        d_max = int(depth.max()) if depth.max() < 10000 else 9999
        self.lbl_info.setText(
            f"{fps:5.1f} FPS    depth {d_min:4d}–{d_max:4d} mm    "
            f"valid {valid_pct:5.1f}%    point cloud {len(pcl):>7,} pts"
        )

    def snapshot(self):
        label = self.txt_label.text().strip()
        info = save_snapshot(
            rgb=self.last_rgb,
            depth_mm=self.last_depth,
            point_cloud=self.last_pcl,
            out_root=OUT,
            label=label,
        )
        self.lbl_status.setText(
            f"Saved {info['id']}  ({info['point_cloud']['n_points']:,} pts, "
            f"valid {info['depth']['valid_pct']:.1f}%)"
        )

    def closeEvent(self, event):
        self.stop_camera()
        super().closeEvent(event)


def main():
    app = QtWidgets.QApplication(sys.argv)
    w = MainWindow()
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
