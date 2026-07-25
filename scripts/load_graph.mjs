#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import neo4j from "neo4j-driver";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER || "neo4j";
const password = process.env.NEO4J_PASS;
const database = process.env.NEO4J_DATABASE || "neo4j";

if (!uri || !password) {
  console.error("Faltan NEO4J_URI o NEO4J_PASS en .env.local.");
  process.exit(1);
}

const seedPath = path.join(process.cwd(), "src", "data", "graph-seed.json");
const records = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
const session = driver.session({ database });

try {
  await session.run("CREATE CONSTRAINT documento_numero IF NOT EXISTS FOR (d:Documento) REQUIRE d.numero IS UNIQUE");
  await session.run("CREATE CONSTRAINT persona_nombre IF NOT EXISTS FOR (p:Persona) REQUIRE p.nombre IS UNIQUE");
  await session.run("CREATE CONSTRAINT cargo_nombre IF NOT EXISTS FOR (c:Cargo) REQUIRE c.nombre IS UNIQUE");

  if (process.argv.includes("--clear")) {
    console.log("Limpiando la base porque se usó --clear...");
    await session.run("MATCH (n) DETACH DELETE n");
  }

  const query = `
    UNWIND $rows AS row
    MERGE (d:Documento {numero: row.numero})
    SET d.id = 'PL_' + row.numero, d.titulo = row.titulo
    FOREACH (_ IN CASE WHEN row.emisor <> '' THEN [1] ELSE [] END |
      MERGE (e:Persona {nombre: row.emisor})
      MERGE (e)-[:EMITE]->(d)
    )
    FOREACH (_ IN CASE WHEN row.emisor <> '' AND row.cargo_emisor <> '' THEN [1] ELSE [] END |
      MERGE (e2:Persona {nombre: row.emisor})
      MERGE (c:Cargo {nombre: row.cargo_emisor})
      MERGE (e2)-[:TIENE_EL_CARGO]->(c)
    )
    FOREACH (_ IN CASE WHEN row.destinatario <> '' THEN [1] ELSE [] END |
      MERGE (r:Persona {nombre: row.destinatario})
      MERGE (d)-[:DIRIGIDO_A]->(r)
    )
    FOREACH (_ IN CASE WHEN row.destinatario <> '' AND row.cargo_destinatario <> '' THEN [1] ELSE [] END |
      MERGE (r2:Persona {nombre: row.destinatario})
      MERGE (c2:Cargo {nombre: row.cargo_destinatario})
      MERGE (r2)-[:TIENE_EL_CARGO]->(c2)
    )
  `;

  const batchSize = 100;
  for (let start = 0; start < records.length; start += batchSize) {
    await session.run(query, { rows: records.slice(start, start + batchSize) });
    console.log(`Cargados ${Math.min(start + batchSize, records.length)} de ${records.length}`);
  }

  const result = await session.run(`
    MATCH (d:Documento) WITH count(d) AS documentos
    MATCH (p:Persona) WITH documentos, count(p) AS personas
    MATCH ()-[r]->() RETURN documentos, personas, count(r) AS relaciones
  `);
  const row = result.records[0];
  console.log({
    documentos: row.get("documentos").toNumber(),
    personas: row.get("personas").toNumber(),
    relaciones: row.get("relaciones").toNumber(),
  });
} finally {
  await session.close();
  await driver.close();
}
