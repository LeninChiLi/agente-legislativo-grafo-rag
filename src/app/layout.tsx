import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agente legislativo · Neo4j + RAG",
  description: "Agente que decide entre consultar Neo4j o recuperar contenido de proyectos de ley mediante RAG.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
