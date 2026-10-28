const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const Settings = require('./Settings');

const money = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const when = (d) => new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' });

/** Receipts for posted sales, in print or WhatsApp form. Re-issuing marks the new receipt as a duplicate. */
class Receipt {
  /** Issues a receipt (snapshot of totals, payment methods and M-Pesa codes). */
  static async issue(saleId, ctx) {
    return withTransaction(ctx, async (db) => {
      const { rows } = await db.query('SELECT * FROM fn_issue_receipt($1, $2)', [saleId, ctx?.userId || null]);
      return rows[0];
    });
  }

  static async forSale(saleId, ctx) {
    return (await exec(ctx).query('SELECT * FROM receipts WHERE sale_id = $1 ORDER BY id', [saleId])).rows;
  }

  /** Everything the print template needs: receipt, business profile, customer, lines, payments. */
  static async getPrintable(receiptId, ctx) {
    const db = exec(ctx);
    const receipt = (await db.query('SELECT * FROM receipts WHERE id = $1', [receiptId])).rows[0];
    if (!receipt) return null;
    const sale = (await db.query(
      `SELECT s.*, c.full_name AS customer_name, c.phone AS customer_phone, u.full_name AS cashier_name
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.cashier_id WHERE s.id = $1`, [receipt.sale_id])).rows[0];
    const lines = (await db.query(
      `SELECT l.id, coalesce(l.description, i.name) AS description, un.code AS unit_code, l.quantity, l.unit_price, l.line_total
         FROM sale_lines l LEFT JOIN items i ON i.id = l.item_id LEFT JOIN units un ON un.id = l.unit_id
        WHERE l.sale_id = $1 ORDER BY l.id`, [receipt.sale_id])).rows;
    const payments = (await db.query(
      `SELECT p.method, pa.amount, p.mpesa_receipt, p.confirmed_at FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
        WHERE pa.sale_id = $1 AND p.state = 'CONFIRMED' ORDER BY p.confirmed_at`, [receipt.sale_id])).rows;
    const business = await Settings.getProfile(ctx);
    return { receipt, business, sale, lines, payments };
  }

  static async markPrinted(receiptId, ctx) {
    const { rows } = await exec(ctx).query('UPDATE receipts SET print_count = print_count + 1 WHERE id = $1 RETURNING *', [receiptId]);
    if (!rows[0]) throw new AppError('Receipt not found', 404);
    return rows[0];
  }

  /** Plain-text version for WhatsApp / SMS. */
  static toText({ receipt, business, sale, lines, payments }) {
    const out = [];
    out.push(business?.business_name || 'Receipt');
    if (business?.receipt_header) out.push(business.receipt_header);
    out.push(`Receipt ${receipt.receipt_no}${receipt.is_duplicate ? ' (DUPLICATE)' : ''}`);
    out.push(when(receipt.issued_at));
    out.push(`Customer: ${sale.customer_name || sale.walkin_name || 'Walk-in'}`);
    out.push('------------------------');
    for (const l of lines) {
      out.push(`${l.description}`);
      out.push(`  ${Number(l.quantity)} ${l.unit_code || ''} x ${money(l.unit_price)} = ${money(l.line_total)}`);
    }
    out.push('------------------------');
    if (Number(sale.discount_amount) > 0) out.push(`Discount: ${money(sale.discount_amount)}`);
    out.push(`TOTAL: KES ${money(receipt.total_amount)}`);
    out.push(`Paid: KES ${money(receipt.amount_paid)}`);
    if (Number(receipt.balance_due) > 0) out.push(`Balance: KES ${money(receipt.balance_due)}`);
    if (payments.length) out.push(`Method: ${payments.map((p) => p.method.replace('_', ' ')).join(' + ')}`);
    if (receipt.mpesa_codes) out.push(`M-Pesa: ${receipt.mpesa_codes}`);
    if (business?.receipt_footer) out.push(business.receipt_footer);
    return out.join('\n');
  }

  /** wa.me click-to-chat link with the receipt text prefilled. phone like 254712345678. */
  static whatsappUrl(phone, text) {
    const digits = String(phone || '').replace(/\D/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  // ---- delivery log (print / WhatsApp / SMS sends) ----
  static async queueDelivery({ receipt_id, channel, recipient_phone }, ctx) {
    const { rows } = await exec(ctx).query(
      'INSERT INTO receipt_deliveries (receipt_id, channel, recipient_phone) VALUES ($1, $2, $3) RETURNING *',
      [receipt_id, channel, recipient_phone || null]);
    return rows[0];
  }

  static async updateDelivery(id, { status, provider_message_id, error_text }, ctx) {
    const { rows } = await exec(ctx).query(
      `UPDATE receipt_deliveries SET status = $2::message_status, provider_message_id = coalesce($3, provider_message_id), error_text = $4,
              sent_at = CASE WHEN $2::message_status IN ('SENT', 'DELIVERED') THEN coalesce(sent_at, now()) ELSE sent_at END
        WHERE id = $1 RETURNING *`,
      [id, status, provider_message_id || null, error_text || null]);
    if (!rows[0]) throw new AppError('Delivery record not found', 404);
    return rows[0];
  }

  static async deliveries(receiptId, ctx) {
    return (await exec(ctx).query('SELECT * FROM receipt_deliveries WHERE receipt_id = $1 ORDER BY id', [receiptId])).rows;
  }
}

module.exports = Receipt;
