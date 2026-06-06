import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Live session recorder for debugging. The client POSTs events here (transcripts, tool
// calls, connection state, timing) and we append them to .debug/events.jsonl so Claude can
// read what actually happened in real time — what the learner said, what Dot replied, which
// transport connected, and the gap between turns (latency). Local-only; .debug is gitignored.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_DIR = path.join(process.cwd(), ".debug");
const LOG_FILE = path.join(LOG_DIR, "events.jsonl");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await mkdir(LOG_DIR, { recursive: true });

    // {clear:true} starts a fresh recording (called when a session begins).
    if (body?.clear) {
      await writeFile(LOG_FILE, "");
      return NextResponse.json({ ok: true, cleared: true });
    }

    const stamped = { wall: new Date().toISOString(), ...body };
    // Mirror tool calls to the `npm run dev` TERMINAL. Client console.log only shows in the
    // browser devtools; this makes the actual tool call visible server-side too.
    if (typeof body?.type === "string" && body.type.startsWith("toolcall:")) {
      // eslint-disable-next-line no-console
      console.log(`🔧 tool → ${body.type.slice(9)}`, JSON.stringify(body.args ?? {}));
    }
    await appendFile(LOG_FILE, JSON.stringify(stamped) + "\n");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "log failed" },
      { status: 500 }
    );
  }
}
