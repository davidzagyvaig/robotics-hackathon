"use client";

import type { Pin } from "@/lib/types";

export default function LesionPanel({ pin }: { pin: Pin | null }) {
  if (!pin) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-muted text-xs">
        Select a lesion pin on the 3D model to view its documentation.
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{pin.id}</h2>
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
            pin.flag ? "bg-flag/20 text-flag" : "bg-accent/15 text-accent"
          }`}
        >
          {pin.flag ? "FLAGGED FOR REVIEW" : "LOGGED"}
        </span>
      </div>

      <div className="aspect-square w-full overflow-hidden rounded-lg border border-line bg-ink">
        {pin.macro ? (
          // macro is an absolute path on disk; backend serves basename under /macro
          <img
            src={`/macro/${pin.macro.split("/").pop()}`}
            alt={pin.id}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted">
            no macro close-up yet
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="ABCD / TDS" value={pin.tds != null ? pin.tds.toFixed(2) : "—"} />
        <Stat label="Region" value={pin.region || "—"} />
        <Stat label="Reference model" value={pin.label || "—"} span />
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
          Explanation
        </div>
        <p className="text-xs leading-relaxed text-gray-300">
          {pin.explanation || "No explanation generated."}
        </p>
      </div>

      <div className="mt-auto rounded border border-line bg-panel2 p-3 text-[10px] leading-relaxed text-muted">
        Documentation aid — not a diagnosis. Every flagged lesion is reviewed by a
        dermatologist. Triage gating is high-sensitivity by design (ABCD/TDS &gt; 5.45
        or malignant-class model signal).
      </div>
    </div>
  );
}

function Stat({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={`rounded border border-line bg-panel2 p-2 ${span ? "col-span-2" : ""}`}>
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-sm text-gray-200">{value}</div>
    </div>
  );
}
