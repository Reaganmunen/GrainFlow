const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { User } = require('../src/models');

const PASSWORD = 'Test-pass-1234';
const OWNER = { username: 'ci_owner', full_name: 'CI Owner', roleCodes: ['OWNER'], modules: ['MILL', 'CEREAL'] };
const CASHIER = { username: 'ci_cashier', full_name: 'CI Cashier', roleCodes: ['CEREAL_CASHIER', 'CASHIER'], modules: ['CEREAL'] };

async function roleId(codes) {
  for (const code of codes) {
    const { rows } = await pool.query('SELECT id FROM roles WHERE code = $1', [code]);
    if (rows[0]) return rows[0].id;
  }
  throw new Error(`None of these roles exist in the test database: ${codes.join(', ')}. Check that the schema script seeds the roles.`);
}

/** Creates the user, or resets the password and unlocks it when it already exists (safe to run many times). */
async function ensureUser(u) {
  const existing = (await pool.query('SELECT id FROM users WHERE username = $1', [u.username])).rows[0];
  if (existing) {
    await pool.query(
      `UPDATE users SET password_hash = crypt($2, gen_salt('bf', 10)), is_active = true,
              failed_login_count = 0, locked_until = NULL, must_change_password = false WHERE id = $1`,
      [existing.id, PASSWORD]
    );
    return existing.id;
  }
  const created = await User.create({
    username: u.username, full_name: u.full_name, password: PASSWORD,
    role_id: await roleId(u.roleCodes), allowed_modules: u.modules, must_change_password: false,
  });
  return created.id;
}

async function login(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token;
}

/** Seeds an owner and a cereal cashier and returns their tokens. Call once per test file, in beforeAll. */
async function seedUsers() {
  await ensureUser(OWNER);
  await ensureUser(CASHIER);
  return { owner: await login(OWNER.username), cashier: await login(CASHIER.username) };
}

const as = (token) => ({ Authorization: `Bearer ${token}` });
const closeDb = () => pool.end();

module.exports = { request, app, seedUsers, as, closeDb, PASSWORD };
