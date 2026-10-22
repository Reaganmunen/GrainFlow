const AppError = require('./AppError');

const isBlank = (v) => v === undefined || v === '';

/** 'true'/'1'/true -> true, 'false'/'0'/false -> false, blank -> undefined */
const bool = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  return v === true || v === 'true' || v === '1' || v === 1;
};

function buildInsert(table, data, cols, casts = {}) {
  const names = [];
  const ph = [];
  const values = [];
  for (const c of cols) {
    if (isBlank(data[c])) continue; // undefined / '' -> let the DB default apply
    values.push(data[c]);
    names.push(c);
    ph.push(`$${values.length}${casts[c] ? '::' + casts[c] : ''}`);
  }
  const text = names.length
    ? `INSERT INTO ${table} (${names.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`
    : `INSERT INTO ${table} DEFAULT VALUES RETURNING *`;
  return { text, values };
}

function buildUpdate(table, id, data, cols, casts = {}, idCol = 'id') {
  const sets = [];
  const values = [];
  for (const c of cols) {
    if (data[c] === undefined) continue;
    values.push(data[c] === '' ? null : data[c]); // '' clears a field
    sets.push(`${c} = $${values.length}${casts[c] ? '::' + casts[c] : ''}`);
  }
  if (!sets.length) throw new AppError('Nothing to update', 400);
  values.push(id);
  return {
    text: `UPDATE ${table} SET ${sets.join(', ')} WHERE ${idCol} = $${values.length} RETURNING *`,
    values,
  };
}

async function insertRow(db, table, data, cols, casts) {
  const q = buildInsert(table, data, cols, casts);
  return (await db.query(q.text, q.values)).rows[0];
}

async function updateRow(db, table, id, data, cols, casts, idCol) {
  const q = buildUpdate(table, id, data, cols, casts, idCol);
  const { rows } = await db.query(q.text, q.values);
  if (!rows[0]) throw new AppError('Record not found', 404);
  return rows[0];
}

/** Small WHERE builder. Use ? for placeholders in raw(). */
class Where {
  constructor() {
    this.parts = [];
    this.values = [];
  }
  raw(sql, ...vals) {
    let n = this.values.length;
    this.parts.push(sql.replace(/\?/g, () => `$${++n}`));
    this.values.push(...vals);
    return this;
  }
  eq(col, v) {
    return v === undefined || v === null || v === '' ? this : this.raw(`${col} = ?`, v);
  }
  /** col is one of the listed values. A list that is undefined means "no restriction"; an empty list matches nothing. */
  inList(col, list) {
    if (list === undefined || list === null) return this;
    const arr = (Array.isArray(list) ? list : [list]).map(String);
    return arr.length ? this.raw(`${col}::text = ANY(?::text[])`, arr) : this.raw('false');
  }
  search(cols, term) {
    if (term === undefined || term === null || !String(term).trim()) return this;
    const n = this.values.length + 1;
    this.parts.push('(' + cols.map((c) => `${c}::text ILIKE $${n}`).join(' OR ') + ')');
    this.values.push(`%${String(term).trim()}%`);
    return this;
  }
  /** expr is a date expression, e.g. fn_local_date(s.sale_date) or e.expense_date */
  dateRange(expr, from, to) {
    if (from) this.raw(`${expr} >= ?::date`, from);
    if (to) this.raw(`${expr} <= ?::date`, to);
    return this;
  }
  get clause() {
    return this.parts.length ? 'WHERE ' + this.parts.join(' AND ') : '';
  }
}

function paginate({ page, limit } = {}, defaultLimit = 50, max = 500) {
  const l = Math.min(Math.max(parseInt(limit, 10) || defaultLimit, 1), max);
  const p = Math.max(parseInt(page, 10) || 1, 1);
  return { limit: l, offset: (p - 1) * l, page: p };
}

/** select = 'SELECT ...', from = 'FROM ... JOIN ...', orderBy must be a trusted constant string. */
async function paged(db, select, from, w, orderBy, opts = {}) {
  const { limit, offset, page } = paginate(opts);
  const total = (await db.query(`SELECT count(*) AS n ${from} ${w.clause}`, w.values)).rows[0].n;
  const n = w.values.length;
  const { rows } = await db.query(
    `${select} ${from} ${w.clause} ORDER BY ${orderBy} LIMIT $${n + 1} OFFSET $${n + 2}`,
    [...w.values, limit, offset]
  );
  return { rows, total, page, limit, pages: Math.ceil(total / limit) };
}

module.exports = { bool, buildInsert, buildUpdate, insertRow, updateRow, Where, paginate, paged };
