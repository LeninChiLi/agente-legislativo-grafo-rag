# Agente legislativo: Neo4j + RAG

Primera tarea calificada del curso **E-Government Intelligence – PUCP**.

La aplicación permite realizar consultas sobre 155 proyectos de ley del Congreso del Perú. Según el tipo de pregunta, el agente decide entre:

- **Neo4j:** para consultas sobre relaciones entre proyectos de ley, autores y destinatarios.
- **RAG:** para buscar información dentro del contenido de los proyectos de ley.

## Demo

Aplicación desplegada:

https://agente-legislativo-grafo-rag.vercel.app

El usuario debe ingresar una API key de OpenRouter para comenzar a realizar consultas.

## Ejemplos de consultas

### Consultas al grafo

- ¿Quién emitió el PL 14712?
- ¿A quién está dirigido el PL 14715?
- ¿Cuántos documentos existen en el grafo?

### Consultas mediante RAG

- ¿Qué proyectos hablan de educación?
- ¿Qué proyectos buscan proteger a las mujeres?
- ¿Qué propone el PL 14710 sobre inteligencia artificial?

Las respuestas indican qué herramienta utilizó el agente y muestran los proyectos de ley empleados como fuente.

## Tecnologías utilizadas

- Next.js
- TypeScript
- Neo4j Aura
- OpenRouter
- RAG con recuperación BM25 y TF-IDF
- Vercel

## Ejecución local

Instalar las dependencias:

```bash
npm install
```

Crear un archivo `.env.local` a partir de `.env.example`:

```env
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASS=tu_clave
NEO4J_DATABASE=neo4j
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
```

Para cargar el grafo en una instancia nueva de Neo4j:

```bash
npm run load:graph
```

Para iniciar la aplicación:

```bash
npm run dev
```

Luego abrir:

```text
http://localhost:3000
```

## Datos

El proyecto incluye:

- 155 proyectos de ley.
- 2,994 fragmentos para recuperación RAG.
- Datos relacionales precargables para Neo4j.
- Referencias al proyecto de ley utilizado en cada respuesta.

## Autor

Max Lenin Chipani Lima