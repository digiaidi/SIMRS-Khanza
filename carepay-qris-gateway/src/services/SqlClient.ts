import { Context, Effect, Layer } from "effect";
import type { AppConfig } from "../config/AppConfig.ts";
import { getDatabase } from "./Database.ts";

export interface SqlClient {
  readonly query: (sql: string, params?: any[]) => Effect.Effect<{ rows: any[] }, Error>;
  readonly execute: (sql: string, params?: any[]) => Effect.Effect<{ rows: any[] }, Error>;
}

export const SqlClient = Context.GenericTag<SqlClient>("SqlClient");

export const SqlClientLive = Layer.effect(
  SqlClient,
  Effect.gen(function* () {
    const pool = getDatabase();

    const runQuery = (sql: string, params: any[] = []) =>
      Effect.tryPromise({
        try: async () => {
          const [rows] = await pool.query(sql, params);
          return { rows: Array.isArray(rows) ? (rows as any[]) : [rows] };
        },
        catch: (err: any) => new Error(`MySQL Error executing [${sql}]: ${err.message || String(err)}`),
      });

    return {
      query: (sql, params) => runQuery(sql, params),
      execute: (sql, params) => runQuery(sql, params),
    } satisfies SqlClient;
  })
);
