import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

const globalForDb = globalThis as unknown as { __supportDb?: DatabaseSync };

function open(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
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

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
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
