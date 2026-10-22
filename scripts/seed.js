/**
 * GrainFlow seed script.
 *
 *   node scripts/seed.js              roles + permissions + login accounts + demo data
 *   node scripts/seed.js --no-demo    only roles, permissions and login accounts
 *   node scripts/seed.js --reset      also reset passwords of the seeded users and
 *                                     re-sync seeded roles' permissions
 *
 * Safe to run more than once: every insert checks for an existing row first.
 * Run it from the project root so that .env is found (same .env the app uses).
 *
 * Env overrides: SEED_PASSWORD (default below).
 */
require('dotenv').config();
const { pool } = require('../src/config/db');

const ARGS = new Set(process.argv.slice(2));
const DEMO = !ARGS.has('--no-demo');
const RESET = ARGS.has('--reset');
const PASSWORD = process.env.SEED_PASSWORD || 'GrainFlow@2026';

// ---------------------------------------------------------------- permissions
// Every permission code that the routes / controllers check.
const PERMISSIONS = [
  'activity.view', 'backups.view', 'catalogue.manage', 'credit.grant',
  'customers.create', 'customers.opening_balance', 'customers.update', 'customers.view',
  'daily_close.perform', 'daily_close.reopen', 'daily_close.view', 'dashboard.view',
  'deliveries.manage', 'deliveries.view',
  'expenses.create', 'expenses.manage', 'expenses.view', 'expenses.void',
  'mill.cancel', 'mill.collect', 'mill.create', 'mill.machines', 'mill.update', 'mill.view', 'mill.yield',
  'payments.create', 'payments.mpesa_manual', 'payments.reverse', 'payments.view',
  'price.override', 'prices.min_price', 'prices.update', 'rates.manage',
  'purchases.create', 'purchases.post', 'purchases.view',
  'reports.profit', 'reports.view', 'roles.manage', 'roles.view',
  'sales.create', 'sales.discount', 'sales.view', 'sales.void',
  'settings.manage', 'settings.view',
  'stock.adjust', 'stock.opening', 'stock.take', 'stock.take_post', 'stock.transfer', 'stock.view',
  'suppliers.create', 'suppliers.opening_balance', 'suppliers.update', 'suppliers.view',
  'users.create', 'users.reset_password', 'users.unlock', 'users.update', 'users.view',
];

// Roles, their modules and their permissions are defined ONCE, in src/config/access.js (the app uses that file,
// not the role_permissions table, for these roles). This script just makes the rows exist and keeps them in sync.
const access = require('../src/config/access');
const ROLE_NAMES = {
  OWNER: 'Owner', MILL_MANAGER: 'Mill manager', MILLER: 'Miller',
  CEREAL_MANAGER: 'Cereal manager', CEREAL_CASHIER: 'Cereal cashier',
};
const ROLES = Object.keys(ROLE_NAMES).map((code) => ({
  code, name: ROLE_NAMES[code], perms: code === 'OWNER' ? 'ALL' : access.ROLES[code].permissions,
}));

// ---------------------------------------------------------------- users
// modules follow the role: owner = both, mill staff = MILL only, cereal staff = CEREAL only
const USERS = [
  { username: 'owner',         full_name: 'Fred (Owner)',     role: 'OWNER',          email: 'owner@grainflow.local',         phone: '0700000001', modules: ['MILL', 'CEREAL'] },
  { username: 'millmanager',   full_name: 'Grace Mill Manager', role: 'MILL_MANAGER',   email: 'millmanager@grainflow.local',   phone: '0700000002', modules: ['MILL'] },
  { username: 'miller',        full_name: 'Peter Miller',     role: 'MILLER',         email: 'miller@grainflow.local',        phone: '0700000004', modules: ['MILL'] },
  { username: 'cerealmanager', full_name: 'Ann Cereal Manager', role: 'CEREAL_MANAGER', email: 'cerealmanager@grainflow.local', phone: '0700000005', modules: ['CEREAL'] },
  { username: 'cashier',       full_name: 'Joy Cashier',      role: 'CEREAL_CASHIER', email: 'cashier@grainflow.local',       phone: '0700000003', modules: ['CEREAL'] },
];

// ---------------------------------------------------------------- helpers
const log = (...a) => console.log(...a);

async function enumLabels(db, table, column) {
  const { rows } = await db.query(
    `SELECT e.enumlabel
       FROM information_schema.columns c
       JOIN pg_type t ON t.typname = c.udt_name
       JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE c.table_schema = 'pmc' AND c.table_name = $1 AND c.column_name = $2
      ORDER BY e.enumsortorder`, [table, column]);
  return rows.map((r) => r.enumlabel);
}

/** Picks the first candidate that is a valid enum label; falls back to the first candidate (non-enum columns). */
async function pick(db, table, column, ...candidates) {
  const labels = await enumLabels(db, table, column);
  if (!labels.length) return candidates[0];
  const hit = candidates.find((c) => labels.includes(c));
  if (hit) return hit;
  log(`    note: ${table}.${column} has values [${labels.join(', ')}]; using "${labels[0]}"`);
  return labels[0];
}

/** Runs fn inside a SAVEPOINT so one failing section does not abort the rest. */
async function step(db, name, fn) {
  await db.query('SAVEPOINT s');
  try {
    const out = await fn();
    await db.query('RELEASE SAVEPOINT s');
    log(`  ok   ${name}${out ? ' - ' + out : ''}`);
    return true;
  } catch (err) {
    await db.query('ROLLBACK TO SAVEPOINT s');
    log(`  SKIP ${name}: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------- core seed
async function seedCore(db) {
  log('\nCore (roles, permissions, users)');

  await step(db, 'permissions', async () => {
    let added = 0;
    for (const code of PERMISSIONS) {
      const r = await db.query(
        `INSERT INTO permissions (code, description)
         SELECT $1::text, $2::text WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = $1::text)`,
        [code, code.replace(/[._]/g, ' ')]);
      added += r.rowCount;
    }
    return `${added} new, ${PERMISSIONS.length - added} already there`;
  });

  await step(db, 'roles', async () => {
    let added = 0;
    for (const r of ROLES) {
      const res = await db.query(
        `INSERT INTO roles (code, name)
         SELECT $1::text, $2::text WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = $1::text)`,
        [r.code, r.name]);
      added += res.rowCount;
    }
    return `${added} new, ${ROLES.length - added} already there`;
  });

  await step(db, 'role permissions', async () => {
    const msgs = [];
    for (const r of ROLES) {
      const role = (await db.query('SELECT id FROM roles WHERE code = $1', [r.code])).rows[0];
      if (!role) continue;
      if (RESET && r.perms !== 'ALL') await db.query('DELETE FROM role_permissions WHERE role_id = $1', [role.id]);
      const res = r.perms === 'ALL'
        ? await db.query(
            `INSERT INTO role_permissions (role_id, permission_id)
             SELECT $1, id FROM permissions ON CONFLICT DO NOTHING`, [role.id])
        : await db.query(
            `INSERT INTO role_permissions (role_id, permission_id)
             SELECT $1, id FROM permissions WHERE code = ANY($2::text[]) ON CONFLICT DO NOTHING`,
            [role.id, r.perms]);
      msgs.push(`${r.code}+${res.rowCount}`);
    }
    return msgs.join(' ');
  });

  await step(db, 'old users on retired roles', async () => {
    // a leftover 'manager' user (old MANAGER role) would still see both businesses: tell the owner instead of guessing
    const { rows } = await db.query(
      `SELECT u.username, r.code FROM users u JOIN roles r ON r.id = u.role_id
        WHERE upper(r.code) = 'MANAGER' ORDER BY u.username`);
    return rows.length ? `still on old MANAGER role: ${rows.map((r) => r.username).join(', ')} (move them to MILL_MANAGER or CEREAL_MANAGER)` : 'none';
  });

  await step(db, 'users', async () => {
    const msgs = [];
    for (const u of USERS) {
      const role = (await db.query('SELECT id FROM roles WHERE code = $1', [u.role])).rows[0];
      if (!role) throw new Error(`role ${u.role} missing`);
      const existing = (await db.query('SELECT id FROM users WHERE lower(username) = lower($1)', [u.username])).rows[0];
      if (existing) {
        // always move an existing seeded user onto the new role and its modules (e.g. the old cashier who could enter the mill)
        await db.query('UPDATE users SET role_id = $2, allowed_modules = $3::module_code[] WHERE id = $1', [existing.id, role.id, u.modules]);
        if (RESET) {
          await db.query(
            `UPDATE users SET password_hash = crypt($2, gen_salt('bf', 10)), must_change_password = false,
                    failed_login_count = 0, locked_until = NULL, is_active = true
              WHERE id = $1`, [existing.id, PASSWORD]);
          msgs.push(`${u.username}:reset`);
        } else {
          msgs.push(`${u.username}:updated`);
        }
        continue;
      }
      await db.query(
        `INSERT INTO users (username, full_name, email, phone, password_hash, role_id, allowed_modules, must_change_password)
         VALUES ($1, $2, $3, $4, crypt($5, gen_salt('bf', 10)), $6, $7::module_code[], false)`,
        [u.username, u.full_name, u.email, u.phone, PASSWORD, role.id, u.modules]);
      msgs.push(`${u.username}:created`);
    }
    return msgs.join(' ');
  });
}

// ---------------------------------------------------------------- demo data
async function seedDemo(db) {
  log('\nDemo data (reference data, prices, customers, suppliers)');
  const owner = (await db.query("SELECT id FROM users WHERE lower(username) = 'owner'")).rows[0];
  try { await db.query('SELECT fn_set_app_user($1, $2)', [owner ? owner.id : null, null]); } catch (_) { /* audit helper optional */ }

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const idOf = async (table, col, val) => (await one(`SELECT id FROM ${table} WHERE ${col} = $1`, [val]))?.id;

  await step(db, 'price tiers', async () => {
    for (const [code, name] of [['RETAIL', 'Retail'], ['WHOLESALE', 'Wholesale']]) {
      await db.query(`INSERT INTO price_tiers (code, name) SELECT $1::text, $2::text WHERE NOT EXISTS (SELECT 1 FROM price_tiers WHERE code = $1::text)`, [code, name]);
    }
  });

  await step(db, 'units', async () => {
    for (const [code, name, kg] of [['KG', 'Kilogram', 1], ['BAG50', '50 kg bag', 50], ['BAG90', '90 kg bag', 90], ['TIN', 'Tin (2 kg)', 2]]) {
      await db.query(`INSERT INTO units (code, name, kg_per_unit) SELECT $1::text, $2::text, $3::numeric WHERE NOT EXISTS (SELECT 1 FROM units WHERE code = $1::text)`, [code, name, kg]);
    }
  });

  await step(db, 'grains', async () => {
    const rows = [['MAIZE', 'Maize', 'CEREAL', true], ['BEANS', 'Beans', 'PULSE', false], ['GREEN_GRAMS', 'Green grams', 'PULSE', false],
      ['RICE', 'Rice', 'CEREAL', false], ['MILLET', 'Millet', 'CEREAL', true], ['SORGHUM', 'Sorghum', 'CEREAL', true]];
    for (const [code, name, category, millable] of rows) {
      await db.query(
        `INSERT INTO grains (code, name, category, is_millable) SELECT $1::text, $2::text, $3::text, $4::boolean
          WHERE NOT EXISTS (SELECT 1 FROM grains WHERE code = $1::text)`, [code, name, category, millable]);
    }
  });

  await step(db, 'grades', async () => {
    for (const [i, [code, name]] of [['A', 'Grade A'], ['B', 'Grade B'], ['STD', 'Standard']].entries()) {
      await db.query(`INSERT INTO grades (code, name, sort_order) SELECT $1::text, $2::text, $3::int WHERE NOT EXISTS (SELECT 1 FROM grades WHERE code = $1::text)`, [code, name, i + 1]);
    }
  });

  // ---- items
  const items = {};
  await step(db, 'items', async () => {
    const kindGrain = await pick(db, 'items', 'kind', 'GRAIN', 'RAW_GRAIN', 'CEREAL', 'RAW');
    const kindFlour = await pick(db, 'items', 'kind', 'FLOUR', 'PRODUCT', 'FINISHED');
    const kindBran = await pick(db, 'items', 'kind', 'BRAN', 'BYPRODUCT', 'BY_PRODUCT');
    const modCereal = await pick(db, 'items', 'owner_module', 'CEREAL');
    const modMill = await pick(db, 'items', 'owner_module', 'MILL');
    const std = await idOf('grades', 'code', 'STD');
    const defs = [
      { sku: 'MAIZE-STD', name: 'Maize', kind: kindGrain, grain: 'MAIZE', mod: modCereal, millable: true, reorder: 500 },
      { sku: 'BEANS-STD', name: 'Beans', kind: kindGrain, grain: 'BEANS', mod: modCereal, millable: false, reorder: 200 },
      { sku: 'GGRAMS-STD', name: 'Green grams', kind: kindGrain, grain: 'GREEN_GRAMS', mod: modCereal, millable: false, reorder: 200 },
      { sku: 'RICE-STD', name: 'Rice', kind: kindGrain, grain: 'RICE', mod: modCereal, millable: false, reorder: 200 },
      { sku: 'FLOUR-MAIZE', name: 'Maize flour', kind: kindFlour, grain: 'MAIZE', mod: modMill, millable: false, reorder: 100 },
      { sku: 'BRAN-MAIZE', name: 'Maize bran', kind: kindBran, grain: 'MAIZE', mod: modMill, millable: false, reorder: 50 },
    ];
    for (const d of defs) {
      const grainId = await idOf('grains', 'code', d.grain);
      await db.query(
        `INSERT INTO items (sku, name, kind, grain_id, grade_id, owner_module, is_millable, track_stock, reorder_level_kg)
         SELECT $1::text, $2::text, $3::${await itemTypeCast(db, 'kind')}, $4::bigint, $5::bigint, $6::${await itemTypeCast(db, 'owner_module')}, $7::boolean, true, $8::numeric
          WHERE NOT EXISTS (SELECT 1 FROM items WHERE sku = $1::text)`,
        [d.sku, d.name, d.kind, grainId, std, d.mod, d.millable, d.reorder]);
      items[d.sku] = await idOf('items', 'sku', d.sku);
    }
    return `${defs.length} items`;
  });

  await step(db, 'bag units, prices and minimum prices', async () => {
    const kg = await idOf('units', 'code', 'KG');
    const bag90 = await idOf('units', 'code', 'BAG90');
    const retail = await idOf('price_tiers', 'code', 'RETAIL');
    const whole = await idOf('price_tiers', 'code', 'WHOLESALE');
    // sku -> [retail per kg, wholesale per kg, min per kg]
    const prices = {
      'MAIZE-STD': [60, 54, 50], 'BEANS-STD': [150, 138, 125], 'GGRAMS-STD': [170, 158, 140],
      'RICE-STD': [160, 148, 130], 'FLOUR-MAIZE': [90, 82, 75], 'BRAN-MAIZE': [35, 30, 20],
    };
    for (const [sku, [r, w, min]] of Object.entries(prices)) {
      const itemId = items[sku];
      if (!itemId) continue;
      await db.query(
        `INSERT INTO item_units (item_id, unit_id, kg_per_unit, is_sellable, is_purchasable)
         VALUES ($1, $2, 1, true, true) ON CONFLICT (item_id, unit_id) DO NOTHING`, [itemId, kg]);
      if (sku !== 'BRAN-MAIZE') {
        await db.query(
          `INSERT INTO item_units (item_id, unit_id, kg_per_unit, is_sellable, is_purchasable)
           VALUES ($1, $2, 90, true, true) ON CONFLICT (item_id, unit_id) DO NOTHING`, [itemId, bag90]);
      }
      const addPrice = async (tier, unit, price) => {
        const cur = await one('SELECT 1 FROM item_prices WHERE item_id = $1 AND tier_id = $2 AND unit_id = $3 AND effective_to IS NULL', [itemId, tier, unit]);
        if (!cur) await db.query('INSERT INTO item_prices (item_id, tier_id, unit_id, price, set_by) VALUES ($1, $2, $3, $4, $5)', [itemId, tier, unit, price, owner?.id || null]);
      };
      await addPrice(retail, kg, r);
      await addPrice(whole, kg, w);
      if (sku !== 'BRAN-MAIZE') {
        await addPrice(retail, bag90, r * 90 * 0.97);
        await addPrice(whole, bag90, w * 90);
      }
      await db.query(
        `INSERT INTO item_min_prices (item_id, min_price_per_kg, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (item_id) DO NOTHING`, [itemId, min, owner?.id || null]);
    }
  });

  await step(db, 'milling rate and yield standard (maize)', async () => {
    const maize = items['MAIZE-STD'];
    if (!maize) throw new Error('maize item missing');
    const basis = await pick(db, 'milling_rates', 'rate_basis', 'PER_KG', 'KG');
    const exists = await one("SELECT 1 FROM milling_rates WHERE rate_type = 'BASE' AND grain_item_id = $1", [maize]);
    if (!exists) {
      await db.query(
        `INSERT INTO milling_rates (grain_item_id, rate_type, name, rate_basis, rate, created_by)
         VALUES ($1, 'BASE', 'Maize milling', $2::${await columnType(db, 'milling_rates', 'rate_basis')}, 5, $3)`,
        [maize, basis, owner?.id || null]);
    }
    const y = await one('SELECT 1 FROM yield_standards WHERE grain_item_id = $1', [maize]);
    if (!y) {
      await db.query(
        `INSERT INTO yield_standards (grain_item_id, flour_item_id, bran_item_id, expected_flour_kg_per_100, expected_bran_kg_per_100, alert_below_kg_per_100, created_by)
         VALUES ($1, $2, $3, 85, 12, 80, $4)`,
        [maize, items['FLOUR-MAIZE'], items['BRAN-MAIZE'], owner?.id || null]);
    }
  });

  await step(db, 'machine', async () => {
    const exists = await one("SELECT 1 FROM machines WHERE name = 'Hammer Mill 1'");
    if (exists) return 'exists';
    const kind = await pick(db, 'machines', 'kind', 'HAMMER_MILL', 'MILL');
    const power = await pick(db, 'machines', 'power_source', 'ELECTRIC', 'ELECTRICITY');
    await db.query(
      `INSERT INTO machines (name, kind, power_source) VALUES ('Hammer Mill 1', $1::${await columnType(db, 'machines', 'kind')}, $2::${await columnType(db, 'machines', 'power_source')})`,
      [kind, power]);
  });

  await step(db, 'customers', async () => {
    const retailType = await pick(db, 'customers', 'customer_type', 'RETAIL', 'INDIVIDUAL', 'WALK_IN', 'REGULAR');
    const bizType = await pick(db, 'customers', 'customer_type', 'WHOLESALE', 'BUSINESS', 'INSTITUTION', 'HOTEL');
    const castType = await columnType(db, 'customers', 'customer_type');
    const rows = [
      ['Mary Wanjiku', null, retailType, '0711000001', false, 0, 0],
      ['John Otieno', null, retailType, '0711000002', false, 0, 0],
      ['Sunrise Hotel', 'Sunrise Hotel Ltd', bizType, '0722000003', true, 50000, 30],
      ['Hillside Primary School', 'Hillside Primary School', bizType, '0733000004', true, 80000, 30],
    ];
    for (const [full, biz, type, phone, credit, limit, days] of rows) {
      await db.query(
        `INSERT INTO customers (full_name, business_name, customer_type, phone, credit_allowed, credit_limit, credit_days)
         SELECT $1::text, $2::text, $3::${castType}, $4::text, $5::boolean, $6::numeric, $7::int
          WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = $4::text)`,
        [full, biz, type, phone, credit, limit, days]);
    }
    return `${rows.length} customers`;
  });

  await step(db, 'suppliers', async () => {
    for (const [name, contact, phone] of [['Nakuru Grain Traders', 'Samuel Kiprop', '0744000001'], ['Kisii Pulses Suppliers', 'Ann Nyaboke', '0755000002']]) {
      await db.query(
        `INSERT INTO suppliers (name, contact_person, phone, payment_terms_days)
         SELECT $1::text, $2::text, $3::text, 7 WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = $1::text)`, [name, contact, phone]);
    }
  });

  await step(db, 'expense categories', async () => {
    for (const name of ['Power / Electricity', 'Fuel', 'Repairs & maintenance', 'Wages', 'Rent', 'Transport', 'Other']) {
      await db.query(`INSERT INTO expense_categories (name) SELECT $1::text WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = $1::text)`, [name]);
    }
  });
}

/** Postgres type name (e.g. item_kind, module_code, text) of pmc.<table>.<column>, for explicit casts. */
async function columnType(db, table, column) {
  const { rows } = await db.query(
    `SELECT udt_name FROM information_schema.columns WHERE table_schema = 'pmc' AND table_name = $1 AND column_name = $2`, [table, column]);
  if (!rows[0]) throw new Error(`column ${table}.${column} not found`);
  return rows[0].udt_name; // search_path already includes pmc, so enum names resolve without a prefix
}
const itemTypeCast = (db, col) => columnType(db, 'items', col);

// ---------------------------------------------------------------- main
(async () => {
  const db = await pool.connect();
  try {
    await db.query("SET search_path TO pmc, public");
    await db.query('BEGIN');
    await seedCore(db);
    if (DEMO) await seedDemo(db);
    await db.query('COMMIT');

    log('\nDone. Log in with:');
    for (const u of USERS) log(`  ${u.username.padEnd(8)} / ${PASSWORD}   (${u.role})`);
    log('\nChange these passwords before real use.');
    if (DEMO) log('Opening stock is not seeded: add it through POST /api/stock/opening (or the Stock screen).');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('\nSeed failed:', err.message);
    process.exitCode = 1;
  } finally {
    db.release();
    await pool.end();
  }
})();