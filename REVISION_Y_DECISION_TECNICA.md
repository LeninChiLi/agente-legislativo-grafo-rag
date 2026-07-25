# Revisión del material y decisión técnica

## 1. Qué exige realmente la tarea

El caso de estudio no pide crear otro chatbot genérico. Pide transformar el chatbot de Neo4j en un **agente con enrutamiento**:

- Preguntas relacionales: consultar Neo4j mediante Cypher.
- Preguntas de contenido: recuperar fragmentos de los proyectos de ley mediante RAG.

La aplicación evaluable debe estar desplegada en Vercel, aceptar la API key de OpenRouter en la interfaz, tener los datos precargados, responder en español y citar el proyecto de ley utilizado.

## 2. Ideas aplicadas de las sesiones

### Sesión 1: criterio y trazabilidad

El curso prioriza capacidades y criterios de decisión sobre una plataforma concreta. Por ello, la solución hace visible qué herramienta eligió el agente, la consulta realizada y las fuentes recuperadas.

### Sesión 3: RAG

La teoría separa dos tiempos:

1. Ingesta offline: cargar, limpiar, segmentar, vectorizar e indexar.
2. Consulta online: vectorizar la pregunta, recuperar, seleccionar contexto y generar con citas.

También señala que para normas conviene segmentar por artículo y que la recuperación dispersa BM25 es especialmente útil con números, siglas y códigos exactos. La solución aplica:

- Segmentación por artículo cuando el documento lo permite.
- Fallback a fragmentos controlados cuando no existe estructura clara.
- Vectores TF-IDF dispersos con unigramas y bigramas.
- Recuperación combinada BM25 + similitud coseno.
- Diversidad por proyecto para evitar que un solo PDF monopolice los resultados.
- Generación anclada en los fragmentos y citas por PL/página.

### Sesión 4: grafo y Neo4j

El grafo es adecuado para vínculos explícitos entre `Persona`, `Documento` y `Cargo`. Cypher describe patrones de relaciones. La solución mantiene el esquema trabajado en clase y añade una barrera de seguridad: solo se permiten consultas de lectura.

### Sesión 5: pipeline completo

El laboratorio enfatiza que cada etapa produce el artefacto de la siguiente y que la procedencia debe conservarse. En la solución:

- Los PDFs producen `processed/*.txt`.
- Los textos producen `rag-index.json`.
- Cada chunk conserva PL, título, página, estado y autores.
- `graph-seed.json` permite poblar Neo4j de manera idempotente.
- La interfaz muestra la trazabilidad del resultado.

## 3. Por qué se eligió la opción A

Es la modalidad recomendada y reutiliza el trabajo de clase. Además demuestra mejor el concepto de agente: no solo recupera documentos, sino que selecciona una herramienta según la naturaleza de la pregunta.

## 4. Decisiones para Vercel

Una base vectorial local que se escriba durante la ejecución no es adecuada para funciones serverless. Por ello, la ingesta se realiza antes del despliegue y el índice se incluye como archivo estático. En cada consulta solo se lee el índice y se calcula el ranking.

La API key de OpenRouter no se incluye en el repositorio ni en las variables de Vercel. El evaluador la introduce en la interfaz, conforme a la consigna.

## 5. Limitaciones documentales identificadas

Diez de los 155 PDFs no contienen una capa textual utilizable. Se indexó únicamente metadata verificable para esos documentos. El agente recibe la instrucción de no atribuirles contenido normativo no recuperado.

Esto es preferible a usar OCR de baja confiabilidad o inventar información. La limitación queda documentada y visible en el índice.

## 6. Prueba principal

- `¿Quién emitió el PL 14712?` debe ir al grafo y recuperar a Alejandro Soto Reyes, su cargo y el PL.
- `¿Qué proyectos hablan de educación?` debe ir al RAG y recuperar varios PL educativos, con citas y fragmentos.
