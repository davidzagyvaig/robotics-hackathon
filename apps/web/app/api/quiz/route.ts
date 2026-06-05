import { NextResponse } from "next/server";
import { recordQuiz } from "@/lib/db";

// Log a quiz attempt (and master the letter on a correct read).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { id, letter, correct } = (await req.json()) as {
      id?: string;
      letter?: string;
      correct?: boolean;
    };
    if (!id || !letter) return NextResponse.json({ error: "id+letter required" }, { status: 400 });
    await recordQuiz(id, letter, !!correct);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "quiz log failed" },
      { status: 500 }
    );
  }
}
