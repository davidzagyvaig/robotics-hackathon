"use client";

import { useEffect, useRef, useState } from "react";
import type { DermaEvent } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

const KIND_COLOR: Record<string, string> = {
  LESION_DETECTED: "text-accent",
  ARM_MOVED: "text-sky-400",
  MACRO_CAPTURED: "text-violet-400",
  VOICE_SAID: "text-amber-300",
  SCAN_STARTED: "text-white",
  SCAN_ENDED: "text-white",
  ERROR: "text-flag",
  WARN: "text-flag",
};

export default function EventFeed() {
  const [events, setEvents] = useState<DermaEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stop = false;
    const url = API.replace(/^http/, "ws") + "/ws/events";

    function connect() {
      if (stop) return;
      ws = new WebSocket(url);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stop) setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as DermaEvent;
          setEvents((prev) => [...prev.slice(-200), ev]);
        } catch {
          /* ignore */
        }
      };
    }
    connect();
    return () => {
      stop = true;
      ws?.close();
    };
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [events]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="text-[11px] uppercase tracking-wider text-muted">
          Live event stream
        </span>
        <span
          className={`flex items-center gap-1 text-[10px] ${
            connected ? "text-accent" : "text-muted"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-accent" : "bg-muted"
            }`}
          />
          {connected ? "connected" : "offline"}
        </span>
      </div>
      <div ref={boxRef} className="flex-1 overflow-y-auto p-3 text-[11px] leading-relaxed">
        {events.length === 0 && (
          <div className="text-muted">
            waiting for events… run a scan: <br />
            <code className="text-gray-400">python -m capture.capture_service --sim</code>
          </div>
        )}
        {events.map((ev, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-muted">
              {new Date(ev.ts * 1000).toLocaleTimeString()}
            </span>
            <span className={KIND_COLOR[ev.kind] || "text-gray-400"}>{ev.kind}</span>
            <span className="truncate text-gray-500">
              {summarize(ev)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function summarize(ev: DermaEvent): string {
  const d = ev.data || {};
  if (ev.kind === "LESION_DETECTED") return `${d.id} @ ${(d.xyz_mm as number[])?.map?.((n) => Math.round(n)).join(",")}mm`;
  if (ev.kind === "ARM_MOVED") return `${d.lesion} P${d.pan} T${d.tilt}`;
  if (ev.kind === "VOICE_SAID") return String(d.text || "").slice(0, 60);
  if (ev.kind === "FRAME") return `frame ${d.frame} · ${d.n_moles} marks · ${d.valid_pct}% depth`;
  return JSON.stringify(d).slice(0, 60);
}
