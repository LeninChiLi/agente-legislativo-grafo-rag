import { NextRequest, NextResponse } from "next/server";
import { chooseTool } from "@/lib/agent";
import { answerWithGraph } from "@/lib/graph-agent";
import { answerWithRag } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

    if (!question || !apiKey) {
      return NextResponse.json({ error: "Falta la pregunta o la API key de OpenRouter." }, { status: 400 });
    }
    if (question.length > 1200) {
      return NextResponse.json({ error: "La pregunta es demasiado extensa." }, { status: 400 });
    }

    const decision = await chooseTool(question, apiKey);

    if (decision.tool === "grafo") {
      const graph = await answerWithGraph(question, apiKey);
      return NextResponse.json({
        tool: "grafo",
        routeReason: decision.reason,
        answer: graph.answer,
        sources: graph.sources,
        cypher: graph.cypher,
        explanation: graph.explanation,
        rows: graph.rows,
        count: graph.rows.length,
        model: graph.model,
      });
    }

    const rag = await answerWithRag(question, decision.searchQuery, apiKey);
    return NextResponse.json({
      tool: "rag",
      routeReason: decision.reason,
      answer: rag.answer,
      sources: rag.sources,
      retrieval: rag.hits.map((hit) => ({
        score: hit.score,
        proyecto: hit.proyecto,
        pagina: hit.pagina,
        titulo: hit.titulo,
        extracto: hit.texto.slice(0, 320),
      })),
      model: rag.model,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /OpenRouter/.test(message) ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
