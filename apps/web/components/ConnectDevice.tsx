"use client";

import { useEffect } from "react";
import { controller, useBrailleState } from "@/lib/controller";

export default function ConnectDevice() {
  const { usbSupported, bleSupported, connected, connecting, simulated, transport, deviceName, error } =
    useBrailleState();

  useEffect(() => {
    controller.reportSupport();
  }, []);

  if (connected) {
    const mode = simulated ? "On screen" : transport === "ble" ? "Bluetooth" : "USB";
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border-2 border-green bg-green-light px-4 py-1.5 text-sm font-extrabold text-green-dark">
          <span className="h-2.5 w-2.5 rounded-full bg-green" />
          {simulated ? "On-screen cell" : (deviceName?.replace(/\s*v\d+$/, "") ?? "BrailleBuddy")} · {mode}
        </div>
        <button
          onClick={() => void controller.disconnect()}
          className="text-xs font-bold text-hare transition hover:text-wolf"
        >
          {simulated ? "exit on-screen mode" : "disconnect"}
        </button>
      </div>
    );
  }

  const none = !usbSupported && !bleSupported;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {usbSupported && (
          <button
            onClick={() => void controller.connect("usb")}
            disabled={connecting}
            className="btn3d btn-blue text-sm"
          >
            {connecting ? "Connecting…" : "Connect USB"}
          </button>
        )}
        {bleSupported && (
          <button
            onClick={() => void controller.connect("ble")}
            disabled={connecting}
            className="btn-white px-5 py-3 text-sm uppercase"
          >
            {connecting ? "Connecting…" : "Bluetooth"}
          </button>
        )}
      </div>

      <button
        onClick={() => controller.connectSimulated()}
        className="text-xs font-extrabold uppercase tracking-wide text-hare transition hover:text-green-dark"
      >
        try it on screen — no device needed →
      </button>

      {none && (
        <p className="max-w-xs text-center text-xs font-bold text-wolf">
          On-screen mode works everywhere. For real dots, use Chrome/Edge (USB) or Chrome on
          Android (Bluetooth).
        </p>
      )}
      {error && <p className="max-w-xs text-center text-xs font-bold text-cardinal">{error}</p>}
    </div>
  );
}
