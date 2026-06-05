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
        <div className="flex items-center gap-2 rounded-full border border-saffron/40 bg-saffron/10 px-4 py-1.5 text-sm text-saffronDeep">
          <span className="h-2 w-2 rounded-full bg-saffron" />
          {simulated ? "On-screen cell" : (deviceName?.replace(/\s*v\d+$/, "") ?? "BrailleBuddy")} connected
          <span className="text-saffron/60">·</span>
          <span className="font-mono text-xs">{mode}</span>
        </div>
        <button
          onClick={() => void controller.disconnect()}
          className="text-[11px] text-muted underline-offset-2 transition hover:text-ink hover:underline"
        >
          {simulated ? "exit on-screen mode" : "disconnect"}
        </button>
      </div>
    );
  }

  const none = !usbSupported && !bleSupported;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {usbSupported && (
          <button
            onClick={() => void controller.connect("usb")}
            disabled={connecting}
            className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-bone shadow-card transition hover:bg-ink2 disabled:opacity-60"
          >
            {connecting ? "Connecting…" : "Connect via USB"}
          </button>
        )}
        {bleSupported && (
          <button
            onClick={() => void controller.connect("ble")}
            disabled={connecting}
            className="rounded-full border border-ink/20 bg-paper px-6 py-3 text-sm font-semibold text-ink transition hover:border-ink/40 disabled:opacity-60"
          >
            {connecting ? "Connecting…" : "Connect via Bluetooth"}
          </button>
        )}
      </div>

      {/* Always available: run the whole tutor with the on-screen cell, no device needed. */}
      <button
        onClick={() => controller.connectSimulated()}
        className="font-mono text-xs uppercase tracking-[0.18em] text-muted underline-offset-4 transition hover:text-saffronDeep hover:underline"
      >
        try it on screen — no device needed →
      </button>

      {none && (
        <div className="max-w-xs text-center text-[11px] text-muted">
          No device link in this browser — that&apos;s fine, on-screen mode works everywhere. For
          real dots, use Chrome or Edge (USB) or Chrome on Android (Bluetooth).
        </div>
      )}
      {error && <div className="max-w-xs text-center text-[11px] text-clay">{error}</div>}
    </div>
  );
}
