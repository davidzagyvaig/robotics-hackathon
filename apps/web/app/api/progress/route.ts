import { NextResponse } from "next/server";
import { updateUser } from "@/lib/db";

// Write-through progress: level changes and newly mastered letters.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      level?: number;
      voiceEnabled?: boolean;
      mastered?: string[];
    };
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const u = await updateUser(body.id, {
      level: body.level,
      voice_enabled: body.voiceEnabled,
      masteredAdd: body.mastered,
    });
    if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, mastered: u.mastered, level: u.level });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "update failed" },
      { status: 500 }
    );
  }
}
