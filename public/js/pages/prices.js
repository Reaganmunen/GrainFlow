/**
 * Cereals > Price list (#/cereal/prices) and Cereals > Minimum prices (#/cereal/min-prices)
 * Price list: retail and wholesale price for every sellable unit of an item (kg, bag, tin), with history.
 * Minimum prices: the lowest price per kg a cashier may sell at without a manager.
 * Uses GET /items, /prices, /min-prices, /items/:id/units, PUT /prices/bulk, GET /prices/:id/history,
 * PUT/DELETE /min-prices/:itemId.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = (n) => num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  const stamp = (v) => new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
  const TIERS = [['RETAIL', 'Retail'], ['WHOLESALE', 'Wholesale']];

  /** Loads everything both pages need. A failed min-prices read (no permission) just means no minimums shown. */
  async function loadAll() {
    const [items, prices, mins] = await Promise.all([
      Api.get('/items?active=true&limit=500'),
      Api.get('/prices'),
      Api.get('/min-prices').catch(() => []),
    ]);
    const byItem = {};
    (prices || []).forEach((p) => {
      const e = byItem[p.item_id] || (byItem[p.item_id] = { RETAIL: [], WHOLESALE: [] });
      (e[p.tier] || (e[p.tier] = [])).push(p);
    });
    const minMap = {};
    (mins || []).forEach((m) => { minMap[m.item_id] = num(m.min_price_per_kg); });
    return { items: items || [], byItem, minMap };
  }
  const lowest = (rows) => (rows && rows.length ? Math.min(...rows.map((r) => num(r.price_per_kg)).filter((v) => v > 0)) : 0);

  // ====================================================================== price list
  GF.page('cereal/prices', {
    title: 'Price list',
    render(el) {
      const s = { items: [], byItem: {}, minMap: {}, loading: true, failed: '', search: '', chip: '' };
      const canEdit = GF.can('prices.update');
      el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>';
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');
      GF.setActions('');

      async function load(quiet) {
        try { Object.assign(s, await loadAll()); s.failed = ''; }
        catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false; paint();
      }
      const priced = (it) => !!(s.byItem[it.id] && (s.byItem[it.id].RETAIL.length || s.byItem[it.id].WHOLESALE.length));

      function paintKpis() {
        const n = s.items.length, p = s.items.filter(priced).length;
        const kpi = (icon, label, value, badge) => `<div class="kpi"><div class="tile"><i class="bi ${icon}"></i></div>
          <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${badge || ''}</div>`;
        kpisEl.innerHTML =
          kpi('bi-box-seam', 'Items', String(n)) +
          kpi('bi-tags', 'Priced', String(p)) +
          kpi('bi-exclamation-circle', 'Not priced', String(n - p), n - p ? '<span class="gf-badge gf-badge-amber">Cannot be sold</span>' : '') +
          kpi('bi-shield-lock', 'With a minimum', String(s.items.filter((i) => s.minMap[i.id] > 0).length));
      }
      function paintToolbar() {
        toolbarEl.innerHTML = `<button type="button" class="fchip outline ${s.chip === 'unpriced' ? 'on' : ''}" data-chip="unpriced">Not priced</button>
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="pr-search" placeholder="Search item or SKU" value="${esc(s.search)}" aria-label="Search items"></label>`;
      }
      const chips = (rows) => (rows && rows.length
        ? rows.map((r) => `<span class="pchip" title="${fmt(r.price_per_kg)} per kg"><span>${esc(r.unit)}</span><b>${fmt(r.price)}</b></span>`).join('')
        : '<span class="muted">–</span>');

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = '<div class="dt-empty">Loading prices…</div>'; return; }
        const err = s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)}</span></div>` : '';
        const term = s.search.toLowerCase();
        const rows = s.items.filter((i) => (!term || String(i.name).toLowerCase().includes(term) || String(i.sku || '').toLowerCase().includes(term)) && (s.chip !== 'unpriced' || !priced(i)));
        if (!rows.length) {
          hostEl.innerHTML = `${err}<div class="dt-empty"><div class="tile"><i class="bi bi-tags"></i></div><h3>${s.search || s.chip ? 'No items match' : 'No items yet'}</h3>
            <p>${s.search || s.chip ? 'Try clearing the filters.' : 'Add the grains you sell in the catalogue first.'}</p></div>`;
          return;
        }
        const body = rows.map((i) => {
          const e = s.byItem[i.id] || { RETAIL: [], WHOLESALE: [] };
          const min = s.minMap[i.id];
          return `<tr class="${canEdit ? 'click' : ''}" data-id="${i.id}">
            <td><div class="cell-plain"><strong>${esc(i.name)}</strong><span>${esc(i.sku || '')}</span></div></td>
            <td><div class="pchips">${chips(e.RETAIL)}</div></td>
            <td><div class="pchips">${chips(e.WHOLESALE)}</div></td>
            <td class="r ${min > 0 ? '' : 'muted'}">${min > 0 ? `${fmt(min)} /kg` : '–'}</td>
            <td>${priced(i) ? '' : '<span class="pill amber">Not priced</span>'}</td></tr>`;
        }).join('');
        hostEl.innerHTML = `${err}<div class="dt-wrap"><table class="dt"><thead><tr><th>Item</th><th>Retail</th><th>Wholesale</th><th class="r">Minimum</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
      }
      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      toolbarEl.addEventListener('click', (e) => { const c = e.target.closest('[data-chip]'); if (c) { s.chip = s.chip === c.dataset.chip ? '' : c.dataset.chip; paint(); } });
      toolbarEl.addEventListener('input', (e) => { if (e.target.id === 'pr-search') { s.search = e.target.value.trim(); paintTable(); } });
      hostEl.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (tr && canEdit) openEdit(s.items.find((i) => i.id === Number(tr.dataset.id)));
      });

      // ------------------------------------------------------------ edit one item's prices
      async function openEdit(item) {
        if (!item) return;
        const m = UI.modal({ title: item.name, wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
        let units;
        try { units = ((await Api.get(`/items/${item.id}/units`)) || []).filter((u) => u.is_sellable !== false); }
        catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); return; }
        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        if (!units.length) { m.error('This item has no sellable units. Add a unit to it in the catalogue first.'); return; }

        const e = s.byItem[item.id] || { RETAIL: [], WHOLESALE: [] };
        const current = (tier, unit) => (e[tier] || []).find((p) => p.unit === unit.code);
        const min = s.minMap[item.id] || 0;
        const kgOf = (u) => num(u.kg_per_unit) || 1;
        const rows = units.map((u) => `<tr data-u="${u.unit_id}">
          <td><strong>${esc(u.name)}</strong><div class="muted" style="font-size:12px">${kgOf(u) === 1 ? '1 kg' : `${fmt(kgOf(u))} kg`}</div></td>
          ${TIERS.map(([t]) => {
            const c = current(t, u);
            return `<td><input class="gf-input plain pe-in" type="number" inputmode="decimal" min="0" step="any" data-tier="${t}" data-orig="${c ? num(c.price) : ''}" value="${c ? num(c.price) : ''}" placeholder="Not set" aria-label="${t === 'RETAIL' ? 'Retail' : 'Wholesale'} price for ${esc(u.name)}">
              <div class="pe-hint" data-hint></div></td>`;
          }).join('')}</tr>`).join('');
        body.insertAdjacentHTML('beforeend', `
          ${min > 0 ? `<div class="gf-note gf-note-amber"><i class="bi bi-shield-lock"></i><span>Minimum price: <b>KES ${fmt(min)}</b> per kg. Prices below it are rejected.</span></div>` : ''}
          <div class="mini-table"><table class="dt"><thead><tr><th>Unit</th><th>Retail (KES)</th><th>Wholesale (KES)</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="gf-hint">Leave a box empty to keep things as they are. A changed price starts today and the old one is kept in the history.</div>`);
        const foot = document.createElement('div');
        foot.className = 'gf-modal-foot';
        foot.innerHTML = `${GF.can('prices.update') ? '<button class="gf-btn gf-btn-ghost" type="button" data-history><i class="bi bi-clock-history"></i>History</button>' : ''}
          <span class="grow"></span><button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-green" type="button" data-save>Save prices</button>`;
        m.el.querySelector('.gf-modal').appendChild(foot);

        function hints() {
          body.querySelectorAll('tr[data-u]').forEach((tr) => {
            const u = units.find((x) => String(x.unit_id) === tr.dataset.u);
            tr.querySelectorAll('input').forEach((inp) => {
              const v = num(inp.value), h = inp.parentElement.querySelector('[data-hint]');
              const perKg = v > 0 ? v / kgOf(u) : 0;
              const below = min > 0 && perKg > 0 && perKg + 0.0001 < min;
              h.className = `pe-hint ${below ? 'red' : ''}`;
              h.textContent = perKg > 0 && kgOf(u) !== 1 ? `${fmt(r2(perKg))} per kg${below ? ' · below the minimum' : ''}` : (below ? 'Below the minimum' : '');
              inp.classList.toggle('is-bad', below);
            });
          });
        }
        body.addEventListener('input', (ev) => { if (ev.target.matches('.pe-in')) hints(); });
        hints();

        foot.addEventListener('click', async (ev) => {
          const b = ev.target.closest('button'); if (!b) return;
          if (b.hasAttribute('data-history')) { openHistory(item); return; }
          if (!b.hasAttribute('data-save')) return;
          m.error('');
          const prices = [];
          body.querySelectorAll('tr[data-u]').forEach((tr) => {
            tr.querySelectorAll('input').forEach((inp) => {
              if (inp.value === '') return;
              const v = num(inp.value);
              if (inp.dataset.orig !== '' && Math.abs(v - num(inp.dataset.orig)) < 0.0001) return;
              prices.push({ item_id: item.id, tier_code: inp.dataset.tier, unit_id: Number(tr.dataset.u), price: v });
            });
          });
          if (!prices.length) { m.close(); UI.toast('No changes to save'); return; }
          if (prices.some((p) => !(p.price > 0))) { m.error('Prices must be more than 0.'); return; }
          m.busy(b, true);
          try {
            await Api.put('/prices/bulk', { prices });
            m.close(); UI.toast(`${prices.length} price${prices.length === 1 ? '' : 's'} updated`); load(true);
          } catch (err) { m.error(err.message); m.busy(b, false); }
        });
      }

      async function openHistory(item) {
        const m = UI.modal({ title: `Price history · ${item.name}`, wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
        try {
          const rows = (await Api.get(`/prices/${item.id}/history`)) || [];
          const body = m.el.querySelector('.gf-modal-body');
          body.querySelector('[data-loading]').remove();
          body.insertAdjacentHTML('beforeend', rows.length
            ? `<ul class="timeline">${rows.map((r) => `<li><span class="dot"></span>
                <span><b>${esc(r.tier === 'RETAIL' ? 'Retail' : 'Wholesale')} · ${esc(r.unit)}</b> KES ${fmt(r.price)}${r.effective_to ? '' : ' <span class="pill green">Current</span>'}${r.set_by_name ? ` · ${esc(r.set_by_name)}` : ''}</span>
                <span class="when">${esc(stamp(r.effective_from))}${r.effective_to ? ` → ${esc(stamp(r.effective_to))}` : ''}</span></li>`).join('')}</ul>`
            : '<div class="gf-hint">No price changes recorded yet.</div>');
        } catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); }
      }

      paint();
      load();
    },
  });

  // ====================================================================== minimum prices
  GF.page('cereal/min-prices', {
    title: 'Minimum prices',
    render(el) {
      const s = { items: [], byItem: {}, minMap: {}, loading: true, failed: '', search: '', chip: '' };
      const canEdit = GF.can('prices.min_price');
      el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>';
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');
      GF.setActions('');

      async function load(quiet) {
        try { Object.assign(s, await loadAll()); s.failed = ''; }
        catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false; paint();
      }
      const low = (i) => { const e = s.byItem[i.id]; return { retail: lowest(e && e.RETAIL), wholesale: lowest(e && e.WHOLESALE) }; };
      const below = (i) => {
        const min = s.minMap[i.id]; if (!(min > 0)) return false;
        const l = low(i);
        return (l.retail > 0 && l.retail + 0.0001 < min) || (l.wholesale > 0 && l.wholesale + 0.0001 < min);
      };

      function paintKpis() {
        const set = s.items.filter((i) => s.minMap[i.id] > 0).length;
        const bad = s.items.filter(below).length;
        const kpi = (icon, label, value, badge) => `<div class="kpi"><div class="tile"><i class="bi ${icon}"></i></div>
          <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${badge || ''}</div>`;
        kpisEl.innerHTML =
          kpi('bi-box-seam', 'Items', String(s.items.length)) +
          kpi('bi-shield-check', 'Minimum set', String(set)) +
          kpi('bi-shield-exclamation', 'No minimum', String(s.items.length - set)) +
          kpi('bi-exclamation-triangle', 'Priced below minimum', String(bad), bad ? '<span class="gf-badge gf-badge-amber">Check the price list</span>' : '');
      }
      function paintToolbar() {
        const c = (key, label) => `<button type="button" class="fchip outline ${s.chip === key ? 'on' : ''}" data-chip="${key}">${label}</button>`;
        toolbarEl.innerHTML = `${c('none', 'No minimum')}${c('set', 'Minimum set')}${c('below', 'Priced below minimum')}<span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="mp-search" placeholder="Search item or SKU" value="${esc(s.search)}" aria-label="Search items"></label>`;
      }
      function paintTable() {
        if (s.loading) { hostEl.innerHTML = '<div class="dt-empty">Loading…</div>'; return; }
        const err = s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)}</span></div>` : '';
        const term = s.search.toLowerCase();
        const rows = s.items.filter((i) => {
          if (term && !String(i.name).toLowerCase().includes(term) && !String(i.sku || '').toLowerCase().includes(term)) return false;
          if (s.chip === 'none') return !(s.minMap[i.id] > 0);
          if (s.chip === 'set') return s.minMap[i.id] > 0;
          if (s.chip === 'below') return below(i);
          return true;
        });
        if (!rows.length) {
          hostEl.innerHTML = `${err}<div class="dt-empty"><div class="tile"><i class="bi bi-shield-lock"></i></div><h3>No items match</h3><p>Try clearing the filters.</p></div>`;
          return;
        }
        const body = rows.map((i) => {
          const min = s.minMap[i.id], l = low(i);
          const st = !(min > 0) ? '<span class="pill">No minimum</span>' : below(i) ? '<span class="pill red">Price below minimum</span>' : '<span class="pill green">OK</span>';
          return `<tr class="${canEdit ? 'click' : ''}" data-id="${i.id}">
            <td><div class="cell-plain"><strong>${esc(i.name)}</strong><span>${esc(i.sku || '')}</span></div></td>
            <td class="r ${l.retail ? '' : 'muted'}">${l.retail ? fmt(l.retail) : '–'}</td>
            <td class="r ${l.wholesale ? '' : 'muted'}">${l.wholesale ? fmt(l.wholesale) : '–'}</td>
            <td class="r ${min > 0 ? '' : 'muted'}"><b>${min > 0 ? fmt(min) : '–'}</b></td><td>${st}</td></tr>`;
        }).join('');
        hostEl.innerHTML = `${err}<div class="dt-wrap"><table class="dt"><thead><tr><th>Item</th><th class="r">Lowest retail /kg</th><th class="r">Lowest wholesale /kg</th><th class="r">Minimum /kg</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></div>`;
      }
      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      toolbarEl.addEventListener('click', (e) => { const c = e.target.closest('[data-chip]'); if (c) { s.chip = s.chip === c.dataset.chip ? '' : c.dataset.chip; paint(); } });
      toolbarEl.addEventListener('input', (e) => { if (e.target.id === 'mp-search') { s.search = e.target.value.trim(); paintTable(); } });
      hostEl.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (tr && canEdit) openEdit(s.items.find((i) => i.id === Number(tr.dataset.id)));
      });

      function openEdit(item) {
        if (!item) return;
        const cur = s.minMap[item.id] || 0, l = low(item);
        const m = UI.modal({
          title: `Minimum price · ${item.name}`,
          body: `<div class="gf-note gf-note-amber"><i class="bi bi-info-circle"></i><span>Cashiers cannot sell below this price per kg without a manager. Changing it does not change existing prices, so check the price list afterwards.</span></div>
            ${l.retail || l.wholesale ? `<div class="gf-hint">Lowest prices now: ${l.retail ? `retail <b>${fmt(l.retail)}</b>` : ''}${l.retail && l.wholesale ? ' · ' : ''}${l.wholesale ? `wholesale <b>${fmt(l.wholesale)}</b>` : ''} per kg</div>` : ''}
            <div class="gf-field"><label class="gf-label" for="mp-min">Minimum price per kg (KES)</label>
              <input class="gf-input plain" id="mp-min" type="number" inputmode="decimal" min="0" step="any" value="${cur > 0 ? cur : ''}" placeholder="e.g. 95"></div>`,
          foot: `${cur > 0 ? '<button class="gf-btn gf-btn-ghost" type="button" data-remove><i class="bi bi-trash"></i>Remove minimum</button>' : ''}
            <span class="grow"></span><button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-green" type="button" data-save>Save</button>`,
        });
        m.el.addEventListener('click', async (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.hasAttribute('data-save')) {
            m.error('');
            const v = m.el.querySelector('#mp-min').value;
            if (v === '' || !(num(v) > 0)) { m.error('Enter a minimum price more than 0, or remove the minimum.'); return; }
            m.busy(b, true);
            try { await Api.put(`/min-prices/${item.id}`, { min_price_per_kg: num(v) }); m.close(); UI.toast('Minimum price saved'); load(true); }
            catch (err) { m.error(err.message); m.busy(b, false); }
          } else if (b.hasAttribute('data-remove')) {
            m.error(''); m.busy(b, true);
            try { await Api.del(`/min-prices/${item.id}`); m.close(); UI.toast('Minimum price removed'); load(true); }
            catch (err) { m.error(err.message); m.busy(b, false); }
          }
        });
      }

      paint();
      load();
    },
  });
})();