"use client";

import { useEffect, useState } from "react";
import { controller, useBrailleState } from "@/lib/controller";

// Voice-first, on-screen by default. No prominent connect buttons — this is built for blind
// learners, so the cell just works on screen and the voice agent guides everything. A
// discreet "physical device" option stays for the hardware demo.
export default function ConnectDevice() {
  const { usbSupported, bleSupported, connected, connecting, simulated, transport, deviceName, error } =
    useBrailleState();
  const [showDevice, setShowDevice] = useState(false);

  useEffect(() => {
    controller.reportSupport();
  }, []);

  // Connected to a REAL device → small confirmation + disconnect.
  if (connected && !simulated) {
    const mode = transport === "ble" ? "Bluetooth" : "USB";
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 rounded-full border-2 border-green bg-green-light px-4 py-1.5 text-sm font-extrabold text-green-dark">
          <span className="h-2.5 w-2.5 rounded-full bg-green" />
          {(deviceName?.replace(/\s*v\d+$/, "") ?? "BrailleBuddy")} · {mode}
        </div>
        <button
          onClick={() => void controller.disconnect()}
          className="text-xs font-bold text-hare transition hover:text-wolf"
        >
          disconnect device
        </button>
      </div>
    );
  }

  // Default (on-screen): calm status, with a discreet way to attach hardware.
  const connectDevice = async (kind: "usb" | "ble") => {
    await controller.disconnect(); // leave on-screen mode first
    await controller.connect(kind);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 text-sm font-bold text-hare">
        <span className="h-2 w-2 rounded-full bg-green" />
        On-screen cell ready
      </div>

      {!showDevice ? (
        <button
          onClick={() => setShowDevice(true)}
          className="text-xs font-bold text-hare/80 underline-offset-2 transition hover:text-wolf hover:underline"
        >
          have a physical BrailleBuddy? connect it
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {usbSupported && (
            <button onClick={() => void connectDevice("usb")} disabled={connecting} className="btn3d btn-blue text-xs">
              {connecting ? "…" : "USB"}
            </button>
          )}
          {bleSupported && (
            <button onClick={() => void connectDevice("ble")} disabled={connecting} className="btn-white px-4 py-2 text-xs uppercase">
              {connecting ? "…" : "Bluetooth"}
            </button>
          )}
          <button onClick={() => setShowDevice(false)} className="text-xs font-bold text-hare">
            cancel
          </button>
        </div>
      )}
      {error && <p className="max-w-xs text-center text-xs font-bold text-cardinal">{error}</p>}
    </div>
  );
}
