/**
 * Cereals > Mill transfers  (#/shared/transfers)  (owner only, the backend refuses anyone else)
 * Stock that moves between the two businesses, at cost: the mill takes grain from the cereal stock,
 * or the cereal side takes flour and bran from the mill.
 * Uses GET /stock/transfers, POST /stock/transfers, GET /stock (source stock) and GET /items.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const first = (r, ...keys) => { for (const k of keys) if (r && r[k] !== undefined && r[k] !== null) return r[k]; return undefined; };
  const kgFmt = (n) => `${num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 })} kg`;
  const dateOnly = (v) => (v ? new Date(v).toLocaleDateString('en-KE', { dateStyle: 'medium' }) : '–');
  const today = () => new Date().toLocaleDateString('en-CA');

  const POOL_NAME = { MILL_STOCK: 'Mill', CEREAL_STOCK: 'Cereals' };
  // the two directions a transfer can go
  const DIR = {
    TO_MILL: { from: 'CEREAL_STOCK', to: 'MILL_STOCK', label: 'Cereals → Mill', hint: 'The mill takes grain from the cereal stock.' },
    TO_CEREAL: { from: 'MILL_STOCK', to: 'CEREAL_STOCK', label: 'Mill → Cereals', hint: 'The cereal side takes flour or bran from the mill stock.' },
  };
  const dirOf = (r) => (r.from_pool === 'MILL_STOCK' ? 'TO_CEREAL' : 'TO_MILL');
  const route = (r) => `<span class="pill ${r.from_pool === 'MILL_STOCK' ? 'amber' : 'green'}">${esc(POOL_NAME[r.from_pool] || r.from_pool)} → ${esc(POOL_NAME[r.to_pool] || r.to_pool)}</span>`;
  const valueOf = (r) => num(first(r, 'total_cost', 'value', 'total_value')) || num(r.quantity_kg) * num(r.unit_cost_per_kg);

  GF.page('shared/transfers', {
    title: 'Mill transfers',
    render(el) {
      if (!GF.isOwner) {
        el.innerHTML = '<div class="empty-card"><div class="tile"><i class="bi bi-lock"></i></div><h2>Only the owner can do this</h2><p>Stock moves between the mill and cereals, so the owner handles it.</p></div>';
        return;
      }
      const canMove = GF.can('stock.transfer');
      const showCost = GF.can('reports.profit');
      const r0 = Kit.range('month');
      const s = { rows: [], total: 0, loading: true, failed: '', rng: 'month', from: r0.from, to: r0.to, dir: '', search: '' };

      el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>';
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

      GF.setActions(canMove ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="tr-new" type="button"><i class="bi bi-arrow-left-right"></i>Move stock</button>' : '');
      const newBtn = document.getElementById('tr-new');

      // ------------------------------------------------------------ data
      async function load(quiet) {
        try {
          const q = new URLSearchParams({ limit: '500' });
          if (s.from) q.set('from', s.from);
          if (s.to) q.set('to', s.to);
          if (s.dir) { q.set('from_pool', DIR[s.dir].from); q.set('to_pool', DIR[s.dir].to); }
          const rows = await Api.get(`/stock/transfers?${q}`);
          s.rows = rows || [];
          s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false; paint();
      }

      const visible = () => {
        const q = s.search.toLowerCase();
        return q ? s.rows.filter((r) => String(r.item_name || '').toLowerCase().includes(q)) : s.rows;
      };

      // ------------------------------------------------------------ painting
      function paintKpis() {
        const rows = visible();
        const kg = (d) => rows.filter((r) => dirOf(r) === d).reduce((t, r) => t + num(r.quantity_kg), 0);
        const val = rows.reduce((t, r) => t + valueOf(r), 0);
        kpisEl.innerHTML =
          Kit.kpi('bi-arrow-left-right', 'Transfers', String(rows.length)) +
          Kit.kpi('bi-gear-wide-connected', 'Cereals → Mill', kgFmt(kg('TO_MILL')), '', 'mill') +
          Kit.kpi('bi-basket', 'Mill → Cereals', kgFmt(kg('TO_CEREAL')), '', 'cereal') +
          (showCost ? Kit.kpi('bi-cash-stack', 'Value moved at cost', UI.money(val)) : Kit.kpi('bi-calendar-event', 'Last transfer', rows[0] ? esc(dateOnly(rows[0].transfer_date)) : 'None'));
      }

      function paintToolbar() {
        const rc = (k, l) => `<button type="button" class="fchip ${s.rng === k ? 'on' : ''}" data-range="${k}">${l}</button>`;
        const dc = (k) => `<button type="button" class="fchip outline ${s.dir === k ? 'on' : ''}" data-dir="${k}">${esc(DIR[k].label)}</button>`;
        toolbarEl.innerHTML = `${rc('week', '7 days')}${rc('month', 'This month')}${rc('all', 'All time')}
          <span class="sep"></span>
          <label class="date-box">From <input type="date" id="t-from" value="${esc(s.from || '')}"></label>
          <label class="date-box">To <input type="date" id="t-to" value="${esc(s.to || '')}"></label>
          <span class="sep"></span>${dc('TO_MILL')}${dc('TO_CEREAL')}
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="t-search" placeholder="Find an item" value="${esc(s.search)}" aria-label="Find an item"></label>`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = Kit.loading('transfers'); return; }
        const err = s.failed ? Kit.error(s.failed) : '';
        const rows = visible();
        if (!rows.length) {
          hostEl.innerHTML = `${err}${Kit.empty('bi-arrow-left-right', 'No transfers found', s.dir || s.search ? 'Try clearing the filters.' : 'No stock moved between the mill and cereals in this period.',
            canMove && !s.dir && !s.search ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">Move stock</button>' : '')}`;
          return;
        }
        const body = rows.map((r) => `<tr class="click" data-id="${r.id}">
          <td><div class="cell-plain"><strong>${esc(dateOnly(r.transfer_date))}</strong></div></td>
          <td>${esc(r.item_name || '')}</td><td>${route(r)}</td>
          <td class="r">${esc(kgFmt(r.quantity_kg))}</td>
          ${showCost ? `<td class="r">${r.unit_cost_per_kg != null ? esc(UI.money(r.unit_cost_per_kg)) : '–'}</td><td class="r">${UI.money(valueOf(r))}</td>` : ''}
          <td class="muted">${esc(r.reason || '')}</td><td class="muted">${esc(r.created_by_name || '')}</td></tr>`).join('');
        const heads = [['Date'], ['Item'], ['Direction'], ['Quantity', 'r']];
        if (showCost) heads.push(['Cost per kg', 'r'], ['Value', 'r']);
        heads.push(['Reason'], ['Moved by']);
        hostEl.innerHTML = `${err}${s.total > s.rows.length ? Kit.note(`Showing the latest ${s.rows.length} of ${s.total} transfers. Narrow the dates to see the rest.`, 'amber') : ''}${Kit.table(heads, body)}`;
      }

      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const r = e.target.closest('[data-range]');
        if (r) { s.rng = r.dataset.range; Object.assign(s, { from: '', to: '' }, Kit.range(s.rng)); load(); paintToolbar(); return; }
        const d = e.target.closest('[data-dir]');
        if (d) { s.dir = s.dir === d.dataset.dir ? '' : d.dataset.dir; load(); paintToolbar(); }
      });
      toolbarEl.addEventListener('change', (e) => {
        if (e.target.id !== 't-from' && e.target.id !== 't-to') return;
        s.from = toolbarEl.querySelector('#t-from').value; s.to = toolbarEl.querySelector('#t-to').value; s.rng = 'custom';
        load(); paintToolbar();
      });
      toolbarEl.addEventListener('input', (e) => {
        if (e.target.id !== 't-search') return;
        s.search = e.target.value.trim(); paintKpis(); paintTable();
      });
      hostEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) { openMove(); return; }
        const tr = e.target.closest('tr[data-id]');
        if (tr) openTransfer(Number(tr.dataset.id));
      });
      if (newBtn) newBtn.addEventListener('click', () => openMove());

      // ------------------------------------------------------------ one transfer
      function openTransfer(id) {
        const r = s.rows.find((x) => x.id === id);
        if (!r) return;
        UI.modal({
          title: 'Transfer',
          body: `<div class="who-head"><div class="grow"><h3>${esc(r.item_name || 'Item')} ${route(r)}</h3><div class="sub">${esc(dateOnly(r.transfer_date))}</div></div></div>
            <div class="fact-grid">
              ${Kit.fact('Quantity', esc(kgFmt(r.quantity_kg)))}${Kit.fact('Moved by', esc(r.created_by_name || '–'))}
              ${showCost ? Kit.fact('Cost per kg', r.unit_cost_per_kg != null ? esc(UI.money(r.unit_cost_per_kg)) : '–') + Kit.fact('Value at cost', esc(UI.money(valueOf(r)))) : ''}
            </div>
            ${r.reason ? `<div class="form-section"><span class="gf-label">Reason</span><div>${esc(r.reason)}</div></div>` : ''}`,
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Close</button>',
        });
      }

      // ------------------------------------------------------------ move stock
      /** Items with stock in one pool, with kg on hand and (when the view has it) average cost. */
      async function sourceItems(pool) {
        const rows = (await Api.get(`/stock?pool=${pool}&limit=200`)) || [];
        const qty = (r) => num(first(r, 'quantity_kg', 'qty_kg', 'on_hand_kg'));
        const cost = (r) => first(r, 'avg_cost_per_kg', 'avg_cost', 'cost_per_kg', 'average_cost');
        let list;
        if (rows.length && rows.every((r) => first(r, 'item_id') !== undefined)) {
          list = rows.map((r) => ({ id: r.item_id, name: r.item_name || `Item ${r.item_id}`, kg: qty(r), cost: cost(r) }));
        } else {
          const items = ((await Api.get('/items?active=true&limit=200')) || []).filter((i) => i.track_stock !== false);
          const by = new Map(rows.map((r) => [String(r.item_name || '').toLowerCase(), r]));
          list = items.map((i) => { const r = by.get(String(i.name || '').toLowerCase()); return { id: i.id, name: i.name, kg: r ? qty(r) : 0, cost: r ? cost(r) : undefined }; });
        }
        return list.filter((i) => i.kg > 0).sort((a, b) => a.name.localeCompare(b.name));
      }

      async function openMove() {
        const m = UI.modal({
          title: 'Move stock',
          body: `<div class="gf-seg" id="m-dir">${Object.entries(DIR).map(([k, d], i) => `<button type="button" data-d="${k}" class="${i === 0 ? 'on' : ''}">${esc(d.label)}</button>`).join('')}</div>
            <div class="gf-hint" id="m-hint"></div>
            <div id="m-form" class="gf-stack"><div class="gf-hint">Loading stock…</div></div>`,
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-dark" type="button" data-ok disabled>Move stock</button>',
        });
        const form = m.el.querySelector('#m-form'), okBtn = m.el.querySelector('[data-ok]');
        let dir = 'TO_MILL', items = [];

        async function paintForm() {
          m.error('');
          m.el.querySelector('#m-hint').textContent = DIR[dir].hint;
          m.el.querySelectorAll('#m-dir button').forEach((b) => b.classList.toggle('on', b.dataset.d === dir));
          okBtn.disabled = true;
          form.innerHTML = '<div class="gf-hint">Loading stock…</div>';
          try { items = await sourceItems(DIR[dir].from); } catch (err) { m.error(err.message); form.innerHTML = ''; return; }
          if (!items.length) {
            form.innerHTML = Kit.note(`There is no stock in ${POOL_NAME[DIR[dir].from] === 'Mill' ? 'the mill' : 'cereals'} to move.`, 'amber', 'bi-info-circle');
            return;
          }
          form.innerHTML = `
            <div class="gf-field"><label class="gf-label" for="m-item">Item</label>
              <select class="gf-input plain" id="m-item">${items.map((i, ix) => `<option value="${ix}">${esc(i.name)}</option>`).join('')}</select>
              <div class="gf-hint" id="m-hand" style="margin-top:6px"></div></div>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="m-kg">Quantity (kg)</label><input class="gf-input plain" id="m-kg" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></div>
              <div class="gf-field"><label class="gf-label" for="m-date">Date</label><input class="gf-input plain" id="m-date" type="date" value="${today()}"></div>
            </div>
            ${showCost ? '<div class="gf-field"><label class="gf-label" for="m-cost">Cost per kg (KES, optional)</label><input class="gf-input plain" id="m-cost" type="number" inputmode="decimal" min="0" step="any" placeholder="Leave empty to use the average cost"></div>' : ''}
            <div class="gf-field"><label class="gf-label" for="m-reason">Reason (optional)</label><input class="gf-input plain" id="m-reason" placeholder="e.g. Maize for milling" autocomplete="off"></div>`;
          sync();
          okBtn.disabled = false;
          const kgBox = form.querySelector('#m-kg'); if (kgBox) kgBox.focus();
        }

        function sync() {
          const it = items[Number(form.querySelector('#m-item').value)];
          if (!it) return;
          const kg = num(form.querySelector('#m-kg').value);
          form.querySelector('#m-hand').innerHTML = `Available: <b>${esc(kgFmt(it.kg))}</b>${showCost && it.cost !== undefined ? ` · average cost <b>${esc(UI.money(it.cost))}</b> per kg` : ''}${kg > it.kg ? ' <span class="neg-text">That is more than is available.</span>' : ''}`;
        }

        m.el.querySelector('#m-dir').addEventListener('click', (e) => {
          const b = e.target.closest('[data-d]'); if (!b || b.dataset.d === dir) return;
          dir = b.dataset.d; paintForm();
        });
        form.addEventListener('change', (e) => { if (e.target.id === 'm-item') sync(); });
        form.addEventListener('input', (e) => { if (e.target.id === 'm-kg') sync(); });

        okBtn.addEventListener('click', async () => {
          m.error('');
          const it = items[Number(form.querySelector('#m-item').value)];
          const kg = num(form.querySelector('#m-kg').value);
          if (!it) return;
          if (!(kg > 0)) { m.error('Enter the quantity in kg.'); return; }
          if (kg > it.kg + 0.0001) { m.error(`Only ${kgFmt(it.kg)} of ${it.name} is available.`); return; }
          const b = { item_id: it.id, from_pool: DIR[dir].from, to_pool: DIR[dir].to, quantity_kg: kg, transfer_date: form.querySelector('#m-date').value || today() };
          const costEl = form.querySelector('#m-cost');
          if (costEl && num(costEl.value) > 0) b.unit_cost_per_kg = num(costEl.value);
          const reason = form.querySelector('#m-reason').value.trim(); if (reason) b.reason = reason;
          m.busy(okBtn, true);
          try {
            await Api.post('/stock/transfers', b);
            m.close();
            UI.toast(`Moved ${kgFmt(kg)} of ${it.name}: ${DIR[dir].label}`);
            load(true);
          } catch (err) { m.error(err.message); m.busy(okBtn, false); }
        });

        paintForm();
      }

      paint();
      load();
    },
  });
})();