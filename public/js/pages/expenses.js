/**
 * Shared > Expenses  (#/shared/expenses)
 * Period and business filters, totals by category, add/edit, void with a reason, and category management.
 * Uses /api/expenses, /expenses/summary, /expenses/categories, /expenses/:id, /expenses/:id/void,
 * plus /suppliers and /mill/machines for the optional pickers.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const METHODS = [['CASH', 'Cash'], ['MPESA_MANUAL', 'M-Pesa'], ['BANK', 'Bank'], ['OTHER', 'Other']];
  const MODULES = [['SHARED', 'Whole business'], ['MILL', 'Posho mill'], ['CEREAL', 'Cereals']];
  const modLabel = (m) => (MODULES.find((x) => x[0] === m) || [, m || '–'])[1];
  const modPill = (m) => `<span class="pill ${m === 'MILL' ? 'amber' : m === 'CEREAL' ? 'green' : ''}">${esc(modLabel(m))}</span>`;
  const methodLabel = (m) => (METHODS.find((x) => x[0] === m) || [, m || '–'])[1];

  function periodRange(key) {
    const now = new Date(), to = ymd(now);
    if (key === 'today') return { from: to, to };
    if (key === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: ymd(d), to }; }
    if (key === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    return {};
  }

  GF.page('shared/expenses', {
    title: 'Expenses',
    render(el) {
      const s = { rows: [], total: 0, summary: [], categories: [], period: 'month', module: '', category: '', search: '', loading: true, failed: '' };

      el.innerHTML = `<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>`;
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

      GF.setActions([
        GF.can('expenses.manage') ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" id="cat-btn" type="button"><i class="bi bi-tags"></i>Categories</button>' : '',
        GF.can('expenses.create') ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="add-exp" type="button"><i class="bi bi-plus-lg"></i>Add expense</button>' : '',
      ].join(' '));
      const addBtn = document.getElementById('add-exp'); if (addBtn) addBtn.addEventListener('click', () => openForm());
      const catBtn = document.getElementById('cat-btn'); if (catBtn) catBtn.addEventListener('click', () => openCategories());

      // ------------------------------------------------------------ data
      const query = () => {
        const r = periodRange(s.period);
        const p = new URLSearchParams();
        if (r.from) { p.set('from', r.from); p.set('to', r.to); }
        if (s.module) p.set('module', s.module);
        return p;
      };

      async function loadCategories() {
        try { s.categories = (await Api.get('/expenses/categories')) || []; } catch (e) { /* the form will say so */ }
      }

      async function load(quiet) {
        try {
          const p = query(), lp = new URLSearchParams(p);
          lp.set('limit', 500);
          if (s.category) lp.set('category_id', s.category);
          if (s.search) lp.set('search', s.search);
          const [rows, summary] = await Promise.all([Api.get(`/expenses?${lp}`), Api.get(`/expenses/summary?${p}`)]);
          s.rows = rows || [];
          s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
          s.summary = summary || [];
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false;
        paint();
      }

      // ------------------------------------------------------------ painting
      function paintKpis() {
        const byCat = {};
        s.summary.forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + num(r.total); });
        const grand = Object.values(byCat).reduce((t, v) => t + v, 0);
        const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
        const kpi = (icon, label, value, badge) => `<div class="kpi"><div class="tile"><i class="bi ${icon}"></i></div>
          <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${badge || ''}</div>`;
        const modTotal = (m) => s.summary.filter((r) => r.module === m).reduce((t, r) => t + num(r.total), 0);
        kpisEl.innerHTML =
          kpi('bi-cash-stack', 'Total spent', UI.money(grand), `<span class="gf-badge gf-badge-amber">${s.total} entries</span>`) +
          kpi('bi-gear-wide-connected', 'Posho mill', UI.money(modTotal('MILL'))) +
          kpi('bi-basket', 'Cereals', UI.money(modTotal('CEREAL'))) +
          kpi('bi-graph-up-arrow', top ? `Biggest cost · ${esc(top[0])}` : 'Biggest cost', top ? UI.money(top[1]) : 'None');
      }

      function paintToolbar() {
        const chip = (grp, key, label) => `<button type="button" class="fchip ${s[grp] === key ? 'on' : 'outline'}" data-${grp}="${key}">${label}</button>`;
        toolbarEl.innerHTML = `
          ${chip('period', 'today', 'Today')}${chip('period', 'week', 'Last 7 days')}${chip('period', 'month', 'This month')}${chip('period', 'all', 'All time')}
          <span class="sep"></span>
          ${chip('module', '', 'All')}${chip('module', 'MILL', 'Mill')}${chip('module', 'CEREAL', 'Cereals')}${chip('module', 'SHARED', 'Shared')}
          <span class="grow"></span>
          <select class="gf-input plain" id="cat-filter" style="height:32px;width:auto;font-size:13px" aria-label="Filter by category">
            <option value="">All categories</option>
            ${s.categories.map((c) => `<option value="${c.id}" ${String(c.id) === String(s.category) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="exp-search" placeholder="Description or code" value="${esc(s.search)}" aria-label="Search expenses"></label>`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = '<div class="dt-empty">Loading expenses…</div>'; return; }
        const err = s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)}</span></div>` : '';
        if (!s.rows.length) {
          const filtered = s.search || s.category || s.module || s.period !== 'all';
          hostEl.innerHTML = `${err}<div class="dt-empty"><div class="tile"><i class="bi bi-cash-stack"></i></div>
            <h3>No expenses found</h3>
            <p>${filtered ? 'Nothing recorded for this period or filter. Try All time or clear the filters.' : 'Record power, fuel, repairs, wages and rent so your profit is worked out correctly.'}</p>
            ${GF.can('expenses.create') ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">Add expense</button>' : ''}</div>`;
          return;
        }
        const body = s.rows.map((r) => `<tr class="click" data-id="${r.id}">
            <td class="nowrap">${esc(dateOnly(r.expense_date))}</td>
            <td><strong>${esc(r.category_name)}</strong><div class="muted" style="font-size:12px">${esc(r.description || r.expense_no || '')}</div></td>
            <td>${modPill(r.module)}</td>
            <td class="nowrap">${esc(methodLabel(r.method))}</td>
            <td class="r"><b>${UI.money(r.amount)}</b></td>
            <td class="r muted"><i class="bi bi-chevron-right"></i></td></tr>`).join('');
        hostEl.innerHTML = `${err}${s.total > s.rows.length ? `<div class="gf-note gf-note-amber" style="margin-bottom:10px"><i class="bi bi-info-circle"></i><span>Showing the latest ${s.rows.length} of ${s.total} expenses. Narrow the period to see the rest. The totals above include all of them.</span></div>` : ''}
          <div class="dt-wrap"><table class="dt"><thead><tr><th>Date</th><th>Expense</th><th>For</th><th>Paid by</th><th class="r">Amount</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
      }

      function paint() {
        paintKpis();
        // keep the search box focused while typing: only rebuild the toolbar when it is not the active element
        if (document.activeElement && document.activeElement.id === 'exp-search') { /* leave it */ } else paintToolbar();
        paintTable();
      }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-period], [data-module]');
        if (!b) return;
        if ('period' in b.dataset) s.period = b.dataset.period; else s.module = b.dataset.module;
        s.loading = true; paintToolbar(); paintTable(); load(true);
      });
      toolbarEl.addEventListener('change', (e) => {
        if (e.target.id === 'cat-filter') { s.category = e.target.value; load(true); }
      });
      toolbarEl.addEventListener('input', UI.debounce((e) => {
        if (e.target.id === 'exp-search') { s.search = e.target.value.trim(); load(true); }
      }, 300));
      hostEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) { openForm(); return; }
        const tr = e.target.closest('tr[data-id]');
        if (tr) openDetail(Number(tr.dataset.id));
      });

      // ------------------------------------------------------------ detail
      async function openDetail(id) {
        const m = UI.modal({ title: 'Expense', body: '<div class="gf-hint" data-loading>Loading…</div>' });
        try {
          const r = (await Api.get(`/expenses/${id}`));
          const fact = (label, v) => `<div class="fact"><span>${label}</span><b>${v}</b></div>`;
          const body = m.el.querySelector('.gf-modal-body');
          body.querySelector('[data-loading]').remove();
          body.insertAdjacentHTML('beforeend', `
            <div class="who-head"><div class="grow"><h3>${UI.money(r.amount)}</h3><div class="sub">${esc(r.category_name)} · ${esc(r.expense_no || '')}</div></div>
              ${GF.can('expenses.create') && !r.is_voided ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" data-edit type="button"><i class="bi bi-pencil"></i>Edit</button>' : ''}
              ${GF.can('expenses.void') && !r.is_voided ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" data-void type="button"><i class="bi bi-slash-circle"></i>Void</button>' : ''}</div>
            ${r.is_voided ? `<div class="gf-note gf-note-red"><i class="bi bi-slash-circle"></i><span>Voided: ${esc(r.void_reason || 'no reason given')}</span></div>` : ''}
            <div class="fact-grid">
              ${fact('Date', esc(dateOnly(r.expense_date)))}
              ${fact('For', esc(modLabel(r.module)))}
              ${fact('Paid by', esc(methodLabel(r.method)))}
              ${fact('M-Pesa code', esc(r.mpesa_code || '–'))}
              ${fact('Receipt no.', esc(r.receipt_ref || '–'))}
            </div>
            ${r.description ? `<div><div class="gf-label" style="margin-bottom:4px">Description</div><p>${esc(r.description)}</p></div>` : ''}`);
          const on = (sel, fn) => { const b = m.el.querySelector(sel); if (b) b.addEventListener('click', fn); };
          on('[data-edit]', () => { m.close(); openForm(id); });
          on('[data-void]', () => { m.close(); openVoid(id); });
        } catch (err) { m.error(err.message); }
      }

      function openVoid(id) {
        const m = UI.modal({
          title: 'Void expense',
          body: `<p>A voided expense stays on record but is no longer counted. This cannot be undone.</p>
            <div class="gf-field"><label class="gf-label" for="vr">Reason</label><input class="gf-input plain" id="vr" placeholder="e.g. Entered twice"></div>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-dark" data-ok type="button">Void expense</button>',
        });
        m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
          const reason = m.el.querySelector('#vr').value.trim();
          if (!reason) { m.error('Enter a reason.'); return; }
          m.error(''); m.busy(e.currentTarget, true);
          try { await Api.post(`/expenses/${id}/void`, { reason }); m.close(); UI.toast('Expense voided'); await load(true); }
          catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      // ------------------------------------------------------------ add / edit
      async function openForm(id) {
        const editing = !!id;
        let r = { expense_date: ymd(new Date()), module: 'SHARED', method: 'CASH' };
        const m = UI.modal({
          title: editing ? 'Edit expense' : 'Add expense', wide: true,
          body: '<div class="gf-hint" data-loading>Loading…</div>',
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button" disabled>Save expense</button>',
        });
        // pickers are optional: a role without access to suppliers or machines just does not see them
        const [exp, sups, machines, cats] = await Promise.all([
          editing ? Api.get(`/expenses/${id}`).catch((err) => { m.error(err.message); return null; }) : Promise.resolve(null),
          Api.get('/suppliers?limit=500&active=true').catch(() => []),
          Api.get('/mill/machines').catch(() => []),
          Api.get('/expenses/categories?active=true').catch((err) => { m.error(err.message); return []; }),
        ]);
        if (editing && !exp) return;
        if (exp) r = exp;
        m.el.querySelector('[data-loading]').remove();
        const catList = cats.slice();
        if (r.category_id && !catList.some((c) => c.id === r.category_id)) catList.push({ id: r.category_id, name: r.category_name });
        const v = (k) => esc(r[k] ?? '');
        const opts = (list, sel, label) => list.map((x) => `<option value="${x.id ?? x[0]}" ${String(x.id ?? x[0]) === String(sel) ? 'selected' : ''}>${esc(label(x))}</option>`).join('');

        m.el.querySelector('.gf-modal-body').insertAdjacentHTML('beforeend', `
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="ef-cat">Category</label>
              <select class="gf-input plain" id="ef-cat"><option value="">Choose…</option>${opts(catList, r.category_id, (c) => c.name)}</select></div>
            <div class="gf-field"><label class="gf-label" for="ef-amount">Amount (KES)</label><input class="gf-input plain" id="ef-amount" type="number" inputmode="decimal" min="1" step="1" value="${v('amount')}"></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="ef-date">Date</label><input class="gf-input plain" id="ef-date" type="date" value="${esc(dateOnly(r.expense_date))}"></div>
            <div class="gf-field"><label class="gf-label" for="ef-module">Which business is this for?</label>
              <select class="gf-input plain" id="ef-module">${opts(MODULES, r.module, (x) => x[1])}</select></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="ef-method">Paid by</label>
              <select class="gf-input plain" id="ef-method">${opts(METHODS, r.method, (x) => x[1])}</select></div>
            <div class="gf-field ${r.method === 'MPESA_MANUAL' ? '' : 'gf-hidden'}" id="ef-code-row"><label class="gf-label" for="ef-code">M-Pesa code</label><input class="gf-input plain" id="ef-code" autocapitalize="characters" value="${v('mpesa_code')}"></div>
          </div>
          <div class="gf-row2">
            ${sups.length ? `<div class="gf-field"><label class="gf-label" for="ef-sup">Paid to supplier (optional)</label>
              <select class="gf-input plain" id="ef-sup"><option value="">None</option>${opts(sups, r.supplier_id, (x) => x.name)}</select></div>` : ''}
            ${machines.length ? `<div class="gf-field ${r.module === 'MILL' ? '' : 'gf-hidden'}" id="ef-mach-row"><label class="gf-label" for="ef-mach">Machine (optional)</label>
              <select class="gf-input plain" id="ef-mach"><option value="">None</option>${opts(machines, r.machine_id, (x) => x.name)}</select></div>` : ''}
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="ef-desc">Description (optional)</label><input class="gf-input plain" id="ef-desc" value="${v('description')}" placeholder="e.g. Diesel for the mill engine"></div>
            <div class="gf-field"><label class="gf-label" for="ef-ref">Receipt number (optional)</label><input class="gf-input plain" id="ef-ref" value="${v('receipt_ref')}"></div>
          </div>`);

        const $ = (q) => m.el.querySelector(q);
        const save = $('[data-ok]'); save.disabled = false;
        $('#ef-method').addEventListener('change', (e) => $('#ef-code-row').classList.toggle('gf-hidden', e.target.value !== 'MPESA_MANUAL'));
        $('#ef-module').addEventListener('change', (e) => { const row = $('#ef-mach-row'); if (row) row.classList.toggle('gf-hidden', e.target.value !== 'MILL'); });

        save.addEventListener('click', async () => {
          const amount = parseFloat($('#ef-amount').value);
          if (!$('#ef-cat').value) { m.error('Choose a category.'); return; }
          if (!(amount > 0)) { m.error('Enter an amount greater than 0.'); return; }
          if (!$('#ef-date').value) { m.error('Choose the date.'); return; }
          const method = $('#ef-method').value, code = $('#ef-code').value.trim().toUpperCase();
          if (method === 'MPESA_MANUAL' && !code) { m.error('Enter the M-Pesa transaction code.'); return; }
          const sup = $('#ef-sup'), mach = $('#ef-mach');
          const module = $('#ef-module').value;
          const body = {
            category_id: Number($('#ef-cat').value), amount, expense_date: $('#ef-date').value, module, method,
            mpesa_code: method === 'MPESA_MANUAL' ? code : null,
            supplier_id: sup && sup.value ? Number(sup.value) : null,
            machine_id: mach && module === 'MILL' && mach.value ? Number(mach.value) : null,
            description: $('#ef-desc').value.trim() || null, receipt_ref: $('#ef-ref').value.trim() || null,
          };
          m.error(''); m.busy(save, true);
          try {
            if (editing) await Api.put(`/expenses/${id}`, body); else await Api.post('/expenses', body);
            m.close(); UI.toast(editing ? 'Expense updated' : 'Expense added'); await load(true);
          } catch (err) { m.busy(save, false); m.error(err.message); }
        });
      }

      // ------------------------------------------------------------ categories
      async function openCategories() {
        const m = UI.modal({ title: 'Expense categories', body: '<div class="gf-hint" data-loading>Loading…</div>' });
        const body = m.el.querySelector('.gf-modal-body');
        async function draw() {
          let list = [];
          try { list = (await Api.get('/expenses/categories')) || []; } catch (err) { m.error(err.message); }
          s.categories = list;
          body.innerHTML = `<div class="gf-note gf-note-red gf-hidden" data-error role="alert"><i class="bi bi-exclamation-circle"></i><span></span></div>
            <div class="gf-row2" style="grid-template-columns:1fr auto;align-items:end">
              <div class="gf-field"><label class="gf-label" for="nc-name">New category</label><input class="gf-input plain" id="nc-name" placeholder="e.g. Security"></div>
              <button class="gf-btn gf-btn-green" id="nc-add" type="button">Add</button></div>
            <div class="mini-table"><table class="dt"><thead><tr><th>Name</th><th>Status</th><th></th></tr></thead><tbody>
              ${list.map((c) => `<tr data-id="${c.id}"><td><input class="gf-input plain" style="height:34px" value="${esc(c.name)}" data-name aria-label="Category name"></td>
                <td>${c.is_active === false ? '<span class="pill red">Hidden</span>' : '<span class="pill green">Active</span>'}</td>
                <td class="r nowrap"><button class="fchip outline" data-save type="button">Rename</button>
                  <button class="fchip outline" data-toggle="${c.is_active === false ? 'on' : 'off'}" type="button">${c.is_active === false ? 'Show' : 'Hide'}</button></td></tr>`).join('')}
            </tbody></table></div>`;
        }
        await draw();
        const fail = (err) => m.error(err.message);
        body.addEventListener('click', async (e) => {
          const tr = e.target.closest('tr[data-id]');
          try {
            if (e.target.closest('#nc-add')) {
              const name = body.querySelector('#nc-name').value.trim();
              if (!name) { m.error('Enter a name.'); return; }
              const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
              await Api.post('/expenses/categories', { name, code, is_active: true });
              UI.toast('Category added'); m.error(''); await draw();
            } else if (tr && e.target.closest('[data-save]')) {
              const name = tr.querySelector('[data-name]').value.trim();
              if (!name) { m.error('Enter a name.'); return; }
              await Api.put(`/expenses/categories/${tr.dataset.id}`, { name });
              UI.toast('Category renamed'); m.error(''); await draw();
            } else if (tr && e.target.closest('[data-toggle]')) {
              await Api.put(`/expenses/categories/${tr.dataset.id}`, { is_active: e.target.closest('[data-toggle]').dataset.toggle === 'on' });
              m.error(''); await draw();
            }
          } catch (err) { fail(err); }
        });
      }

      paint();
      loadCategories().then(() => { paintToolbar(); });
      load();
    },
  });
})();