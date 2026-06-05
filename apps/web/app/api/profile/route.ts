import { NextResponse } from "next/server";
import { getUser } from "@/lib/db";

// Silent resume: the browser remembers the last learner id and hydrates on load.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const u = await getUser(id);
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: u.id,
    name: u.name,
    level: u.level,
    streak: u.streak,
    mastered: u.mastered,
    voiceEnabled: u.voice_enabled,
  });
}
