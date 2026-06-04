"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Pin, PinsDoc } from "@/lib/types";
import LesionPanel from "@/components/LesionPanel";
import EventFeed from "@/components/EventFeed";

// R3F must be client-only
const MeshViewer = dynamic(() => import("@/components/MeshViewer"), { ssr: false });

export default function Page() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [session, setSession] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/pins.json")
      .then((r) => r.json())
      .then((d: PinsDoc) => {
        setPins(d.pins || []);
        setSession(d.session);
      })
      .catch(() => {});
  }, []);

  const selected = useMemo(
    () => pins.find((p) => p.id === selectedId) || null,
    [pins, selectedId]
  );
  const flagged = pins.filter((p) => p.flag).length;

  return (
    <main className="flex h-screen flex-col bg-ink text-gray-200">
      {/* header */}
      <header className="flex items-center justify-between border-b border-line bg-panel px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded bg-accent/20 text-accent grid place-items-center text-sm font-bold">
            ◉
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">
              DermaScout · Clinician Console
            </h1>
            <p className="text-[10px] text-muted">
              Voice-guided 3D skin documentation &amp; longitudinal monitoring
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5 text-[11px]">
          <Metric label="session" value={session ? session.slice(0, 14) : "—"} />
          <Metric label="lesions" value={String(pins.length)} />
          <Metric label="flagged" value={String(flagged)} flag={flagged > 0} />
        </div>
      </header>

      {/* body: 3D viewer | right column (lesion panel + event feed) */}
      <div className="flex min-h-0 flex-1">
        <section className="relative flex-1 border-r border-line">
          {pins.length === 0 && (
            <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded border border-line bg-panel/90 px-3 py-1.5 text-[11px] text-muted">
              No mesh/pins found — run{" "}
              <code className="text-gray-400">python tools/seed_demo.py</code>
            </div>
          )}
          <MeshViewer
            meshUrl="/mesh.glb"
            pins={pins}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-muted">
            drag to rotate · scroll to zoom · click a pin
          </div>
        </section>

        <aside className="flex w-[380px] flex-col">
          <div className="min-h-0 flex-1 border-b border-line bg-panel">
            <LesionPanel pin={selected} />
          </div>
          <div className="h-[34%] bg-panel2">
            <EventFeed />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value, flag }: { label: string; value: string; flag?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-sm font-semibold ${flag ? "text-flag" : "text-gray-100"}`}>
        {value}
      </div>
    </div>
  );
}
