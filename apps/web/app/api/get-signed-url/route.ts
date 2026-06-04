import { NextResponse } from "next/server";

// Mints a short-lived signed URL for the ElevenLabs agent so the browser can start a
// conversation WITHOUT ever seeing the API key. The signed URL is valid for 15 minutes.
// Docs: https://elevenlabs.io/docs/api-reference/conversations/get-signed-url

export const dynamic = "force-dynamic"; // never cache the signed URL

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
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { "xi-api-key": apiKey } }
    );
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `ElevenLabs returned ${res.status}`, detail },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { signed_url: string };
    return NextResponse.json({ signedUrl: data.signed_url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch signed URL" },
      { status: 500 }
    );
  }
}
