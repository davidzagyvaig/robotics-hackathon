import { NextResponse } from "next/server";

// Mints a WebRTC conversation token so the browser can connect to the agent over WebRTC
// (LiveKit / UDP) — far lower latency + proper jitter handling vs the WebSocket path.
// The API key stays server-side; only the short-lived token reaches the browser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const agentId = process.env.NEXT_PUBLIC_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !apiKey) {
    return NextResponse.json(
      { error: "Set ELEVENLABS_API_KEY and NEXT_PUBLIC_AGENT_ID in apps/web/.env.local" },
      { status: 500 }
    );
  }
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
      { headers: { "xi-api-key": apiKey } }
    );
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: `ElevenLabs ${res.status}`, detail }, { status: 502 });
    }
    const data = (await res.json()) as { token: string };
    return NextResponse.json({ token: data.token });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch token" },
      { status: 500 }
    );
  }
}
