const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow, paged, bool } = require('../utils/sql');

const COLS = ['sku', 'name', 'kind', 'grain_id', 'grade_id', 'owner_module', 'is_millable', 'track_stock',
  'reorder_level_kg', 'description', 'is_active'];

class Item {
  /** Filters: search, kind, grain_id, owner_module, millable, active, page, limit. Includes stock per pool. */
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('i.kind', f.kind)
      .eq('i.grain_id', f.grain_id)
      .eq('i.owner_module', f.owner_module)
      .eq('i.is_millable', bool(f.millable))
      .eq('i.is_active', bool(f.active))
      .search(['i.name', 'i.sku'], f.search);
    return paged(
      exec(ctx),
      `SELECT i.*, g.name AS grain_name, gr.name AS grade_name,
              coalesce((SELECT quantity_kg FROM stock_balances WHERE item_id = i.id AND pool = 'CEREAL_STOCK'), 0) AS cereal_stock_kg,
              coalesce((SELECT quantity_kg FROM stock_balances WHERE item_id = i.id AND pool = 'MILL_STOCK'), 0) AS mill_stock_kg`,
      'FROM items i LEFT JOIN grains g ON g.id = i.grain_id LEFT JOIN grades gr ON gr.id = i.grade_id',
      w, 'i.name', f
    );
  }

  static async findById(id, ctx) {
    const db = exec(ctx);
    const item = (await db.query(
      `SELECT i.*, g.name AS grain_name, gr.name AS grade_name FROM items i
         LEFT JOIN grains g ON g.id = i.grain_id LEFT JOIN grades gr ON gr.id = i.grade_id WHERE i.id = $1`, [id])).rows[0];
    if (!item) return null;
    item.units = await Item.units(id, ctx);
    item.prices = (await db.query('SELECT tier, unit, price, price_per_kg, effective_from FROM v_current_prices WHERE item_id = $1 ORDER BY tier, unit', [id])).rows;
    item.min_price_per_kg = (await db.query('SELECT min_price_per_kg FROM item_min_prices WHERE item_id = $1', [id])).rows[0]?.min_price_per_kg ?? null;
    return item;
  }

  static async create(d, ctx) {
    if (!d.sku || !d.name || !d.kind) throw new AppError('sku, name and kind are required');
    return withTransaction(ctx, async (db) => {
      const row = await insertRow(db, 'items', d, COLS); // trigger adds the KG unit automatically
      return Item.findById(row.id, { client: db });
    });
  }

  static async update(id, d, ctx) {
    return withTransaction(ctx, async (db) => {
      await updateRow(db, 'items', id, d, COLS);
      return Item.findById(id, { client: db });
    });
  }

  // ---- units (bags, tins, packets -> kg) ----
  static async units(itemId, ctx) {
    return (await exec(ctx).query(
      `SELECT iu.item_id, iu.unit_id, u.code, u.name, iu.kg_per_unit, iu.is_sellable, iu.is_purchasable
         FROM item_units iu JOIN units u ON u.id = iu.unit_id WHERE iu.item_id = $1 ORDER BY iu.kg_per_unit, u.code`, [itemId])).rows;
  }

  /** Adds/updates how many kg one unit of this item is. kg_per_unit defaults to the unit's own size (bags); TIN needs it explicitly. */
  static async setUnit(itemId, unitId, d = {}, ctx) {
    return withTransaction(ctx, async (db) => (await db.query(
      `INSERT INTO item_units (item_id, unit_id, kg_per_unit, is_sellable, is_purchasable)
       VALUES ($1, $2, coalesce($3::numeric, (SELECT kg_per_unit FROM units WHERE id = $2)), coalesce($4::boolean, true), coalesce($5::boolean, true))
       ON CONFLICT (item_id, unit_id) DO UPDATE
         SET kg_per_unit = EXCLUDED.kg_per_unit, is_sellable = EXCLUDED.is_sellable, is_purchasable = EXCLUDED.is_purchasable
       RETURNING *`,
      [itemId, unitId, d.kg_per_unit ?? null, bool(d.is_sellable) ?? null, bool(d.is_purchasable) ?? null]
    )).rows[0]);
  }

  static async removeUnit(itemId, unitId, ctx) {
    return withTransaction(ctx, async (db) => {
      const u = (await db.query("SELECT code FROM units WHERE id = $1", [unitId])).rows[0];
      if (u && u.code === 'KG') throw new AppError('The KG unit cannot be removed');
      const r = await db.query('DELETE FROM item_units WHERE item_id = $1 AND unit_id = $2', [itemId, unitId]);
      return r.rowCount > 0;
    });
  }

  /**
   * Till catalogue: sellable items with each unit's current price for the tier, stock on hand (kg) in the
   * module's pool and the minimum price. module = 'CEREAL' | 'MILL', tier = 'RETAIL' | 'WHOLESALE'.
   */
  static async posCatalogue({ module = 'CEREAL', tier = 'RETAIL', search } = {}, ctx) {
    const pool = module === 'MILL' ? 'MILL_STOCK' : 'CEREAL_STOCK';
    const params = [pool, tier, module];
    let searchSql = '';
    if (search) {
      params.push(`%${search}%`);
      searchSql = 'AND (i.name ILIKE $4 OR i.sku ILIKE $4)';
    }
    const { rows } = await exec(ctx).query(
      `SELECT i.id, i.sku, i.name, i.kind, coalesce(sb.quantity_kg, 0) AS stock_kg, mp.min_price_per_kg,
              coalesce(json_agg(json_build_object('unit_id', u.id, 'unit_code', u.code, 'unit_name', u.name,
                       'kg_per_unit', iu.kg_per_unit, 'price', ip.price) ORDER BY iu.kg_per_unit)
                       FILTER (WHERE ip.id IS NOT NULL), '[]'::json) AS prices
         FROM items i
         JOIN item_units iu ON iu.item_id = i.id AND iu.is_sellable
         JOIN units u ON u.id = iu.unit_id
         LEFT JOIN item_prices ip ON ip.item_id = i.id AND ip.unit_id = u.id AND ip.effective_to IS NULL
              AND ip.tier_id = (SELECT id FROM price_tiers WHERE code = $2)
         LEFT JOIN stock_balances sb ON sb.item_id = i.id AND sb.pool = $1::stock_pool
         LEFT JOIN item_min_prices mp ON mp.item_id = i.id
        WHERE i.is_active AND i.track_stock AND (sb.item_id IS NOT NULL OR i.owner_module = $3::module_code) ${searchSql}
        GROUP BY i.id, sb.quantity_kg, mp.min_price_per_kg
        ORDER BY i.name`,
      params
    );
    return rows;
  }
}

module.exports = Item;
