// CarePay - Database Service (MySQL connection to Khanza sik)
import mysql from "mysql2/promise";
import type { AppConfig } from "../config/AppConfig.ts";

let pool: mysql.Pool | null = null;

export function createDatabase(config: AppConfig): mysql.Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.pass,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
  });
  return pool;
}

export function getDatabase(): mysql.Pool {
  if (!pool) throw new Error("Database not initialized. Call createDatabase first.");
  return pool;
}

export async function checkDatabaseHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getDatabase();
    await db.query("SELECT 1");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function runMigrations(db: mysql.Pool): Promise<void> {
  const migrations = [
    "../../migrations/001_carepay_tables.sql",
    "../../migrations/002_carepay_account_linkage.sql",
  ];
  
  for (const m of migrations) {
    try {
      const migrationSql = await Bun.file(
        new URL(m, import.meta.url).pathname
      ).text();
      
      const statements = migrationSql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      
      for (const stmt of statements) {
        await db.query(stmt);
      }
      console.log(`[CarePay] ✅ Migration applied: ${m.split("/").pop()} (${statements.length} statements)`);
    } catch (e: any) {
      if (e.message.includes("already exists") || e.code === "ER_TABLE_EXISTS_ERROR") {
        console.log(`[CarePay] ✅ Tables in ${m.split("/").pop()} already exist, skipping`);
      } else {
        throw e;
      }
    }
  }
}
