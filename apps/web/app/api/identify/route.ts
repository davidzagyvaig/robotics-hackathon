import { NextResponse } from "next/server";
import { identifyUser } from "@/lib/db";

// Voice identity: the agent calls this (via the identify_learner client tool) with the
// spoken name. We find or create the learner in the local Postgres and return their
// progress so the agent can greet appropriately and resume at the right level.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { name } = (await req.json()) as { name?: string };
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const { user, isNew } = await identifyUser(name);
    return NextResponse.json({
      id: user.id,
      name: user.name,
      level: user.level,
      streak: user.streak,
      mastered: user.mastered,
      voiceEnabled: user.voice_enabled,
      isNew,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "identify failed" },
      { status: 500 }
    );
  }
}
