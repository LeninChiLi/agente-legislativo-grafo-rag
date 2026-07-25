"use client";

import { useEffect, useRef, useState } from "react";

interface RetrievalItem {
  score: number;
  proyecto: string;
  pagina: number;
  titulo: string;
  extracto: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  tool?: "grafo" | "rag";
  routeReason?: string;
  sources?: string[];
  cypher?: string;
  explanation?: string;
  rows?: Record<string, unknown>[];
  retrieval?: RetrievalItem[];
  model?: string;
  error?: boolean;
}

interface AppInfo {
  rag?: { documents: number; chunks: number; scanned_or_empty: string[] };
  graphConfigured?: boolean;
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [graphInfo, setGraphInfo] = useState<{ nodes?: unknown[]; rels?: unknown[]; error?: string } | null>(null);
  const messagesEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/info")
      .then((response) => response.json())
      .then(setAppInfo)
      .catch(() => setAppInfo(null));
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (keySet && appInfo?.graphConfigured) {
      fetch("/api/schema")
        .then((response) => response.json())
        .then(setGraphInfo)
        .catch(() => setGraphInfo({ error: "No fue posible leer el esquema." }));
    }
  }, [keySet, appInfo?.graphConfigured]);

  const handleKeySubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (apiKey.trim()) setKeySet(true);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");
    setMessages((previous) => [...previous, { role: "user", content: question }]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, apiKey }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessages((previous) => [
          ...previous,
          { role: "assistant", content: data.error || "Ocurrió un error.", error: true },
        ]);
      } else {
        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content: data.answer,
            tool: data.tool,
            routeReason: data.routeReason,
            sources: data.sources,
            cypher: data.cypher,
            explanation: data.explanation,
            rows: data.rows,
            retrieval: data.retrieval,
            model: data.model,
          },
        ]);
      }
    } catch {
      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: "Error de conexión con la aplicación.", error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const examples = [
    { label: "Grafo", text: "¿Quién emitió el PL 14712?" },
    { label: "Grafo", text: "¿A quién está dirigido el PL 14715?" },
    { label: "RAG", text: "¿Qué proyectos hablan de educación?" },
    { label: "RAG", text: "¿Qué propone el PL 14710 sobre inteligencia artificial?" },
    { label: "RAG", text: "¿Qué proyectos buscan proteger a las mujeres?" },
  ];

  if (!keySet) {
    return (
      <div className="container key-container">
        <section className="key-page">
          <div className="brand-mark">AG</div>
          <p className="eyebrow">E-Government · PUCP</p>
          <h1>Agente legislativo</h1>
          <p className="subtitle">
            Decide entre consultar relaciones en Neo4j o recuperar contenido de 155 proyectos de ley mediante RAG.
          </p>

          <div className="feature-grid">
            <div><strong>Neo4j</strong><span>Relaciones y Cypher</span></div>
            <div><strong>RAG</strong><span>{appInfo?.rag?.chunks ?? "…"} fragmentos indexados</span></div>
            <div><strong>Fuentes</strong><span>Citas por proyecto de ley</span></div>
          </div>

          <form onSubmit={handleKeySubmit} className="key-form">
            <label htmlFor="apiKey">API key de OpenRouter</label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setApiKey(event.target.value)}
              placeholder="sk-or-v1-..."
              autoComplete="off"
              autoFocus
            />
            <button type="submit">Ingresar al agente</button>
          </form>
          <p className="key-hint">La key se mantiene solamente en la memoria de esta pestaña y no se almacena.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="chat-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="mini-brand">AG</div>
            <div>
              <h2>Agente legislativo</h2>
              <p>Grafo + RAG</p>
            </div>
          </div>

          <div className="system-card">
            <h3>Datos cargados</h3>
            <div className="metric"><span>Proyectos de ley</span><strong>{appInfo?.rag?.documents ?? "…"}</strong></div>
            <div className="metric"><span>Fragmentos RAG</span><strong>{appInfo?.rag?.chunks ?? "…"}</strong></div>
            <div className="metric"><span>Neo4j</span><strong className={appInfo?.graphConfigured ? "ok" : "warn"}>{appInfo?.graphConfigured ? "Conectado" : "Configurar"}</strong></div>
          </div>

          {graphInfo?.nodes && (
            <div className="system-card compact">
              <h3>Esquema Neo4j</h3>
              <p>{graphInfo.nodes.length} tipos de nodo · {graphInfo.rels?.length ?? 0} tipos de relación</p>
            </div>
          )}

          <div className="sidebar-examples">
            <h3>Preguntas de prueba</h3>
            {examples.map((example) => (
              <button key={example.text} className="example-btn" onClick={() => setInput(example.text)}>
                <span className={`example-tag ${example.label.toLowerCase()}`}>{example.label}</span>
                {example.text}
              </button>
            ))}
          </div>

          <button className="change-key" onClick={() => { setKeySet(false); setApiKey(""); setMessages([]); }}>
            Cambiar API key
          </button>
        </aside>

        <main className="chat-main">
          <header className="chat-header">
            <div>
              <p className="eyebrow">Caso de estudio 1</p>
              <h1>Consulta proyectos de ley</h1>
            </div>
            <div className="status"><span></span> Corpus precargado</div>
          </header>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">↗</div>
                <h2>El agente seleccionará la herramienta adecuada</h2>
                <p>
                  Las preguntas relacionales van a Neo4j. Las preguntas sobre contenido pasan por recuperación RAG y responden citando el PL fuente.
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <article key={index} className={`msg msg-${message.role} ${message.error ? "msg-error" : ""}`}>
                <div className="msg-avatar">{message.role === "user" ? "TÚ" : "IA"}</div>
                <div className="msg-body">
                  {message.tool && (
                    <div className="route-row">
                      <span className={`tool-badge ${message.tool}`}>
                        {message.tool === "grafo" ? "tool_grafo · Neo4j" : "tool_rag · Recuperación"}
                      </span>
                      {message.routeReason && <span className="route-reason">{message.routeReason}</span>}
                    </div>
                  )}

                  <div className="msg-text">{message.content}</div>

                  {message.sources && message.sources.length > 0 && (
                    <div className="source-row">
                      <span>Fuentes verificables</span>
                      {message.sources.map((source) => <strong key={source}>{source}</strong>)}
                    </div>
                  )}

                  {message.cypher && (
                    <details className="details-card">
                      <summary>Ver consulta Cypher y resultados</summary>
                      {message.explanation && <p>{message.explanation}</p>}
                      <pre>{message.cypher}</pre>
                      {message.rows && message.rows.length > 0 && <ResultTable rows={message.rows} />}
                    </details>
                  )}

                  {message.retrieval && message.retrieval.length > 0 && (
                    <details className="details-card">
                      <summary>Ver fragmentos recuperados</summary>
                      <div className="retrieval-list">
                        {message.retrieval.map((item, itemIndex) => (
                          <div className="retrieval-item" key={`${item.proyecto}-${item.pagina}-${itemIndex}`}>
                            <div><strong>{item.proyecto}</strong><span>p. {item.pagina} · score {item.score}</span></div>
                            <h4>{item.titulo}</h4>
                            <p>{item.extracto}…</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {message.model && <p className="model-note">Modelo utilizado: {message.model}</p>}
                </div>
              </article>
            ))}

            {loading && (
              <article className="msg msg-assistant">
                <div className="msg-avatar">IA</div>
                <div className="msg-body loading-body">
                  <span className="spinner"></span>
                  El agente está decidiendo la herramienta y consultando los datos…
                </div>
              </article>
            )}
            <div ref={messagesEnd} />
          </div>

          <form onSubmit={send} className="chat-input">
            <input
              type="text"
              value={input}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setInput(event.target.value)}
              placeholder="Ej.: ¿Qué proyectos hablan de educación?"
              disabled={loading}
              maxLength={1200}
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Enviar pregunta">→</button>
          </form>
        </main>
      </div>
    </div>
  );
}

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0] || {});
  return (
    <div className="results-table">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 20).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => {
                const value = row[column];
                return <td key={column}>{typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
