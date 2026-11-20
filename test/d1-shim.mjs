// Imitação mínima do Cloudflare D1 sobre o SQLite do Node, só para testes
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const prepare = (sql) => {
    let params = [];
    const stmt = {
      bind(...p) { params = p.map((v) => (v === undefined ? null : v)); return stmt; },
      async run() { db.prepare(sql).run(...params); return { success: true }; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async first() { return db.prepare(sql).get(...params) || null; },
      _exec() { db.prepare(sql).run(...params); }
    };
    return stmt;
  };
  return {
    prepare,
    async batch(stmts) { db.exec('BEGIN'); try { stmts.forEach((s) => s._exec()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
    raw: db
  };
}
