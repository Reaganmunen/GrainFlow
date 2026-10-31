require('dotenv').config();
const { Pool, types } = require('pg');

// bigint -> Number, numeric -> Number, DATE -> 'YYYY-MM-DD' string (no timezone shifts)
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(1082, (v) => v);

// DB_SSL=true -> encrypted AND certificate-checked (Neon uses a normal public certificate). Only set DB_SSL_INSECURE=true for a self-signed server.
const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_INSECURE !== 'true' } : false;

// Serverless: every warm instance holds its own pool, so keep it small there (many instances x 10 would exhaust the database).
const POOL_MAX = Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 3 : 10);

// Neon scales to zero when idle, so the first connection after a quiet spell can be slow: allow time, and drop idle clients early.
const POOL_OPTS = { max: POOL_MAX, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000, keepAlive: true };

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl, ...POOL_OPTS }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'posho_cereals',
        ssl,
        ...POOL_OPTS,
      }
);

// Every connection works inside the pmc schema and on Nairobi time.
// On Neon's POOLED endpoint (host contains "-pooler") session SETs may not stick: use the direct host, or also run
//   ALTER ROLE <role> SET search_path TO pmc, public;  ALTER ROLE <role> SET timezone TO 'Africa/Nairobi';
pool.on('connect', (client) => {
  client
    .query("SET search_path TO pmc, public; SET TIME ZONE 'Africa/Nairobi';")
    .catch((e) => console.error('PG session setup failed:', e.message));
});
pool.on('error', (err) => console.error('Unexpected PG pool error:', err.message));

/** Query runner: the caller's transaction client if there is one, else the pool. */
const exec = (ctx) => (ctx && ctx.client) || pool;

/**
 * Runs fn(client) inside a transaction and tells the audit trigger who is acting.
 *   ctx = { userId, ip }              -> opens (and commits/rolls back) its own transaction
 *   ctx = { userId, ip, client }      -> joins the caller's transaction (caller owns commit)
 */
async function withTransaction(ctx, fn) {
  if (ctx && ctx.client) return fn(ctx.client);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT fn_set_app_user($1, $2)', [ctx?.userId ?? null, ctx?.ip ?? null]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const FRIENDLY = {
  customers_phone_check: 'Enter a valid Kenyan phone number, e.g. 0712345678',
  ux_customers_phone: 'A customer with this phone number already exists',
  ux_users_username: 'That username is already taken',
  ux_payments_mpesa_receipt: 'This M-Pesa code has already been recorded',
};

/** Turns a Postgres error into { status, message } for your error middleware (null = unknown error). */
function toHttpError(err) {
  if (!err || !err.code) return null;
  if (FRIENDLY[err.constraint]) {
    return { status: err.code === '23505' ? 409 : 400, message: FRIENDLY[err.constraint] };
  }
  switch (err.code) {
    case '23505':
      return { status: 409, message: 'Duplicate record' + (err.detail ? `: ${err.detail}` : '') };
    case '23503':
      return { status: 409, message: 'This record is linked to other records, or the linked record does not exist' };
    case '23502':
      return { status: 400, message: `Missing required value${err.column ? `: ${err.column}` : ''}` };
    case '23514': // check_violation (incl. "Insufficient stock", price rules)
    case 'P0001': // RAISE EXCEPTION from the business-logic functions
      return { status: 400, message: err.message };
    case '23001': // restrict_violation (append-only tables)
      return { status: 409, message: err.message };
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
      return { status: 400, message: 'Invalid value supplied' };
    default:
      return null;
  }
}

module.exports = { pool, exec, withTransaction, toHttpError };
