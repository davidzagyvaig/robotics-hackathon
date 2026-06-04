"use client";

import { useEffect } from "react";
import { controller, useBrailleState } from "@/lib/controller";

export default function ConnectDevice() {
  const { usbSupported, bleSupported, connected, connecting, transport, deviceName, error } =
    useBrailleState();

  useEffect(() => {
    controller.reportSupport();
  }, []);

  if (connected) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-sm text-accent">
          <span className="h-2 w-2 rounded-full bg-accent" />
          {deviceName?.replace(/\s*v\d+$/, "") ?? "BrailleBuddy"} connected
          <span className="text-accent/50">·</span>
          <span className="text-accent/80">{transport === "ble" ? "Bluetooth" : "USB"}</span>
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

  const none = !usbSupported && !bleSupported;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {usbSupported && (
          <button
            onClick={() => void controller.connect("usb")}
            disabled={connecting}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-60"
          >
            {connecting ? "Connecting…" : "Connect via USB"}
          </button>
        )}
        {bleSupported && (
          <button
            onClick={() => void controller.connect("ble")}
            disabled={connecting}
            className="rounded-full border border-accent/50 bg-panel px-5 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/10 disabled:opacity-60"
          >
            {connecting ? "Connecting…" : "Connect via Bluetooth"}
          </button>
        )}
      </div>
      {none && (
        <div className="max-w-xs text-center text-[11px] text-flag">
          This browser can&apos;t reach the device. Use Chrome or Edge on desktop (USB or
          Bluetooth), or Chrome on Android (Bluetooth).
        </div>
      )}
      {error && <div className="max-w-xs text-center text-[11px] text-flag">{error}</div>}
      {!none && (
        <div className="text-[11px] text-muted">Plug in over USB, or pair over Bluetooth.</div>
      )}
    </div>
  );
}
