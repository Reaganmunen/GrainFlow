const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where } = require('../utils/sql');

/** Price lists (history kept), and the minimum price a cashier may sell at without a manager override. */
class Price {
  /** Current prices. Filters: item_id, tier ('RETAIL'|'WHOLESALE'), search. */
  static async current(f = {}, ctx) {
    const w = new Where().eq('item_id', f.item_id).eq('tier', f.tier).search(['item_name'], f.search);
    return (await exec(ctx).query(`SELECT * FROM v_current_prices ${w.clause} ORDER BY item_name, tier, price_per_kg`, w.values)).rows;
  }

  static async history(itemId, f = {}, ctx) {
    const w = new Where().raw('ip.item_id = ?', itemId).eq('t.code', f.tier);
    return (await exec(ctx).query(
      `SELECT ip.id, t.code AS tier, u.code AS unit, ip.price, ip.effective_from, ip.effective_to, us.full_name AS set_by_name
         FROM item_prices ip JOIN price_tiers t ON t.id = ip.tier_id JOIN units u ON u.id = ip.unit_id
         LEFT JOIN users us ON us.id = ip.set_by ${w.clause} ORDER BY ip.effective_from DESC, ip.id DESC`, w.values)).rows;
  }

  /** Sets a new price (closes the old one). Rejected by the DB if below the item's minimum price. */
  static async set({ item_id, tier_id, tier_code, unit_id, price }, ctx) {
    if (!item_id || !unit_id || price === undefined || price === '' || Number(price) < 0) {
      throw new AppError('item_id, unit_id and a valid price are required');
    }
    return withTransaction(ctx, async (db) => {
      let tier = tier_id;
      if (!tier) {
        const t = (await db.query('SELECT id FROM price_tiers WHERE code = $1', [tier_code])).rows[0];
        if (!t) throw new AppError('Unknown price tier', 400);
        tier = t.id;
      }
      const cur = (await db.query(
        'SELECT price FROM item_prices WHERE item_id = $1 AND tier_id = $2 AND unit_id = $3 AND effective_to IS NULL',
        [item_id, tier, unit_id])).rows[0];
      if (cur && Number(cur.price) === Number(price)) return { unchanged: true, price: cur.price };
      return (await db.query(
        'INSERT INTO item_prices (item_id, tier_id, unit_id, price, set_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [item_id, tier, unit_id, price, ctx?.userId || null])).rows[0];
    });
  }

  /** prices = [{ item_id, tier_code, unit_id, price }, ...] applied in one transaction. */
  static async setMany(prices, ctx) {
    if (!Array.isArray(prices) || !prices.length) throw new AppError('prices must be a non-empty array');
    return withTransaction(ctx, async (db) => {
      const out = [];
      for (const p of prices) out.push(await Price.set(p, { ...ctx, client: db }));
      return out;
    });
  }

  static async minPrices(ctx) {
    return (await exec(ctx).query(
      `SELECT m.item_id, i.name AS item_name, m.min_price_per_kg, m.updated_at FROM item_min_prices m
         JOIN items i ON i.id = m.item_id ORDER BY i.name`)).rows;
  }

  /** Note: raising a minimum does not change existing prices; check the price list afterwards. */
  static async setMinPrice(itemId, minPricePerKg, ctx) {
    if (minPricePerKg === undefined || minPricePerKg === '' || Number(minPricePerKg) < 0) throw new AppError('A valid min_price_per_kg is required');
    return withTransaction(ctx, async (db) => (await db.query(
      `INSERT INTO item_min_prices (item_id, min_price_per_kg, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (item_id) DO UPDATE SET min_price_per_kg = EXCLUDED.min_price_per_kg, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING *`, [itemId, minPricePerKg, ctx?.userId || null])).rows[0]);
  }

  static async removeMinPrice(itemId, ctx) {
    return withTransaction(ctx, async (db) => (await db.query('DELETE FROM item_min_prices WHERE item_id = $1', [itemId])).rowCount > 0);
  }
}

module.exports = Price;
