/**
 * Owner > Dashboard  (#/owner/dashboard)
 * One phone-friendly view of the whole business: today's sales and collections, cash against M-Pesa,
 * profit, a 14-day sales trend, things that need attention, low stock, stock value and overdue credit.
 * Module chips (Both / Mill / Cereals) filter every card.
 *
 * Uses GET /reports/dashboard (today, alerts, trend, lowStock, stockValue), GET /reports/sales-trend?module=,
 *      GET /reports/payments-daily, GET /reports/profit and GET /reports/credit-overdue.
 * Money-sensitive cards (profit, stock value) only show when the role has reports.profit.
 * Credit and payment cards only show when the role has reports.view. The server still checks every call.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const first = (r, ...keys) => { for (const k of keys) if (r && r[k] !== undefined && r[k] !== null) return r[k]; return undefined; };
  const pretty = (k) => String(k).replace(/_/g, ' ').replace(/\b(count|total|open|pending)\b/g, '').trim().replace(/^./, (c) => c.toUpperCase());
  const shortDay = (d) => new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short' });
  const POOL = { MILL_OWN: 'Mill own grain', CUSTOMER: 'Customer grain', CEREAL: 'Cereal stock', MILL: 'Mill stock' };
  const poolLabel = (p) => POOL[p] || pretty(p || 'Stock');

  const MODULES = [['', 'Both'], ['MILL', 'Posho mill'], ['CEREAL', 'Cereals']];

  // where an alert should take the owner, matched on the alert's field name
  const ALERT_LINKS = [
    [/yield/i, '#/mill/yield', 'bi-exclamation-triangle'],
    [/low_?stock|reorder/i, '#/cereal/stock', 'bi-boxes'],
    [/overdue|credit/i, '#/owner/credit-overdue', 'bi-hourglass-split'],
    [/supplier/i, '#/owner/supplier-balances', 'bi-person-lines-fill'],
    [/delivery|deliveries/i, '#/cereal/deliveries', 'bi-truck'],
    [/void|approval/i, '#/shared/activity', 'bi-clock-history'],
    [/close/i, '#/shared/daily-close', 'bi-journal-check'],
  ];

  GF.page('owner/dashboard', {
    title: 'Dashboard',
    render(el) {
      const canMoney = GF.can('reports.profit');
      const canReports = GF.can('reports.view');
      const s = { module: '', data: null, pay: [], profit: null, overdue: [], loading: true, failed: '' };

      el.innerHTML = `<div class="dash">
        <div class="dash-head">
          <div><h2 class="dash-title">${UI.greeting()}, ${esc((GF.user.full_name || GF.user.name || 'there').split(' ')[0])}</h2>
            <p class="dash-sub" id="dash-date"></p></div>
          <div class="dash-tools"><div class="gf-seg" id="mod-seg" role="group" aria-label="Show"></div>
            <button class="icon-btn" id="refresh" type="button" aria-label="Refresh"><i class="bi bi-arrow-clockwise"></i></button></div>
        </div>
        <div id="dash-body"></div></div>`;
      const body = el.querySelector('#dash-body');
      el.querySelector('#dash-date').textContent = new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      // ------------------------------------------------------------ module filter
      const seg = el.querySelector('#mod-seg');
      const paintSeg = () => {
        seg.innerHTML = MODULES.map(([v, l]) => `<button type="button" data-m="${v}" class="${s.module === v ? 'on' : ''}">${l}</button>`).join('');
      };
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-m]'); if (!b || b.dataset.m === s.module) return;
        s.module = b.dataset.m; paintSeg(); load(true);
      });
      el.querySelector('#refresh').addEventListener('click', () => load(false));
      paintSeg();

      // ------------------------------------------------------------ data
      async function load(quiet) {
        if (!quiet) { s.loading = true; paint(); }
        s.failed = '';
        const today = ymd(new Date());
        const m = s.module ? `&module=${s.module}` : '';
        try {
          // the main call and the trend (which can be filtered by module) are required
          const [data, trend] = await Promise.all([
            Api.get('/reports/dashboard'),
            Api.get(`/reports/sales-trend?days=14${m}`),
          ]);
          s.data = data || {};
          s.data.trend = trend || [];
        } catch (e) { s.failed = e.message; s.loading = false; paint(); return; }

        // optional cards: a role without the permission simply does not get them
        const opt = (p) => p.catch(() => null);
        const [pay, profit, overdue] = await Promise.all([
          canReports ? opt(Api.get(`/reports/payments-daily?from=${today}&to=${today}${m}`)) : null,
          canMoney ? opt(Api.get(`/reports/profit?from=${today}&to=${today}${m}`)) : null,
          canReports ? opt(Api.get('/reports/credit-overdue')) : null,
        ]);
        s.pay = pay || []; s.profit = profit; s.overdue = overdue || [];
        s.loading = false; paint();
      }

      // ------------------------------------------------------------ helpers over view columns
      const todayRows = () => (s.data.today || []).filter((r) => !s.module || String(r.module || '').toUpperCase() === s.module);
      const sumOf = (rows, ...keys) => rows.reduce((t, r) => t + num(first(r, ...keys)), 0);
      const rowsByModule = (rows) => (s.module ? rows.filter((r) => String(r.module || '').toUpperCase() === s.module) : rows);

      // ------------------------------------------------------------ paint
      function kpi(icon, label, value, extra, tone) {
        return `<div class="kpi"><div class="tile ${tone || ''}"><i class="bi ${icon}"></i></div>
          <div class="kpi-body"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div></div>${extra || ''}</div>`;
      }

      function paint() {
        if (s.loading) { body.innerHTML = '<div class="dt-empty">Loading the dashboard…</div>'; return; }
        if (s.failed) {
          body.innerHTML = `<div class="gf-note gf-note-red" role="alert"><i class="bi bi-exclamation-circle"></i><span>${esc(s.failed)}</span></div>
            <div class="dt-empty"><button class="gf-btn gf-btn-dark gf-btn-sm" id="retry" type="button">Try again</button></div>`;
          body.querySelector('#retry').addEventListener('click', () => load(false));
          return;
        }

        const rows = todayRows();
        const salesTotal = sumOf(rows, 'sales_total', 'total_sales', 'sales', 'revenue');
        const salesCount = sumOf(rows, 'sales_count', 'count', 'sales_n');
        const collected = sumOf(rows, 'collected', 'amount_collected', 'paid', 'amount_paid');
        const profitNet = s.profit && s.profit.totals ? num(s.profit.totals.net_profit) : undefined;
        const alerts = alertItems();
        const alertCount = alerts.reduce((t, a) => t + a.n, 0);

        body.innerHTML = `
          <div class="kpis">
            ${kpi('bi-receipt', 'Sales today', UI.money(salesTotal), `<span class="gf-badge gf-badge-green">${salesCount} sales</span>`, '')}
            ${kpi('bi-cash-coin', 'Collected today', UI.money(collected), '', '')}
            ${canMoney && profitNet !== undefined
              ? kpi('bi-graph-up-arrow', 'Net profit today', `<span class="${profitNet < 0 ? 'dash-neg' : ''}">${UI.money(profitNet)}</span>`, '', 'cereal')
              : kpi('bi-hourglass-split', 'Still to collect', UI.money(Math.max(0, salesTotal - collected)), '', 'cereal')}
            ${kpi('bi-bell', 'Needs attention', String(alertCount), alertCount ? '<span class="gf-badge gf-badge-red">Check</span>' : '<span class="gf-badge gf-badge-green">Clear</span>', 'mill')}
          </div>

          <div class="dash-grid">
            <section class="dash-card dash-wide">
              <header><h3>Sales, last 14 days</h3><span class="dash-legend"><i class="sw sw-sales"></i>Sales<i class="sw sw-col"></i>Collected</span></header>
              ${trendHtml()}
            </section>

            <section class="dash-card">
              <header><h3>Needs attention</h3></header>
              ${alertsHtml(alerts)}
            </section>

            ${canReports ? `<section class="dash-card"><header><h3>Cash and M-Pesa today</h3></header>${payHtml()}</section>` : ''}

            <section class="dash-card">
              <header><h3>Running low</h3><a class="dash-more" href="#/cereal/stock">All stock</a></header>
              ${lowHtml()}
            </section>

            ${canReports ? `<section class="dash-card"><header><h3>Credit overdue</h3><a class="dash-more" href="#/owner/credit-overdue">See all</a></header>${overdueHtml()}</section>` : ''}

            ${canMoney ? `<section class="dash-card"><header><h3>Stock value</h3></header>${stockValueHtml()}</section>` : ''}
          </div>`;
      }

      // ---- trend: plain CSS bars, no chart library needed
      function trendHtml() {
        const t = s.data.trend || [];
        if (!t.length) return '<div class="dash-empty">No sales recorded in this period.</div>';
        const max = Math.max(1, ...t.map((r) => Math.max(num(r.sales_total), num(r.collected))));
        const cols = t.map((r, i) => {
          const hs = Math.round((num(r.sales_total) / max) * 100), hc = Math.round((num(r.collected) / max) * 100);
          const isToday = i === t.length - 1;
          return `<div class="bar ${isToday ? 'is-today' : ''}" title="${esc(String(r.day).slice(0, 10))}: ${esc(UI.money(r.sales_total))} sold, ${esc(UI.money(r.collected))} collected">
            <div class="bar-cols"><span class="b-sales" style="height:${hs}%"></span><span class="b-col" style="height:${hc}%"></span></div>
            <span class="bar-day">${esc(shortDay(r.day))}</span></div>`;
        }).join('');
        const total = t.reduce((a, r) => a + num(r.sales_total), 0);
        return `<div class="trend-sum"><b>${UI.money(total)}</b><span>sold over ${t.length} days</span></div><div class="trend" role="img" aria-label="Daily sales for the last ${t.length} days">${cols}</div>`;
      }

      // ---- alerts: v_owner_alerts is one row of counts; show every non-zero one and link it where we can
      function alertItems() {
        const a = (s.data && s.data.alerts) || {};
        return Object.keys(a).filter((k) => typeof a[k] !== 'object' && num(a[k]) > 0 && !/^(id|as_of|day|date|module)$/i.test(k) && !/(amount|value|kes|total_owed)/i.test(k))
          .map((k) => {
            const link = ALERT_LINKS.find(([re]) => re.test(k));
            const money = Object.keys(a).find((x) => /(amount|value|kes)/i.test(x) && x.replace(/_(amount|value|kes)$/i, '') === k.replace(/_(count|n)$/i, ''));
            return { key: k, label: pretty(k), n: num(a[k]), money: money ? num(a[money]) : null, href: link ? link[1] : null, icon: link ? link[2] : 'bi-bell' };
          });
      }
      function alertsHtml(items) {
        if (!items.length) return '<div class="dash-empty ok"><i class="bi bi-check-circle"></i>Nothing needs your attention right now.</div>';
        return `<ul class="alert-list">${items.map((a) => {
          const inner = `<span class="al-ic"><i class="bi ${a.icon}"></i></span><span class="al-t">${esc(a.label)}${a.money ? `<small>${esc(UI.money(a.money))}</small>` : ''}</span><span class="pill red">${a.n}</span>${a.href ? '<i class="bi bi-chevron-right al-go"></i>' : ''}`;
          return `<li>${a.href ? `<a href="${a.href}">${inner}</a>` : `<div>${inner}</div>`}</li>`;
        }).join('')}</ul>`;
      }

      // ---- cash against M-Pesa
      function payHtml() {
        const rows = rowsByModule(s.pay);
        if (!rows.length) return '<div class="dash-empty">No payments taken yet today.</div>';
        const cash = sumOf(rows, 'cash', 'cash_total', 'cash_collected', 'cash_amount');
        const mpesa = sumOf(rows, 'mpesa', 'mpesa_total', 'mpesa_collected', 'mpesa_amount', 'mpesa_stk', 'mpesa_stk_total')
          + sumOf(rows, 'mpesa_manual', 'mpesa_manual_total');
        const other = Math.max(0, sumOf(rows, 'total', 'total_collected', 'collected', 'amount') - cash - mpesa);
        const all = cash + mpesa + other;
        if (all <= 0) return '<div class="dash-empty">No payments taken yet today.</div>';
        const pc = (v) => Math.round((v / all) * 100);
        return `<div class="split" role="img" aria-label="Cash ${pc(cash)} percent, M-Pesa ${pc(mpesa)} percent">
            <span class="sp-cash" style="width:${pc(cash)}%"></span><span class="sp-mp" style="width:${pc(mpesa)}%"></span><span class="sp-oth" style="width:${Math.max(0, 100 - pc(cash) - pc(mpesa))}%"></span></div>
          <div class="fact-grid">
            <div class="fact"><span><i class="sw sw-cash"></i>Cash</span><b>${UI.money(cash)}</b></div>
            <div class="fact"><span><i class="sw sw-mp"></i>M-Pesa</span><b>${UI.money(mpesa)}</b></div>
            ${other > 0 ? `<div class="fact"><span><i class="sw sw-oth"></i>Other</span><b>${UI.money(other)}</b></div>` : ''}
            <div class="fact"><span>Total taken</span><b>${UI.money(all)}</b></div></div>`;
      }

      // ---- low stock (item_name, pool, quantity_kg, reorder_level_kg come straight from the dashboard query)
      function lowHtml() {
        let rows = (s.data.lowStock || []);
        if (s.module) rows = rows.filter((r) => (s.module === 'MILL' ? /MILL|CUSTOMER/i : /CEREAL/i).test(String(r.pool || '')));
        if (!rows.length) return '<div class="dash-empty ok"><i class="bi bi-check-circle"></i>Every item is above its reorder level.</div>';
        return `<ul class="low-list">${rows.map((r) => {
          const q = num(r.quantity_kg), lvl = num(r.reorder_level_kg), out = q <= 0;
          const pct = lvl > 0 ? Math.min(100, Math.round((q / lvl) * 100)) : 0;
          return `<li><div class="low-top"><strong>${esc(r.item_name)}</strong><span class="pill ${out ? 'red' : 'amber'}">${out ? 'Out' : 'Low'}</span></div>
            <div class="low-meter"><span class="${out ? 'is-out' : ''}" style="width:${pct}%"></span></div>
            <div class="low-sub"><span>${esc(UI.kg(q))} left</span><span>${esc(poolLabel(r.pool))}${lvl ? ` · reorder at ${esc(UI.kg(lvl))}` : ''}</span></div></li>`;
        }).join('')}</ul>`;
      }

      // ---- overdue credit
      function overdueHtml() {
        const rows = s.overdue || [];
        if (!rows.length) return '<div class="dash-empty ok"><i class="bi bi-check-circle"></i>No customer is past their credit due date.</div>';
        const amt = (r) => num(first(r, 'overdue_amount', 'amount_overdue', 'balance', 'amount_due', 'outstanding', 'total_outstanding'));
        const sorted = rows.slice().sort((a, b) => amt(b) - amt(a));
        const total = sorted.reduce((t, r) => t + amt(r), 0);
        return `<div class="trend-sum"><b>${UI.money(total)}</b><span>owed by ${rows.length} customer${rows.length === 1 ? '' : 's'}</span></div>
          <ul class="debt-list">${sorted.slice(0, 5).map((r) => {
            const name = first(r, 'customer_name', 'full_name', 'name') || 'Customer';
            const days = first(r, 'days_overdue', 'days_late', 'max_days_overdue');
            return `<li><span class="gf-avatar" style="background:${UI.avatarColor(name)}">${esc(UI.initials(name))}</span>
              <span class="debt-who"><strong>${esc(name)}</strong>${days !== undefined ? `<small>${num(days)} day${num(days) === 1 ? '' : 's'} late</small>` : ''}</span>
              <b>${esc(UI.money(amt(r)))}</b></li>`;
          }).join('')}</ul>`;
      }

      // ---- stock value per pool
      function stockValueHtml() {
        let rows = (s.data.stockValue || []);
        if (s.module) rows = rows.filter((r) => (s.module === 'MILL' ? /MILL|CUSTOMER/i : /CEREAL/i).test(String(r.pool || '')));
        const val = (r) => num(first(r, 'stock_value', 'value', 'total_value', 'total_cost_value', 'value_kes'));
        if (!rows.length || !rows.some((r) => val(r) > 0)) return '<div class="dash-empty">No stock value to show yet.</div>';
        const total = rows.reduce((t, r) => t + val(r), 0);
        return `<div class="trend-sum"><b>${UI.money(total)}</b><span>at cost</span></div>
          <ul class="debt-list">${rows.map((r) => {
            const kg = first(r, 'quantity_kg', 'total_kg', 'qty_kg', 'kg');
            return `<li><span class="debt-who"><strong>${esc(poolLabel(r.pool))}</strong>${kg !== undefined ? `<small>${esc(UI.kg(kg))}</small>` : ''}</span><b>${esc(UI.money(val(r)))}</b></li>`;
          }).join('')}</ul>`;
      }

      paint();
      load(false);
    },
  });
})();