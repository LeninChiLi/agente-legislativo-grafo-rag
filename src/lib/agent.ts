import { callOpenRouter, parseJsonObject } from "@/lib/openrouter";

export type AgentTool = "grafo" | "rag";

export interface RoutingDecision {
  tool: AgentTool;
  reason: string;
  searchQuery: string;
  model?: string;
}

const ROUTER_PROMPT = `Eres el enrutador de un agente sobre proyectos de ley del Congreso del Perú.
Debes elegir exactamente una herramienta:

- grafo: preguntas sobre relaciones o estructura del grafo, por ejemplo quién emitió/firmó un PL, a quién fue dirigido, qué cargo tiene una persona, cuántos nodos/documentos/relaciones hay o qué documentos están vinculados con una persona.
- rag: preguntas sobre el contenido, tema, objetivo, artículos, medidas, problemas, beneficiarios o propuestas de uno o varios proyectos de ley.

Devuelve SOLO JSON:
{"tool":"grafo|rag","reason":"explicación breve","search_query":"consulta optimizada en español"}

Reglas:
1. Si pide qué dice, de qué trata, qué propone o cuáles proyectos hablan de un tema: rag.
2. Si pide una relación explícita entre Persona, Documento o Cargo: grafo.
3. Ante duda, usa rag porque conserva el contenido documental y las fuentes.`;

const GRAPH_PATTERNS = [
  /qu[ií]e?n(?:es)?\s+(emit|firm|present)/i,
  /a qui[eé]n (?:est[aá] )?dirigid/i,
  /qu[eé] cargo/i,
  /documentos? (?:emit|firm|present)/i,
  /cu[aá]ntos? (?:documentos?|nodos?|relaciones?)/i,
  /relaciones? (?:hay|existen)/i,
  /qui[eé]nes? son congresistas/i,
];

function deterministicRoute(question: string): RoutingDecision {
  const graph = GRAPH_PATTERNS.some((pattern) => pattern.test(question));
  return {
    tool: graph ? "grafo" : "rag",
    reason: graph
      ? "La pregunta solicita una relación estructurada del grafo."
      : "La pregunta solicita contenido o temática de los proyectos de ley.",
    searchQuery: question,
  };
}

export async function chooseTool(question: string, apiKey: string): Promise<RoutingDecision> {
  try {
    const result = await callOpenRouter(
      apiKey,
      [
        { role: "system", content: ROUTER_PROMPT },
        { role: "user", content: question },
      ],
      { json: true, temperature: 0, maxTokens: 220 },
    );
    const parsed = parseJsonObject<{
      tool?: string;
      reason?: string;
      search_query?: string;
    }>(result.content);

    if (parsed.tool !== "grafo" && parsed.tool !== "rag") {
      throw new Error("Herramienta inválida.");
    }

    return {
      tool: parsed.tool,
      reason: parsed.reason?.trim() || "Decisión del agente.",
      searchQuery: parsed.search_query?.trim() || question,
      model: result.model,
    };
  } catch {
    return deterministicRoute(question);
  }
}
