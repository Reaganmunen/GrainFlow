#!/usr/bin/env node
/**
 * Creates the production accounts from scripts/users.json (copy scripts/users.example.json and edit it).
 *
 *   node scripts/create-users.js                 uses scripts/users.json
 *   node scripts/create-users.js my-users.json   uses another file
 *   node scripts/create-users.js --dry-run       checks the file and the roles, creates nothing
 *
 * - "role" is one of: OWNER, MILL_MANAGER, MILLER, CEREAL_MANAGER, CEREAL_CASHIER
 * - leave "password" out and a strong one is generated; passwords are printed ONCE at the end (save them)
 * - every user must change the password at first login (set "must_change_password": false to skip that)
 * - usernames that already exist are skipped, so it is safe to run again
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/config/db');
const { User } = require('../src/models');
const access = require('../src/config/access');

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const file = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, 'users.json'));

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // no 0/O/1/l/I
const generate = (len = 14) => Array.from({ length: len }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

async function main() {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}\nCopy scripts/users.example.json to scripts/users.json and edit it.`);
  let list;
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${path.basename(file)} is not valid JSON: ${e.message}`); }
  if (!Array.isArray(list) || !list.length) throw new Error('The file must be a JSON list of users.');

  const { rows: roles } = await pool.query('SELECT id, code FROM roles');
  const roleId = Object.fromEntries(roles.map((r) => [access.canon(r.code), r.id]));

  // validate everything first, so a typo in the last line does not leave half the users created
  const seen = new Set();
  list.forEach((u, i) => {
    const where = `User #${i + 1} (${u.username || 'no username'})`;
    if (!u.username || !/^[A-Za-z0-9._-]{3,40}$/.test(u.username)) throw new Error(`${where}: username must be 3-40 letters, digits, . _ -`);
    if (seen.has(u.username.toLowerCase())) throw new Error(`${where}: username appears twice in the file`);
    seen.add(u.username.toLowerCase());
    if (!u.full_name || !String(u.full_name).trim()) throw new Error(`${where}: full_name is required`);
    const code = access.canon(u.role);
    if (!access.ROLES[code]) throw new Error(`${where}: role "${u.role}" is not one of ${Object.keys(access.ROLES).join(', ')}`);
    if (!roleId[code]) throw new Error(`${where}: role ${code} does not exist in the database (roles table has: ${roles.map((r) => r.code).join(', ') || 'nothing'})`);
    if (u.password !== undefined && String(u.password).length < 8) throw new Error(`${where}: password must be at least 8 characters`);
  });
  const owners = list.filter((u) => access.canon(u.role) === 'OWNER').length;
  if (!owners) console.log('Warning: this file creates no OWNER. Make sure one already exists.');

  console.log(`\nChecked ${list.length} user(s) in ${path.basename(file)}${dry ? ' (dry run, nothing will be created)' : ''}\n`);
  const made = [];
  for (const u of list) {
    const code = access.canon(u.role);
    const exists = (await pool.query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [u.username])).rowCount;
    if (exists) { console.log(`  skipped   ${u.username} (already exists)`); continue; }
    if (dry) { console.log(`  would add ${u.username}  ${code}`); continue; }
    const password = u.password ? String(u.password) : generate();
    await User.create({
      username: u.username, full_name: u.full_name, email: u.email || null, phone: u.phone || null,
      password, role_id: roleId[code], must_change_password: u.must_change_password !== false,
    }, { userId: null });
    made.push({ username: u.username, name: u.full_name, role: code, password, generated: !u.password });
    console.log(`  created   ${u.username}  ${code}`);
  }

  if (made.length) {
    console.log('\n=== LOGIN DETAILS (shown once, save them now) ===');
    for (const m of made) console.log(`${m.role.padEnd(15)} ${m.name.padEnd(24)} ${m.username.padEnd(18)} ${m.generated ? m.password : '(password from your file)'}`);
    console.log('\nEach user will be asked to set a new password at first login (unless you turned that off).');
  }
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exitCode = 1; }).finally(() => pool.end());
