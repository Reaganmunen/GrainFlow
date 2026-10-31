/**
 * Catalogue screens: Mill > Products (#/mill/catalogue) and Cereals > Products (#/cereal/catalogue).
 * Where a manager adds and edits the products their business sells or buys: name, SKU, kind, grain and grade,
 * stock settings and the units (bag, tin, packet...) with how many kg each one is.
 * A manager only sees add / edit on products of their own business; shared products are the owner's.
 * Uses /api/items, /items/kinds, /items/:id/units, /items/:id/units/:unitId, /grains, /grades and /units.
 */
(function () {
  const { esc, num, pretty, pill, opts } = Kit;
  const slug = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 14);

  function cataloguePage({ path, module, title, tileClass }) {
    GF.page(path, {
      title,
      render(el) {
        const canAdd = GF.can('catalogue.items') || GF.can('catalogue.manage');
        const s = { rows: [], grains: [], grades: [], units: [], kinds: { enum: false, kinds: [] }, loading: true, failed: '', search: '', show: 'active' };
        const stockKey = module === 'MILL' ? 'mill_stock_kg' : 'cereal_stock_kg';

        el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="host"></div>';
        const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#host');
        GF.setActions(canAdd ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="add-product" type="button"><i class="bi bi-plus-lg"></i>Add product</button>' : '');
        const addBtn = document.getElementById('add-product');
        if (addBtn) addBtn.addEventListener('click', () => openProduct());

        // the owner may edit anything; a manager only products of their own business (shared ones have no owner_module)
        const editable = (r) => canAdd && (GF.isOwner || r.owner_module === module);

        // -------------------------------------------------------- data
        async function load(quiet) {
          try {
            const [items, grains, grades, units, kinds] = await Promise.all([
              Api.get('/items?limit=500'), Api.get('/grains'), Api.get('/grades'), Api.get('/units?active=true'), Api.get('/items/kinds'),
            ]);
            s.rows = (items || []).filter((r) => r.owner_module === module || !r.owner_module);
            s.grains = grains || []; s.grades = grades || []; s.units = units || [];
            s.kinds = kinds || { enum: false, kinds: [] };
            s.failed = '';
          } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
          s.loading = false; paint();
        }

        const shown = () => s.rows.filter((r) => {
          if (s.show === 'active' && r.is_active === false) return false;
          if (s.show === 'inactive' && r.is_active !== false) return false;
          if (s.search) { const q = s.search.toLowerCase(); if (![r.name, r.sku, r.grain_name].some((v) => String(v || '').toLowerCase().includes(q))) return false; }
          return true;
        });

        // -------------------------------------------------------- painting
        function paintKpis() {
          const active = s.rows.filter((r) => r.is_active !== false).length;
          const noStock = s.rows.filter((r) => r.is_active !== false && r.track_stock !== false && num(r[stockKey]) <= 0).length;
          kpisEl.innerHTML =
            Kit.kpi('bi-box-seam', 'Products', String(s.rows.length), '', tileClass) +
            Kit.kpi('bi-check-circle', 'Active', String(active)) +
            Kit.kpi('bi-exclamation-triangle', 'Active with no stock', String(noStock), noStock ? '<span class="gf-badge gf-badge-red">Check</span>' : '<span class="gf-badge gf-badge-green">None</span>');
        }

        function paintToolbar() {
          toolbarEl.innerHTML = `${Kit.chips('show', s.show, [['active', 'Active'], ['inactive', 'Inactive'], ['all', 'All']])}
            <span class="grow"></span><label class="search"><i class="bi bi-search"></i><input type="search" id="cat-search" placeholder="Find a product" value="${esc(s.search)}" aria-label="Find a product"></label>
            <span class="count-note">Showing ${shown().length} of ${s.rows.length}</span>`;
        }

        function paintTable() {
          if (s.loading) { hostEl.innerHTML = Kit.loading('products'); return; }
          const err = s.failed ? Kit.error(s.failed) : '';
          if (!s.rows.length) {
            hostEl.innerHTML = err + Kit.empty('bi-box-seam', 'No products yet',
              canAdd ? 'Add the first product you sell or buy. It then appears in the till, purchases, stock and price list.' : 'Ask the owner or a manager to add products.',
              canAdd ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">Add product</button>' : '');
            return;
          }
          const rows = shown();
          if (!rows.length) { hostEl.innerHTML = err + Kit.empty('bi-search', 'Nothing matches', 'Try a different name or change the filter.'); return; }
          const body = rows.map((r) => {
            const can = editable(r);
            return `<tr class="${can ? 'click' : ''}" data-id="${r.id}">
              <td><strong>${esc(r.name)}</strong><div class="muted" style="font-size:12px">${esc(r.sku || '')}</div></td>
              <td>${esc(r.grain_name || '–')}${r.grade_name ? `<div class="muted" style="font-size:12px">${esc(r.grade_name)}</div>` : ''}</td>
              <td>${r.kind ? pill('', pretty(r.kind)) : '–'}${r.owner_module ? '' : ` ${pill('amber', 'Shared')}`}</td>
              <td class="r">${r.track_stock === false ? '<span class="muted">Not tracked</span>' : `<b>${esc(UI.kg(r[stockKey]))}</b>`}</td>
              <td class="r muted">${num(r.reorder_level_kg) ? esc(UI.kg(r.reorder_level_kg)) : '–'}</td>
              <td>${r.is_active === false ? pill('', 'Inactive') : pill('green', 'Active')}</td>
              <td class="r muted">${can ? '<i class="bi bi-pencil"></i>' : '<i class="bi bi-lock" title="Only the owner can change this product"></i>'}</td></tr>`;
          }).join('');
          hostEl.innerHTML = err + Kit.table([['Product'], ['Grain / grade'], ['Kind'], ['On hand', 'r'], ['Reorder at', 'r'], ['Status'], ['']], body);
        }

        function paint() { paintKpis(); paintToolbar(); paintTable(); }

        // -------------------------------------------------------- events
        toolbarEl.addEventListener('click', (e) => { const b = e.target.closest('[data-show]'); if (b) { s.show = b.dataset.show; paint(); } });
        toolbarEl.addEventListener('input', UI.debounce((e) => {
          if (e.target.id !== 'cat-search') return;
          s.search = e.target.value.trim(); paintTable(); paintToolbar();
          const box = toolbarEl.querySelector('#cat-search');
          if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        }, 200));
        hostEl.addEventListener('click', (e) => {
          if (e.target.closest('[data-add]')) { openProduct(); return; }
          const tr = e.target.closest('tr[data-id]');
          if (!tr) return;
          const r = s.rows.find((x) => String(x.id) === tr.dataset.id);
          if (r && editable(r)) openProduct(r);
        });

        // -------------------------------------------------------- add / edit a product
        async function openProduct(item) {
          const editing = !!item;
          const it = item || { is_active: true, track_stock: true, is_millable: false, owner_module: module };
          const m = UI.modal({
            title: editing ? `Edit ${it.name}` : 'Add product', wide: true,
            body: '<div class="gf-hint" data-loading>Loading…</div>',
            foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button" disabled>Save product</button>',
          });
          const body = m.el.querySelector('.gf-modal-body');
          const save = m.el.querySelector('[data-ok]');

          // units already on the product (edit) - the KG unit is added by the database when a product is created
          let draft = [];
          if (editing) {
            try { draft = ((await Api.get(`/items/${it.id}/units`)) || []).map((u) => ({ ...u, kg_per_unit: num(u.kg_per_unit), existing: true })); }
            catch (err) { m.error(err.message); return; }
          }
          const removed = [];

          const kindField = s.kinds.enum && s.kinds.kinds.length
            ? `<select class="gf-input plain" id="pr-kind"><option value="">Choose…</option>${s.kinds.kinds.map((k) => `<option value="${esc(k)}" ${k === it.kind ? 'selected' : ''}>${esc(pretty(k))}</option>`).join('')}</select>`
            : `<input class="gf-input plain" id="pr-kind" list="pr-kinds" value="${esc(it.kind || '')}" placeholder="e.g. GRAIN"><datalist id="pr-kinds">${s.kinds.kinds.map((k) => `<option value="${esc(k)}"></option>`).join('')}</datalist>`;
          const moduleField = GF.isOwner && !editing
            ? `<div class="gf-field"><label class="gf-label" for="pr-mod">Belongs to</label><select class="gf-input plain" id="pr-mod">
                <option value="CEREAL" ${it.owner_module === 'CEREAL' ? 'selected' : ''}>Cereals</option><option value="MILL" ${it.owner_module === 'MILL' ? 'selected' : ''}>Posho mill</option></select></div>`
            : '';

          body.querySelector('[data-loading]').remove();
          body.insertAdjacentHTML('beforeend', `
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="pr-name">Product name</label><input class="gf-input plain" id="pr-name" value="${esc(it.name || '')}" placeholder="e.g. Maize, grade 1"></div>
              <div class="gf-field"><label class="gf-label" for="pr-sku">SKU (code)</label><input class="gf-input plain" id="pr-sku" value="${esc(it.sku || '')}" placeholder="e.g. MAIZE-1"></div>
            </div>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="pr-kind">Kind</label>${kindField}</div>
              ${moduleField || `<div class="gf-field"><label class="gf-label" for="pr-reorder">Reorder at (kg, optional)</label><input class="gf-input plain" id="pr-reorder" type="number" inputmode="decimal" min="0" step="1" value="${esc(it.reorder_level_kg ?? '')}"></div>`}
            </div>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="pr-grain">Grain</label>
                <div style="display:flex;gap:8px"><select class="gf-input plain" id="pr-grain" style="flex:1"></select>
                <button class="gf-btn gf-btn-ghost gf-btn-sm" id="pr-newgrain" type="button" title="Add a grain that is not in the list">New</button></div></div>
              <div class="gf-field"><label class="gf-label" for="pr-grade">Grade (optional)</label>
                <select class="gf-input plain" id="pr-grade"><option value="">None</option>${opts(s.grades, it.grade_id, (g) => g.name)}</select></div>
            </div>
            ${moduleField ? `<div class="gf-row2"><div class="gf-field"><label class="gf-label" for="pr-reorder">Reorder at (kg, optional)</label><input class="gf-input plain" id="pr-reorder" type="number" inputmode="decimal" min="0" step="1" value="${esc(it.reorder_level_kg ?? '')}"></div><div></div></div>` : ''}
            <div class="gf-field"><label class="gf-label" for="pr-desc">Description (optional)</label><input class="gf-input plain" id="pr-desc" value="${esc(it.description || '')}"></div>
            <div style="display:flex;flex-wrap:wrap;gap:8px 22px;margin-bottom:14px">
              <label class="gf-check"><input type="checkbox" id="pr-track" ${it.track_stock === false ? '' : 'checked'}><span>Track stock</span></label>
              <label class="gf-check"><input type="checkbox" id="pr-mill" ${it.is_millable ? 'checked' : ''}><span>Can be milled</span></label>
              <label class="gf-check"><input type="checkbox" id="pr-active" ${it.is_active === false ? '' : 'checked'}><span>Active (can be sold and bought)</span></label>
            </div>
            <h3 style="margin:6px 0 4px;font-size:14px">Units</h3>
            <div class="gf-hint" style="margin-bottom:8px">How this product is sold or bought, and how many kg one unit is. Kilograms are always there.</div>
            <div id="pr-units"></div>
            <div class="gf-row2" style="grid-template-columns:1fr 120px auto;align-items:end;margin-top:8px">
              <div class="gf-field" style="margin:0"><label class="gf-label" for="pr-unit-pick">Add a unit</label><select class="gf-input plain" id="pr-unit-pick"></select></div>
              <div class="gf-field" style="margin:0"><label class="gf-label" for="pr-unit-kg">Kg in one</label><input class="gf-input plain" id="pr-unit-kg" type="number" inputmode="decimal" min="0" step="0.1"></div>
              <button class="gf-btn gf-btn-ghost gf-btn-sm" id="pr-unit-add" type="button"><i class="bi bi-plus-lg"></i>Add</button>
            </div>`);
          const $ = (q) => body.querySelector(q);

          // grain list (can grow when the manager adds a new grain)
          const paintGrains = (sel) => {
            $('#pr-grain').innerHTML = `<option value="">Choose…</option>${opts(s.grains.filter((g) => g.is_active !== false || String(g.id) === String(sel)), sel, (g) => g.name)}`;
          };
          paintGrains(it.grain_id);

          // SKU follows the name until the manager types their own
          let skuTouched = editing;
          $('#pr-sku').addEventListener('input', () => { skuTouched = true; });
          $('#pr-name').addEventListener('input', () => { if (!skuTouched) $('#pr-sku').value = slug($('#pr-name').value); });

          // ---- units
          const paintUnits = () => {
            $('#pr-units').innerHTML = draft.length
              ? Kit.table([['Unit'], ['Kg in one', 'r'], ['Sell'], ['Buy'], ['']], draft.map((u, i) => {
                const kg = String(u.code).toUpperCase() === 'KG';
                return `<tr><td><strong>${esc(u.name || u.code)}</strong></td>
                  <td class="r">${kg ? '1' : `<input class="gf-input plain" data-i="${i}" data-f="kg_per_unit" type="number" min="0" step="0.1" value="${esc(u.kg_per_unit || '')}" style="width:90px;height:32px;text-align:right">`}</td>
                  <td><input type="checkbox" data-i="${i}" data-f="is_sellable" ${u.is_sellable === false ? '' : 'checked'} aria-label="Sold by ${esc(u.name || u.code)}"></td>
                  <td><input type="checkbox" data-i="${i}" data-f="is_purchasable" ${u.is_purchasable === false ? '' : 'checked'} aria-label="Bought by ${esc(u.name || u.code)}"></td>
                  <td class="r">${kg ? '' : `<button class="gf-x" type="button" data-rm="${i}" aria-label="Remove ${esc(u.name || u.code)}"><i class="bi bi-trash"></i></button>`}</td></tr>`;
              }).join(''))
              : '<div class="gf-hint">Only kilograms for now.</div>';
            const free = s.units.filter((u) => !draft.some((d) => String(d.unit_id) === String(u.id)) && String(u.code).toUpperCase() !== 'KG');
            $('#pr-unit-pick').innerHTML = free.length ? free.map((u) => `<option value="${u.id}">${esc(u.name || u.code)}</option>`).join('') : '<option value="">No more units</option>';
            $('#pr-unit-add').disabled = !free.length;
            fillKg();
          };
          const fillKg = () => { const u = s.units.find((x) => String(x.id) === $('#pr-unit-pick').value); $('#pr-unit-kg').value = u && num(u.kg_per_unit) ? num(u.kg_per_unit) : ''; };
          $('#pr-unit-pick').addEventListener('change', fillKg);
          $('#pr-unit-add').addEventListener('click', () => {
            const u = s.units.find((x) => String(x.id) === $('#pr-unit-pick').value);
            const kg = num($('#pr-unit-kg').value);
            if (!u) return;
            if (!(kg > 0)) { m.error(`Enter how many kg one ${u.name || u.code} is.`); return; }
            m.error('');
            const gone = removed.indexOf(u.id); if (gone >= 0) removed.splice(gone, 1);
            draft.push({ unit_id: u.id, code: u.code, name: u.name, kg_per_unit: kg, is_sellable: true, is_purchasable: true, existing: false });
            paintUnits();
          });
          $('#pr-units').addEventListener('input', (e) => {
            const t = e.target; if (t.dataset.i === undefined) return;
            const u = draft[Number(t.dataset.i)];
            u[t.dataset.f] = t.type === 'checkbox' ? t.checked : num(t.value);
          });
          $('#pr-units').addEventListener('click', (e) => {
            const b = e.target.closest('[data-rm]'); if (!b) return;
            const [u] = draft.splice(Number(b.dataset.rm), 1);
            if (u.existing) removed.push(u.unit_id);
            paintUnits();
          });
          paintUnits();

          // ---- new grain, without leaving the form
          $('#pr-newgrain').addEventListener('click', () => {
            const g = UI.modal({
              title: 'Add a grain',
              body: `<div class="gf-field"><label class="gf-label" for="ng-name">Grain name</label><input class="gf-input plain" id="ng-name" placeholder="e.g. Maize"></div>
                <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="ng-code">Code</label><input class="gf-input plain" id="ng-code" placeholder="e.g. MAIZE"></div>
                <div class="gf-field"><label class="gf-label" for="ng-cat">Category (optional)</label><input class="gf-input plain" id="ng-cat" placeholder="e.g. Cereal, Legume"></div></div>
                <label class="gf-check"><input type="checkbox" id="ng-mill"><span>This grain can be milled</span></label>`,
              foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">Add grain</button>',
            });
            const q = (id) => g.el.querySelector(id);
            q('#ng-name').addEventListener('input', () => { if (!q('#ng-code').dataset.t) q('#ng-code').value = slug(q('#ng-name').value).replace(/-/g, '_'); });
            q('#ng-code').addEventListener('input', () => { q('#ng-code').dataset.t = '1'; });
            q('[data-ok]').addEventListener('click', async (e) => {
              const name = q('#ng-name').value.trim(), code = q('#ng-code').value.trim().toUpperCase();
              if (!name || !code) { g.error('Enter the grain name and its code.'); return; }
              g.error(''); g.busy(e.currentTarget, true);
              try {
                const row = await Api.post('/grains', { name, code, category: q('#ng-cat').value.trim() || null, is_millable: q('#ng-mill').checked, is_active: true });
                s.grains.push(row); s.grains.sort((a, b) => String(a.name).localeCompare(b.name));
                paintGrains(row.id);
                if (row.is_millable) $('#pr-mill').checked = true;
                g.close(); UI.toast('Grain added');
              } catch (err) { g.busy(e.currentTarget, false); g.error(err.message); }
            });
          });

          // ---- save
          save.disabled = false;
          save.addEventListener('click', async () => {
            const name = $('#pr-name').value.trim(), sku = $('#pr-sku').value.trim(), kind = $('#pr-kind').value.trim();
            if (!name) { m.error('Enter the product name.'); return; }
            if (!sku) { m.error('Enter a SKU (a short code for the product).'); return; }
            if (!kind) { m.error('Choose the kind of product.'); return; }
            const reorder = $('#pr-reorder').value;
            if (reorder !== '' && !(num(reorder) >= 0)) { m.error('Reorder level cannot be negative.'); return; }
            const badUnit = draft.find((u) => String(u.code).toUpperCase() !== 'KG' && !(num(u.kg_per_unit) > 0));
            if (badUnit) { m.error(`Enter how many kg one ${badUnit.name || badUnit.code} is.`); return; }

            const data = {
              name, sku, kind,
              grain_id: $('#pr-grain').value || (editing ? '' : undefined),
              grade_id: $('#pr-grade').value || (editing ? '' : undefined),
              reorder_level_kg: reorder === '' ? (editing ? '' : undefined) : num(reorder),
              description: $('#pr-desc').value.trim() || (editing ? '' : undefined),
              track_stock: $('#pr-track').checked, is_millable: $('#pr-mill').checked, is_active: $('#pr-active').checked,
            };
            if (!editing) data.owner_module = GF.isOwner ? ($('#pr-mod') ? $('#pr-mod').value : module) : module;

            m.error(''); m.busy(save, true);
            let id = it.id, step = editing ? 'product' : 'product';
            try {
              if (editing) await Api.put(`/items/${id}`, data);
              else id = (await Api.post('/items', data)).id;
              step = 'units';
              for (const unitId of removed) await Api.del(`/items/${id}/units/${unitId}`);
              for (const u of draft.filter((x) => String(x.code).toUpperCase() !== 'KG' || x.existing)) {
                await Api.put(`/items/${id}/units/${u.unit_id}`, { kg_per_unit: num(u.kg_per_unit) || 1, is_sellable: u.is_sellable !== false, is_purchasable: u.is_purchasable !== false });
              }
              m.close(); UI.toast(editing ? 'Product updated' : 'Product added'); load(true);
            } catch (err) {
              m.busy(save, false);
              if (step === 'units' && !editing) {
                // the product exists now; do not let a second click create it again
                m.close(); UI.toast(`Product added, but its units were not saved: ${err.message}. Open it to add them.`, 'error'); load(true);
              } else m.error(err.message);
            }
          });
        }

        paint();
        load();
      },
    });
  }

  cataloguePage({ path: 'cereal/catalogue', module: 'CEREAL', title: 'Products', tileClass: 'cereal' });
  cataloguePage({ path: 'mill/catalogue', module: 'MILL', title: 'Products', tileClass: 'mill' });
})();
