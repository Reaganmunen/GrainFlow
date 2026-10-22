/**
 * Cereals > Losses and stock takes  (#/cereal/adjustments)
 * Tab 1, Losses: every loss or correction to the cereal stock (spoilage, spillage, moisture, count corrections ...),
 *   a summary of what was lost and why, and a form to record a new one.
 * Tab 2, Stock takes: a counting sheet. Count what is on the shelf, save, then post. Posting turns every
 *   difference into a "count correction" loss or gain.
 * Uses GET/POST /stock/adjustments, GET /stock/adjustments/loss-summary, GET /stock/adjustments/:id,
 *   GET/POST /stock/takes, GET/DELETE /stock/takes/:id, PUT /stock/takes/:id/lines,
 *   DELETE /stock/takes/:id/lines/:itemId, POST /stock/takes/:id/post, GET /stock and GET /items.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const POOL = 'CEREAL_STOCK';
  const kgFmt = (n) => `${num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 })} kg`;
  const sign = (n) => (num(n) > 0 ? '+' : '');
  const first = (r, ...keys) => { for (const k of keys) if (r && r[k] !== undefined && r[k] !== null) return r[k]; return undefined; };
  const dateOnly = (v) => (v ? new Date(v).toLocaleDateString('en-KE', { dateStyle: 'medium' }) : '–');
  const stamp = (v) => (v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
  const today = () => new Date().toLocaleDateString('en-CA');

  const REASON = {
    WEIGHT_LOSS: 'Weight loss', MOISTURE: 'Moisture loss', PESTS: 'Pests', SPOILAGE: 'Spoilage', DAMAGE: 'Damage',
    SPILLAGE: 'Spillage', THEFT_SUSPECTED: 'Suspected theft', COUNT_CORRECTION: 'Count correction', OTHER: 'Other',
  };
  const reasonPill = (r) => `<span class="pill ${r === 'THEFT_SUSPECTED' ? 'red' : r === 'COUNT_CORRECTION' || r === 'OTHER' ? '' : 'amber'}">${esc(REASON[r] || Kit.pretty(r))}</span>`;
  const changeCell = (n) => `<td class="r ${num(n) < 0 ? 'neg' : 'pos'}">${sign(n)}${num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 })} kg</td>`;

  GF.page('cereal/adjustments', {
    title: 'Losses and stock takes',
    render(el) {
      const canAdjust = GF.can('stock.adjust');
      const canTake = GF.can('stock.take');
      const canPost = GF.can('stock.take_post');
      const showValue = GF.can('reports.profit');
      const r0 = Kit.range('month');
      const s = {
        tab: 'loss', loading: true, failed: '',
        // losses
        rows: [], total: 0, summary: [], rng: 'month', from: r0.from, to: r0.to, reason: '', search: '',
        // stock takes
        takes: [], takeStatus: '',
      };

      el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>';
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

      // ------------------------------------------------------------ page actions follow the tab
      function paintActions() {
        const btn = s.tab === 'loss'
          ? (canAdjust ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="adj-new" type="button"><i class="bi bi-plus-lg"></i>Record loss</button>' : '')
          : (canTake ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="adj-new" type="button"><i class="bi bi-plus-lg"></i>New stock take</button>' : '');
        GF.setActions(btn);
        const b = document.getElementById('adj-new');
        if (b) b.addEventListener('click', () => (s.tab === 'loss' ? openLossForm() : openNewTake()));
      }

      // ------------------------------------------------------------ data
      async function loadLoss(quiet) {
        try {
          const q = new URLSearchParams({ pool: POOL, limit: '500' });
          if (s.from) q.set('from', s.from);
          if (s.to) q.set('to', s.to);
          if (s.reason) q.set('reason', s.reason);
          const sq = new URLSearchParams({ pool: POOL });
          if (s.from) sq.set('from', s.from);
          if (s.to) sq.set('to', s.to);
          const [rows, summary] = await Promise.all([Api.get(`/stock/adjustments?${q}`), Api.get(`/stock/adjustments/loss-summary?${sq}`)]);
          s.rows = rows || [];
          s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
          s.summary = summary || [];
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false; paint();
      }
      async function loadTakes(quiet) {
        try {
          const q = new URLSearchParams({ pool: POOL, limit: '200' });
          if (s.takeStatus) q.set('status', s.takeStatus);
          s.takes = (await Api.get(`/stock/takes?${q}`)) || [];
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false; paint();
      }
      const loadTab = (quiet) => { s.loading = true; if (!quiet) paintTable(); return s.tab === 'loss' ? loadLoss(quiet) : loadTakes(quiet); };

      // ------------------------------------------------------------ painting
      function paintKpis() {
        if (s.tab === 'loss') {
          const kgLost = s.summary.reduce((t, r) => t + num(r.kg_lost), 0);
          const valLost = s.summary.reduce((t, r) => t + num(r.value_lost), 0);
          const gained = s.rows.filter((r) => num(r.quantity_kg_change) > 0).reduce((t, r) => t + num(r.quantity_kg_change), 0);
          const top = s.summary[0];
          kpisEl.innerHTML =
            Kit.kpi('bi-clipboard-data', 'Entries', String(s.rows.length)) +
            Kit.kpi('bi-box-arrow-down', 'Lost', kgFmt(kgLost), '', 'mill') +
            (showValue ? Kit.kpi('bi-cash-stack', 'Value lost at cost', UI.money(valLost), '', 'mill') : Kit.kpi('bi-box-arrow-in-up', 'Gained', kgFmt(gained), '', 'cereal')) +
            Kit.kpi('bi-exclamation-triangle', 'Biggest cause', top ? esc(REASON[top.reason] || Kit.pretty(top.reason)) : 'None');
        } else {
          const drafts = s.takes.filter((t) => t.status === 'DRAFT');
          const posted = s.takes.filter((t) => t.status === 'POSTED');
          const last = posted[0];
          kpisEl.innerHTML =
            Kit.kpi('bi-clipboard-check', 'Stock takes', String(s.takes.length)) +
            Kit.kpi('bi-pencil-square', 'Being counted', String(drafts.length), drafts.length ? '<span class="gf-badge gf-badge-amber">Not posted</span>' : '', 'mill') +
            Kit.kpi('bi-check2-circle', 'Posted', String(posted.length), '', 'cereal') +
            Kit.kpi('bi-calendar-check', 'Last posted count', last ? esc(dateOnly(last.take_date)) : 'None');
        }
      }

      function paintToolbar() {
        const seg = `<div class="gf-seg" style="min-width:260px"><button type="button" class="${s.tab === 'loss' ? 'on' : ''}" data-tab="loss">Losses</button><button type="button" class="${s.tab === 'takes' ? 'on' : ''}" data-tab="takes">Stock takes</button></div><span class="sep"></span>`;
        if (s.tab === 'loss') {
          const rc = (k, l) => `<button type="button" class="fchip ${s.rng === k ? 'on' : ''}" data-range="${k}">${l}</button>`;
          toolbarEl.innerHTML = `${seg}${rc('week', '7 days')}${rc('month', 'This month')}${rc('all', 'All time')}
            <span class="sep"></span>
            <label class="date-box">From <input type="date" id="a-from" value="${esc(s.from || '')}"></label>
            <label class="date-box">To <input type="date" id="a-to" value="${esc(s.to || '')}"></label>
            <select class="gf-input plain" id="a-reason" style="width:auto;height:32px;font-size:13px" aria-label="Reason">
              <option value="">All reasons</option>${Object.entries(REASON).map(([k, l]) => `<option value="${k}" ${s.reason === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
            <span class="grow"></span>
            <label class="search"><i class="bi bi-search"></i><input type="search" id="a-search" placeholder="Find an item" value="${esc(s.search)}" aria-label="Find an item"></label>`;
        } else {
          const sc = (k, l) => `<button type="button" class="fchip outline ${s.takeStatus === k ? 'on' : ''}" data-tstatus="${k}">${l}</button>`;
          toolbarEl.innerHTML = `${seg}${sc('DRAFT', 'Being counted')}${sc('POSTED', 'Posted')}`;
        }
      }

      const lossRows = () => {
        const q = s.search.toLowerCase();
        return q ? s.rows.filter((r) => String(r.item_name || '').toLowerCase().includes(q)) : s.rows;
      };

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = Kit.loading(s.tab === 'loss' ? 'losses' : 'stock takes'); return; }
        const err = s.failed ? Kit.error(s.failed) : '';

        if (s.tab === 'loss') {
          const rows = lossRows();
          if (!rows.length) {
            hostEl.innerHTML = `${err}${Kit.empty('bi-clipboard-data', 'No losses recorded', s.reason || s.search ? 'Try clearing the filters.' : 'Nothing was written off in this period.',
              canAdjust && !s.reason && !s.search ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">Record loss</button>' : '')}`;
            return;
          }
          const breakdown = s.summary.length ? `<div class="chips-row" style="margin-bottom:12px">${s.summary.map((x) =>
            `<span class="pill amber">${esc(REASON[x.reason] || Kit.pretty(x.reason))} · ${esc(kgFmt(x.kg_lost))}${showValue ? ` · ${esc(UI.money(x.value_lost))}` : ''}</span>`).join('')}</div>` : '';
          const body = rows.map((r) => `<tr class="click" data-id="${r.id}">
            <td><div class="cell-plain"><strong>${esc(dateOnly(r.adjustment_date))}</strong></div></td>
            <td>${esc(r.item_name || '')}</td><td>${reasonPill(r.reason)}</td>
            ${changeCell(r.quantity_kg_change)}
            ${showValue ? `<td class="r ${num(r.value_change) < 0 ? 'neg' : 'pos'}">${r.value_change != null ? UI.money(r.value_change) : '–'}</td>` : ''}
            <td class="muted">${esc(r.note || '')}</td><td class="muted">${esc(r.created_by_name || '')}</td></tr>`).join('');
          const heads = [['Date'], ['Item'], ['Reason'], ['Change', 'r']];
          if (showValue) heads.push(['Value', 'r']);
          heads.push(['Note'], ['Recorded by']);
          hostEl.innerHTML = `${err}${breakdown}${s.total > s.rows.length ? Kit.note(`Showing the latest ${s.rows.length} of ${s.total} entries. Narrow the dates to see the rest.`, 'amber') : ''}${Kit.table(heads, body)}`;
          return;
        }

        if (!s.takes.length) {
          hostEl.innerHTML = `${err}${Kit.empty('bi-clipboard-check', 'No stock takes yet', s.takeStatus ? 'Try clearing the filter.' : 'Count what is on the shelf and compare it with what the system says.',
            canTake && !s.takeStatus ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">New stock take</button>' : '')}`;
          return;
        }
        const body = s.takes.map((t) => `<tr class="click" data-take="${t.id}">
          <td><div class="cell-plain"><strong>${esc(dateOnly(t.take_date))}</strong><span>${esc(first(t, 'take_no') || `Count #${t.id}`)}</span></div></td>
          <td>${t.status === 'POSTED' ? '<span class="pill green">Posted</span>' : '<span class="pill amber">Being counted</span>'}</td>
          <td class="r">${num(t.line_count)}</td><td class="muted">${esc(t.notes || '')}</td><td class="muted">${esc(t.created_by_name || '')}</td></tr>`).join('');
        hostEl.innerHTML = `${err}${Kit.table([['Date'], ['Status'], ['Items counted', 'r'], ['Notes'], ['Started by']], body)}`;
      }

      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { if (s.tab === tab.dataset.tab) return; s.tab = tab.dataset.tab; paintActions(); loadTab(); paintToolbar(); return; }
        const r = e.target.closest('[data-range]');
        if (r) { s.rng = r.dataset.range; Object.assign(s, { from: '', to: '' }, Kit.range(s.rng)); loadTab(); paintToolbar(); return; }
        const ts = e.target.closest('[data-tstatus]');
        if (ts) { s.takeStatus = s.takeStatus === ts.dataset.tstatus ? '' : ts.dataset.tstatus; loadTab(); paintToolbar(); }
      });
      toolbarEl.addEventListener('change', (e) => {
        if (e.target.id === 'a-from' || e.target.id === 'a-to') {
          s.from = toolbarEl.querySelector('#a-from').value; s.to = toolbarEl.querySelector('#a-to').value; s.rng = 'custom';
          loadTab(); paintToolbar();
        } else if (e.target.id === 'a-reason') { s.reason = e.target.value; loadTab(); }
      });
      toolbarEl.addEventListener('input', (e) => {
        if (e.target.id !== 'a-search') return;
        s.search = e.target.value.trim(); paintTable();
      });
      hostEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) { if (s.tab === 'loss') openLossForm(); else openNewTake(); return; }
        const tr = e.target.closest('tr[data-id]');
        if (tr) { openLoss(Number(tr.dataset.id)); return; }
        const tk = e.target.closest('tr[data-take]');
        if (tk) openTake(Number(tk.dataset.take));
      });

      // ------------------------------------------------------------ shared lookups
      async function stockRows() { return (await Api.get(`/stock?pool=${POOL}&limit=200`)) || []; }
      const qtyOf = (r) => num(first(r, 'quantity_kg', 'qty_kg', 'on_hand_kg'));

      /** Items that can be counted or adjusted, each with what the system says is on hand. */
      async function stockItems() {
        const rows = await stockRows();
        if (rows.length && rows.every((r) => first(r, 'item_id') !== undefined)) {
          return rows.map((r) => ({ id: r.item_id, name: r.item_name || `Item ${r.item_id}`, sku: r.sku, kg: qtyOf(r) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
        const items = ((await Api.get('/items?active=true&limit=200')) || []).filter((i) => i.track_stock !== false);
        const byName = new Map(rows.map((r) => [String(r.item_name || '').toLowerCase(), qtyOf(r)]));
        return items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, kg: byName.get(String(i.name || '').toLowerCase()) || 0 }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      // ------------------------------------------------------------ one loss
      async function openLoss(id) {
        const m = UI.modal({ title: 'Stock adjustment', body: '<div class="gf-hint" data-loading>Loading…</div>', foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Close</button>' });
        let a;
        try { a = await Api.get(`/stock/adjustments/${id}`); }
        catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); return; }
        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        const row = s.rows.find((r) => r.id === id) || {};
        body.insertAdjacentHTML('beforeend', `
          <div class="who-head"><div class="grow"><h3>${esc(a.item_name || 'Item')} ${reasonPill(a.reason)}</h3>
            <div class="sub">${esc(dateOnly(a.adjustment_date))}</div></div></div>
          <div class="fact-grid">
            ${Kit.fact('Change', `<span class="${num(a.quantity_kg_change) < 0 ? 'neg-text' : ''}">${sign(a.quantity_kg_change)}${esc(kgFmt(a.quantity_kg_change))}</span>`)}
            ${showValue ? Kit.fact('Value', a.value_change != null ? esc(UI.money(a.value_change)) : '–') : Kit.fact('Recorded', esc(stamp(a.created_at)))}
            ${Kit.fact('Recorded by', esc(row.created_by_name || '–'))}${Kit.fact('Approved by', esc(row.approved_by_name || '–'))}
          </div>
          ${a.note ? `<div class="form-section"><span class="gf-label">Note</span><div>${esc(a.note)}</div></div>` : ''}`);
      }

      // ------------------------------------------------------------ record a loss
      async function openLossForm() {
        const m = UI.modal({
          title: 'Record a loss',
          body: '<div class="gf-hint" data-loading>Loading items…</div>',
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-dark" type="button" data-ok disabled>Save</button>',
        });
        let items;
        try { items = await stockItems(); } catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); return; }
        if (!items.length) { m.error('No stock items yet. Add opening stock first.'); m.el.querySelector('[data-loading]').remove(); return; }

        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        body.insertAdjacentHTML('beforeend', `
          <div class="gf-field"><label class="gf-label" for="l-item">Item</label>
            <select class="gf-input plain" id="l-item">${items.map((i, ix) => `<option value="${ix}">${esc(i.name)}</option>`).join('')}</select>
            <div class="gf-hint" id="l-hand" style="margin-top:6px"></div></div>
          <div class="gf-seg" id="l-dir"><button type="button" data-d="loss" class="on">Stock lost</button><button type="button" data-d="gain">Stock found</button></div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="l-kg">Quantity (kg)</label><input class="gf-input plain" id="l-kg" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></div>
            <div class="gf-field"><label class="gf-label" for="l-date">Date</label><input class="gf-input plain" id="l-date" type="date" value="${today()}"></div>
          </div>
          <div class="gf-field"><label class="gf-label" for="l-reason">Reason</label>
            <select class="gf-input plain" id="l-reason">${Object.entries(REASON).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
          <div class="gf-field gf-hidden" id="l-cost-wrap"><label class="gf-label" for="l-cost">Cost per kg (KES, optional)</label><input class="gf-input plain" id="l-cost" type="number" inputmode="decimal" min="0" step="any"></div>
          <div class="gf-field"><label class="gf-label" for="l-note">Note <span id="l-note-req" class="gf-hint"></span></label><textarea class="gf-input plain" id="l-note" placeholder="What happened?"></textarea></div>`);
        const $ = (q) => body.querySelector(q);
        const save = m.el.querySelector('[data-ok]');
        let dir = 'loss';

        const sync = () => {
          const it = items[Number($('#l-item').value)];
          const kg = num($('#l-kg').value);
          $('#l-hand').innerHTML = `On hand now: <b>${esc(kgFmt(it.kg))}</b>${dir === 'loss' && kg > it.kg ? ' <span class="neg-text">This is more than the system says is on hand.</span>' : ''}`;
          $('#l-note-req').textContent = $('#l-reason').value === 'OTHER' ? '(required for “Other”)' : '';
          $('#l-cost-wrap').classList.toggle('gf-hidden', dir !== 'gain');
        };
        $('#l-item').addEventListener('change', sync);
        $('#l-kg').addEventListener('input', sync);
        $('#l-reason').addEventListener('change', sync);
        $('#l-dir').addEventListener('click', (e) => {
          const b = e.target.closest('[data-d]'); if (!b) return;
          dir = b.dataset.d;
          $('#l-dir').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          if (dir === 'gain' && ['SPOILAGE', 'PESTS', 'SPILLAGE', 'DAMAGE', 'MOISTURE', 'WEIGHT_LOSS', 'THEFT_SUSPECTED'].includes($('#l-reason').value)) $('#l-reason').value = 'COUNT_CORRECTION';
          sync();
        });
        sync();
        save.disabled = false;

        save.addEventListener('click', async () => {
          m.error('');
          const it = items[Number($('#l-item').value)];
          const kg = num($('#l-kg').value);
          const reason = $('#l-reason').value;
          const note = $('#l-note').value.trim();
          if (!(kg > 0)) { m.error('Enter the quantity in kg.'); return; }
          if (reason === 'OTHER' && !note) { m.error('Add a note when the reason is “Other”.'); return; }
          const b = { pool: POOL, item_id: it.id, reason, quantity_kg_change: dir === 'loss' ? -kg : kg, adjustment_date: $('#l-date').value || today() };
          if (note) b.note = note;
          if (dir === 'gain' && num($('#l-cost').value) > 0) b.unit_cost_per_kg = num($('#l-cost').value);
          m.busy(save, true);
          try {
            await Api.post('/stock/adjustments', b);
            m.close(); UI.toast('Recorded'); loadLoss(true);
          } catch (err) { m.error(err.message); m.busy(save, false); }
        });
      }

      // ------------------------------------------------------------ stock takes
      function openNewTake() {
        const m = UI.modal({
          title: 'New stock take',
          body: `<div class="gf-hint">You will get a sheet listing every item with what the system says is on hand. Enter what you actually count.</div>
            <div class="gf-field"><label class="gf-label" for="t-date">Date of the count</label><input class="gf-input plain" id="t-date" type="date" value="${today()}"></div>
            <div class="gf-field"><label class="gf-label" for="t-notes">Notes (optional)</label><input class="gf-input plain" id="t-notes" placeholder="e.g. Month-end count" autocomplete="off"></div>`,
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-dark" type="button" data-ok>Start counting</button>',
        });
        const okBtn = m.el.querySelector('[data-ok]');
        okBtn.addEventListener('click', async () => {
          m.error(''); m.busy(okBtn, true);
          try {
            const b = { pool: POOL, take_date: m.el.querySelector('#t-date').value || today() };
            const notes = m.el.querySelector('#t-notes').value.trim(); if (notes) b.notes = notes;
            const t = await Api.post('/stock/takes', b);
            m.close(); UI.toast('Stock take started');
            if (s.tab !== 'takes') { s.tab = 'takes'; paintActions(); }
            loadTab(true); paintToolbar();
            openTake(t.id);
          } catch (err) { m.error(err.message); m.busy(okBtn, false); }
        });
      }

      async function openTake(id) {
        const m = UI.modal({ title: 'Stock take', wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
        m.el.querySelector('.gf-modal').style.width = 'min(920px, 100%)';
        let take, items = [];
        try {
          take = await Api.get(`/stock/takes/${id}`);
          if (take.status === 'DRAFT') items = await stockItems();
        } catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); return; }

        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        const lines = take.lines || [];
        const head = `<div class="who-head"><div class="grow"><h3>Count of ${esc(dateOnly(take.take_date))} ${take.status === 'POSTED' ? '<span class="pill green">Posted</span>' : '<span class="pill amber">Being counted</span>'}</h3>
          <div class="sub">${esc(take.notes || '')}</div></div></div>`;

        // ---- posted: read only
        if (take.status !== 'DRAFT') {
          const rows = lines.map((l) => {
            const v = num(l.counted_kg) - num(l.system_kg);
            return `<tr><td>${esc(l.item_name)}</td><td class="r">${esc(kgFmt(l.system_kg))}</td><td class="r">${esc(kgFmt(l.counted_kg))}</td>
              <td class="r ${v < 0 ? 'neg' : v > 0 ? 'pos' : 'muted'}">${v === 0 ? '–' : `${sign(v)}${esc(kgFmt(v))}`}</td><td class="muted">${esc(l.note || '')}</td></tr>`;
          }).join('');
          body.insertAdjacentHTML('beforeend', `${head}${Kit.note('This count is posted. Every difference was written to the stock as a count correction.', 'amber', 'bi-lock')}
            <div class="mini-table" style="max-height:50vh"><table class="dt"><thead><tr><th>Item</th><th class="r">System</th><th class="r">Counted</th><th class="r">Difference</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>`);
          m.el.querySelector('.gf-modal').insertAdjacentHTML('beforeend', '<div class="gf-modal-foot"><button class="gf-btn gf-btn-ghost" type="button" data-close>Close</button></div>');
          return;
        }

        // ---- draft: counting sheet
        const saved = new Map(lines.map((l) => [String(l.item_id), l]));
        body.insertAdjacentHTML('beforeend', `${head}
          <div class="gf-hint">Leave an item empty if you did not count it. Only items with a count are included.</div>
          <label class="search" style="width:100%"><i class="bi bi-search"></i><input type="search" id="tk-find" placeholder="Find an item" aria-label="Find an item"></label>
          <div class="mini-table" style="max-height:50vh"><table class="dt"><thead><tr><th>Item</th><th class="r">System</th><th class="r" style="width:130px">Counted (kg)</th><th class="r">Difference</th><th>Note</th></tr></thead>
            <tbody id="tk-body">${items.map((it) => {
              const l = saved.get(String(it.id));
              const sys = l ? num(l.system_kg) : it.kg;
              return `<tr data-item="${esc(it.id)}" data-name="${esc(it.name.toLowerCase())}" data-sys="${esc(sys)}">
                <td>${esc(it.name)}</td><td class="r">${esc(kgFmt(sys))}</td>
                <td class="r"><input class="gf-input plain" data-counted type="number" inputmode="decimal" min="0" step="any" style="height:34px;text-align:right" value="${l ? esc(num(l.counted_kg)) : ''}"></td>
                <td class="r" data-diff></td>
                <td><input class="gf-input plain" data-note style="height:34px" value="${l ? esc(l.note || '') : ''}" autocomplete="off"></td></tr>`;
            }).join('')}</tbody></table></div>
          <div class="gf-hint" id="tk-sum"></div>`);

        const foot = document.createElement('div');
        foot.className = 'gf-modal-foot';
        foot.innerHTML = `<button class="gf-btn gf-btn-ghost" type="button" data-close>Close</button>
          ${canTake ? '<button class="gf-btn gf-btn-ghost" type="button" data-delete><i class="bi bi-trash"></i>Delete</button><button class="gf-btn gf-btn-ghost" type="button" data-save>Save counts</button>' : ''}
          ${canPost ? '<button class="gf-btn gf-btn-green" type="button" data-post><i class="bi bi-check2-circle"></i>Save and post</button>' : ''}`;
        m.el.querySelector('.gf-modal').appendChild(foot);

        const tbody = body.querySelector('#tk-body');
        const rowsEls = () => [...tbody.querySelectorAll('tr[data-item]')];
        const counted = (tr) => { const v = tr.querySelector('[data-counted]').value; return v === '' ? null : num(v); };

        function recalc() {
          let n = 0, net = 0, off = 0;
          rowsEls().forEach((tr) => {
            const c = counted(tr), cell = tr.querySelector('[data-diff]');
            if (c === null) { cell.textContent = ''; cell.className = 'r'; return; }
            const d = c - num(tr.dataset.sys);
            n += 1; net += d; if (Math.abs(d) > 0.0001) off += 1;
            cell.textContent = Math.abs(d) < 0.0001 ? '–' : `${sign(d)}${kgFmt(d)}`;
            cell.className = `r ${d < 0 ? 'neg' : d > 0 ? 'pos' : 'muted'}`;
          });
          body.querySelector('#tk-sum').innerHTML = n ? `<b>${n}</b> items counted, <b>${off}</b> with a difference, net <b>${sign(net)}${esc(kgFmt(net))}</b>.` : 'Nothing counted yet.';
        }
        recalc();
        body.addEventListener('input', (e) => { if (e.target.matches('[data-counted]')) recalc(); });
        body.querySelector('#tk-find').addEventListener('input', (e) => {
          const q = e.target.value.trim().toLowerCase();
          rowsEls().forEach((tr) => { tr.style.display = !q || tr.dataset.name.includes(q) ? '' : 'none'; });
        });

        /** Saves what is typed in (and removes lines that were cleared). Returns the saved take, or null if nothing to save. */
        async function saveSheet() {
          const toSave = [], toRemove = [];
          rowsEls().forEach((tr) => {
            const c = counted(tr), itemId = tr.dataset.item;
            if (c === null) { if (saved.has(String(itemId))) toRemove.push(itemId); return; }
            toSave.push({ item_id: Number(itemId), counted_kg: c, note: tr.querySelector('[data-note]').value.trim() || undefined });
          });
          for (const itemId of toRemove) await Api.del(`/stock/takes/${id}/lines/${itemId}`);
          if (!toSave.length) return null;
          return Api.put(`/stock/takes/${id}/lines`, { lines: toSave });
        }

        foot.addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-save], [data-post], [data-delete]');
          if (!btn) return;
          m.error('');
          if (btn.hasAttribute('data-delete')) { m.close(); openDeleteTake(take); return; }
          m.busy(btn, true);
          try {
            const result = await saveSheet();
            if (btn.hasAttribute('data-save')) {
              m.close(); UI.toast('Counts saved'); loadTab(true); openTake(id);
              return;
            }
            if (!result) { m.error('Count at least one item before posting.'); m.busy(btn, false); return; }
            m.close(); loadTab(true); openPost(result);
          } catch (err) { m.error(err.message); m.busy(btn, false); }
        });
      }

      function openPost(take) {
        const lines = take.lines || [];
        const diffs = lines.map((l) => ({ l, d: num(l.counted_kg) - num(l.system_kg) })).filter((x) => Math.abs(x.d) > 0.0001);
        const net = diffs.reduce((t, x) => t + x.d, 0);
        const rows = diffs.map((x) => `<tr><td>${esc(x.l.item_name)}</td><td class="r ${x.d < 0 ? 'neg' : 'pos'}">${sign(x.d)}${esc(kgFmt(x.d))}</td></tr>`).join('');
        const m = UI.modal({
          title: 'Post this stock take?',
          body: `${Kit.note('Posting changes the stock on hand to match your count. It cannot be undone.', 'amber', 'bi-exclamation-triangle')}
            <div class="gf-hint"><b>${lines.length}</b> items counted, <b>${diffs.length}</b> with a difference${diffs.length ? `, net <b>${sign(net)}${esc(kgFmt(net))}</b>` : ''}.</div>
            ${rows ? `<div class="mini-table"><table class="dt"><thead><tr><th>Item</th><th class="r">Correction</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}`,
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Not yet</button><button class="gf-btn gf-btn-green" type="button" data-ok>Post count</button>',
        });
        const okBtn = m.el.querySelector('[data-ok]');
        okBtn.addEventListener('click', async () => {
          m.error(''); m.busy(okBtn, true);
          try {
            await Api.post(`/stock/takes/${take.id}/post`, {});
            m.close(); UI.toast('Stock take posted'); loadTab(true); openTake(take.id);
          } catch (err) { m.error(err.message); m.busy(okBtn, false); }
        });
      }

      function openDeleteTake(take) {
        const m = UI.modal({
          title: 'Delete this stock take?',
          body: '<div class="gf-note gf-note-amber"><i class="bi bi-exclamation-triangle"></i><span>The counts you entered are thrown away. The stock is not changed.</span></div>',
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Keep it</button><button class="gf-btn gf-btn-dark" type="button" data-ok>Delete</button>',
        });
        const okBtn = m.el.querySelector('[data-ok]');
        okBtn.addEventListener('click', async () => {
          m.error(''); m.busy(okBtn, true);
          try { await Api.del(`/stock/takes/${take.id}`); m.close(); UI.toast('Stock take deleted'); loadTab(true); }
          catch (err) { m.error(err.message); m.busy(okBtn, false); }
        });
      }

      paintActions();
      paint();
      loadTab(true);
    },
  });
})();