/**
 * Shared > Catalogue  (#/shared/catalogue)
 * Every item the business buys, mills or sells: SKU, kind, which shop it belongs to, stock, and the units it is sold in
 * (kg, bag, tin ...). Anyone who sells can look; catalogue.manage can add and change items and their units.
 * Uses GET /items, POST /items, PUT /items/:id, GET /grains /grades /units, GET/PUT/DELETE /items/:id/units/:unitId.
 * With no connection it shows the saved till catalogue (read only).
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const fmt = (n) => num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  const pretty = (v) => String(v || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  const MODULE_LABEL = { MILL: 'Posho mill', CEREAL: 'Cereals', SHARED: 'Both' };

  GF.page('shared/catalogue', {
    title: 'Catalogue',
    render(el) {
      const canManage = GF.can('catalogue.manage');
      const s = { items: [], search: '', kind: '', module: '', inactive: false, loading: true, failed: '', offline: false, lookups: null };

      el.innerHTML = '<div class="toolbar" id="toolbar"></div><div id="host"></div>';
      const toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#host');
      GF.setActions(canManage ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="add-item" type="button"><i class="bi bi-plus-lg"></i>Add item</button>' : '');
      const addBtn = document.getElementById('add-item');
      if (addBtn) addBtn.addEventListener('click', () => openForm());

      // ---------------------------------------------------------- data
      async function load(quiet) {
        s.failed = ''; s.offline = false;
        try {
          if (Offline.isOffline()) throw new ApiError('offline', 0, 'NETWORK');
          s.items = (await Api.get(`/items?limit=500${s.inactive ? '' : '&active=true'}`)) || [];
        } catch (err) {
          if (err.code === 'NETWORK') {
            // no connection: the prices saved on this computer for the till are the catalogue we can show
            const seen = new Map();
            for (const m of GF.modules) {
              const list = await Offline.read(`/sales/catalogue?module=${m}&tier=RETAIL`);
              (list || []).forEach((i) => seen.set(i.id, { id: i.id, sku: i.sku, name: i.name, kind: i.kind, owner_module: m, is_active: true,
                cereal_stock_kg: m === 'CEREAL' ? i.stock_kg : 0, mill_stock_kg: m === 'MILL' ? i.stock_kg : 0, _prices: i.prices }));
            }
            s.items = [...seen.values()]; s.offline = true;
          } else { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        }
        s.loading = false;
        paint();
      }

      async function lookups() {
        if (s.lookups) return s.lookups;
        const [grains, grades, units] = await Promise.all([Api.get('/grains'), Api.get('/grades'), Api.get('/units')]);
        s.lookups = { grains: grains || [], grades: grades || [], units: units || [] };
        return s.lookups;
      }

      // ---------------------------------------------------------- painting
      const visible = (i) => {
        if (s.kind && i.kind !== s.kind) return false;
        if (s.module && i.owner_module !== s.module) return false;
        if (s.search) {
          const q = s.search.toLowerCase();
          if (![i.name, i.sku, i.grain_name].some((v) => String(v || '').toLowerCase().includes(q))) return false;
        }
        return true;
      };

      function paintToolbar() {
        const kinds = [...new Set(s.items.map((i) => i.kind).filter(Boolean))].sort();
        const chip = (attr, val, label, on) => `<button type="button" class="fchip ${on ? 'on' : ''}" ${attr}="${esc(val)}">${esc(label)}</button>`;
        toolbarEl.innerHTML = `
          ${chip('data-kind', '', 'All kinds', !s.kind)}${kinds.map((k) => chip('data-kind', k, pretty(k), s.kind === k)).join('')}
          <span class="sep"></span>
          ${chip('data-mod', '', 'Both shops', !s.module)}${['MILL', 'CEREAL', 'SHARED'].filter((m) => m === 'SHARED' || GF.inModule(m)).map((m) => chip('data-mod', m, MODULE_LABEL[m], s.module === m)).join('')}
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="q" placeholder="Find item or SKU" value="${esc(s.search)}" aria-label="Find item"></label>
          ${canManage && !s.offline ? `<label class="gf-check"><input type="checkbox" id="inactive" ${s.inactive ? 'checked' : ''}> Show inactive</label>` : ''}
          <button type="button" class="icon-sq" data-refresh title="Refresh" aria-label="Refresh"><i class="bi bi-arrow-clockwise"></i></button>`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = '<div class="dt-empty">Loading catalogue…</div>'; return; }
        const rows = s.items.filter(visible);
        const note = s.offline
          ? '<div class="gf-note gf-note-amber" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>Offline. This is the catalogue saved on this computer for the till (read only). Changes need the internet.</span></div>'
          : s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-exclamation-circle"></i><span>${esc(s.failed)}</span></div>` : '';
        if (!rows.length) {
          hostEl.innerHTML = `${note}<div class="dt-empty"><div class="tile"><i class="bi bi-grid"></i></div><h3>${s.items.length ? 'No items match' : 'No items yet'}</h3>
            <p>${s.items.length ? 'Try a different search or filter.' : (canManage ? 'Add your first item with the button at the top.' : 'Ask the owner to add items.')}</p></div>`;
          return;
        }
        hostEl.innerHTML = `${note}<div class="dt-wrap"><table class="dt"><thead><tr>
          <th>SKU</th><th>Item</th><th>Kind</th><th>Shop</th><th>Stock</th><th>Status</th></tr></thead><tbody>
          ${rows.map((i) => {
            const stock = num(i.cereal_stock_kg) + num(i.mill_stock_kg);
            return `<tr class="${canManage && !s.offline ? 'click' : ''}" data-id="${i.id}">
              <td class="muted">${esc(i.sku || '–')}</td>
              <td><strong>${esc(i.name)}</strong>${i.grain_name ? `<div class="muted">${esc(i.grain_name)}${i.grade_name ? ` · ${esc(i.grade_name)}` : ''}</div>` : ''}</td>
              <td>${esc(pretty(i.kind) || '–')}</td>
              <td><span class="pill ${i.owner_module === 'MILL' ? 'amber' : i.owner_module === 'CEREAL' ? 'green' : ''}">${esc(MODULE_LABEL[i.owner_module] || '–')}</span></td>
              <td>${i.track_stock === false ? '<span class="muted">Not tracked</span>' : `${fmt(stock)} kg`}</td>
              <td>${i.is_active === false ? '<span class="pill red">Inactive</span>' : '<span class="pill green">Active</span>'}${i.is_millable ? ' <span class="pill amber">Millable</span>' : ''}</td></tr>`;
          }).join('')}</tbody></table></div>`;
      }

      function paint() { paintToolbar(); paintTable(); }

      // ---------------------------------------------------------- events
      toolbarEl.addEventListener('click', (e) => {
        const k = e.target.closest('[data-kind]'), m = e.target.closest('[data-mod]');
        if (k) { s.kind = k.dataset.kind; paint(); }
        else if (m) { s.module = m.dataset.mod; paint(); }
        else if (e.target.closest('[data-refresh]')) load();
      });
      toolbarEl.addEventListener('change', (e) => { if (e.target.id === 'inactive') { s.inactive = e.target.checked; load(); } });
      toolbarEl.addEventListener('input', UI.debounce((e) => {
        if (e.target.id !== 'q') return;
        s.search = e.target.value.trim();
        const pos = e.target.selectionStart;
        paintTable();
        const box = toolbarEl.querySelector('#q'); if (box) { box.focus(); box.setSelectionRange(pos, pos); }
      }, 200));
      hostEl.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-id]');
        if (row && canManage && !s.offline) openForm(s.items.find((i) => String(i.id) === row.dataset.id));
      });

      // ---------------------------------------------------------- add / edit
      async function openForm(item) {
        const editing = !!item;
        const m = UI.modal({
          title: editing ? `Edit ${item.name}` : 'Add item', wide: true,
          body: '<div class="gf-hint" data-loading>Loading…</div>',
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Close</button><button class="gf-btn gf-btn-green" data-ok type="button" disabled>Save item</button>',
        });
        let L;
        try { L = await lookups(); } catch (err) { m.error(err.message); return; }
        const kinds = [...new Set(s.items.map((i) => i.kind).filter(Boolean))];
        const i = item || { kind: kinds[0] || '', owner_module: GF.modules.length === 1 ? GF.modules[0] : 'CEREAL', track_stock: true, is_active: true, is_millable: false };
        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        const opt = (list, val, label) => list.map((x) => `<option value="${x.id}" ${String(x.id) === String(val) ? 'selected' : ''}>${esc(label(x))}</option>`).join('');
        body.insertAdjacentHTML('beforeend', `
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="f-name">Name</label><input class="gf-input plain" id="f-name" value="${esc(i.name || '')}" placeholder="e.g. Maize, white"></div>
            <div class="gf-field"><label class="gf-label" for="f-sku">SKU</label><input class="gf-input plain" id="f-sku" value="${esc(i.sku || '')}" placeholder="e.g. MZ-WHT" style="text-transform:uppercase"></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="f-kind">Kind</label><input class="gf-input plain" id="f-kind" list="f-kinds" value="${esc(i.kind || '')}" placeholder="Pick or type" ${editing ? '' : ''}><datalist id="f-kinds">${kinds.map((k) => `<option value="${esc(k)}">`).join('')}</datalist></div>
            <div class="gf-field"><label class="gf-label" for="f-mod">Belongs to</label><select class="gf-input plain" id="f-mod">${['CEREAL', 'MILL', 'SHARED'].filter((x) => x === 'SHARED' ? GF.isOwner : GF.inModule(x)).map((x) => `<option value="${x}" ${i.owner_module === x ? 'selected' : ''}>${MODULE_LABEL[x]}</option>`).join('')}</select></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="f-grain">Grain (optional)</label><select class="gf-input plain" id="f-grain"><option value="">None</option>${opt(L.grains, i.grain_id, (g) => g.name)}</select></div>
            <div class="gf-field"><label class="gf-label" for="f-grade">Grade (optional)</label><select class="gf-input plain" id="f-grade"><option value="">None</option>${opt(L.grades, i.grade_id, (g) => g.name)}</select></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="f-reorder">Reorder level (kg, optional)</label><input class="gf-input plain" id="f-reorder" type="number" min="0" step="any" value="${i.reorder_level_kg ?? ''}"></div>
            <div class="gf-field"><label class="gf-label" for="f-desc">Notes (optional)</label><input class="gf-input plain" id="f-desc" value="${esc(i.description || '')}"></div>
          </div>
          <div class="gf-stack">
            <label class="gf-check"><input type="checkbox" id="f-track" ${i.track_stock !== false ? 'checked' : ''}> Track stock for this item</label>
            <label class="gf-check"><input type="checkbox" id="f-mill" ${i.is_millable ? 'checked' : ''}> Can be milled (grain customers bring to the mill)</label>
            ${editing ? `<label class="gf-check"><input type="checkbox" id="f-active" ${i.is_active !== false ? 'checked' : ''}> Active (shows on the till)</label>` : ''}
          </div>
          ${editing ? '<div class="form-section"><div class="gf-label" style="margin:10px 0 6px">Units this item is sold or bought in</div><div id="u-box" class="gf-hint">Loading units…</div></div>' : '<div class="gf-hint">After saving you can add bags, tins and other units.</div>'}`);
        const $ = (sel) => body.querySelector(sel);
        const save = m.el.querySelector('[data-ok]');
        save.disabled = false;

        save.addEventListener('click', async () => {
          const name = $('#f-name').value.trim(), sku = $('#f-sku').value.trim().toUpperCase(), kind = $('#f-kind').value.trim();
          if (!name || !sku || !kind) { m.error('Name, SKU and kind are required.'); return; }
          const payload = {
            name, sku, kind, owner_module: $('#f-mod').value, grain_id: $('#f-grain').value || null, grade_id: $('#f-grade').value || null,
            reorder_level_kg: $('#f-reorder').value === '' ? null : Number($('#f-reorder').value), description: $('#f-desc').value.trim() || null,
            track_stock: $('#f-track').checked, is_millable: $('#f-mill').checked,
          };
          if (editing) payload.is_active = $('#f-active').checked;
          m.error(''); m.busy(save, true);
          try {
            if (editing) await Api.put(`/items/${item.id}`, payload);
            else await Api.post('/items', payload);
            m.close(); UI.toast(editing ? 'Item saved' : 'Item added'); await load(true);
            if (!editing) UI.toast('Open the item to add bags, tins and prices.');
          } catch (err) { m.busy(save, false); m.error(err.message); }
        });
        if (editing) unitsPanel(m, item, L);
      }

      // ---------------------------------------------------------- units of one item
      async function unitsPanel(m, item, L) {
        const box = m.el.querySelector('#u-box');
        async function paintUnits() {
          let rows;
          try { rows = (await Api.get(`/items/${item.id}/units`)) || []; } catch (err) { box.textContent = err.message; return; }
          const have = new Set(rows.map((r) => r.unit_id));
          const free = L.units.filter((u) => !have.has(u.id) && u.is_active !== false);
          box.className = '';
          box.innerHTML = `<div class="mini-table"><table class="dt"><thead><tr><th>Unit</th><th>Kg in one</th><th>Sold</th><th>Bought</th><th></th></tr></thead><tbody>
            ${rows.map((r) => `<tr data-u="${r.unit_id}"><td><strong>${esc(r.name)}</strong> <span class="muted">${esc(r.code)}</span></td>
              <td><input class="gf-input plain" data-kg type="number" min="0" step="any" value="${num(r.kg_per_unit)}" style="width:90px" ${r.code === 'KG' ? 'disabled' : ''}></td>
              <td><input type="checkbox" data-sell ${r.is_sellable ? 'checked' : ''}></td><td><input type="checkbox" data-buy ${r.is_purchasable ? 'checked' : ''}></td>
              <td style="white-space:nowrap"><button type="button" class="job-btn" data-save>Save</button>${r.code === 'KG' ? '' : ' <button type="button" class="job-btn quiet" data-del aria-label="Remove unit"><i class="bi bi-x-lg"></i></button>'}</td></tr>`).join('')}
            </tbody></table></div>
            ${free.length ? `<div class="gf-row2" style="margin-top:10px;align-items:end"><div class="gf-field"><label class="gf-label" for="u-new">Add a unit</label>
              <select class="gf-input plain" id="u-new">${free.map((u) => `<option value="${u.id}" data-kg="${num(u.kg_per_unit)}">${esc(u.name)} (${esc(u.code)})</option>`).join('')}</select></div>
              <div class="gf-field"><label class="gf-label" for="u-kg">Kg in one</label><input class="gf-input plain" id="u-kg" type="number" min="0" step="any" value="${num(free[0].kg_per_unit) || ''}"></div></div>
              <button type="button" class="gf-btn gf-btn-ghost gf-btn-sm" data-add><i class="bi bi-plus-lg"></i>Add unit</button>` : ''}`;
        }
        box.addEventListener('change', (e) => {
          if (e.target.id !== 'u-new') return;
          const o = e.target.selectedOptions[0]; const kg = box.querySelector('#u-kg'); if (o && kg) kg.value = num(o.dataset.kg) || '';
        });
        box.addEventListener('click', async (e) => {
          const row = e.target.closest('tr[data-u]');
          try {
            if (e.target.closest('[data-save]')) {
              await Api.put(`/items/${item.id}/units/${row.dataset.u}`, { kg_per_unit: Number(row.querySelector('[data-kg]').value) || undefined, is_sellable: row.querySelector('[data-sell]').checked, is_purchasable: row.querySelector('[data-buy]').checked });
              UI.toast('Unit saved');
            } else if (e.target.closest('[data-del]')) {
              await Api.del(`/items/${item.id}/units/${row.dataset.u}`); UI.toast('Unit removed'); await paintUnits();
            } else if (e.target.closest('[data-add]')) {
              const kg = Number(box.querySelector('#u-kg').value);
              if (!(kg > 0)) { m.error('Enter how many kg are in one.'); return; }
              m.error('');
              await Api.put(`/items/${item.id}/units/${box.querySelector('#u-new').value}`, { kg_per_unit: kg, is_sellable: true, is_purchasable: true });
              UI.toast('Unit added. Set its price on the Price list.'); await paintUnits();
            }
          } catch (err) { m.error(err.message); }
        });
        paintUnits();
      }

      paint();
      load();
    },
  });
})();
