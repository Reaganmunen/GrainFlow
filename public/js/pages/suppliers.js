/**
 * Shared > Suppliers  (#/shared/suppliers)
 * List with search and filters, add/edit form, statement with running balance, pay a supplier, opening balance.
 * Uses /api/suppliers, /suppliers/:id, /suppliers/:id/ledger, /suppliers/:id/unpaid-purchases,
 * /suppliers/:id/opening-balance and POST /supplier-payments.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
  const today = () => new Date().toLocaleDateString('en-CA');
  const METHODS = [['CASH', 'Cash'], ['MPESA_MANUAL', 'M-Pesa'], ['BANK', 'Bank'], ['OTHER', 'Other']];

  GF.page('shared/suppliers', {
    title: 'Suppliers',
    render(el) {
      const s = { rows: [], total: 0, search: '', chip: '', loading: true, failed: '' };

      el.innerHTML = `<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>`;
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

      GF.setActions(GF.can('suppliers.create')
        ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="add-supplier" type="button"><i class="bi bi-plus-lg"></i>Add supplier</button>' : '');
      const addBtn = document.getElementById('add-supplier');
      if (addBtn) addBtn.addEventListener('click', () => openForm());

      // ------------------------------------------------------------ data
      async function load(quiet) {
        try {
          const q = s.search ? `&search=${encodeURIComponent(s.search)}` : '';
          const rows = await Api.get(`/suppliers?limit=500&active=true${q}`);
          s.rows = rows || [];
          s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false;
        paint();
      }

      const owed = (r) => num(r.amount_owed) > 0;
      const visible = (r) => (s.chip === 'owed' ? owed(r) : true);

      // ------------------------------------------------------------ painting
      function paintKpis() {
        const owing = s.rows.filter(owed);
        const total = owing.reduce((t, r) => t + num(r.amount_owed), 0);
        const top = owing.slice().sort((a, b) => num(b.amount_owed) - num(a.amount_owed))[0];
        const kpi = (icon, label, value, badge) => `<div class="kpi"><div class="tile"><i class="bi ${icon}"></i></div>
          <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${badge || ''}</div>`;
        kpisEl.innerHTML =
          kpi('bi-person-lines-fill', 'Suppliers', String(s.total)) +
          kpi('bi-wallet2', 'We owe', UI.money(total), `<span class="gf-badge gf-badge-amber">${owing.length} unpaid</span>`) +
          kpi('bi-check-circle', 'Fully paid', String(s.rows.length - owing.length)) +
          kpi('bi-exclamation-circle', top ? `Largest balance · ${esc(top.name)}` : 'Largest balance', top ? UI.money(top.amount_owed) : 'None');
      }

      function paintToolbar() {
        const shown = s.rows.filter(visible).length;
        toolbarEl.innerHTML = `
          <button type="button" class="fchip ${s.chip === '' ? 'on' : ''}" data-chip="">Everyone</button>
          <button type="button" class="fchip outline ${s.chip === 'owed' ? 'on' : ''}" data-chip="owed">We owe <span class="n">${s.rows.filter(owed).length}</span></button>
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="sup-search" placeholder="Name, code or phone" value="${esc(s.search)}" aria-label="Search suppliers"></label>
          <span class="count-note">Showing ${shown} of ${s.total}</span>`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = '<div class="dt-empty">Loading suppliers…</div>'; return; }
        const rows = s.rows.filter(visible);
        const err = s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)}</span></div>` : '';
        if (!rows.length) {
          const filtered = s.search || s.chip;
          hostEl.innerHTML = `${err}<div class="dt-empty"><div class="tile"><i class="bi bi-person-lines-fill"></i></div>
            <h3>${filtered ? 'No suppliers match' : 'No suppliers yet'}</h3>
            <p>${filtered ? 'Try a different name or clear the filter.' : 'Add the farmers and traders you buy grain from so purchases and what you owe them are tracked.'}</p>
            ${!filtered && GF.can('suppliers.create') ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">Add supplier</button>' : ''}</div>`;
          return;
        }
        const body = rows.map((r) => {
          const bal = num(r.amount_owed);
          return `<tr class="click" data-id="${r.id}">
            <td><div class="cell-who"><span class="gf-avatar" style="background:${UI.avatarColor(r.name)}">${esc(UI.initials(r.name))}</span>
              <div><strong>${esc(r.name)}</strong><span>${esc([r.contact_person, r.supplier_code].filter(Boolean).join(' · '))}</span></div></div></td>
            <td class="nowrap">${esc(r.phone || '–')}</td>
            <td class="nowrap">${r.payment_terms_days ? `${num(r.payment_terms_days)} days` : '<span class="muted">On delivery</span>'}</td>
            <td class="r ${bal > 0 ? 'neg' : bal < 0 ? 'pos' : 'muted'}">${bal === 0 ? '–' : bal < 0 ? `${UI.money(-bal)} advance` : UI.money(bal)}</td>
            <td class="r muted"><i class="bi bi-chevron-right"></i></td></tr>`;
        }).join('');
        hostEl.innerHTML = `${err}${s.total > s.rows.length ? `<div class="gf-note gf-note-amber" style="margin-bottom:10px"><i class="bi bi-info-circle"></i><span>Showing the first ${s.rows.length} of ${s.total} suppliers. Use the search box to narrow it down.</span></div>` : ''}
          <div class="dt-wrap"><table class="dt"><thead><tr><th>Supplier</th><th>Phone</th><th>Payment terms</th><th class="r">We owe</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
      }

      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const c = e.target.closest('[data-chip]');
        if (c) { s.chip = s.chip === c.dataset.chip ? '' : c.dataset.chip; paint(); }
      });
      toolbarEl.addEventListener('input', UI.debounce(async (e) => {
        if (e.target.id !== 'sup-search') return;
        s.search = e.target.value.trim();
        await load(true);
        const box = toolbarEl.querySelector('#sup-search');
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }, 300));
      hostEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) { openForm(); return; }
        const tr = e.target.closest('tr[data-id]');
        if (tr) openStatement(Number(tr.dataset.id));
      });

      // ------------------------------------------------------------ statement
      async function openStatement(id) {
        const m = UI.modal({ title: 'Supplier statement', wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
        try {
          const st = await Api.get(`/suppliers/${id}/ledger`);
          const sup = st.supplier, bal = num(st.amount_owed);
          const entries = (st.entries || []).slice().reverse();
          const fact = (label, v, cls = '') => `<div class="fact"><span>${label}</span><b class="${cls}">${v}</b></div>`;
          const ledger = entries.length ? `<div class="mini-table"><table class="dt"><thead><tr><th>Date</th><th>What</th><th class="r">Bought</th><th class="r">Paid</th><th class="r">We owe</th></tr></thead><tbody>
            ${entries.map((x) => `<tr><td class="nowrap">${esc(dateOnly(x.entry_date))}</td>
              <td>${esc(x.description || pretty(x.entry_type))}<div class="muted" style="font-size:12px">${esc(pretty(x.entry_type))}</div></td>
              <td class="r">${num(x.credit) ? UI.money(x.credit) : '–'}</td><td class="r">${num(x.debit) ? UI.money(x.debit) : '–'}</td>
              <td class="r"><b>${UI.money(x.running_balance)}</b></td></tr>`).join('')}</tbody></table></div>`
            : '<div class="gf-hint">No transactions yet.</div>';

          const body = m.el.querySelector('.gf-modal-body');
          body.querySelector('[data-loading]').remove();
          body.insertAdjacentHTML('beforeend', `
            <div class="who-head"><span class="gf-avatar" style="background:${UI.avatarColor(sup.name)}">${esc(UI.initials(sup.name))}</span>
              <div class="grow"><h3>${esc(sup.name)}</h3><div class="sub">${esc([sup.contact_person, sup.supplier_code, sup.phone].filter(Boolean).join(' · '))}</div></div>
              ${GF.can('purchases.create') ? '<button class="gf-btn gf-btn-green gf-btn-sm" data-pay type="button"><i class="bi bi-cash-coin"></i>Pay supplier</button>' : ''}
              ${GF.can('suppliers.update') ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" data-edit type="button"><i class="bi bi-pencil"></i>Edit</button>' : ''}</div>
            <div class="fact-grid" style="grid-template-columns:repeat(3,1fr)">
              ${fact(bal < 0 ? 'Paid in advance' : 'We owe', UI.money(Math.abs(bal)), bal > 0 ? 'neg' : '')}
              ${fact('Payment terms', sup.payment_terms_days ? `${num(sup.payment_terms_days)} days` : 'On delivery')}
              ${fact('Address', esc(sup.address || '–'))}
            </div>
            ${sup.notes ? `<div class="gf-hint">${esc(sup.notes)}</div>` : ''}
            <div><div style="display:flex;align-items:center;margin-bottom:6px"><span class="gf-label">Statement</span>
              ${GF.can('suppliers.opening_balance') && !entries.some((x) => x.entry_type === 'OPENING_BALANCE') ? '<button class="fchip outline" style="margin-left:auto" data-opening type="button">Set opening balance</button>' : ''}</div>${ledger}</div>`);

          const on = (sel, fn) => { const b = m.el.querySelector(sel); if (b) b.addEventListener('click', fn); };
          on('[data-edit]', () => { m.close(); openForm(id); });
          on('[data-opening]', () => { m.close(); openOpening(sup); });
          on('[data-pay]', () => { m.close(); openPay(sup, bal); });
        } catch (err) { m.error(err.message); }
      }

      // ------------------------------------------------------------ pay supplier
      async function openPay(sup, owedNow) {
        const m = UI.modal({
          title: 'Pay supplier',
          body: '<div class="gf-hint" data-loading>Loading…</div>',
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button" disabled>Record payment</button>',
        });
        let unpaid = [];
        try { unpaid = await Api.get(`/suppliers/${sup.id}/unpaid-purchases`); } catch (err) { m.error(err.message); }
        m.el.querySelector('[data-loading]').remove();

        m.el.querySelector('.gf-modal-body').insertAdjacentHTML('beforeend', `
          <p>Paying <b>${esc(sup.name)}</b>${owedNow > 0 ? `. You owe them <b>${UI.money(owedNow)}</b>.` : '.'}</p>
          <div class="gf-field"><label class="gf-label" for="sp-purchase">Pay towards</label>
            <select class="gf-input plain" id="sp-purchase">
              ${unpaid.map((p) => `<option value="${p.id}" data-due="${num(p.balance_due)}">${esc(p.purchase_no)} · ${esc(dateOnly(p.purchase_date))} · ${UI.money(p.balance_due)} due</option>`).join('')}
              <option value="">General payment (not tied to one purchase)</option>
            </select></div>
          <div class="gf-field gf-hidden" id="sp-module-row"><label class="gf-label" for="sp-module">Which business is this for?</label>
            <select class="gf-input plain" id="sp-module"><option value="CEREAL">Cereals</option><option value="MILL">Posho mill</option></select></div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="sp-amount">Amount (KES)</label><input class="gf-input plain" id="sp-amount" type="number" inputmode="decimal" min="1" step="1"></div>
            <div class="gf-field"><label class="gf-label" for="sp-method">Method</label>
              <select class="gf-input plain" id="sp-method">${METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
          </div>
          <div class="gf-field gf-hidden" id="sp-code-row"><label class="gf-label" for="sp-code">M-Pesa code</label><input class="gf-input plain" id="sp-code" autocapitalize="characters" placeholder="e.g. SJK4L2M9QP"></div>
          <div class="gf-field"><label class="gf-label" for="sp-note">Note (optional)</label><input class="gf-input plain" id="sp-note"></div>`);

        const $ = (q) => m.el.querySelector(q);
        const save = $('[data-ok]'); save.disabled = false;
        const syncPurchase = () => {
          const opt = $('#sp-purchase').selectedOptions[0];
          const tied = !!$('#sp-purchase').value;
          $('#sp-module-row').classList.toggle('gf-hidden', tied);
          if (tied) $('#sp-amount').value = opt.dataset.due || '';
        };
        $('#sp-purchase').addEventListener('change', syncPurchase);
        $('#sp-method').addEventListener('change', (e) => $('#sp-code-row').classList.toggle('gf-hidden', e.target.value !== 'MPESA_MANUAL'));
        syncPurchase();

        save.addEventListener('click', async () => {
          const amount = parseFloat($('#sp-amount').value);
          if (!(amount > 0)) { m.error('Enter an amount greater than 0.'); return; }
          const method = $('#sp-method').value;
          const code = $('#sp-code').value.trim().toUpperCase();
          if (method === 'MPESA_MANUAL' && !code) { m.error('Enter the M-Pesa transaction code.'); return; }
          const body = { supplier_id: sup.id, amount, method };
          if ($('#sp-purchase').value) body.purchase_id = Number($('#sp-purchase').value); else body.module = $('#sp-module').value;
          if (method === 'MPESA_MANUAL') body.mpesa_code = code;
          if ($('#sp-note').value.trim()) body.note = $('#sp-note').value.trim();
          m.error(''); m.busy(save, true);
          try {
            await Api.post('/supplier-payments', body);
            m.close(); UI.toast('Payment recorded'); await load(true);
          } catch (err) { m.busy(save, false); m.error(err.message); }
        });
      }

      // ------------------------------------------------------------ opening balance
      function openOpening(sup) {
        const m = UI.modal({
          title: 'Opening balance',
          body: `<p>Enter what you already owed <b>${esc(sup.name)}</b> before you started using GrainFlow. This can only be set once.</p>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="ob-amt">Amount we owe (KES)</label><input class="gf-input plain" id="ob-amt" type="number" inputmode="decimal" min="1" step="1"></div>
              <div class="gf-field"><label class="gf-label" for="ob-date">As of</label><input class="gf-input plain" id="ob-date" type="date" value="${today()}"></div>
            </div>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">Save balance</button>',
        });
        m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
          const amount = parseFloat(m.el.querySelector('#ob-amt').value);
          if (!(amount > 0)) { m.error('Enter an amount greater than 0.'); return; }
          m.error(''); m.busy(e.currentTarget, true);
          try {
            await Api.post(`/suppliers/${sup.id}/opening-balance`, { amount, as_of: m.el.querySelector('#ob-date').value || undefined });
            m.close(); UI.toast('Opening balance saved'); await load(true);
          } catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      // ------------------------------------------------------------ add / edit
      async function openForm(id) {
        const editing = !!id;
        let c = {};
        const m = UI.modal({
          title: editing ? 'Edit supplier' : 'Add supplier', wide: true,
          body: editing ? '<div class="gf-hint" data-loading>Loading…</div>' : '',
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button" disabled>Save supplier</button>',
        });
        if (editing) {
          try { c = await Api.get(`/suppliers/${id}`); } catch (err) { m.error(err.message); return; }
          m.el.querySelector('[data-loading]').remove();
        }
        const v = (k) => esc(c[k] ?? '');

        m.el.querySelector('.gf-modal-body').insertAdjacentHTML('beforeend', `
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="sf-name">Supplier name</label><input class="gf-input plain" id="sf-name" value="${v('name')}" placeholder="e.g. Kamau Grain Traders"></div>
            <div class="gf-field"><label class="gf-label" for="sf-contact">Contact person (optional)</label><input class="gf-input plain" id="sf-contact" value="${v('contact_person')}"></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="sf-phone">Phone</label><input class="gf-input plain" id="sf-phone" inputmode="tel" value="${v('phone')}" placeholder="0712345678"></div>
            <div class="gf-field"><label class="gf-label" for="sf-email">Email (optional)</label><input class="gf-input plain" id="sf-email" type="email" value="${v('email')}"></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="sf-addr">Address (optional)</label><input class="gf-input plain" id="sf-addr" value="${v('address')}"></div>
            <div class="gf-field"><label class="gf-label" for="sf-terms">Days to pay (0 = on delivery)</label><input class="gf-input plain" id="sf-terms" type="number" min="0" step="1" value="${v('payment_terms_days') || 0}"></div>
          </div>
          <div class="gf-field"><label class="gf-label" for="sf-notes">Notes (optional)</label><textarea class="gf-input plain" id="sf-notes">${v('notes')}</textarea></div>
          ${editing ? `<label class="gf-check"><input type="checkbox" id="sf-active" ${c.is_active === false ? '' : 'checked'}> Active (untick to hide this supplier from the list)</label>` : ''}`);

        const $ = (q) => m.el.querySelector(q);
        const save = $('[data-ok]'); save.disabled = false;

        save.addEventListener('click', async () => {
          const name = $('#sf-name').value.trim();
          if (!name) { m.error('Enter the supplier’s name.'); return; }
          const body = {
            name, contact_person: $('#sf-contact').value.trim(), phone: $('#sf-phone').value.trim(), email: $('#sf-email').value.trim(),
            address: $('#sf-addr').value.trim(), notes: $('#sf-notes').value.trim(),
            payment_terms_days: parseInt($('#sf-terms').value, 10) || 0,
          };
          if (editing) body.is_active = $('#sf-active').checked;
          m.error(''); m.busy(save, true);
          try {
            if (editing) await Api.put(`/suppliers/${id}`, body); else await Api.post('/suppliers', body);
            m.close(); UI.toast(editing ? 'Supplier updated' : 'Supplier added'); await load(true);
          } catch (err) { m.busy(save, false); m.error(err.message); }
        });
      }

      paint();
      load();
    },
  });
})();