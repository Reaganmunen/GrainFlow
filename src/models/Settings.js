const { exec, withTransaction } = require('../config/db');
const { updateRow } = require('../utils/sql');

const PROFILE_COLS = ['business_name', 'owner_name', 'phone', 'email', 'address', 'kra_pin', 'mpesa_till_number',
  'default_receipt_style', 'receipt_header', 'receipt_footer'];
const MPESA_COLS = ['environment', 'business_shortcode', 'till_number', 'transaction_type', 'callback_url', 'is_active'];

/** business_profile, app_settings and mpesa_config (non-secret Daraja settings only). */
class Settings {
  static async getProfile(ctx) {
    return (await exec(ctx).query('SELECT * FROM business_profile WHERE id = 1')).rows[0] || null;
  }
  static async updateProfile(d, ctx) {
    return withTransaction(ctx, (db) => updateRow(db, 'business_profile', 1, d, PROFILE_COLS));
  }

  static async listSettings(ctx) {
    return (await exec(ctx).query('SELECT * FROM app_settings ORDER BY key')).rows;
  }
  /** Returns the JSON value of a setting, or fallback. */
  static async getSetting(key, fallback = null, ctx) {
    const { rows } = await exec(ctx).query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return rows[0] ? rows[0].value : fallback;
  }
  static async setSetting(key, value, description, ctx) {
    return withTransaction(ctx, async (db) => (await db.query(
      `INSERT INTO app_settings (key, value, description) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, description = coalesce(EXCLUDED.description, app_settings.description), updated_at = now()
       RETURNING *`,
      [key, JSON.stringify(value), description || null]
    )).rows[0]);
  }

  static async getMpesaConfig(ctx) {
    return (await exec(ctx).query('SELECT * FROM mpesa_config WHERE id = 1')).rows[0] || null;
  }
  static async updateMpesaConfig(d, ctx) {
    return withTransaction(ctx, (db) => updateRow(db, 'mpesa_config', 1, d, MPESA_COLS));
  }
}

module.exports = Settings;
