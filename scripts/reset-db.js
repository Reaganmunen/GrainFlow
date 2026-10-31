#!/usr/bin/env node
/**
 * Wipes the GrainFlow data in the pmc schema so you can start production clean.
 *
 *   node scripts/reset-db.js --dry-run                  show what would be deleted (changes nothing)
 *   node scripts/reset-db.js                            wipe all business data + users, keep the setup tables
 *   node scripts/reset-db.js --keep-catalogue           also keep items, prices, grains, grades, machines, milling rates ...
 *   node scripts/reset-db.js --everything               wipe EVERY table, setup tables too (you must re-seed roles/permissions)
 *   node scripts/reset-db.js --confirm=<database name>  skip the typing prompt (for scripts)
 *
 * Always kept unless --everything: roles, permissions, role_permissions, app_settings, business_profile,
 * mpesa_config, price_tiers, units.  After a reset run:  node scripts/create-users.js
 * It reads the same .env as the app (DATABASE_URL or DB_*). It does everything in ONE transaction: it either all
 * happens or nothing does.
 */
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/config/db');

const SCHEMA = 'pmc';
const SYSTEM = ['roles', 'permissions', 'role_permissions', 'app_settings', 'business_profile', 'mpesa_config', 'price_tiers', 'units'];
const CATALOGUE = ['grains', 'grades', 'items', 'item_units', 'item_prices', 'item_min_prices', 'milling_rates',
  'yield_standards', 'machines', 'expense_categories'];

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const confirmArg = (args.find((a) => a.startsWith('--confirm=')) || '').slice('--confirm='.length);
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const T = (s) => `${q(SCHEMA)}.${q(s)}`;

function target() {
  try {
    if (process.env.DATABASE_URL) { const u = new URL(process.env.DATABASE_URL); return `${u.hostname}${u.port ? ':' + u.port : ''}`; }
  } catch { /* fall through */ }
  return `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`;
}

const ask = (question) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
});

async function main() {
  const everything = has('--everything');
  const keepCatalogue = has('--keep-catalogue') && !everything;
  const dry = has('--dry-run');

  const { rows: info } = await pool.query('SELECT current_database() AS db, current_user AS usr');
  const db = info[0].db;
  const { rows: all } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name", [SCHEMA]);
  const tables = all.map((r) => r.table_name);
  if (!tables.length) throw new Error(`No tables found in schema "${SCHEMA}". Is this the right database?`);

  const keep = new Set(everything ? [] : [...SYSTEM, ...(keepCatalogue ? CATALOGUE : [])].filter((t) => tables.includes(t)));
  let wipe = tables.filter((t) => !keep.has(t));

  // foreign keys from a kept table to a table being wiped: Postgres then refuses a plain TRUNCATE
  const { rows: fks } = await pool.query(
    `SELECT k.relname AS child, w.relname AS parent,
            (SELECT array_agg(a.attname::text) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS cols,
            (SELECT bool_and(NOT a.attnotnull) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS nullable
       FROM pg_constraint c
       JOIN pg_class k ON k.oid = c.conrelid JOIN pg_class w ON w.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = k.relnamespace JOIN pg_namespace n2 ON n2.oid = w.relnamespace
      WHERE c.contype = 'f' AND n.nspname = $1 AND n2.nspname = $1`, [SCHEMA]);

  // kept tables that point into the wipe set get emptied too and then put back with those links cleared
  const dependents = new Set();
  for (let grew = true; grew;) {
    grew = false;
    const gone = new Set([...wipe, ...dependents]);
    for (const f of fks) {
      if (keep.has(f.child) && !dependents.has(f.child) && gone.has(f.parent)) { dependents.add(f.child); grew = true; }
    }
  }
  const nullCols = {}; // dependent kept table -> columns to clear when it is put back
  for (const f of fks) {
    if (dependents.has(f.child) && (wipe.includes(f.parent))) {
      if (!f.nullable) throw new Error(`Cannot keep ${f.child}: ${f.cols.join(',')} is NOT NULL and points at ${f.parent}, which is being wiped. Use --everything.`);
      nullCols[f.child] = nullCols[f.child] || new Set();
      f.cols.forEach((c) => nullCols[f.child].add(c));
    }
  }

  const { rows: seqs } = await pool.query(
    `SELECT s.relname AS seq, t.relname AS tbl
       FROM pg_class s JOIN pg_namespace n ON n.oid = s.relnamespace
       LEFT JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a', 'i') AND d.refobjsubid > 0
       LEFT JOIN pg_class t ON t.oid = d.refobjid
      WHERE s.relkind = 'S' AND n.nspname = $1`, [SCHEMA]);
  const restartSeqs = seqs.filter((s) => (s.tbl ? wipe.includes(s.tbl) : !(keepCatalogue && /item|sku|grain|grade|machine|categor/i.test(s.seq)))).map((s) => s.seq);

  // ---- plan ----
  console.log(`\nTarget: ${target()}  database "${db}"  schema "${SCHEMA}"  (as ${info[0].usr})`);
  console.log(`Mode:   ${everything ? 'EVERYTHING (setup tables too)' : keepCatalogue ? 'all data except setup + catalogue' : 'all data except setup tables'}\n`);
  console.log('Rows that will be DELETED:');
  let total = 0;
  for (const t of wipe) {
    const n = (await pool.query(`SELECT count(*)::int AS n FROM ${T(t)}`)).rows[0].n;
    total += n;
    console.log(`  ${t.padEnd(28)} ${String(n).padStart(8)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(28)} ${String(total).padStart(8)}`);
  console.log(`\nKept as they are: ${[...keep].filter((t) => !dependents.has(t)).join(', ') || '(nothing)'}`);
  if (dependents.size) console.log(`Kept, but re-inserted with user links cleared: ${[...dependents].join(', ')}`);
  console.log(`Numbering restarted from 1 on ${restartSeqs.length} sequence(s).\n`);

  if (dry) { console.log('Dry run: nothing was changed.'); return; }

  if (confirmArg !== db) {
    if (confirmArg) throw new Error(`--confirm=${confirmArg} does not match the database "${db}".`);
    const typed = await ask(`This cannot be undone. Type the database name (${db}) to continue: `);
    if (typed !== db) { console.log('Cancelled. Nothing was changed.'); return; }
  }

  // ---- do it ----
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SAVEPOINT au');
    try { await client.query('SELECT fn_set_app_user(NULL, NULL)'); } catch { await client.query('ROLLBACK TO SAVEPOINT au'); }
    await client.query('SAVEPOINT rr');
    try { await client.query('SET LOCAL session_replication_role = replica'); } // skips audit / append-only triggers when the role may
    catch { await client.query('ROLLBACK TO SAVEPOINT rr'); console.log('Note: could not relax triggers (needs a privileged role); continuing without.'); }

    // back up the dependent kept tables
    const order = [...dependents];
    const colsOf = {};
    for (const t of order) {
      colsOf[t] = (await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER' ORDER BY ordinal_position", [SCHEMA, t])).rows.map((r) => r.column_name);
      await client.query(`CREATE TEMP TABLE ${q('_keep_' + t)} ON COMMIT DROP AS SELECT ${colsOf[t].map(q).join(', ')} FROM ${T(t)}`);
      for (const c of nullCols[t] || []) await client.query(`UPDATE ${q('_keep_' + t)} SET ${q(c)} = NULL`);
    }
    // parents before children among the dependents
    const sorted = [];
    const left = new Set(order);
    while (left.size) {
      const next = [...left].find((t) => ![...left].some((p) => p !== t && fks.some((f) => f.child === t && f.parent === p)));
      if (!next) { sorted.push(...left); break; }
      sorted.push(next);
      left.delete(next);
    }

    await client.query(`TRUNCATE TABLE ${[...wipe, ...dependents].map(T).join(', ')}`);

    for (const t of sorted) {
      const cols = colsOf[t].map(q).join(', ');
      await client.query(`INSERT INTO ${T(t)} (${cols}) OVERRIDING SYSTEM VALUE SELECT ${cols} FROM ${q('_keep_' + t)}`);
    }
    for (const s of restartSeqs) await client.query(`ALTER SEQUENCE ${T(s)} RESTART`);
    await client.query('COMMIT');
    console.log('Done. The database is clean.' + (everything ? ' Re-seed roles and permissions before logging in.' : ' Next: node scripts/create-users.js'));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error('\nFAILED (nothing was changed):', e.message); process.exitCode = 1; }).finally(() => pool.end());
