export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface OpenRouterOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export async function callOpenRouter(
  apiKey: string,
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {},
): Promise<{ content: string; model: string }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Agente Legislativo PUCP",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
      messages,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 900,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const raw = await response.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || parsed?.message || raw;
    } catch {
      // Conserva el texto original.
    }
    throw new Error(`OpenRouter ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter devolvió una respuesta vacía.");
  }
  return { content: content.trim(), model: data.model || "openrouter/free" };
}

export function parseJsonObject<T>(content: string): T {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1)) as T;
    }
    throw new Error("El modelo no devolvió JSON válido.");
  }
}
