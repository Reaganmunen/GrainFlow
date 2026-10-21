/**
 * Shared > Customers  (#/shared/customers)
 * List with search and filters, add/edit form, statement with running balance, grain held at the mill, opening balance.
 * Uses /api/customers, /api/customers/:id, /api/customers/:id/ledger, /grain-held and /opening-balance.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const idOf = (r) => r.customer_id ?? r.id;
  const nameOf = (r) => r.full_name || r.business_name || 'Customer';
  const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');

  GF.page('shared/customers', {
    title: 'Customers',
    render(el) {
      const s = { rows: [], total: 0, search: '', chip: '', loading: true, failed: '', types: new Set() };

      el.innerHTML = `<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>`;
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

      GF.setActions(GF.can('customers.create')
        ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="add-customer" type="button"><i class="bi bi-plus-lg"></i>Add customer</button>' : '');
      const addBtn = document.getElementById('add-customer');
      if (addBtn) addBtn.addEventListener('click', () => openForm());

      // ------------------------------------------------------------ data
      async function load(quiet) {
        try {
          const q = s.search ? `&search=${encodeURIComponent(s.search)}` : '';
          const rows = await Api.get(`/customers?limit=500&active=true${q}`);
          s.rows = rows || [];
          s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
          s.rows.forEach((r) => { if (r.customer_type) s.types.add(r.customer_type); });
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false;
        paint();
      }

      const owes = (r) => num(r.balance) > 0;
      const visible = (r) => {
        if (s.chip === 'owing') return owes(r);
        if (s.chip === 'overdue') return num(r.overdue_amount) > 0;
        if (s.chip === 'credit') return !!r.credit_allowed;
        return true;
      };

      // ------------------------------------------------------------ painting
      function paintKpis() {
        const owing = s.rows.filter(owes);
        const owed = owing.reduce((t, r) => t + num(r.balance), 0);
        const overdue = s.rows.reduce((t, r) => t + num(r.overdue_amount), 0);
        const overdueN = s.rows.filter((r) => num(r.overdue_amount) > 0).length;
        const onCredit = s.rows.filter((r) => r.credit_allowed).length;
        const top = owing.slice().sort((a, b) => num(b.balance) - num(a.balance))[0];
        const kpi = (icon, label, value, badge) => `<div class="kpi"><div class="tile"><i class="bi ${icon}"></i></div>
          <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${badge || ''}</div>`;
        kpisEl.innerHTML =
          kpi('bi-people', 'Customers', String(s.total), `<span class="gf-badge gf-badge-green">${onCredit} on credit</span>`) +
          kpi('bi-wallet2', 'Owe us', UI.money(owed), `<span class="gf-badge gf-badge-amber">${owing.length} owing</span>`) +
          kpi('bi-hourglass-split', 'Overdue', UI.money(overdue),
            overdueN ? `<span class="gf-badge gf-badge-red">${overdueN} late</span>` : '<span class="gf-badge gf-badge-green">None</span>') +
          kpi('bi-person-exclamation', top ? `Largest balance · ${esc(nameOf(top))}` : 'Largest balance', top ? UI.money(top.balance) : 'None');
      }

      function paintToolbar() {
        const chip = (key, label, n) => `<button type="button" class="fchip outline ${s.chip === key ? 'on' : ''}" data-chip="${key}">${label} <span class="n">${n}</span></button>`;
        const shown = s.rows.filter(visible).length;
        toolbarEl.innerHTML = `
          <button type="button" class="fchip ${s.chip === '' ? 'on' : ''}" data-chip="">Everyone</button>
          ${chip('owing', 'Owing', s.rows.filter(owes).length)}
          ${chip('overdue', 'Overdue', s.rows.filter((r) => num(r.overdue_amount) > 0).length)}
          ${chip('credit', 'On credit', s.rows.filter((r) => r.credit_allowed).length)}
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="cust-search" placeholder="Name, code or phone" value="${esc(s.search)}" aria-label="Search customers"></label>
          <span class="count-note">Showing ${shown} of ${s.total}</span>`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = '<div class="dt-empty">Loading customers…</div>'; return; }
        const rows = s.rows.filter(visible);
        const err = s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)}</span></div>` : '';
        if (!rows.length) {
          hostEl.innerHTML = `${err}<div class="dt-empty"><div class="tile"><i class="bi bi-people"></i></div>
            <h3>${s.search || s.chip ? 'No customers match' : 'No customers yet'}</h3>
            <p>${s.search || s.chip ? 'Try a different name or clear the filter.' : 'Add the people who mill grain or buy on credit so their balances are tracked.'}</p>
            ${!s.search && !s.chip && GF.can('customers.create') ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">Add customer</button>' : ''}</div>`;
          return;
        }
        const body = rows.map((r) => {
          const nm = nameOf(r), bal = num(r.balance), od = num(r.overdue_amount);
          return `<tr class="click" data-id="${idOf(r)}">
            <td><div class="cell-who"><span class="gf-avatar" style="background:${UI.avatarColor(nm)}">${esc(UI.initials(nm))}</span>
              <div><strong>${esc(nm)}</strong><span>${esc(r.business_name && r.business_name !== nm ? r.business_name + ' · ' : '')}${esc(r.customer_code || '')}</span></div></div></td>
            <td class="nowrap">${esc(r.phone || '–')}</td>
            <td>${r.customer_type ? `<span class="pill">${esc(pretty(r.customer_type))}</span>` : '<span class="muted">–</span>'}</td>
            <td class="nowrap">${r.credit_allowed ? `<span class="pill green">Credit</span> <span class="muted">${r.credit_limit ? UI.money(r.credit_limit) : 'no limit'}</span>` : '<span class="muted">Cash only</span>'}</td>
            <td class="r ${bal > 0 ? 'neg' : bal < 0 ? 'pos' : 'muted'}">${bal === 0 ? '–' : bal < 0 ? `${UI.money(-bal)} credit` : UI.money(bal)}</td>
            <td class="r ${od > 0 ? 'neg' : 'muted'}">${od > 0 ? UI.money(od) : '–'}</td>
            <td class="r muted"><i class="bi bi-chevron-right"></i></td></tr>`;
        }).join('');
        hostEl.innerHTML = `${err}${s.total > s.rows.length ? `<div class="gf-note gf-note-amber" style="margin-bottom:10px"><i class="bi bi-info-circle"></i><span>Showing the first ${s.rows.length} of ${s.total} customers. Use the search box to narrow it down.</span></div>` : ''}
          <div class="dt-wrap"><table class="dt"><thead><tr><th>Customer</th><th>Phone</th><th>Type</th><th>Credit</th><th class="r">Owes us</th><th class="r">Overdue</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
      }

      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const c = e.target.closest('[data-chip]');
        if (c) { s.chip = s.chip === c.dataset.chip ? '' : c.dataset.chip; paint(); }
      });
      toolbarEl.addEventListener('input', UI.debounce(async (e) => {
        if (e.target.id !== 'cust-search') return;
        s.search = e.target.value.trim();
        await load(true);
        const box = toolbarEl.querySelector('#cust-search');
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }, 300));
      hostEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) { openForm(); return; }
        const tr = e.target.closest('tr[data-id]');
        if (tr) openStatement(Number(tr.dataset.id));
      });

      // ------------------------------------------------------------ statement
      async function openStatement(id) {
        const m = UI.modal({ title: 'Customer statement', wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
        try {
          const [st, grain] = await Promise.all([
            Api.get(`/customers/${id}/ledger`),
            Api.get(`/customers/${id}/grain-held`).catch(() => []),
          ]);
          const c = st.customer, bal = num(st.balance);
          const entries = (st.entries || []).slice().reverse();
          const grainRows = (grain || []).map((g) => {
            const kgKey = Object.keys(g).find((k) => /kg/i.test(k));
            return `<li><span class="dot"></span><span>${esc(g.grain || g.grain_name || g.item_name || 'Grain')}</span><span class="when">${kgKey ? UI.kg(g[kgKey]) : ''}</span></li>`;
          }).join('');
          const fact = (label, v, cls = '') => `<div class="fact"><span>${label}</span><b class="${cls}">${v}</b></div>`;
          const ledger = entries.length ? `<div class="mini-table"><table class="dt"><thead><tr><th>Date</th><th>What</th><th class="r">Charged</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead><tbody>
            ${entries.map((x) => `<tr><td class="nowrap">${esc(dateOnly(x.entry_date))}</td>
              <td>${esc(x.description || pretty(x.entry_type))}<div class="muted" style="font-size:12px">${esc(pretty(x.entry_type))}</div></td>
              <td class="r">${num(x.debit) ? UI.money(x.debit) : '–'}</td><td class="r">${num(x.credit) ? UI.money(x.credit) : '–'}</td>
              <td class="r"><b>${UI.money(x.running_balance)}</b></td></tr>`).join('')}</tbody></table></div>`
            : '<div class="gf-hint">No transactions yet.</div>';

          const body = m.el.querySelector('.gf-modal-body');
          body.querySelector('[data-loading]').remove();
          body.insertAdjacentHTML('beforeend', `
            <div class="who-head"><span class="gf-avatar" style="background:${UI.avatarColor(nameOf(c))}">${esc(UI.initials(nameOf(c)))}</span>
              <div class="grow"><h3>${esc(nameOf(c))}</h3><div class="sub">${esc([c.business_name !== nameOf(c) ? c.business_name : '', c.customer_code, c.phone].filter(Boolean).join(' · '))}</div></div>
              ${GF.can('customers.update') ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" data-edit type="button"><i class="bi bi-pencil"></i>Edit</button>' : ''}</div>
            <div class="fact-grid" style="grid-template-columns:repeat(3,1fr)">
              ${fact(bal < 0 ? 'In credit' : 'Owes us', UI.money(Math.abs(bal)), bal > 0 ? 'neg' : '')}
              ${fact('Overdue', num(c.overdue_amount) > 0 ? UI.money(c.overdue_amount) : '–', num(c.overdue_amount) > 0 ? 'neg' : '')}
              ${fact('Credit', c.credit_allowed ? `${c.credit_limit ? UI.money(c.credit_limit) : 'No limit'}${c.credit_days ? ` · ${c.credit_days} days` : ''}` : 'Cash only')}
            </div>
            ${grainRows ? `<div><div class="gf-label" style="margin-bottom:6px">Grain waiting at the mill</div><ul class="timeline">${grainRows}</ul></div>` : ''}
            <div><div style="display:flex;align-items:center;margin-bottom:6px"><span class="gf-label">Statement</span>
              ${GF.can('customers.opening_balance') && !entries.some((x) => x.entry_type === 'OPENING_BALANCE') ? '<button class="fchip outline" style="margin-left:auto" data-opening type="button">Set opening balance</button>' : ''}</div>${ledger}</div>`);

          const edit = m.el.querySelector('[data-edit]');
          if (edit) edit.addEventListener('click', () => { m.close(); openForm(id); });
          const opening = m.el.querySelector('[data-opening]');
          if (opening) opening.addEventListener('click', () => { m.close(); openOpening(c); });
        } catch (err) { m.error(err.message); }
      }

      // ------------------------------------------------------------ opening balance
      function openOpening(c) {
        const m = UI.modal({
          title: 'Opening balance',
          body: `<p>Enter what <b>${esc(nameOf(c))}</b> already owed you before you started using GrainFlow. This can only be set once.</p>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="ob-amt">Amount owed (KES)</label><input class="gf-input plain" id="ob-amt" type="number" inputmode="decimal" min="1" step="1"></div>
              <div class="gf-field"><label class="gf-label" for="ob-date">As of</label><input class="gf-input plain" id="ob-date" type="date" value="${new Date().toLocaleDateString('en-CA')}"></div>
            </div>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">Save balance</button>',
        });
        m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
          const amount = parseFloat(m.el.querySelector('#ob-amt').value);
          if (!(amount > 0)) { m.error('Enter an amount greater than 0.'); return; }
          m.error(''); m.busy(e.currentTarget, true);
          try {
            await Api.post(`/customers/${idOf(c)}/opening-balance`, { amount, as_of: m.el.querySelector('#ob-date').value || undefined });
            m.close(); UI.toast('Opening balance saved'); await load(true);
          } catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      // ------------------------------------------------------------ add / edit
      async function openForm(id) {
        const editing = !!id;
        let c = {};
        const m = UI.modal({
          title: editing ? 'Edit customer' : 'Add customer', wide: true,
          body: editing ? '<div class="gf-hint" data-loading>Loading…</div>' : '',
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button" disabled>Save customer</button>',
        });
        if (editing) {
          try { c = await Api.get(`/customers/${id}`); } catch (err) { m.error(err.message); return; }
          m.el.querySelector('[data-loading]').remove();
        }
        const types = [...s.types];
        if (c.customer_type && !types.includes(c.customer_type)) types.push(c.customer_type);
        const canCredit = GF.can('credit.grant');
        const v = (k) => esc(c[k] ?? '');

        m.el.querySelector('.gf-modal-body').insertAdjacentHTML('beforeend', `
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="cf-name">Full name</label><input class="gf-input plain" id="cf-name" value="${v('full_name')}" placeholder="e.g. Mary Wanjiku"></div>
            <div class="gf-field"><label class="gf-label" for="cf-phone">Phone</label><input class="gf-input plain" id="cf-phone" inputmode="tel" value="${v('phone')}" placeholder="0712345678"></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="cf-biz">Business name (optional)</label><input class="gf-input plain" id="cf-biz" value="${v('business_name')}" placeholder="Hotel, school, shop…"></div>
            <div class="gf-field"><label class="gf-label" for="cf-type">Type</label>
              <select class="gf-input plain" id="cf-type"><option value="">Default</option>${types.map((t) => `<option value="${esc(t)}" ${t === c.customer_type ? 'selected' : ''}>${esc(pretty(t))}</option>`).join('')}</select></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="cf-alt">Other phone (optional)</label><input class="gf-input plain" id="cf-alt" inputmode="tel" value="${v('alt_phone')}"></div>
            <div class="gf-field"><label class="gf-label" for="cf-email">Email (optional)</label><input class="gf-input plain" id="cf-email" type="email" value="${v('email')}"></div>
          </div>
          <div class="gf-field"><label class="gf-label" for="cf-addr">Address (optional)</label><input class="gf-input plain" id="cf-addr" value="${v('address')}"></div>
          ${canCredit ? `<div class="form-section"><span class="gf-label">Credit</span>
            <label class="gf-check"><input type="checkbox" id="cf-credit" ${c.credit_allowed ? 'checked' : ''}> Allow this customer to buy on credit</label>
            <div class="gf-row2 ${c.credit_allowed ? '' : 'gf-hidden'}" id="cf-credit-fields" style="margin-top:10px">
              <div class="gf-field"><label class="gf-label" for="cf-limit">Credit limit (KES)</label><input class="gf-input plain" id="cf-limit" type="number" min="0" step="100" value="${v('credit_limit')}"></div>
              <div class="gf-field"><label class="gf-label" for="cf-days">Days to pay</label><input class="gf-input plain" id="cf-days" type="number" min="0" step="1" value="${v('credit_days')}"></div>
            </div></div>` : ''}
          <div class="gf-field"><label class="gf-label" for="cf-notes">Notes (optional)</label><textarea class="gf-input plain" id="cf-notes">${v('notes')}</textarea></div>`);

        const $ = (q) => m.el.querySelector(q);
        const save = $('[data-ok]'); save.disabled = false;
        const creditBox = $('#cf-credit');
        if (creditBox) creditBox.addEventListener('change', () => $('#cf-credit-fields').classList.toggle('gf-hidden', !creditBox.checked));

        save.addEventListener('click', async () => {
          const name = $('#cf-name').value.trim();
          if (!name) { m.error('Enter the customer’s name.'); return; }
          const body = {
            full_name: name, business_name: $('#cf-biz').value.trim(), phone: $('#cf-phone').value.trim(), alt_phone: $('#cf-alt').value.trim(),
            email: $('#cf-email').value.trim(), address: $('#cf-addr').value.trim(), notes: $('#cf-notes').value.trim(),
          };
          if ($('#cf-type').value) body.customer_type = $('#cf-type').value;
          if (creditBox) {
            body.credit_allowed = creditBox.checked;
            if (creditBox.checked) { body.credit_limit = $('#cf-limit').value || 0; body.credit_days = $('#cf-days').value || 0; }
          }
          m.error(''); m.busy(save, true);
          try {
            if (editing) await Api.put(`/customers/${id}`, body); else await Api.post('/customers', body);
            m.close(); UI.toast(editing ? 'Customer updated' : 'Customer added'); await load(true);
          } catch (err) { m.busy(save, false); m.error(err.message); }
        });
      }

      paint();
      load();
    },
  });
})();