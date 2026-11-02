import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("[db] DATABASE_URL not set — running without database");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/leadcaffeine",
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Prevent uncaught pool errors from crashing the process
// when the database is temporarily unavailable (e.g. during deploy)
pool.on("error", (err) => {
  console.error("[db] Pool error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });
