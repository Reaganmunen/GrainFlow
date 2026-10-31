/**
 * Stock screens: Mill > Mill stock (#/mill/stock) and Cereals > Stock (#/cereal/stock).
 * One factory, two pools. Tabs: On hand, Movements and (mill only) Customer grain.
 * Uses /api/stock, /stock/movements, /stock/customer-grain, /stock/opening, /items and /items/:id/units.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const first = (r, ...keys) => { for (const k of keys) if (r[k] !== undefined && r[k] !== null) return r[k]; return undefined; };
  const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const fmtKg = (n) => `${num(n).toLocaleString('en-KE', { maximumFractionDigits: 1 })} kg`;
  const stamp = (v) => new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

  function stockPage({ path, title, pool, icon, tileClass }) {
    GF.page(path, {
      title,
      render(el) {
        const mill = pool === 'MILL_STOCK';
        const s = {
          tab: 'hand', rows: [], loading: true, failed: '', search: '', lowOnly: false,
          grain: [], grainLoaded: false,
          mv: [], mvPage: 1, mvPages: 1, mvTotal: 0, mvType: '', mvFrom: '', mvTo: '', mvTypes: new Set(),
        };

        el.innerHTML = `<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>`;
        const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

        GF.setActions(GF.can('stock.opening')
          ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="opening-btn" type="button"><i class="bi bi-box-arrow-in-down"></i>Add opening stock</button>' : '');
        const openBtn = document.getElementById('opening-btn');
        if (openBtn) openBtn.addEventListener('click', () => openOpening());

        // -------------------------------------------------------- data
        async function loadHand(quiet) {
          try {
            s.rows = (await Api.get(`/stock?pool=${pool}&limit=200`)) || [];
            s.failed = '';
          } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
          s.loading = false; paint();
        }
        async function loadMoves() {
          s.loading = true; paintTable();
          try {
            const q = new URLSearchParams({ pool, limit: 50, page: s.mvPage });
            if (s.mvType) q.set('movement_type', s.mvType);
            if (s.mvFrom) q.set('from', s.mvFrom);
            if (s.mvTo) q.set('to', s.mvTo);
            const rows = (await Api.get(`/stock/movements?${q}`)) || [];
            s.mv = rows;
            s.mvPages = (rows.pagination && rows.pagination.pages) || 1;
            s.mvTotal = (rows.pagination && rows.pagination.total) || rows.length;
            rows.forEach((r) => { if (r.movement_type) s.mvTypes.add(r.movement_type); });
            s.failed = '';
          } catch (err) { s.failed = err.message; UI.toast(err.message, 'error'); }
          s.loading = false; paint();
        }
        async function loadGrain() {
          s.loading = true; paintTable();
          try { s.grain = (await Api.get('/stock/customer-grain')) || []; s.failed = ''; } catch (err) { s.failed = err.message; UI.toast(err.message, 'error'); }
          s.grainLoaded = true; s.loading = false; paint();
        }

        // -------------------------------------------------------- helpers over view columns
        const qty = (r) => num(first(r, 'quantity_kg', 'qty_kg', 'on_hand_kg'));
        const reorder = (r) => first(r, 'reorder_level_kg', 'reorder_level');
        const cost = (r) => first(r, 'avg_cost_per_kg', 'avg_cost', 'cost_per_kg', 'average_cost');
        const value = (r) => { const v = first(r, 'stock_value', 'value', 'total_value'); if (v !== undefined) return num(v); const c = cost(r); return c !== undefined ? qty(r) * num(c) : undefined; };
        const showValue = () => GF.can('reports.profit') && s.rows.some((r) => value(r) !== undefined);
        const state = (r) => (qty(r) <= 0 ? 'out' : r.is_low ? 'low' : 'ok');
        const rowsHand = () => s.rows.filter((r) => {
          if (s.lowOnly && state(r) === 'ok') return false;
          if (s.search) { const q = s.search.toLowerCase(); if (![r.item_name, r.sku, r.grain].some((v) => String(v || '').toLowerCase().includes(q))) return false; }
          return true;
        });

        // -------------------------------------------------------- painting
        function paintKpis() {
          const total = s.rows.reduce((t, r) => t + qty(r), 0);
          const low = s.rows.filter((r) => state(r) === 'low').length;
          const out = s.rows.filter((r) => state(r) === 'out').length;
          const val = s.rows.reduce((t, r) => t + (value(r) || 0), 0);
          const kpi = (ic, label, v, badge) => `<div class="kpi"><div class="tile ${tileClass}"><i class="bi ${ic}"></i></div>
            <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${v}</div></div>${badge || ''}</div>`;
          const grainKg = s.grain.reduce((t, g) => { const k = Object.keys(g).find((x) => /kg/i.test(x)); return t + (k ? num(g[k]) : 0); }, 0);
          kpisEl.innerHTML =
            kpi('bi-boxes', 'Items in stock', String(s.rows.filter((r) => qty(r) > 0).length), `<span class="gf-badge gf-badge-green">${s.rows.length} tracked</span>`) +
            kpi('bi-speedometer', 'Total on hand', `${num(total).toLocaleString('en-KE', { maximumFractionDigits: 0 })} <small>kg</small>`) +
            kpi('bi-exclamation-triangle', 'Low or out of stock', String(low + out),
              low + out ? `<span class="gf-badge gf-badge-red">${out} out</span>` : '<span class="gf-badge gf-badge-green">All fine</span>') +
            (mill
              ? kpi('bi-person-check', 'Customer grain held', s.grainLoaded ? `${num(grainKg).toLocaleString('en-KE', { maximumFractionDigits: 0 })} <small>kg</small>` : '<small>Open the tab</small>')
              : (GF.can('reports.profit') && s.rows.some((r) => value(r) !== undefined)
                ? kpi('bi-cash-stack', 'Stock value at cost', UI.money(val)) : kpi('bi-box-seam', 'Items out of stock', String(out))));
        }

        function paintToolbar() {
          const tab = (k, label) => `<button type="button" class="${s.tab === k ? 'on' : ''}" data-tab="${k}">${label}</button>`;
          let extra = '';
          if (s.tab === 'hand') {
            extra = `<button type="button" class="fchip outline ${s.lowOnly ? 'on' : ''}" data-low>Low or out <span class="n">${s.rows.filter((r) => state(r) !== 'ok').length}</span></button>
              <span class="grow"></span><label class="search"><i class="bi bi-search"></i><input type="search" id="st-search" placeholder="Find an item" value="${esc(s.search)}" aria-label="Find an item"></label>
              <span class="count-note">Showing ${rowsHand().length} of ${s.rows.length}</span>`;
          } else if (s.tab === 'moves') {
            extra = `<select class="gf-input plain" id="mv-type" style="width:auto;height:32px;font-size:13px" aria-label="Movement type"><option value="">All movements</option>
                ${[...s.mvTypes].map((t) => `<option value="${esc(t)}" ${t === s.mvType ? 'selected' : ''}>${esc(pretty(t))}</option>`).join('')}</select>
              <span class="field-inline"><input class="gf-input plain" id="mv-from" type="date" value="${esc(s.mvFrom)}" aria-label="From date"><span class="muted">to</span><input class="gf-input plain" id="mv-to" type="date" value="${esc(s.mvTo)}" aria-label="To date"></span>
              <span class="grow"></span><span class="count-note">${s.mvTotal} movements</span>`;
          } else {
            extra = `<span class="grow"></span><span class="count-note">${s.grain.length} lines held</span>`;
          }
          toolbarEl.innerHTML = `<div class="gf-seg" style="min-width:${mill ? 330 : 220}px">${tab('hand', 'On hand')}${tab('moves', 'Movements')}${mill ? tab('grain', 'Customer grain') : ''}</div><span class="sep"></span>${extra}`;
        }

        const err = () => (s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)}</span></div>` : '');
        const empty = (ic, h, p, action = '') => `${err()}<div class="dt-empty"><div class="tile ${tileClass}"><i class="bi ${ic}"></i></div><h3>${h}</h3><p>${p}</p>${action}</div>`;

        function paintTable() {
          if (s.loading) { hostEl.innerHTML = '<div class="dt-empty">Loading…</div>'; return; }

          if (s.tab === 'hand') {
            const rows = rowsHand();
            if (!s.rows.length) {
              hostEl.innerHTML = empty('bi-boxes', 'No stock recorded yet',
                'Add the quantity you have on the shelves today. After that, purchases, sales and mill jobs keep it up to date.',
                GF.can('stock.opening') ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-opening type="button">Add opening stock</button>' : '');
              return;
            }
            if (!rows.length) { hostEl.innerHTML = empty('bi-search', 'Nothing matches', 'Try a different name or turn off the low stock filter.'); return; }
            const sv = showValue();
            hostEl.innerHTML = `${err()}<div class="dt-wrap"><table class="dt"><thead><tr><th>Item</th><th>Kind</th><th class="r">On hand</th><th class="r">Reorder at</th>${sv ? '<th class="r">Cost per kg</th><th class="r">Value</th>' : ''}<th>Status</th></tr></thead><tbody>
              ${rows.map((r) => {
                const st = state(r), ro = reorder(r), c = cost(r), v = value(r);
                return `<tr><td><strong>${esc(r.item_name)}</strong><div class="muted" style="font-size:12px">${esc(r.sku || '')}${r.grain ? ` · ${esc(r.grain)}` : ''}</div></td>
                  <td>${r.kind ? `<span class="pill">${esc(pretty(r.kind))}</span>` : '–'}</td>
                  <td class="r"><b>${fmtKg(qty(r))}</b></td><td class="r muted">${ro ? fmtKg(ro) : '–'}</td>
                  ${sv ? `<td class="r">${c !== undefined ? UI.money(c) : '–'}</td><td class="r">${v !== undefined ? UI.money(v) : '–'}</td>` : ''}
                  <td>${st === 'out' ? '<span class="pill red">Out of stock</span>' : st === 'low' ? '<span class="pill amber">Low</span>' : '<span class="pill green">OK</span>'}</td></tr>`;
              }).join('')}</tbody></table></div>`;
            return;
          }

          if (s.tab === 'moves') {
            if (!s.mv.length) { hostEl.innerHTML = empty('bi-arrow-left-right', 'No movements found', 'Every purchase, sale, mill job and adjustment shows up here once it happens.'); return; }
            hostEl.innerHTML = `${err()}<div class="dt-wrap"><table class="dt"><thead><tr><th>When</th><th>Item</th><th>What happened</th><th class="r">Quantity</th><th>Customer</th><th>By</th><th>Note</th></tr></thead><tbody>
              ${s.mv.map((r) => {
                const q = num(first(r, 'quantity_kg', 'qty_kg', 'quantity'));
                return `<tr><td class="nowrap">${esc(stamp(r.movement_date))}</td><td><strong>${esc(r.item_name)}</strong></td>
                  <td><span class="pill">${esc(pretty(r.movement_type))}</span></td>
                  <td class="r ${q < 0 ? 'neg' : 'pos'}">${q > 0 ? '+' : ''}${fmtKg(q)}</td>
                  <td>${esc(r.customer_name || '–')}</td><td>${esc(r.user_name || '–')}</td>
                  <td class="muted">${esc(first(r, 'note', 'notes', 'reference', 'description') || '')}</td></tr>`;
              }).join('')}</tbody></table></div>
              <div class="pager"><span>Page ${s.mvPage} of ${s.mvPages}</span><button type="button" data-pg="-1" ${s.mvPage <= 1 ? 'disabled' : ''}>Previous</button><button type="button" data-pg="1" ${s.mvPage >= s.mvPages ? 'disabled' : ''}>Next</button></div>`;
            return;
          }

          // customer grain (mill only)
          if (!s.grain.length) { hostEl.innerHTML = empty('bi-person-check', 'No customer grain waiting', 'Grain brought in for milling appears here until the flour is collected. It is never counted as the mill’s own stock.'); return; }
          hostEl.innerHTML = `${err()}<div class="dt-wrap"><table class="dt"><thead><tr><th>Customer</th><th>Grain</th><th class="r">Held at the mill</th></tr></thead><tbody>
            ${s.grain.map((g) => {
              const k = Object.keys(g).find((x) => /kg/i.test(x));
              const nm = g.full_name || g.customer_name || 'Customer';
              return `<tr><td><div class="cell-who"><span class="gf-avatar" style="background:${UI.avatarColor(nm)}">${esc(UI.initials(nm))}</span><div><strong>${esc(nm)}</strong></div></div></td>
                <td>${esc(g.grain || g.grain_name || g.item_name || '–')}</td><td class="r"><b>${k ? fmtKg(g[k]) : '–'}</b></td></tr>`;
            }).join('')}</tbody></table></div>`;
        }

        function paint() { paintKpis(); paintToolbar(); paintTable(); }

        // -------------------------------------------------------- events
        toolbarEl.addEventListener('click', (e) => {
          const t = e.target.closest('[data-tab]');
          if (t) {
            s.tab = t.dataset.tab; s.failed = '';
            if (s.tab === 'hand') { paint(); loadHand(true); }
            else if (s.tab === 'moves') { s.mvPage = 1; loadMoves(); }
            else loadGrain();
            return;
          }
          if (e.target.closest('[data-low]')) { s.lowOnly = !s.lowOnly; paint(); }
        });
        toolbarEl.addEventListener('change', (e) => {
          if (e.target.id === 'mv-type') { s.mvType = e.target.value; s.mvPage = 1; loadMoves(); }
          if (e.target.id === 'mv-from') { s.mvFrom = e.target.value; s.mvPage = 1; loadMoves(); }
          if (e.target.id === 'mv-to') { s.mvTo = e.target.value; s.mvPage = 1; loadMoves(); }
        });
        toolbarEl.addEventListener('input', UI.debounce((e) => {
          if (e.target.id !== 'st-search') return;
          s.search = e.target.value.trim(); paintTable(); paintToolbar();
          const box = toolbarEl.querySelector('#st-search');
          if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        }, 200));
        hostEl.addEventListener('click', (e) => {
          if (e.target.closest('[data-opening]')) { openOpening(); return; }
          const pg = e.target.closest('[data-pg]');
          if (pg) { s.mvPage = Math.min(Math.max(1, s.mvPage + Number(pg.dataset.pg)), s.mvPages); loadMoves(); }
        });

        // -------------------------------------------------------- opening stock
        async function openOpening() {
          const m = UI.modal({
            title: mill ? 'Add opening mill stock' : 'Add opening cereal stock',
            body: '<div class="gf-hint" data-loading>Loading items…</div>',
            foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button" disabled>Save stock</button>',
          });
          let items;
          try { items = (await Api.get('/items?active=true&limit=200')) || []; } catch (e) { m.error(e.message); return; }
          items = items.filter((i) => i.track_stock !== false);
          if (!items.length) { m.error('No products yet. Add them under Products in the menu first.'); return; }

          const body = m.el.querySelector('.gf-modal-body');
          body.querySelector('[data-loading]').remove();
          body.insertAdjacentHTML('beforeend', `
            <p>Use this once per item to enter what you have today. Afterwards, stock changes through purchases, sales, mill jobs and adjustments.</p>
            <div class="gf-field"><label class="gf-label" for="os-item">Item</label>
              <select class="gf-input plain" id="os-item">${items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></div>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="os-qty">Quantity</label><input class="gf-input plain" id="os-qty" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0"></div>
              <div class="gf-field"><label class="gf-label" for="os-unit">Counted in</label><select class="gf-input plain" id="os-unit"></select></div>
            </div>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="os-cost">Cost per kg (KES)</label><input class="gf-input plain" id="os-cost" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0"></div>
              <div class="gf-field"><label class="gf-label">In kilograms</label><div class="gf-hint" id="os-kg" style="padding-top:12px">Enter a quantity.</div></div>
            </div>`);
          const $ = (q) => body.querySelector(q);
          const save = m.el.querySelector('[data-ok]');
          let units = [];
          const calc = () => {
            const u = units.find((x) => String(x.unit_id) === $('#os-unit').value);
            const kg = num($('#os-qty').value) * (u ? num(u.kg_per_unit) : 1);
            $('#os-kg').innerHTML = kg > 0 ? `<b>${fmtKg(kg)}</b>${num($('#os-cost').value) ? ` worth <b>${UI.money(kg * num($('#os-cost').value))}</b>` : ''}` : 'Enter a quantity.';
            return kg;
          };
          async function loadUnits() {
            try { units = (await Api.get(`/items/${$('#os-item').value}/units`)) || []; } catch (_) { units = []; }
            if (!units.length) units = [{ unit_id: 0, code: 'KG', name: 'Kilogram', kg_per_unit: 1 }];
            $('#os-unit').innerHTML = units.map((u) => `<option value="${u.unit_id}">${esc(u.name || u.code)}${num(u.kg_per_unit) !== 1 ? ` (${num(u.kg_per_unit)} kg)` : ''}</option>`).join('');
            calc();
          }
          $('#os-item').addEventListener('change', loadUnits);
          ['#os-qty', '#os-unit', '#os-cost'].forEach((q) => $(q).addEventListener('input', calc));
          await loadUnits();
          save.disabled = false;

          save.addEventListener('click', async () => {
            const kg = calc();
            if (!(kg > 0)) { m.error('Enter a quantity greater than 0.'); return; }
            m.error(''); m.busy(save, true);
            try {
              await Api.post('/stock/opening', { item_id: Number($('#os-item').value), pool, quantity_kg: kg, cost_per_kg: num($('#os-cost').value) });
              m.close(); UI.toast('Opening stock saved'); s.loading = true; await loadHand(true);
            } catch (e) { m.busy(save, false); m.error(e.message); }
          });
        }

        paint();
        loadHand();
        if (mill) Api.get('/stock/customer-grain').then((g) => { s.grain = g || []; s.grainLoaded = true; paintKpis(); }).catch(() => {});
      },
    });
  }

  stockPage({ path: 'mill/stock', title: 'Mill stock', pool: 'MILL_STOCK', icon: 'bi-boxes', tileClass: 'mill' });
  stockPage({ path: 'cereal/stock', title: 'Stock', pool: 'CEREAL_STOCK', icon: 'bi-boxes', tileClass: 'cereal' });
})();