import fs from "node:fs";
import path from "node:path";
import { callOpenRouter } from "@/lib/openrouter";

interface RagChunk {
  id: string;
  numero: string;
  proyecto: string;
  titulo: string;
  fecha: string;
  estado: string;
  autores: string;
  pagina: number;
  texto: string;
  length: number;
  norm: number;
}

interface RagIndex {
  version: number;
  retrieval: string;
  stats: {
    documents: number;
    chunks: number;
    avgdl: number;
    scanned_or_empty: string[];
  };
  chunks: RagChunk[];
  idf: Record<string, number>;
  postings: Record<string, [number, number][]>;
}

export interface RagHit {
  score: number;
  numero: string;
  proyecto: string;
  titulo: string;
  pagina: number;
  texto: string;
  estado: string;
  autores: string;
}

const STOPWORDS = new Set([
  "a", "al", "algo", "algun", "alguna", "algunas", "alguno", "algunos", "ante", "antes",
  "como", "con", "contra", "cual", "cuando", "de", "del", "desde", "donde", "durante",
  "e", "el", "ella", "ellas", "ello", "ellos", "en", "entre", "era", "es", "esa", "esas",
  "ese", "eso", "esos", "esta", "estas", "este", "esto", "estos", "fue", "ha", "han", "hasta",
  "hay", "la", "las", "le", "les", "lo", "los", "mas", "me", "mi", "mis", "muy", "no",
  "nos", "o", "para", "pero", "por", "porque", "que", "se", "segun", "ser", "si", "sin",
  "sobre", "son", "su", "sus", "tambien", "te", "tiene", "tu", "un", "una", "uno", "unos",
  "y", "ya", "proyecto", "ley", "congreso", "republica", "peru", "articulo", "senor", "senora",
]);

const SUFFIXES = [
  "amientos", "imientos", "aciones", "uciones", "adoras", "adores", "ancias", "encias",
  "amiento", "imiento", "acion", "ucion", "mente", "idades", "idad", "ismos", "istas",
  "adora", "ador", "antes", "ancia", "encia", "icos", "icas", "ico", "ica", "osos", "osas",
  "oso", "osa", "amientos", "es", "s",
];

const SYNONYMS: Record<string, string[]> = {
  educacion: ["docente", "escuela", "instituto", "universidad", "pedagogico", "estudiante"],
  salud: ["sanitario", "hospital", "medico", "paciente", "enfermedad"],
  mujer: ["mujeres", "genero", "femenino", "violencia", "desaparecida"],
  ambiente: ["ambiental", "ecosistema", "contaminacion", "climatico", "recursos naturales"],
  agricultura: ["agrario", "agricola", "campesino", "productor", "riego"],
  seguridad: ["policia", "delito", "criminal", "proteccion", "orden interno"],
  inteligencia: ["artificial", "algoritmo", "automatizacion", "digital"],
  trabajo: ["laboral", "empleo", "trabajador", "remuneracion"],
  transporte: ["transito", "vehiculo", "carretera", "movilidad"],
  discapacidad: ["persona con discapacidad", "accesibilidad", "inclusion"],
};

let cachedIndex: RagIndex | null = null;

function getIndex(): RagIndex {
  if (!cachedIndex) {
    const file = path.join(process.cwd(), "src", "data", "rag-index.json");
    cachedIndex = JSON.parse(fs.readFileSync(file, "utf8")) as RagIndex;
  }
  return cachedIndex;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stem(token: string): string {
  if (token.length <= 4 || /^\d+$/.test(token)) return token;
  for (const suffix of SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function tokenize(text: string): string[] {
  const raw = normalize(text).match(/[a-z0-9]+/g) || [];
  const words = raw
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map(stem);
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    bigrams.push(`__${words[i]}_${words[i + 1]}`);
  }
  return [...words, ...bigrams];
}

function expandQuery(query: string): string {
  const normalized = normalize(query);
  const additions: string[] = [];
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (normalized.includes(key)) additions.push(...values);
  }
  return additions.length ? `${query} ${additions.join(" ")}` : query;
}

export function searchRag(query: string, limit = 7): RagHit[] {
  const index = getIndex();
  const expanded = expandQuery(query);
  const queryTerms = tokenize(expanded);
  const queryTf = new Map<string, number>();
  for (const term of queryTerms) queryTf.set(term, (queryTf.get(term) || 0) + 1);

  const scores = new Map<number, { bm25: number; dot: number }>();
  let qNormSq = 0;
  const k1 = 1.5;
  const b = 0.75;

  for (const [term, qtf] of queryTf.entries()) {
    const postings = index.postings[term];
    const idf = index.idf[term];
    if (!postings || idf === undefined) continue;

    const qWeight = (1 + Math.log(qtf)) * idf;
    qNormSq += qWeight * qWeight;

    for (const [chunkIndex, tf] of postings) {
      const chunk = index.chunks[chunkIndex];
      const current = scores.get(chunkIndex) || { bm25: 0, dot: 0 };
      const denominator = tf + k1 * (1 - b + b * (chunk.length / index.stats.avgdl));
      current.bm25 += idf * ((tf * (k1 + 1)) / denominator) * (1 + Math.log(qtf));
      current.dot += ((1 + Math.log(tf)) * idf) * qWeight;
      scores.set(chunkIndex, current);
    }
  }

  const exactNumber = query.match(/\b(?:PL[\s_-]*)?(\d{5})\b/i)?.[1];
  const qNorm = Math.sqrt(qNormSq) || 1;
  const maxBm25 = Math.max(1, ...Array.from(scores.values(), (item) => item.bm25));
  const ranked = Array.from(scores.entries()).map(([chunkIndex, raw]) => {
    const chunk = index.chunks[chunkIndex];
    const cosine = chunk.norm > 0 ? raw.dot / (qNorm * chunk.norm) : 0;
    let score = 0.72 * (raw.bm25 / maxBm25) + 0.28 * cosine;
    const normalizedTitle = normalize(chunk.titulo);
    const normalizedQuery = normalize(query);
    for (const token of tokenize(query).filter((t) => !t.startsWith("__"))) {
      if (normalizedTitle.includes(token)) score += 0.018;
    }
    if (exactNumber && chunk.numero === exactNumber) score += 1.5;
    if (normalizedQuery.includes(normalize(chunk.proyecto))) score += 1.2;
    return { chunk, score };
  });

  ranked.sort((a, b2) => b2.score - a.score);
  const perDocument = new Map<string, number>();
  const selected: RagHit[] = [];
  const maxPerDocument = exactNumber ? 2 : 1;
  for (const item of ranked) {
    const count = perDocument.get(item.chunk.numero) || 0;
    if (count >= maxPerDocument) continue;
    if (item.score <= 0 && selected.length > 0) continue;
    selected.push({
      score: Number(item.score.toFixed(4)),
      numero: item.chunk.numero,
      proyecto: item.chunk.proyecto,
      titulo: item.chunk.titulo,
      pagina: item.chunk.pagina,
      texto: item.chunk.texto,
      estado: item.chunk.estado,
      autores: item.chunk.autores,
    });
    perDocument.set(item.chunk.numero, count + 1);
    if (selected.length >= limit) break;
  }

  return selected;
}

export async function answerWithRag(
  question: string,
  searchQuery: string,
  apiKey: string,
): Promise<{ answer: string; hits: RagHit[]; sources: string[]; model: string }> {
  const hits = searchRag(`${question} ${searchQuery}`, 7);
  if (!hits.length) {
    return {
      answer: "No encontré fragmentos suficientemente relacionados en el corpus cargado.",
      hits: [],
      sources: [],
      model: "sin-llm",
    };
  }

  const context = hits
    .map(
      (hit, index) =>
        `FRAGMENTO ${index + 1}\n` +
        `FUENTE: ${hit.proyecto} (PL ${hit.numero}), página ${hit.pagina}\n` +
        `TÍTULO: ${hit.titulo}\nESTADO: ${hit.estado}\nAUTORES: ${hit.autores || "No consignados"}\n` +
        `CONTENIDO:\n${hit.texto}`,
    )
    .join("\n\n---\n\n")
    .slice(0, 24_000);

  const prompt = `Eres un asistente legislativo peruano con recuperación aumentada (RAG).
Responde en español únicamente con la información de los fragmentos recuperados.

REGLAS OBLIGATORIAS:
1. No inventes datos ni uses conocimiento externo.
2. Cita el proyecto de ley después de cada afirmación relevante con el formato [PL 14712/2025-CR, p. 3].
3. Si varios proyectos son pertinentes, enuméralos y explica brevemente por qué.
4. Distingue entre el título/metadata y el contenido normativo.
5. Si el contexto no basta, dilo de forma explícita.
6. Termina con una línea "Fuentes:" y lista los PL usados, sin incluir documentos no utilizados.

PREGUNTA:
${question}

CONTEXTO RECUPERADO:
${context}`;

  const result = await callOpenRouter(
    apiKey,
    [
      { role: "system", content: "Responde con fidelidad documental y trazabilidad de fuentes." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.1, maxTokens: 1100 },
  );

  const sources = Array.from(new Set(hits.map((hit) => hit.proyecto))).slice(0, 6);
  let answer = result.content;
  if (!/\[PL\s+\d{5}/i.test(answer)) {
    answer += `\n\nFuentes recuperadas: ${sources.map((source) => `[PL ${source}]`).join(", ")}.`;
  }

  return { answer, hits, sources, model: result.model };
}

export function getRagStats() {
  return getIndex().stats;
}
