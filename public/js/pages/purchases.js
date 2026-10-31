/**
 * Cereals > Purchases (#/cereal/purchases)
 * List with filters, new purchase form (lines by kg, bag or tin, transport and loading cost, true cost per kg),
 * save as draft or post to stock, pay the supplier later.
 * Uses /purchases, /purchases/:id, /purchases/:id/post { pay? }, /suppliers, /items, /items/:id/units, /supplier-payments.
 * A draft cannot be edited here: delete it and enter it again.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = (n) => num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
  const stamp = (v) => new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
  const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const POOL_NAME = { CEREAL_STOCK: 'Cereals', MILL_STOCK: 'Mill' };
  const METHODS = [['CASH', 'Cash'], ['MPESA_MANUAL', 'M-Pesa'], ['BANK', 'Bank'], ['OTHER', 'Other']];

  const statusPill = (r) => {
    if (r.status === 'DRAFT') return '<span class="pill">Draft</span>';
    if (r.status !== 'POSTED') return `<span class="pill red">${esc(pretty(r.status))}</span>`;
    if (num(r.balance_due) > 0) return num(r.amount_paid) > 0 ? '<span class="pill amber">Part paid</span>' : '<span class="pill amber">Unpaid</span>';
    return '<span class="pill green">Paid</span>';
  };

  function range(key) {
    const now = new Date();
    if (key === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    if (key === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: ymd(d), to: ymd(now) }; }
    return { from: '', to: '' };
  }

  GF.page('cereal/purchases', {
    title: 'Purchases',
    render(el) {
      const s = { rows: [], total: 0, loading: true, failed: '', rng: 'month', ...range('month'), chip: '', search: '' };
      const cache = { suppliers: null, items: null, units: {} };

      el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>';
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

      GF.setActions(GF.can('purchases.create')
        ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="add-purchase" type="button"><i class="bi bi-plus-lg"></i>New purchase</button>' : '');
      const addBtn = document.getElementById('add-purchase');
      if (addBtn) addBtn.addEventListener('click', () => openForm());

      // ------------------------------------------------------------ data
      async function load(quiet) {
        try {
          const q = new URLSearchParams({ limit: '500' });
          if (s.from) q.set('from', s.from);
          if (s.to) q.set('to', s.to);
          if (s.search) q.set('search', s.search);
          if (s.chip === 'DRAFT') q.set('status', 'DRAFT');
          if (s.chip === 'POSTED') q.set('status', 'POSTED');
          const rows = await Api.get(`/purchases?${q}`);
          s.rows = rows || [];
          s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false;
        paint();
      }
      const shown = () => (s.chip === 'UNPAID' ? s.rows.filter((r) => r.status === 'POSTED' && num(r.balance_due) > 0) : s.rows);

      async function suppliers() {
        if (!cache.suppliers) cache.suppliers = (await Api.get('/suppliers?active=true&limit=500')) || [];
        return cache.suppliers;
      }
      async function items() {
        if (!cache.items) cache.items = (await Api.get('/items?active=true&limit=500')) || [];
        return cache.items;
      }
      async function unitsOf(itemId) {
        if (!cache.units[itemId]) cache.units[itemId] = ((await Api.get(`/items/${itemId}/units`)) || []).filter((u) => u.is_purchasable !== false);
        return cache.units[itemId];
      }

      // ------------------------------------------------------------ painting
      function paintKpis() {
        const posted = s.rows.filter((r) => r.status === 'POSTED');
        const sum = (k) => posted.reduce((t, r) => t + num(r[k]), 0);
        const owed = posted.filter((r) => num(r.balance_due) > 0).length;
        const drafts = s.rows.filter((r) => r.status === 'DRAFT').length;
        const kpi = (icon, label, value, badge) => `<div class="kpi"><div class="tile"><i class="bi ${icon}"></i></div>
          <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${badge || ''}</div>`;
        kpisEl.innerHTML =
          kpi('bi-cart-plus', 'Purchases', String(posted.length), drafts ? `<span class="gf-badge gf-badge-amber">${drafts} draft</span>` : '') +
          kpi('bi-box-seam', 'Total bought', UI.money(sum('total_cost'))) +
          kpi('bi-cash-coin', 'Paid', UI.money(sum('amount_paid'))) +
          kpi('bi-hourglass-split', 'Owed to suppliers', UI.money(sum('balance_due')),
            owed ? `<span class="gf-badge gf-badge-amber">${owed} unpaid</span>` : '<span class="gf-badge gf-badge-green">None</span>');
      }

      function paintToolbar() {
        const rchip = (key, label) => `<button type="button" class="fchip ${s.rng === key ? 'on' : ''}" data-range="${key}">${label}</button>`;
        const cchip = (key, label) => `<button type="button" class="fchip outline ${s.chip === key ? 'on' : ''}" data-chip="${key}">${label}</button>`;
        toolbarEl.innerHTML = `
          ${rchip('month', 'This month')}${rchip('week', '7 days')}${rchip('all', 'All time')}
          <span class="sep"></span>
          <label class="date-box">From <input type="date" id="p-from" value="${esc(s.from)}"></label>
          <label class="date-box">To <input type="date" id="p-to" value="${esc(s.to)}"></label>
          <span class="sep"></span>
          ${cchip('UNPAID', 'Unpaid')}${cchip('DRAFT', 'Drafts')}${cchip('POSTED', 'Posted')}
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="p-search" placeholder="Purchase no, supplier or invoice" value="${esc(s.search)}" aria-label="Search purchases"></label>`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = '<div class="dt-empty">Loading purchases…</div>'; return; }
        const rows = shown();
        const err = s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)}</span></div>` : '';
        if (!rows.length) {
          hostEl.innerHTML = `${err}<div class="dt-empty"><div class="tile"><i class="bi bi-cart-plus"></i></div>
            <h3>${s.search || s.chip ? 'No purchases match' : 'No purchases yet'}</h3>
            <p>${s.search || s.chip ? 'Try clearing the filters.' : 'Record grain you buy from suppliers so stock and cost per kg stay correct.'}</p>
            ${!s.search && !s.chip && GF.can('purchases.create') ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">New purchase</button>' : ''}</div>`;
          return;
        }
        const body = rows.map((r) => {
          const bal = num(r.balance_due);
          return `<tr class="click" data-id="${r.id}">
            <td><div class="cell-plain"><strong>${esc(r.purchase_no || 'Draft')}</strong><span>${esc(dateOnly(r.purchase_date))}</span></div></td>
            <td>${esc(r.supplier_name)}</td>
            <td><span class="pill ${r.stock_pool === 'MILL_STOCK' ? 'amber' : ''}">${esc(POOL_NAME[r.stock_pool] || pretty(r.stock_pool))}</span></td>
            <td class="muted">${esc(r.supplier_invoice_ref || '–')}</td>
            <td class="r">${UI.money(r.total_cost)}</td>
            <td class="r">${UI.money(r.amount_paid)}</td>
            <td class="r ${bal > 0 && r.status === 'POSTED' ? 'neg' : 'muted'}">${bal > 0 && r.status === 'POSTED' ? UI.money(bal) : '–'}</td>
            <td>${statusPill(r)}</td></tr>`;
        }).join('');
        hostEl.innerHTML = `${err}${s.total > s.rows.length ? `<div class="gf-note gf-note-amber" style="margin-bottom:10px"><i class="bi bi-info-circle"></i><span>Showing the latest ${s.rows.length} of ${s.total} purchases. Narrow the dates to see the rest.</span></div>` : ''}
          <div class="dt-wrap"><table class="dt"><thead><tr><th>Purchase</th><th>Supplier</th><th>Stock</th><th>Invoice</th><th class="r">Total cost</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></div>`;
      }

      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const r = e.target.closest('[data-range]');
        if (r) { s.rng = r.dataset.range; Object.assign(s, range(s.rng)); load(); paintToolbar(); return; }
        const c = e.target.closest('[data-chip]');
        if (c) { s.chip = s.chip === c.dataset.chip ? '' : c.dataset.chip; load(); paintToolbar(); }
      });
      toolbarEl.addEventListener('change', (e) => {
        if (e.target.id === 'p-from' || e.target.id === 'p-to') {
          s.from = toolbarEl.querySelector('#p-from').value; s.to = toolbarEl.querySelector('#p-to').value; s.rng = 'custom';
          load(); paintToolbar();
        }
      });
      toolbarEl.addEventListener('input', UI.debounce(async (e) => {
        if (e.target.id !== 'p-search') return;
        s.search = e.target.value.trim();
        await load(true);
        const box = toolbarEl.querySelector('#p-search');
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }, 300));
      hostEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) { openForm(); return; }
        const tr = e.target.closest('tr[data-id]');
        if (tr) openPurchase(Number(tr.dataset.id));
      });

      // ------------------------------------------------------------ one purchase
      async function openPurchase(id) {
        const m = UI.modal({ title: 'Purchase', wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
        let p, pays = [];
        try {
          p = await Api.get(`/purchases/${id}`);
          if (p.status === 'POSTED' && GF.can('suppliers.view')) pays = (await Api.get(`/supplier-payments?purchase_id=${id}&limit=100`).catch(() => [])) || [];
        } catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); return; }

        const bal = num(p.balance_due);
        const lines = (p.lines || []).map((l) => `<tr><td>${esc(l.item_name)}</td>
          <td class="r">${fmt(l.quantity)} ${esc(l.unit_code || '')}</td><td class="r">${fmt(l.unit_cost)}</td>
          <td class="r"><b>${fmt(l.line_total !== undefined && l.line_total !== null ? l.line_total : num(l.quantity) * num(l.unit_cost))}</b></td></tr>`).join('');
        const extras = [['Transport', p.transport_cost], ['Loading', p.loading_cost], ['Other', p.other_cost]].filter(([, v]) => num(v) > 0);
        const payRows = pays.map((x) => `<li><span class="dot"></span><span>${esc(pretty(x.method))}${x.mpesa_code ? ` · ${esc(x.mpesa_code)}` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</span>
          <span class="when">${UI.money(x.amount)} · ${esc(stamp(x.paid_on))}</span></li>`).join('');
        const fact = (label, v) => `<div class="fact"><span>${label}</span><b>${v}</b></div>`;

        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        body.insertAdjacentHTML('beforeend', `
          <div class="who-head"><div class="grow"><h3>${esc(p.purchase_no || 'Draft purchase')} ${statusPill(p)}</h3>
            <div class="sub">${esc(p.supplier_name)} · ${esc(dateOnly(p.purchase_date))} · ${esc(POOL_NAME[p.stock_pool] || '')} stock${p.supplier_invoice_ref ? ` · invoice ${esc(p.supplier_invoice_ref)}` : ''}</div></div></div>
          <div class="fact-grid">
            ${fact('Total cost', UI.money(p.total_cost))}${fact('Paid', UI.money(p.amount_paid))}
            ${fact('Balance', bal > 0 && p.status === 'POSTED' ? `<span class="neg-text">${UI.money(bal)}</span>` : '–')}
            ${fact('Entered by', esc(p.created_by_name || '–'))}
          </div>
          <div class="mini-table"><table class="dt"><thead><tr><th>Item</th><th class="r">Quantity</th><th class="r">Cost each</th><th class="r">Amount</th></tr></thead><tbody>${lines}</tbody></table></div>
          ${extras.length ? `<div class="gf-hint">${extras.map(([k, v]) => `${k} <b>${UI.money(v)}</b>`).join(' · ')} (added to the cost of the grain)</div>` : ''}
          ${p.notes ? `<div class="gf-hint">${esc(p.notes)}</div>` : ''}
          ${p.status === 'POSTED' ? `<div class="form-section"><span class="gf-label">Payments to the supplier</span>${payRows ? `<ul class="timeline">${payRows}</ul>` : '<div class="gf-hint">Nothing paid yet.</div>'}</div>` : ''}`);

        const foot = document.createElement('div');
        foot.className = 'gf-modal-foot';
        foot.innerHTML = `<button class="gf-btn gf-btn-ghost" type="button" data-close>Close</button>
          ${p.status === 'DRAFT' && GF.can('purchases.create') ? '<button class="gf-btn gf-btn-ghost" type="button" data-delete><i class="bi bi-trash"></i>Delete draft</button>' : ''}
          ${p.status === 'DRAFT' && GF.can('purchases.post') ? '<button class="gf-btn gf-btn-green" type="button" data-post><i class="bi bi-box-arrow-in-down"></i>Post to stock</button>' : ''}
          ${p.status === 'POSTED' && bal > 0 && GF.can('purchases.create') ? '<button class="gf-btn gf-btn-green" type="button" data-pay><i class="bi bi-wallet2"></i>Pay supplier</button>' : ''}`;
        m.el.querySelector('.gf-modal').appendChild(foot);

        foot.addEventListener('click', async (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.hasAttribute('data-pay')) { m.close(); openPay(p); return; }
          if (b.hasAttribute('data-post')) {
            m.error(''); m.busy(b, true);
            try { await Api.post(`/purchases/${id}/post`, {}); m.close(); UI.toast('Purchase posted. Stock updated.'); load(true); }
            catch (err) { m.error(err.message); m.busy(b, false); }
          } else if (b.hasAttribute('data-delete')) {
            m.error(''); m.busy(b, true);
            try { await Api.del(`/purchases/${id}`); m.close(); UI.toast('Draft deleted'); load(true); }
            catch (err) { m.error(err.message); m.busy(b, false); }
          }
        });
      }

      // ------------------------------------------------------------ pay the supplier
      function openPay(p) {
        const due = num(p.balance_due);
        const m = UI.modal({
          title: `Pay supplier · ${p.purchase_no}`,
          body: `<div class="pay-total"><span>${esc(p.supplier_name)} is owed</span><b>${UI.money(due)}</b></div>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="sp-amount">Amount (KES)</label><input class="gf-input plain" id="sp-amount" type="number" inputmode="decimal" min="0" step="any" value="${due}"></div>
              <div class="gf-field"><label class="gf-label" for="sp-method">Method</label><select class="gf-input plain" id="sp-method">${METHODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
            </div>
            <div class="gf-field gf-hidden" id="sp-code-row"><label class="gf-label" for="sp-code">M-Pesa code (optional)</label><input class="gf-input plain" id="sp-code" autocomplete="off" style="text-transform:uppercase"></div>
            <div class="gf-field"><label class="gf-label" for="sp-note">Note (optional)</label><input class="gf-input plain" id="sp-note" autocomplete="off"></div>`,
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-green" type="button" data-ok>Record payment</button>',
        });
        const $m = (sel) => m.el.querySelector(sel);
        $m('#sp-method').addEventListener('change', (e) => $m('#sp-code-row').classList.toggle('gf-hidden', e.target.value !== 'MPESA_MANUAL'));
        const ok = $m('[data-ok]');
        ok.addEventListener('click', async () => {
          m.error('');
          const amount = num($m('#sp-amount').value);
          if (!(amount > 0)) { m.error('Enter the amount.'); return; }
          if (amount > due + 0.005) { m.error('The amount is more than the balance.'); return; }
          const body = { supplier_id: p.supplier_id, purchase_id: p.id, amount, method: $m('#sp-method').value };
          const code = $m('#sp-code').value.trim().toUpperCase(); if (code && body.method === 'MPESA_MANUAL') body.mpesa_code = code;
          const note = $m('#sp-note').value.trim(); if (note) body.note = note;
          m.busy(ok, true);
          try { await Api.post('/supplier-payments', body); m.close(); UI.toast('Payment recorded'); load(true); openPurchase(p.id); }
          catch (err) { m.error(err.message); m.busy(ok, false); }
        });
      }

      // ------------------------------------------------------------ new purchase
      async function openForm() {
        const m = UI.modal({ title: 'New purchase', wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
        m.el.querySelector('.gf-modal').classList.add('is-xl');
        let sup, itm;
        try { [sup, itm] = await Promise.all([suppliers(), items()]); }
        catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); return; }
        if (!sup.length) { m.error('Add a supplier first (People > Suppliers), then come back.'); m.el.querySelector('[data-loading]').remove(); return; }
        if (!itm.length) { m.error('No products are set up yet. Add them under Products in the menu first.'); m.el.querySelector('[data-loading]').remove(); return; }

        const canPost = GF.can('purchases.post');
        const POOLS = [['CEREAL_STOCK', 'Cereal stock', 'CEREAL'], ['MILL_STOCK', 'Mill stock', 'MILL']].filter((p) => GF.inModule(p[2])); // only your own side
        const f = { pool: (POOLS[0] || ['CEREAL_STOCK'])[0], lines: [{ item_id: '', unit_id: '', qty: '', cost: '', units: [] }], payMethod: 'CASH' };
        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        body.insertAdjacentHTML('beforeend', `
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="pf-sup">Supplier</label>
              <select class="gf-input plain" id="pf-sup">${sup.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
            <div class="gf-field"><label class="gf-label" for="pf-date">Date</label><input class="gf-input plain" id="pf-date" type="date" value="${ymd(new Date())}"></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label">Goes into</label>
              <div class="gf-seg" id="pf-pool">${POOLS.map((p, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-pool="${p[0]}">${p[1]}</button>`).join('')}</div></div>
            <div class="gf-field"><label class="gf-label" for="pf-ref">Supplier invoice no (optional)</label><input class="gf-input plain" id="pf-ref" autocomplete="off"></div>
          </div>
          <div class="form-section"><span class="gf-label">Items bought</span>
            <div id="pf-lines" class="pl-lines"></div>
            <button type="button" class="gf-btn gf-btn-ghost gf-btn-sm" id="pf-add"><i class="bi bi-plus-lg"></i>Add item</button></div>
          <div class="form-section"><span class="gf-label">Extra costs (added to the cost of the grain)</span>
            <div class="gf-row2" style="grid-template-columns:repeat(3,1fr)">
              <div class="gf-field"><label class="gf-label" for="pf-transport">Transport</label><input class="gf-input plain" id="pf-transport" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></div>
              <div class="gf-field"><label class="gf-label" for="pf-loading">Loading</label><input class="gf-input plain" id="pf-loading" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></div>
              <div class="gf-field"><label class="gf-label" for="pf-other">Other</label><input class="gf-input plain" id="pf-other" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></div>
            </div></div>
          <div class="pl-total" id="pf-total"></div>
          ${canPost ? `<div class="form-section"><span class="gf-label">Paid at delivery (optional, used when you post)</span>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="pf-paid">Amount (KES)</label><input class="gf-input plain" id="pf-paid" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></div>
              <div class="gf-field"><label class="gf-label" for="pf-method">Method</label><select class="gf-input plain" id="pf-method">${METHODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div></div>` : ''}
          <div class="gf-field"><label class="gf-label" for="pf-notes">Notes (optional)</label><input class="gf-input plain" id="pf-notes" autocomplete="off"></div>`);
        const foot = document.createElement('div');
        foot.className = 'gf-modal-foot';
        foot.innerHTML = `<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button>
          <button class="gf-btn gf-btn-ghost" type="button" data-draft>Save as draft</button>
          ${canPost ? '<button class="gf-btn gf-btn-green" type="button" data-post>Save and post</button>' : ''}`;
        m.el.querySelector('.gf-modal').appendChild(foot);

        const $b = (sel) => body.querySelector(sel);
        const linesEl = $b('#pf-lines');
        const unitOf = (l) => l.units.find((u) => String(u.unit_id) === String(l.unit_id));
        const kgOf = (l) => num(l.qty) * (unitOf(l) ? num(unitOf(l).kg_per_unit) : 0);

        function paintLines() {
          linesEl.innerHTML = f.lines.map((l, i) => `<div class="pl" data-i="${i}">
            <select class="gf-input plain pl-item" data-item aria-label="Item"><option value="">Choose item…</option>${itm.map((x) => `<option value="${x.id}" ${String(x.id) === String(l.item_id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
            <input class="gf-input plain pl-qty" data-qty type="number" inputmode="decimal" min="0" step="any" placeholder="Qty" value="${esc(l.qty)}" aria-label="Quantity">
            <select class="gf-input plain pl-unit" data-unit aria-label="Unit">${l.units.length ? l.units.map((u) => `<option value="${u.unit_id}" ${String(u.unit_id) === String(l.unit_id) ? 'selected' : ''}>${esc(u.kg_per_unit && Number(u.kg_per_unit) !== 1 ? `${u.name} (${fmt(u.kg_per_unit)} kg)` : u.name)}</option>`).join('') : '<option value="">Unit</option>'}</select>
            <input class="gf-input plain pl-cost" data-cost type="number" inputmode="decimal" min="0" step="any" placeholder="Cost each" value="${esc(l.cost)}" aria-label="Cost per unit">
            <b class="pl-amt" data-amt>${fmt(num(l.qty) * num(l.cost))}</b>
            <button type="button" class="cl-x" data-remove aria-label="Remove line" ${f.lines.length === 1 ? 'disabled' : ''}><i class="bi bi-x-lg"></i></button></div>`).join('');
        }

        function totals() {
          const goods = r2(f.lines.reduce((t, l) => t + num(l.qty) * num(l.cost), 0));
          const extra = num($b('#pf-transport').value) + num($b('#pf-loading').value) + num($b('#pf-other').value);
          const kg = f.lines.reduce((t, l) => t + kgOf(l), 0);
          const total = r2(goods + extra);
          $b('#pf-total').innerHTML = `<div class="tr"><span>Grain</span><b>${UI.money(goods)}</b></div>
            ${extra > 0 ? `<div class="tr"><span>Extra costs</span><b>${UI.money(extra)}</b></div>` : ''}
            <div class="tr total"><span>Total cost</span><b>${UI.money(total)}</b></div>
            ${kg > 0 ? `<div class="gf-hint">${UI.kg(kg)} bought · true cost <b>${UI.money(r2(total / kg))}</b> per kg</div>` : ''}`;
          f.lines.forEach((l, i) => { const a = linesEl.querySelector(`[data-i="${i}"] [data-amt]`); if (a) a.textContent = fmt(num(l.qty) * num(l.cost)); });
        }

        $b('#pf-pool').addEventListener('click', (e) => {
          const b = e.target.closest('[data-pool]'); if (!b) return;
          f.pool = b.dataset.pool;
          $b('#pf-pool').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        });
        $b('#pf-add').addEventListener('click', () => { f.lines.push({ item_id: '', unit_id: '', qty: '', cost: '', units: [] }); paintLines(); totals(); });
        linesEl.addEventListener('input', (e) => {
          const row = e.target.closest('[data-i]'); if (!row) return;
          const l = f.lines[Number(row.dataset.i)];
          if (e.target.matches('[data-qty]')) l.qty = e.target.value;
          else if (e.target.matches('[data-cost]')) l.cost = e.target.value;
          totals();
        });
        linesEl.addEventListener('change', async (e) => {
          const row = e.target.closest('[data-i]'); if (!row) return;
          const l = f.lines[Number(row.dataset.i)];
          if (e.target.matches('[data-unit]')) { l.unit_id = e.target.value; totals(); return; }
          if (!e.target.matches('[data-item]')) return;
          l.item_id = e.target.value; l.units = []; l.unit_id = '';
          if (l.item_id) {
            try {
              l.units = await unitsOf(l.item_id);
              const kg = l.units.find((u) => Number(u.kg_per_unit) === 1) || l.units[0];
              l.unit_id = kg ? kg.unit_id : '';
            } catch (err) { m.error(err.message); }
          }
          paintLines(); totals();
        });
        linesEl.addEventListener('click', (e) => {
          const x = e.target.closest('[data-remove]'); if (!x || f.lines.length === 1) return;
          f.lines.splice(Number(x.closest('[data-i]').dataset.i), 1); paintLines(); totals();
        });
        ['#pf-transport', '#pf-loading', '#pf-other'].forEach((id) => $b(id).addEventListener('input', totals));
        paintLines(); totals();

        async function save(post, btn) {
          m.error('');
          const bad = f.lines.findIndex((l) => !l.item_id || !l.unit_id || !(num(l.qty) > 0) || !(num(l.cost) > 0));
          if (bad >= 0) { m.error(`Check line ${bad + 1}: choose the item and unit, then enter the quantity and cost.`); return; }
          const payload = {
            supplier_id: Number($b('#pf-sup').value), stock_pool: f.pool, purchase_date: $b('#pf-date').value || undefined,
            supplier_invoice_ref: $b('#pf-ref').value.trim() || undefined,
            transport_cost: num($b('#pf-transport').value), loading_cost: num($b('#pf-loading').value), other_cost: num($b('#pf-other').value),
            notes: $b('#pf-notes').value.trim() || undefined,
            lines: f.lines.map((l) => ({ item_id: Number(l.item_id), unit_id: Number(l.unit_id), quantity: num(l.qty), unit_cost: num(l.cost) })),
          };
          let paid = null;
          if (post && canPost && num($b('#pf-paid').value) > 0) {
            paid = { amount: num($b('#pf-paid').value), method: $b('#pf-method').value };
            const goods = payload.lines.reduce((t, l) => t + l.quantity * l.unit_cost, 0) + payload.transport_cost + payload.loading_cost + payload.other_cost;
            if (paid.amount > goods + 0.005) { m.error('The amount paid is more than the total cost.'); return; }
          }
          m.busy(btn, true);
          let created;
          try { created = await Api.post('/purchases', payload); }
          catch (err) { m.error(err.message); m.busy(btn, false); return; }
          if (!post) { m.close(); UI.toast('Draft saved'); load(true); return; }
          try {
            await Api.post(`/purchases/${created.id}/post`, paid ? { pay: paid } : {});
            m.close(); UI.toast('Purchase posted. Stock updated.'); load(true);
          } catch (err) {
            m.close(); load(true);
            UI.toast(`Saved as a draft, but it could not be posted: ${err.message}`, 'error');
          }
        }
        foot.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.hasAttribute('data-draft')) save(false, b);
          else if (b.hasAttribute('data-post')) save(true, b);
        });
      }

      paint();
      load();
    },
  });
})();