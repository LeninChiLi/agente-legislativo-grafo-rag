import { runCypher } from "@/lib/neo4j";
import { callOpenRouter, parseJsonObject } from "@/lib/openrouter";
import { CYPHER_SYSTEM_PROMPT } from "@/lib/schema";

const FORBIDDEN = /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|CALL|LOAD\s+CSV|FOREACH|APOC|GRANT|DENY|REVOKE)\b/i;
const ALLOWED_START = /^\s*(MATCH|OPTIONAL\s+MATCH)\b/i;

export function validateReadOnlyCypher(cypher: string): string {
  const query = cypher.trim().replace(/;\s*$/, "");
  if (!ALLOWED_START.test(query)) {
    throw new Error("La consulta no empieza con MATCH u OPTIONAL MATCH.");
  }
  if (FORBIDDEN.test(query)) {
    throw new Error("La consulta contiene una operación no permitida.");
  }
  if (!/\bRETURN\b/i.test(query)) {
    throw new Error("La consulta no contiene RETURN.");
  }
  return /\bLIMIT\b/i.test(query) ? query : `${query} LIMIT 50`;
}

export async function answerWithGraph(question: string, apiKey: string) {
  const generated = await callOpenRouter(
    apiKey,
    [
      { role: "system", content: CYPHER_SYSTEM_PROMPT },
      { role: "user", content: question },
    ],
    { json: true, temperature: 0, maxTokens: 450 },
  );

  const parsed = parseJsonObject<{ cypher?: string; explicacion?: string }>(generated.content);
  if (!parsed.cypher) throw new Error("El modelo no generó una consulta Cypher.");
  const cypher = validateReadOnlyCypher(parsed.cypher);
  const rows = await runCypher(cypher);

  if (!rows.length) {
    return {
      answer: "No encontré una relación que responda la pregunta en el grafo Neo4j cargado.",
      cypher,
      explanation: parsed.explicacion || "Consulta relacional al grafo.",
      rows,
      sources: [],
      model: generated.model,
    };
  }

  const synthesis = await callOpenRouter(
    apiKey,
    [
      {
        role: "system",
        content:
          "Redacta una respuesta breve en español usando únicamente las filas de Neo4j. " +
          "No inventes. Menciona el PL consultado como fuente, por ejemplo [Grafo Neo4j · PL 14712].",
      },
      {
        role: "user",
        content: `Pregunta: ${question}\nFilas del grafo: ${JSON.stringify(rows).slice(0, 12_000)}`,
      },
    ],
    { temperature: 0.1, maxTokens: 450 },
  );

  const sourceValues = new Set<string>();
  for (const row of rows) {
    for (const value of Object.values(row)) {
      const text = String(value ?? "");
      const match = text.match(/(?:PL[_\s-]*)?(\d{5})/i);
      if (match) sourceValues.add(`PL ${match[1]}`);
    }
  }

  return {
    answer: synthesis.content,
    cypher,
    explanation: parsed.explicacion || "Consulta relacional al grafo.",
    rows,
    sources: Array.from(sourceValues),
    model: synthesis.model,
  };
}
