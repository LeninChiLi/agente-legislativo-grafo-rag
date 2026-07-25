# Agente legislativo: Neo4j + RAG

Caso de estudio 1 del curso **E-Government Intelligence · PUCP (julio de 2026)**.

La aplicación parte del chatbot Neo4j desarrollado en clase y lo convierte en un **agente que decide** entre dos herramientas:

- `tool_grafo`: traduce preguntas relacionales a Cypher de solo lectura y consulta Neo4j Aura.
- `tool_rag`: recupera fragmentos del contenido de 155 proyectos de ley y redacta una respuesta en español con citas al PL fuente.

## Cumplimiento de la tarea

- Opción A: agente Grafo + RAG.
- Campo para que el evaluador ingrese su API key de OpenRouter.
- Corpus e índice ya precargados en el proyecto; el evaluador no procesa PDFs.
- Respuestas en español con fuentes.
- Compatible con despliegue en Vercel.
- La API key no se guarda en base de datos, archivo ni `localStorage`; se conserva solo en la memoria de la pestaña.

## Arquitectura

```text
Pregunta
   |
   v
Agente enrutador (OpenRouter)
   |-------------------------------|
   v                               v
tool_grafo                     tool_rag
LLM -> Cypher                  búsqueda en índice estático
validación solo lectura        BM25 + coseno TF-IDF
Neo4j Aura                     top fragmentos
LLM sintetiza                  LLM responde con citas
```

### RAG

La ingesta se hace offline mediante `scripts/build_rag_index.py`:

1. Extrae la capa textual de cada PDF con PyMuPDF.
2. Limpia ruido y segmenta por artículo cuando la estructura lo permite; si no, usa fragmentos de tamaño controlado.
3. Vectoriza los fragmentos como vectores dispersos TF-IDF con unigramas y bigramas.
4. Construye un índice invertido para BM25 y similitud coseno.
5. Conserva por fragmento: número del PL, título, estado, autores, página y texto.

El índice precargado contiene:

- 155 proyectos de ley.
- 2,994 fragmentos.
- Metadata y fuente por cada fragmento.

Diez PDFs no poseen capa textual utilizable; para ellos se indexaron el título, autores y estado provenientes de `_indice.csv`. El sistema no simula haber leído contenido que no pudo extraerse.

### Seguridad de Neo4j

El modelo solamente puede producir consultas de lectura. Antes de ejecutarlas, el backend bloquea palabras como `CREATE`, `MERGE`, `DELETE`, `SET`, `CALL`, `LOAD CSV` y `APOC`. La sesión del driver se abre además en modo `READ`.

## Ejecutar en local

Requisitos: Node.js 20 o superior y una instancia Neo4j Aura ya poblada con el grafo trabajado en clase.

```bash
npm install
cp .env.example .env.local
```

Completar `.env.local`:

```env
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASS=tu_clave
NEO4J_DATABASE=neo4j
```

Si la instancia de Aura todavía no está poblada, ejecutar una sola vez:

```bash
npm run load:graph
```

El script crea los 155 nodos `Documento` y carga las relaciones que pudieron extraerse de manera verificable de los oficios del corpus. Incluye los casos de prueba PL 14712 y PL 14715. No use `--clear` sobre una base que contenga información que quiera conservar.

Luego:

```bash
npm run dev
```

Abrir `http://localhost:3000` y pegar una API key de OpenRouter en la interfaz.

## Desplegar en Vercel

1. Subir esta carpeta a un repositorio de GitHub.
2. En Vercel: **Add New -> Project** e importar el repositorio.
3. En **Settings -> Environment Variables**, agregar:
   - `NEO4J_URI`
   - `NEO4J_USER`
   - `NEO4J_PASS`
   - `NEO4J_DATABASE`
4. Opcionalmente agregar `NEXT_PUBLIC_APP_URL` con el dominio final.
5. Ejecutar el deployment.

No se debe agregar una variable `OPENROUTER_API_KEY`: la tarea exige que el evaluador coloque su propia key en la interfaz.

## Pruebas esperadas

### Grafo

- `¿Quién emitió el PL 14712?`
- `¿A quién está dirigido el PL 14715?`
- `¿Cuántos documentos hay en el grafo?`

La interfaz debe mostrar la etiqueta `tool_grafo`, la respuesta, la consulta Cypher y las filas devueltas.

### RAG

- `¿Qué proyectos hablan de educación?`
- `¿Qué proyectos buscan proteger a las mujeres?`
- `¿Qué propone el PL 14710 sobre inteligencia artificial?`

La interfaz debe mostrar `tool_rag`, los PL citados y los fragmentos recuperados. En el caso del PL 14710, el PDF no contiene texto extraíble: el agente debe limitarse a la metadata disponible y advertir que no tiene base para describir artículos no recuperados.

## Regenerar el índice

El evaluador no necesita hacerlo. Se incluye el script para trazabilidad y reproducibilidad.

```bash
python -m pip install pymupdf
python scripts/build_rag_index.py \
  --pdf-dir ../proyecto_ley \
  --output src/data/rag-index.json \
  --processed-dir processed
```

## Estructura principal

```text
src/app/api/chat/route.ts   agente y respuesta unificada
src/lib/agent.ts            decisión grafo o RAG
src/lib/graph-agent.ts      Cypher, validación y síntesis
src/lib/rag.ts              recuperación BM25 + TF-IDF
src/data/rag-index.json     índice precargado
processed/                  corpus textual procesado
scripts/build_rag_index.py  ingesta reproducible
scripts/load_graph.mjs       carga idempotente de Neo4j
src/data/graph-seed.json     datos relacionales precargables
```
