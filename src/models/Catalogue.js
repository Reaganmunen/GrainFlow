const { exec, withTransaction } = require('../config/db');
const { Where, insertRow, updateRow, bool } = require('../utils/sql');

/** Tiny CRUD factory for the simple lookup tables. */
function makeLookup(table, cols, orderBy) {
  return {
    async list(f = {}, ctx) {
      const w = new Where();
      if (cols.includes('is_active')) w.eq('is_active', bool(f.active));
      const { rows } = await exec(ctx).query(`SELECT * FROM ${table} ${w.clause} ORDER BY ${orderBy}`, w.values);
      return rows;
    },
    async findById(id, ctx) {
      return (await exec(ctx).query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0] || null;
    },
    async create(d, ctx) {
      return withTransaction(ctx, (db) => insertRow(db, table, d, cols));
    },
    async update(id, d, ctx) {
      return withTransaction(ctx, (db) => updateRow(db, table, id, d, cols));
    },
  };
}

const Grain = makeLookup('grains', ['code', 'name', 'category', 'is_millable', 'is_active'], 'name');
const Grade = makeLookup('grades', ['code', 'name', 'sort_order'], 'sort_order, name');
const Unit = makeLookup('units', ['code', 'name', 'kg_per_unit', 'is_active'], 'code');
const PriceTier = makeLookup('price_tiers', ['code', 'name'], 'id');

module.exports = { Grain, Grade, Unit, PriceTier };
