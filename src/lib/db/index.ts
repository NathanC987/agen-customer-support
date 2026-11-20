import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomInt } from "node:crypto";
import path from "node:path";
import { SCHEMA } from "./schema";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

const globalForDb = globalThis as unknown as { __supportDb?: DatabaseSync };

function open(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive migrations for databases created by older versions (CREATE TABLE IF NOT EXISTS won't add columns). */
function migrate(db: DatabaseSync) {
  const cols = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols("messages").includes("client_id")) db.exec("ALTER TABLE messages ADD COLUMN client_id TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id) WHERE client_id IS NOT NULL");
}

export function db(): DatabaseSync {
  if (!globalForDb.__supportDb) globalForDb.__supportDb = open();
  return globalForDb.__supportDb;
}

type Params = SQLInputValue[];

// node:sqlite returns null-prototype rows; spread into plain objects so they serialize to Client Components
export function all<T>(sql: string, ...params: Params): T[] {
  return db().prepare(sql).all(...params).map((r) => ({ ...r }) as T);
}

export function get<T>(sql: string, ...params: Params): T | undefined {
  const row = db().prepare(sql).get(...params);
  return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: Params) {
  return db().prepare(sql).run(...params);
}

let txDepth = 0;

/** Runs fn atomically. Re-entrant: nested calls use savepoints, so helpers can safely wrap their own writes. */
export function tx<T>(fn: () => T): T {
  const d = db();
  const sp = `sp${txDepth}`;
  d.exec(txDepth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${sp}`);
  txDepth++;
  try {
    const out = fn();
    txDepth--;
    d.exec(txDepth === 0 ? "COMMIT" : `RELEASE ${sp}`);
    return out;
  } catch (e) {
    txDepth--;
    d.exec(txDepth === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  }
}

/** Collision-checked random id, e.g. uniqueId("ORD", "orders") → ORD48213. */
export function uniqueId(prefix: string, table: string, column = "id", sep = ""): string {
  for (let digits = 5; ; digits++) {
    for (let i = 0; i < 20; i++) {
      const id = `${prefix}${sep}${randomInt(10 ** (digits - 1), 10 ** digits)}`;
      if (!get(`SELECT 1 FROM ${table} WHERE ${column} = ?`, id)) return id;
    }
  }
}

export function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
