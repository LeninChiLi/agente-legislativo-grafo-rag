import { NextResponse } from "next/server";
import { runCypher } from "@/lib/neo4j";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [nodes, rels] = await Promise.all([
      runCypher("MATCH (n) RETURN labels(n)[0] AS tipo, count(n) AS total ORDER BY total DESC"),
      runCypher("MATCH ()-[r]->() RETURN type(r) AS tipo, count(r) AS total ORDER BY total DESC"),
    ]);
    return NextResponse.json({ nodes, rels });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
