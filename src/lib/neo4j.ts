import neo4j, { type Driver, type Integer } from "neo4j-driver";

const URI = process.env.NEO4J_URI;
const USER = process.env.NEO4J_USER;
const PASS = process.env.NEO4J_PASS;
const DB = process.env.NEO4J_DATABASE || "neo4j";

let driver: Driver | undefined;

export function getDriver() {
  if (!URI || !USER || !PASS) {
    throw new Error("Faltan NEO4J_URI, NEO4J_USER o NEO4J_PASS en las variables de entorno.");
  }
  if (!driver) {
    driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS));
  }
  return driver;
}

function serialise(value: unknown): unknown {
  if (neo4j.isInt(value)) {
    const integer = value as Integer;
    return integer.inSafeRange() ? integer.toNumber() : integer.toString();
  }
  if (Array.isArray(value)) return value.map(serialise);
  if (value && typeof value === "object") {
    if ("properties" in value) {
      return serialise((value as { properties: unknown }).properties);
    }
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = serialise(nested);
    }
    return output;
  }
  return value;
}

export async function runCypher(query: string) {
  const session = getDriver().session({ database: DB, defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(query);
    return result.records.map((record) => {
      const row: Record<string, unknown> = {};
      record.keys.forEach((key) => {
        row[String(key)] = serialise(record.get(key));
      });
      return row;
    });
  } finally {
    await session.close();
  }
}
