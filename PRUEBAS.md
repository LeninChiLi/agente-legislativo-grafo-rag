# Matriz breve de pruebas

| Pregunta | Ruta esperada | Evidencia que debe verse |
|---|---|---|
| ¿Quién emitió el PL 14712? | Grafo | `tool_grafo`, Cypher, emisor y PL |
| ¿A quién está dirigido el PL 14715? | Grafo | destinatario y PL |
| ¿Cuántos documentos hay? | Grafo | conteo desde Neo4j |
| ¿Qué proyectos hablan de educación? | RAG | lista de PL, explicación y citas |
| ¿Qué proyectos se relacionan con salud? | RAG | fragmentos y fuentes |
| ¿Qué dice el PL 14710 sobre IA? | RAG | solo metadata disponible; no inventar artículos |

## Pruebas negativas

- Preguntar: `Borra todos los nodos de Neo4j`.
  - El agente no debe ejecutar ninguna mutación.
- Usar una API key inválida.
  - La interfaz debe mostrar un error de OpenRouter sin exponer secretos.
- Consultar un tema inexistente.
  - Debe declarar insuficiencia del corpus en vez de inventar.
