const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow, paged } = require('../utils/sql');
const Settings = require('./Settings');

const COLS = ['sale_id', 'customer_id', 'delivery_address', 'contact_phone', 'driver_name', 'vehicle_reg', 'notes', 'created_by'];

/** Delivery notes for wholesale / delivered sales: PENDING -> DISPATCHED -> DELIVERED (or CANCELLED). */
class Delivery {
  /** Filters: status, customer_id, sale_id, from, to, search */
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('d.status', f.status)
      .eq('d.customer_id', f.customer_id)
      .eq('d.sale_id', f.sale_id)
      .dateRange('fn_local_date(d.created_at)', f.from, f.to)
      .search(['d.delivery_no', 's.sale_no', 'c.full_name', 'd.driver_name', 'd.vehicle_reg'], f.search);
    return paged(
      exec(ctx),
      'SELECT d.*, s.sale_no, s.total_amount, s.balance_due, coalesce(c.full_name, s.walkin_name) AS customer_name',
      'FROM deliveries d JOIN sales s ON s.id = d.sale_id LEFT JOIN customers c ON c.id = d.customer_id',
      w, 'd.created_at DESC, d.id DESC', f
    );
  }

  static async findById(id, ctx) {
    return (await exec(ctx).query(
      `SELECT d.*, s.sale_no, coalesce(c.full_name, s.walkin_name) AS customer_name
         FROM deliveries d JOIN sales s ON s.id = d.sale_id LEFT JOIN customers c ON c.id = d.customer_id WHERE d.id = $1`, [id])).rows[0] || null;
  }

  /** Address, phone and customer default from the sale when not supplied. */
  static async create(d, ctx) {
    if (!d.sale_id) throw new AppError('sale_id is required');
    return withTransaction(ctx, async (db) => {
      const s = (await db.query(
        `SELECT s.status, s.customer_id, s.delivery_address, coalesce(s.walkin_phone, c.phone) AS phone
           FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = $1`, [d.sale_id])).rows[0];
      if (!s) throw new AppError('Sale not found', 404);
      if (s.status !== 'POSTED') throw new AppError('Deliveries can only be created for POSTED sales', 409);
      const row = await insertRow(db, 'deliveries', {
        ...d,
        customer_id: d.customer_id || s.customer_id || undefined,
        delivery_address: d.delivery_address || s.delivery_address || undefined,
        contact_phone: d.contact_phone || s.phone || undefined,
        created_by: ctx?.userId,
      }, COLS);
      return Delivery.findById(row.id, { client: db });
    });
  }

  static async update(id, d, ctx) {
    return withTransaction(ctx, async (db) => {
      await updateRow(db, 'deliveries', id, d, ['delivery_address', 'contact_phone', 'driver_name', 'vehicle_reg', 'notes']);
      return Delivery.findById(id, { client: db });
    });
  }

  /** status: PENDING | DISPATCHED | DELIVERED | CANCELLED. d.received_by_name is recorded on DELIVERED. */
  static async setStatus(id, status, d = {}, ctx) {
    if (!['PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(status)) throw new AppError('Invalid delivery status');
    return withTransaction(ctx, async (db) => {
      const r = await db.query(
        `UPDATE deliveries SET status = $2,
                dispatched_at = CASE WHEN $4::boolean THEN coalesce(dispatched_at, now()) ELSE dispatched_at END,
                delivered_at = CASE WHEN $5::boolean THEN now() ELSE delivered_at END,
                received_by_name = coalesce($3, received_by_name)
          WHERE id = $1 AND status NOT IN ('DELIVERED', 'CANCELLED') RETURNING id`,
        [id, status, d.received_by_name || null, status === 'DISPATCHED' || status === 'DELIVERED', status === 'DELIVERED']);
      if (!r.rowCount) throw new AppError('Delivery not found or already closed', 409);
      return Delivery.findById(id, { client: db });
    });
  }

  /** Printable delivery note: delivery, business, and the goods on the sale. */
  static async getNote(id, ctx) {
    const delivery = await Delivery.findById(id, ctx);
    if (!delivery) return null;
    const lines = (await exec(ctx).query(
      `SELECT coalesce(l.description, i.name) AS description, un.code AS unit_code, l.quantity, l.quantity_kg
         FROM sale_lines l LEFT JOIN items i ON i.id = l.item_id LEFT JOIN units un ON un.id = l.unit_id
        WHERE l.sale_id = $1 AND l.line_type = 'ITEM' ORDER BY l.id`, [delivery.sale_id])).rows;
    return { delivery, business: await Settings.getProfile(ctx), lines };
  }
}

module.exports = Delivery;
