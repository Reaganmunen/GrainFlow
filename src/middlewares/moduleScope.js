/**
 * Module (business) restriction, enforced on the server for every route that touches module data.
 * Needs req.access = { owner, modules[], pools[] } from middlewares/auth.js.
 *
 *   ownerOnly                       whole-business things (dashboard, transfers, balances across both businesses)
 *   requireModule('MILL')           everything under the route belongs to one business
 *   scopeLists                      list/report queries: sets req.query.scope_modules / scope_pools, models filter on them;
 *                                   asking for a business you are not in is refused
 *   bodyModule() / bodyPool()       a record being created or edited must be in your business
 *   guardRecord(...)                a record fetched by :id must be in your business
 *
 * A user without any module gets nothing (see requireAnyModule). The owner passes every check.
 */
const { pool } = require('../config/db');
const query = (text, values) => pool.query(text, values);
const AppError = require('../utils/AppError');
const { POOL_MODULE, MODULES } = require('../config/access');

const LABEL = { MILL: 'posho mill', CEREAL: 'cereal', SHARED: 'shared' };
const forbid = (message, extra) => new AppError(message, 403, { code: 'FORBIDDEN', ...extra });
const denyModule = (m) => forbid(`You do not have access to the ${LABEL[m] || m} side`, { module: m });
const up = (v) => (v === undefined || v === null || v === '' ? '' : String(v).trim().toUpperCase());
const blank = (v) => v === undefined || v === null || v === '';
const allows = (req, m) => !!req.access && (req.access.owner || (MODULES.includes(m) && req.access.modules.includes(m)));
const asArray = (v) => (Array.isArray(v) ? v : blank(v) ? [] : [v]);

/** Everyone who is not the owner needs at least one module to use the system at all. Mounted once, after authenticate. */
function requireAnyModule(req, res, next) {
  if (req.access && (req.access.owner || req.access.modules.length)) return next();
  return next(forbid('Your account has no module assigned. Ask the owner.', { code: 'NO_MODULE' }));
}

const ownerOnly = (req, res, next) =>
  req.access && req.access.owner ? next() : next(forbid('Only the owner can do this'));

const requireModule = (m) => (req, res, next) => (allows(req, m) ? next() : next(denyModule(m)));

/**
 * List endpoints. Sets req.query.scope_modules and req.query.scope_pools for a non-owner (always overwritten, so the
 * client cannot send its own). A module/pool asked for explicitly must be one of yours, otherwise 403.
 * The owner is unscoped (and may still filter by module as usual).
 */
function scopeLists(req, res, next) {
  delete req.query.scope_modules;
  delete req.query.scope_pools;
  if (req.access.owner) return next();
  const { modules, pools } = req.access;
  const asked = up(req.query.module);
  if (asked && !modules.includes(asked)) return next(denyModule(asked));
  const askedPool = up(req.query.pool || req.query.stock_pool);
  if (askedPool && !pools.includes(askedPool)) return next(forbid('You do not have access to that stock'));
  req.query.scope_modules = modules;
  req.query.scope_pools = pools;
  // a single-business user is pinned to it, so single-module filters (and DB functions that take one module) just work
  if (!asked && modules.length === 1) req.query.module = modules[0];
  next();
}

/**
 * Body carries a module (expense, payment, daily close ...). A non-owner must be in it: a missing module is filled in
 * with their only one, SHARED is refused.  { required: false } leaves a missing module alone (for edits).
 */
const bodyModule = (field = 'module', { required = true } = {}) => (req, res, next) => {
  if (req.access.owner) return next();
  req.body = req.body || {};
  const v = up(req.body[field]);
  if (!v) {
    if (!required) return next();
    if (req.access.modules.length === 1) { req.body[field] = req.access.modules[0]; return next(); }
    return next(new AppError(`${field} is required`));
  }
  return req.access.modules.includes(v) ? next() : next(denyModule(v));
};

/**
 * Body carries a stock pool (stock adjustment, stock take, purchase ...). Same idea as bodyModule.
 * { purchase: true } = a pool you can buy into (not customer grain).
 */
const bodyPool = (field = 'pool', { required = true, purchase = false } = {}) => (req, res, next) => {
  if (req.access.owner) return next();
  req.body = req.body || {};
  const mine = req.access.pools.filter((p) => !purchase || p !== 'CUSTOMER_GRAIN');
  const v = up(req.body[field]);
  if (!v) {
    if (!required) return next();
    if (mine.length === 1) { req.body[field] = mine[0]; return next(); }
    return next(new AppError(`${field} is required`));
  }
  return mine.includes(v) ? next() : next(forbid('You do not have access to that stock', { pool: v }));
};

/**
 * Record fetched by id: looks up which business it belongs to and refuses if it is not yours.
 *   table and moduleSql are trusted constants (never user input); the record is aliased as t.
 *   moduleSql must yield 'MILL' / 'CEREAL' (anything else, e.g. NULL or 'SHARED', is owner-only).
 * A missing record is left for the controller to answer with 404.
 */
const guardRecord = (table, moduleSql, param = 'id') => async (req, res, next) => {
  if (req.access.owner) return next();
  try {
    const id = req.params[param];
    if (!/^\d+$/.test(String(id))) return next();
    const { rows } = await query(`SELECT (${moduleSql})::text AS m FROM ${table} t WHERE t.id = $1`, [id]);
    if (!rows.length) return next();
    const m = rows[0].m;
    if (m && req.access.modules.includes(m)) { req.opModule = m; return next(); } // a manager approving this must work there too
    return next(m ? denyModule(m) : forbid('Only the owner can open this record'));
  } catch (err) {
    return next(err);
  }
};

/** Same, for a record id that comes in the body (e.g. POST /deliveries { sale_id }). */
const guardBodyRecord = (table, moduleSql, field) => async (req, res, next) => {
  if (req.access.owner) return next();
  try {
    const id = req.body && req.body[field];
    if (blank(id)) return next();
    if (!/^\d+$/.test(String(id))) return next(new AppError(`${field} is not valid`));
    const { rows } = await query(`SELECT (${moduleSql})::text AS m FROM ${table} t WHERE t.id = $1`, [id]);
    if (!rows.length) return next();
    const m = rows[0].m;
    return m && req.access.modules.includes(m) ? next() : next(m ? denyModule(m) : forbid('Only the owner can use this record'));
  } catch (err) {
    return next(err);
  }
};

/** SQL: which module a stock pool column belongs to. */
const POOL_SQL = (col) => `CASE WHEN ${col}::text IN ('MILL_STOCK','CUSTOMER_GRAIN') THEN 'MILL' WHEN ${col}::text = 'CEREAL_STOCK' THEN 'CEREAL' END`;

module.exports = {
  requireAnyModule, ownerOnly, requireModule, scopeLists, bodyModule, bodyPool, guardRecord, guardBodyRecord,
  POOL_SQL, POOL_MODULE,
};
