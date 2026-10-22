/**
 * Report screens, all built from one small framework (makeReport) below:
 *   Owner > Sales                #/owner/sales
 *   Owner > Profit and margin    #/owner/profit
 *   Owner > Customer balances    #/owner/customer-balances
 *   Owner > Credit overdue       #/owner/credit-overdue   (tabs: Overdue, Ageing)
 *   Owner > Supplier balances    #/owner/supplier-balances
 *   Owner > Stock value          #/owner/stock-value
 *   Cereals > Margin per grain   #/cereal/margin
 * Uses GET /reports/sales-daily, /payments-daily, /profit, /margin, /customer-balances, /credit-overdue,
 * /receivables-aging, /supplier-balances and /stock-value. Every table can be exported to CSV.
 *
 * Several of these come straight from database views, so where the exact columns are not fixed the screen
 * reads whatever columns come back (autoTable) and formats them by name: money, kg, percent, dates, counts.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const first = (r, ...keys) => { for (const k of keys) if (r && r[k] !== undefined && r[k] !== null) return r[k]; return undefined; };
  const fmt = (n, d = 2) => num(n).toLocaleString('en-KE', { maximumFractionDigits: d });
  const dayLabel = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '–');
  const MODULE = { MILL: 'Mill', CEREAL: 'Cereals', SHARED: 'Shared' };
  const POOL = { MILL_STOCK: 'Mill stock', CEREAL_STOCK: 'Cereal stock', CUSTOMER_GRAIN: 'Customer grain', MILL_OWN: 'Mill own grain', CUSTOMER: 'Customer grain', CEREAL: 'Cereal stock', MILL: 'Mill stock' };
  const neg = (n, text) => (num(n) < 0 ? `<span class="neg-text">${text}</span>` : text);

  // ================================================================ generic table over whatever columns come back
  const HIDE = /(^id$|_id$|^created_at$|^updated_at$)/i;
  const NONNUM = /(phone|code|sku|_no$|^no$|number|email|msisdn)/i;
  const DATEK = /(^(day|date|as_of)$|_date$|_day$|_at$)/i;
  const INTK = /(count|^n$|_n$|entries|days|jobs|lines|invoices)/i;
  const PCTK = /(pct|percent)/i;
  const UNITK = /(per_kg|per_unit|per_bag|avg|average|price|rate)/i;
  const KGK = /(kg|weight|quantity)/i;
  const MONEYK = /(amount|value|revenue|cost|cogs|profit|expense|total|balance|owed|outstanding|overdue|collected|cash|mpesa|kes|sold|paid|credit|margin|spend|purchase)/i;
  const NAMEK = /(name|customer|supplier|item|grain|pool|^day$|^date$)/i;
  const headOf = (k) => String(k).replace(/_/g, ' ').replace(/\bkg\b/i, 'kg').replace(/\bkes\b/i, '(KES)').replace(/\bpct\b/i, '%').replace(/^./, (c) => c.toUpperCase());
  const isNum = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));

  /**
   * opts: { sort: RegExp (column to sort by, descending), allMoney: bool, skip: RegExp, first: [keys], labels: { key: 'Header' }, empty: 'text' }
   * Returns { html, cols, rows, csv }.
   */
  function autoTable(rows, opts = {}) {
    if (!rows || !rows.length) return { html: Kit.empty('bi-table', 'Nothing to show', opts.empty || 'There is no data for this period.'), cols: [], rows: [], csv: null };
    let keys = Object.keys(rows[0]).filter((k) => !HIDE.test(k) && !(opts.skip && opts.skip.test(k)));
    const lead = [...(opts.first || []), ...keys.filter((k) => NAMEK.test(k) && !(opts.first || []).includes(k))].filter((k, i, a) => keys.includes(k) && a.indexOf(k) === i);
    keys = [...lead, ...keys.filter((k) => !lead.includes(k))];

    const cols = keys.map((k) => {
      const vals = rows.map((r) => r[k]).filter((v) => v !== null && v !== undefined && v !== '');
      const numeric = vals.length > 0 && vals.every(isNum) && !NONNUM.test(k);
      let kind = 'text';
      if (DATEK.test(k)) kind = 'date';
      else if (numeric) {
        if (PCTK.test(k)) kind = 'pct';
        else if (INTK.test(k)) kind = 'int';
        else if (UNITK.test(k)) kind = 'unit';
        else if (KGK.test(k)) kind = 'kg';
        else if (MONEYK.test(k) || opts.allMoney) kind = 'money';
        else kind = 'number';
      }
      return { key: k, kind, head: (opts.labels && opts.labels[k]) || headOf(k), sum: ['int', 'kg', 'money'].includes(kind) };
    });

    let sorted = rows.slice();
    const sk = opts.sort && cols.find((c) => opts.sort.test(c.key) && ['money', 'kg', 'number', 'pct', 'unit', 'int'].includes(c.kind));
    if (sk) sorted.sort((a, b) => num(b[sk.key]) - num(a[sk.key]));

    const show = (c, v) => {
      if (v === null || v === undefined || v === '') return '–';
      switch (c.kind) {
        case 'date': return esc(DATEK.test(c.key) && String(v).length >= 10 ? dayLabel(v) : String(v));
        case 'int': return esc(fmt(v, 0));
        case 'kg': return esc(`${fmt(v)} kg`);
        case 'money': case 'unit': return neg(v, esc(UI.money(v)));
        case 'pct': return neg(v, esc(`${fmt(v, 1)}%`));
        case 'number': return esc(fmt(v));
        default: {
          if (c.key === 'module') return esc(MODULE[v] || v);
          if (c.key === 'pool') return esc(POOL[v] || v);
          return esc(/^[A-Z0-9_]+$/.test(String(v)) && String(v).includes('_') ? headOf(v) : String(v));
        }
      }
    };
    const rightKinds = ['int', 'kg', 'money', 'unit', 'pct', 'number'];
    const body = sorted.map((r) => `<tr>${cols.map((c) => `<td class="${rightKinds.includes(c.kind) ? 'r' : ''}">${show(c, r[c.key])}</td>`).join('')}</tr>`).join('');
    const totals = cols.map((c, i) => {
      if (i === 0) return '<td><b>Total</b></td>';
      if (!c.sum) return '<td></td>';
      const t = sorted.reduce((a, r) => a + num(r[c.key]), 0);
      return `<td class="r"><b>${show(c, t)}</b></td>`;
    }).join('');
    const foot = cols.some((c) => c.sum) && sorted.length > 1 ? `<tr>${totals}</tr>` : '';
    const sums = {};
    cols.forEach((c) => { if (c.sum) sums[c.key] = sorted.reduce((a, r) => a + num(r[c.key]), 0); });
    return {
      html: Kit.table(cols.map((c) => [c.head, rightKinds.includes(c.kind) ? 'r' : '']), body, { foot }),
      cols, rows: sorted, sums,
      csv: { headers: cols.map((c) => c.head), rows: sorted.map((r) => cols.map((c) => r[c.key])) },
    };
  }

  /** KPI cards from the first summable columns of an autoTable result. */
  function autoKpis(t, n, firstCard) {
    const cards = [];
    if (firstCard) cards.push(firstCard);
    const pick = t.cols.filter((c) => c.sum && c.kind !== 'int').slice(0, n - cards.length);
    pick.forEach((c) => {
      const v = t.sums[c.key];
      cards.push(Kit.kpi(c.kind === 'kg' ? 'bi-speedometer' : 'bi-cash-stack', c.head, c.kind === 'kg' ? esc(`${fmt(v)} kg`) : esc(UI.money(v))));
    });
    return cards.join('');
  }

  // ================================================================ the report framework
  const MODS = [['', 'Both'], ['MILL', 'Mill'], ['CEREAL', 'Cereals']];

  /**
   * cfg: { path, title, dates, range, modules, defaultModule(), tabs: [[key,label]], flags: [{key,label,on}],
   *        search: 'server'|'client', placeholder, fetch(s) -> data, view(s, data) -> { kpis, body, csv:{headers,rows,name} } }
   */
  function makeReport(cfg) {
    GF.page(cfg.path, {
      title: cfg.title,
      render(el) {
        const multi = cfg.modules && (GF.isOwner || GF.modules.length > 1);
        const r0 = cfg.dates ? Kit.range(cfg.range || 'month') : {};
        const s = {
          rng: cfg.range || 'month', from: r0.from || '', to: r0.to || '',
          module: cfg.defaultModule ? cfg.defaultModule() : '', search: '', tab: cfg.tabs ? cfg.tabs[0][0] : '',
          flags: Object.fromEntries((cfg.flags || []).map((f) => [f.key, !!f.on])), data: null, loading: true, failed: '',
        };
        el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>';
        const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');
        let csv = null;

        async function load(quiet) {
          if (!quiet) { s.loading = true; paintBody(); }
          try { s.data = await cfg.fetch(s); s.failed = ''; }
          catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
          s.loading = false; paintBody();
        }

        function paintToolbar() {
          const parts = [];
          if (cfg.tabs) parts.push(`<div class="gf-seg" style="min-width:${cfg.tabs.length * 130}px">${cfg.tabs.map(([k, l]) => `<button type="button" class="${s.tab === k ? 'on' : ''}" data-tab="${k}">${esc(l)}</button>`).join('')}</div>`);
          if (cfg.dates) {
            const rc = (k, l) => `<button type="button" class="fchip ${s.rng === k ? 'on' : ''}" data-range="${k}">${l}</button>`;
            parts.push(`${rc('today', 'Today')}${rc('week', '7 days')}${rc('month', 'This month')}${rc('all', 'All time')}
              <label class="date-box">From <input type="date" id="r-from" value="${esc(s.from || '')}"></label>
              <label class="date-box">To <input type="date" id="r-to" value="${esc(s.to || '')}"></label>`);
          }
          if (multi) parts.push(MODS.filter(([k]) => GF.isOwner || !k || GF.inModule(k)).map(([k, l]) => `<button type="button" class="fchip outline ${s.module === k ? 'on' : ''}" data-module="${k}">${l}</button>`).join(''));
          if (cfg.flags) parts.push(cfg.flags.map((f) => `<button type="button" class="fchip outline ${s.flags[f.key] ? 'on' : ''}" data-flag="${f.key}">${esc(f.label)}</button>`).join(''));
          const grow = cfg.search ? `<span class="grow"></span><label class="search"><i class="bi bi-search"></i><input type="search" id="r-search" placeholder="${esc(cfg.placeholder || 'Search')}" value="${esc(s.search)}" aria-label="Search"></label>` : '';
          toolbarEl.innerHTML = parts.join('<span class="sep"></span>') + grow;
        }

        function paintBody() {
          if (s.loading) { kpisEl.innerHTML = ''; hostEl.innerHTML = Kit.loading(cfg.title.toLowerCase()); GF.setActions(''); return; }
          if (s.failed || !s.data) {
            kpisEl.innerHTML = '';
            hostEl.innerHTML = `${Kit.error(s.failed || 'No data came back.')}<div class="dt-empty"><button class="gf-btn gf-btn-dark gf-btn-sm" data-retry type="button">Try again</button></div>`;
            GF.setActions('');
            return;
          }
          const v = cfg.view(s, s.data);
          kpisEl.innerHTML = v.kpis || '';
          kpisEl.style.display = v.kpis ? '' : 'none';
          hostEl.innerHTML = v.body;
          csv = v.csv && v.csv.rows && v.csv.rows.length ? v.csv : null;
          GF.setActions(csv ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" id="rp-csv" type="button"><i class="bi bi-download"></i>Export CSV</button>' : '');
          const b = document.getElementById('rp-csv');
          if (b) b.addEventListener('click', () => Kit.csv(csv.rows, csv.headers, csv.name || cfg.path.replace('/', '-')));
        }

        // ---- events
        toolbarEl.addEventListener('click', (e) => {
          const t = e.target.closest('[data-tab]');
          if (t) { s.tab = t.dataset.tab; paintToolbar(); paintBody(); return; }
          const r = e.target.closest('[data-range]');
          if (r) { s.rng = r.dataset.range; Object.assign(s, { from: '', to: '' }, Kit.range(s.rng)); paintToolbar(); load(); return; }
          const m = e.target.closest('[data-module]');
          if (m) { s.module = m.dataset.module; paintToolbar(); load(); return; }
          const f = e.target.closest('[data-flag]');
          if (f) { s.flags[f.dataset.flag] = !s.flags[f.dataset.flag]; paintToolbar(); (cfg.flagsReload === false ? paintBody : load)(); }
        });
        toolbarEl.addEventListener('change', (e) => {
          if (e.target.id !== 'r-from' && e.target.id !== 'r-to') return;
          s.from = toolbarEl.querySelector('#r-from').value; s.to = toolbarEl.querySelector('#r-to').value; s.rng = 'custom';
          paintToolbar(); load();
        });
        toolbarEl.addEventListener('input', UI.debounce(async (e) => {
          if (e.target.id !== 'r-search') return;
          s.search = e.target.value.trim();
          if (cfg.search === 'server') await load(true); else paintBody();
        }, 300));
        hostEl.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) load(); });

        paintToolbar();
        paintBody();
        load();
      },
    });
  }

  const qs = (s, extra) => {
    const q = new URLSearchParams(extra || {});
    if (s.from) q.set('from', s.from);
    if (s.to) q.set('to', s.to);
    if (s.module) q.set('module', s.module);
    return q.toString();
  };
  const kpiRow = (...cards) => cards.join('');

  // ================================================================ Owner > Sales
  makeReport({
    path: 'owner/sales', title: 'Sales', dates: true, range: 'month', modules: true,
    async fetch(s) {
      const [sales, pay] = await Promise.all([
        Api.get(`/reports/sales-daily?${qs(s)}`),
        Api.get(`/reports/payments-daily?${qs(s)}`).catch(() => []),
      ]);
      return { sales: sales || [], pay: pay || [] };
    },
    view(s, d) {
      const rows = d.sales;
      const sum = (k) => rows.reduce((t, r) => t + num(r[k]), 0);
      const sold = sum('sales_total'), got = sum('collected'), n = sum('sales_count');
      const kpis = kpiRow(
        Kit.kpi('bi-bar-chart', 'Sold', UI.money(sold), n ? `<span class="gf-badge">${fmt(n, 0)} sales</span>` : ''),
        Kit.kpi('bi-cash-coin', 'Collected', UI.money(got), '', 'cereal'),
        Kit.kpi('bi-hourglass-split', 'Not yet collected', UI.money(Math.max(0, sold - got)), '', 'mill'),
        Kit.kpi('bi-receipt', 'Average sale', n ? UI.money(sold / n) : '–'),
      );
      let body;
      if (!rows.length) body = Kit.empty('bi-bar-chart', 'No sales in this period', 'Try a longer period.');
      else {
        const tr = rows.map((r) => `<tr><td>${esc(dayLabel(r.day))}</td><td class="muted">${esc(MODULE[r.module] || r.module || '')}</td>
          <td class="r">${esc(fmt(r.sales_count, 0))}</td><td class="r">${UI.money(r.sales_total)}</td><td class="r">${UI.money(r.collected)}</td>
          <td class="r ${num(r.sales_total) - num(r.collected) > 0.5 ? 'neg' : 'muted'}">${num(r.sales_total) - num(r.collected) > 0.5 ? UI.money(num(r.sales_total) - num(r.collected)) : '–'}</td></tr>`).join('');
        const foot = `<tr><td><b>Total</b></td><td></td><td class="r"><b>${esc(fmt(n, 0))}</b></td><td class="r"><b>${UI.money(sold)}</b></td><td class="r"><b>${UI.money(got)}</b></td><td class="r"><b>${UI.money(Math.max(0, sold - got))}</b></td></tr>`;
        body = Kit.table([['Day'], ['Business'], ['Sales', 'r'], ['Sold', 'r'], ['Collected', 'r'], ['Not collected', 'r']], tr, { foot });
      }
      const pay = autoTable(d.pay, { sort: /^$/, skip: /^$/ });
      if (d.pay.length) body += `<h3 style="margin:22px 0 8px;font-size:15px;font-weight:600">Cash and M-Pesa by day</h3>${pay.html}`;
      return {
        kpis, body,
        csv: { headers: ['Day', 'Business', 'Sales', 'Sold', 'Collected'], rows: rows.map((r) => [String(r.day).slice(0, 10), r.module, r.sales_count, r.sales_total, r.collected]), name: 'sales' },
      };
    },
  });

  // ================================================================ Owner > Profit and margin
  makeReport({
    path: 'owner/profit', title: 'Profit and margin', dates: true, range: 'month', modules: true,
    fetch: (s) => Api.get(`/reports/profit?${qs(s)}`),
    view(s, d) {
      const rows = d.rows || [], t = d.totals || {};
      const margin = num(t.revenue) > 0 ? (num(t.gross_profit) / num(t.revenue)) * 100 : null;
      const kpis = kpiRow(
        Kit.kpi('bi-receipt', 'Revenue', UI.money(t.revenue)),
        Kit.kpi('bi-percent', 'Gross profit', neg(t.gross_profit, esc(UI.money(t.gross_profit))), margin !== null ? `<span class="gf-badge ${margin < 0 ? 'gf-badge-red' : 'gf-badge-green'}">${fmt(margin, 1)}% margin</span>` : '', 'cereal'),
        Kit.kpi('bi-wallet2', 'Expenses', UI.money(t.expenses), '', 'mill'),
        Kit.kpi('bi-graph-up-arrow', 'Net profit', neg(t.net_profit, esc(UI.money(t.net_profit)))),
      );
      let body;
      if (!rows.length) body = Kit.empty('bi-graph-up-arrow', 'No figures for this period', 'Try a longer period.');
      else {
        const tr = rows.map((r) => `<tr><td>${esc(dayLabel(r.day))}</td><td class="muted">${esc(MODULE[r.module] || r.module || '')}</td>
          <td class="r">${UI.money(r.revenue)}</td><td class="r">${UI.money(r.cogs)}</td><td class="r ${num(r.gross_profit) < 0 ? 'neg' : ''}">${UI.money(r.gross_profit)}</td>
          <td class="r">${UI.money(r.expenses)}</td><td class="r ${num(r.net_profit) < 0 ? 'neg' : 'pos'}">${UI.money(r.net_profit)}</td></tr>`).join('');
        const foot = `<tr><td><b>Total</b></td><td></td><td class="r"><b>${UI.money(t.revenue)}</b></td><td class="r"><b>${UI.money(t.cogs)}</b></td><td class="r"><b>${UI.money(t.gross_profit)}</b></td><td class="r"><b>${UI.money(t.expenses)}</b></td><td class="r"><b>${UI.money(t.net_profit)}</b></td></tr>`;
        body = `${Kit.note('Gross profit is sales minus what the goods cost you. Net profit is gross profit minus expenses.', 'amber', 'bi-info-circle')}${Kit.table([['Day'], ['Business'], ['Revenue', 'r'], ['Cost of goods', 'r'], ['Gross profit', 'r'], ['Expenses', 'r'], ['Net profit', 'r']], tr, { foot })}`;
      }
      return {
        kpis, body,
        csv: { headers: ['Day', 'Business', 'Revenue', 'Cost of goods', 'Gross profit', 'Expenses', 'Net profit'], rows: rows.map((r) => [String(r.day).slice(0, 10), r.module, r.revenue, r.cogs, r.gross_profit, r.expenses, r.net_profit]), name: 'profit' },
      };
    },
  });

  // ================================================================ Cereals > Margin per grain
  makeReport({
    path: 'cereal/margin', title: 'Margin per grain', dates: true, range: 'month', modules: true,
    defaultModule: () => (GF.inModule('CEREAL') ? 'CEREAL' : ''),
    fetch: async (s) => (await Api.get(`/reports/margin?${qs(s)}`)) || [],
    view(s, rows) {
      const t = autoTable(rows, { sort: /profit/i, empty: 'Nothing was sold in this period.' });
      const note = rows.length ? Kit.note('Best earners first. Margin is what you sold for, less what the stock cost you.', 'amber', 'bi-info-circle') : '';
      return {
        kpis: rows.length ? autoKpis(t, 4, Kit.kpi('bi-basket', 'Grains and items', String(rows.length))) : '',
        body: `${note}${t.html}`,
        csv: t.csv ? { ...t.csv, name: 'margin-per-grain' } : null,
      };
    },
  });

  // ================================================================ Owner > Customer balances
  makeReport({
    path: 'owner/customer-balances', title: 'Customer balances', search: 'server', placeholder: 'Name, code or phone',
    flags: [{ key: 'owing', label: 'Owing only', on: true }, { key: 'overdue', label: 'Overdue only', on: false }], flagsReload: true,
    async fetch(s) {
      const q = new URLSearchParams({ limit: '500' });
      if (s.flags.owing) q.set('owing', 'true');
      if (s.search) q.set('search', s.search);
      const rows = (await Api.get(`/reports/customer-balances?${q}`)) || [];
      return { rows, total: (rows.pagination && rows.pagination.total) || rows.length };
    },
    view(s, d) {
      const rows = s.flags.overdue ? d.rows.filter((r) => num(r.overdue_amount) > 0) : d.rows;
      const owed = rows.reduce((t, r) => t + Math.max(0, num(r.balance)), 0);
      const late = rows.reduce((t, r) => t + num(r.overdue_amount), 0);
      const top = rows.slice().sort((a, b) => num(b.balance) - num(a.balance))[0];
      const kpis = kpiRow(
        Kit.kpi('bi-people', 'Customers listed', String(rows.length)),
        Kit.kpi('bi-wallet2', 'Total owed to you', UI.money(owed), '', 'mill'),
        Kit.kpi('bi-hourglass-split', 'Of which overdue', UI.money(late), late > 0 ? '<span class="gf-badge gf-badge-red">Chase</span>' : '<span class="gf-badge gf-badge-green">None</span>'),
        Kit.kpi('bi-person-exclamation', top && num(top.balance) > 0 ? `Largest · ${esc(top.full_name || '')}` : 'Largest balance', top && num(top.balance) > 0 ? UI.money(top.balance) : 'None'),
      );
      let body;
      if (!rows.length) body = Kit.empty('bi-people', 'No customers to show', s.search || s.flags.overdue ? 'Try clearing the filters.' : 'Nobody owes you anything right now.');
      else {
        const tr = rows.map((r) => `<tr><td><div class="cell-plain"><strong>${esc(r.full_name || r.business_name || '')}</strong><span>${esc(r.customer_code || '')}</span></div></td>
          <td class="muted">${esc(r.phone || '')}</td>
          <td class="r ${num(r.balance) > 0 ? 'neg' : 'muted'}">${num(r.balance) !== 0 ? UI.money(r.balance) : '–'}</td>
          <td class="r ${num(r.overdue_amount) > 0 ? 'neg' : 'muted'}">${num(r.overdue_amount) > 0 ? UI.money(r.overdue_amount) : '–'}</td></tr>`).join('');
        const foot = `<tr><td><b>Total</b></td><td></td><td class="r"><b>${UI.money(owed)}</b></td><td class="r"><b>${UI.money(late)}</b></td></tr>`;
        body = `${d.total > d.rows.length ? Kit.note(`Showing ${d.rows.length} of ${d.total} customers. Use the search box to narrow it down.`, 'amber') : ''}${Kit.table([['Customer'], ['Phone'], ['Balance', 'r'], ['Overdue', 'r']], tr, { foot })}`;
      }
      return { kpis, body, csv: { headers: ['Customer', 'Code', 'Phone', 'Balance', 'Overdue'], rows: rows.map((r) => [r.full_name || r.business_name, r.customer_code, r.phone, r.balance, r.overdue_amount]), name: 'customer-balances' } };
    },
  });

  // ================================================================ Owner > Credit overdue
  makeReport({
    path: 'owner/credit-overdue', title: 'Credit overdue',
    tabs: [['overdue', 'Overdue'], ['aging', 'Ageing']], search: 'client', placeholder: 'Find a customer',
    async fetch() {
      const [overdue, aging] = await Promise.all([Api.get('/reports/credit-overdue'), Api.get('/reports/receivables-aging').catch(() => [])]);
      return { overdue: overdue || [], aging: aging || [] };
    },
    view(s, d) {
      const nameOf = (r) => first(r, 'customer_name', 'full_name', 'name') || '';
      const q = s.search.toLowerCase();
      const filt = (rows) => (q ? rows.filter((r) => String(nameOf(r)).toLowerCase().includes(q)) : rows);
      if (s.tab === 'aging') {
        const rows = filt(d.aging);
        const t = autoTable(rows, { allMoney: true, first: ['customer_name', 'full_name', 'name'], sort: /total/i, empty: 'No customer owes you anything.' });
        const total = t.cols.length && rows.length ? rows.reduce((a, r) => a + num(first(r, 'total_outstanding', 'total', 'balance')), 0) : 0;
        return {
          kpis: kpiRow(Kit.kpi('bi-people', 'Customers owing', String(rows.length)), Kit.kpi('bi-wallet2', 'Total outstanding', UI.money(total), '', 'mill')),
          body: `${rows.length ? Kit.note('How long each customer’s debt has been standing, so you can see who to chase first.', 'amber', 'bi-info-circle') : ''}${t.html}`,
          csv: t.csv ? { ...t.csv, name: 'receivables-ageing' } : null,
        };
      }
      const rows = filt(d.overdue);
      const amt = (r) => num(first(r, 'overdue_amount', 'amount_overdue', 'balance', 'amount_due', 'outstanding', 'total_outstanding'));
      const days = (r) => num(first(r, 'days_overdue', 'days_late', 'max_days_overdue'));
      const total = rows.reduce((a, r) => a + amt(r), 0);
      const worst = rows.slice().sort((a, b) => days(b) - days(a))[0];
      const t = autoTable(rows, { sort: /overdue|amount|balance|outstanding/i, empty: 'Nobody is past their credit due date.' });
      return {
        kpis: kpiRow(
          Kit.kpi('bi-people', 'Customers late', String(rows.length), rows.length ? '<span class="gf-badge gf-badge-red">Chase</span>' : '<span class="gf-badge gf-badge-green">None</span>'),
          Kit.kpi('bi-hourglass-split', 'Total overdue', UI.money(total), '', 'mill'),
          Kit.kpi('bi-calendar-x', 'Longest late', worst && days(worst) ? `${days(worst)} days` : '–'),
          Kit.kpi('bi-person-exclamation', 'Worst case', worst ? esc(nameOf(worst)) : 'None'),
        ),
        body: t.html,
        csv: t.csv ? { ...t.csv, name: 'credit-overdue' } : null,
      };
    },
  });

  // ================================================================ Owner > Supplier balances
  makeReport({
    path: 'owner/supplier-balances', title: 'Supplier balances', search: 'client', placeholder: 'Find a supplier',
    flags: [{ key: 'owed', label: 'Owed only', on: true }],
    fetch: async (s) => (await Api.get(`/reports/supplier-balances${s.flags.owed ? '?owed=true' : ''}`)) || [],
    view(s, rows0) {
      const q = s.search.toLowerCase();
      const rows = q ? rows0.filter((r) => String(r.name || '').toLowerCase().includes(q)) : rows0;
      const owed = rows.reduce((t, r) => t + Math.max(0, num(r.amount_owed)), 0);
      const top = rows.slice().sort((a, b) => num(b.amount_owed) - num(a.amount_owed))[0];
      const t = autoTable(rows, { first: ['name'], sort: /owed|balance/i, labels: { name: 'Supplier', amount_owed: 'You owe' }, empty: s.flags.owed ? 'You do not owe any supplier right now.' : 'No suppliers yet.' });
      return {
        kpis: kpiRow(
          Kit.kpi('bi-person-lines-fill', 'Suppliers listed', String(rows.length)),
          Kit.kpi('bi-wallet2', 'Total you owe', UI.money(owed), '', 'mill'),
          Kit.kpi('bi-person-exclamation', top && num(top.amount_owed) > 0 ? `Largest · ${esc(top.name)}` : 'Largest balance', top && num(top.amount_owed) > 0 ? UI.money(top.amount_owed) : 'None'),
        ),
        body: t.html,
        csv: t.csv ? { ...t.csv, name: 'supplier-balances' } : null,
      };
    },
  });

  // ================================================================ Owner > Stock value
  makeReport({
    path: 'owner/stock-value', title: 'Stock value',
    fetch: async () => (await Api.get('/reports/stock-value')) || [],
    view(s, rows) {
      const t = autoTable(rows, { first: ['pool'], labels: { pool: 'Stock' }, empty: 'No stock has been counted in yet.' });
      const val = (r) => num(first(r, 'stock_value', 'value', 'total_value', 'total_cost_value', 'value_kes'));
      const kg = (r) => num(first(r, 'quantity_kg', 'total_kg', 'qty_kg', 'kg'));
      const totalVal = rows.reduce((a, r) => a + val(r), 0), totalKg = rows.reduce((a, r) => a + kg(r), 0);
      const known = rows.some((r) => val(r) > 0);
      return {
        kpis: rows.length ? (known
          ? kpiRow(Kit.kpi('bi-cash-stack', 'Total stock value at cost', UI.money(totalVal)), Kit.kpi('bi-speedometer', 'Total on hand', `${esc(fmt(totalKg))} kg`, '', 'cereal'), Kit.kpi('bi-boxes', 'Stock groups', String(rows.length)))
          : autoKpis(t, 3)) : '',
        body: `${rows.length ? Kit.note('Valued at what the stock cost you, not at selling price.', 'amber', 'bi-info-circle') : ''}${t.html}`,
        csv: t.csv ? { ...t.csv, name: 'stock-value' } : null,
      };
    },
  });
})();