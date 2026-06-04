"use client";

import { useEffect } from "react";
import { controller, useBrailleState } from "@/lib/controller";

export default function ConnectDevice() {
  const { supported, connected, connecting, deviceName, error, pot } = useBrailleState();

  // Reflect real WebSerial support + try to silently re-open a remembered device.
  useEffect(() => {
    controller.reportSupport();
    void controller.tryReconnect();
  }, []);

  if (!supported) {
    return (
      <div className="rounded-lg border border-flag/40 bg-flag/10 px-4 py-3 text-center text-sm text-flag">
        This browser can't talk to USB devices. Open BrailleBuddy in <b>Chrome</b> or{" "}
        <b>Edge</b> on a desktop.
      </div>
    );
  }

  if (connected) {
    const cps = controller.cps.toFixed(1);
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-sm text-accent">
          <span className="h-2 w-2 rounded-full bg-accent" />
          {deviceName?.replace(/\s*v\d+$/, "") ?? "BrailleBuddy"} connected
        </div>
        <div className="text-[11px] text-muted">
          speed knob: <span className="text-gray-300">{cps} chars/sec</span>{" "}
          <span className="text-line">·</span> pot {pot}
        </div>
        <button
          onClick={() => void controller.disconnect()}
          className="text-[11px] text-muted underline-offset-2 hover:text-gray-300 hover:underline"
        >
          disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={() => void controller.connect()}
        disabled={connecting}
        className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Connect your BrailleBuddy"}
      </button>
      {error && <div className="max-w-xs text-center text-[11px] text-flag">{error}</div>}
      <div className="text-[11px] text-muted">Plug the device in over USB, then click connect.</div>
    </div>
  );
}
