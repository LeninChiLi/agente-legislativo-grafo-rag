import { NextResponse } from "next/server";
import { getRagStats } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    rag: getRagStats(),
    graphConfigured: Boolean(process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASS),
  });
}
