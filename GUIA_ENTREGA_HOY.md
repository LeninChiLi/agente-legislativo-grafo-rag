# Guía de entrega en GitHub y Vercel

## 1. Probar localmente

En la carpeta del proyecto:

```bash
npm install
copy .env.example .env.local
```

Editar `.env.local` con la URI y contraseña de Neo4j Aura.

Si la base está vacía:

```bash
npm run load:graph
```

Luego:

```bash
npm run dev
```

Probar obligatoriamente:

1. `¿Quién emitió el PL 14712?`
2. `¿Qué proyectos hablan de educación?`

## 2. Crear repositorio

En GitHub, crear un repositorio vacío, por ejemplo:

```text
agente-legislativo-grafo-rag
```

En la terminal de la carpeta:

```bash
git init
git add .
git commit -m "Caso de estudio 1: agente Neo4j y RAG"
git branch -M main
git remote add origin URL_DEL_REPOSITORIO
git push -u origin main
```

Verificar que `.env.local` NO aparezca en GitHub.

## 3. Desplegar en Vercel

1. Entrar a Vercel.
2. Seleccionar **Add New -> Project**.
3. Importar el repositorio.
4. En Environment Variables añadir:

```text
NEO4J_URI
NEO4J_USER
NEO4J_PASS
NEO4J_DATABASE
```

5. Desplegar.
6. Copiar el dominio de Vercel y añadirlo opcionalmente como:

```text
NEXT_PUBLIC_APP_URL=https://tu-proyecto.vercel.app
```

7. Ejecutar un redeploy.

## 4. Verificación final

- Abrir Vercel en una ventana de incógnito.
- Pegar una API key de OpenRouter.
- Probar una pregunta de grafo y otra de RAG.
- Confirmar que se muestran fuentes.
- Entregar en Paideia:
  - enlace de Vercel;
  - enlace del repositorio GitHub.
