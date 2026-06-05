import { NextResponse } from "next/server";
import { allLearners } from "@/lib/db";

// The tracking dashboard data source: every learner + progress + quiz accuracy.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await allLearners();
    return NextResponse.json({ learners: rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "learners failed" },
      { status: 500 }
    );
  }
}
