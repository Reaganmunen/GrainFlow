/**
 * Shared > Payments  (#/shared/payments)
 * Every payment taken at the tills or on account: cash, M-Pesa prompts, M-Pesa codes, bank and other.
 * Filter by date, status, method and business; open one to see where it was applied and the M-Pesa attempts;
 * chase a waiting M-Pesa prompt, confirm it with the SMS code, cancel it, apply a loose payment to unpaid sales,
 * or reverse it (with a reason, and a manager's approval if you cannot approve yourself).
 * Also: receive a payment on account from a customer (not tied to one sale).
 * Uses GET /payments, GET /payments/:id, POST /payments/on-account, /expire-stale, /:id/allocate,
 * /:id/stk-query, /:id/confirm-manually, /:id/cancel, /:id/reverse and GET /customers/lookup.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const fmt = (n) => num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  const stamp = (v) => (v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
  const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const range = (key) => Kit.range(key);

  const METHOD = { CASH: 'Cash', MPESA_STK: 'M-Pesa prompt', MPESA_MANUAL: 'M-Pesa code', BANK: 'Bank', OTHER: 'Other' };
  const MODULE = { MILL: 'Mill', CEREAL: 'Cereals', SHARED: 'Shared' };
  const STATE = {
    CONFIRMED: ['green', 'Confirmed'], PENDING: ['amber', 'Waiting'], FAILED: ['red', 'Failed'],
    CANCELLED: ['', 'Cancelled'], REVERSED: ['red', 'Reversed'],
  };
  const statePill = (st) => { const [tone, label] = STATE[st] || ['', pretty(st)]; return `<span class="pill ${tone}">${esc(label)}</span>`; };
  const isMpesa = (m) => String(m || '').startsWith('MPESA');
  const nameOf = (c) => (c && (c.full_name || c.business_name)) || '';

  GF.page('shared/payments', {
    title: 'Payments',
    render(el) {
      const multiModule = GF.isOwner || GF.modules.length > 1;
      const s = {
        rows: [], total: 0, loading: true, failed: '',
        rng: 'today', from: range('today').from, to: range('today').to,
        state: '', method: '', module: '', search: '',
      };

      el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div class="toolbar" id="toolbar2"></div><div id="table-host"></div>';
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'),
        toolbar2El = el.querySelector('#toolbar2'), hostEl = el.querySelector('#table-host');

      GF.setActions(`<button class="icon-sq" id="pay-refresh" type="button" title="Refresh" aria-label="Refresh"><i class="bi bi-arrow-clockwise"></i></button>
        ${GF.can('payments.create') ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="pay-receive" type="button"><i class="bi bi-wallet2"></i>Receive payment</button>' : ''}`);
      const refreshBtn = document.getElementById('pay-refresh');
      const receiveBtn = document.getElementById('pay-receive');

      // ------------------------------------------------------------ data
      async function load(quiet) {
        try {
          const q = new URLSearchParams({ limit: '500' });
          if (s.from) q.set('from', s.from);
          if (s.to) q.set('to', s.to);
          if (s.state) q.set('state', s.state);
          if (s.module) q.set('module', s.module);
          if (s.search) q.set('search', s.search);
          const rows = await Api.get(`/payments?${q}`);
          s.rows = rows || [];
          s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false;
        paint();
      }

      // the method filter is applied here (M-Pesa covers both the prompt and the typed-in code)
      const visible = () => s.rows.filter((r) => {
        if (!s.method) return true;
        if (s.method === 'MPESA') return isMpesa(r.method);
        return r.method === s.method;
      });

      // ------------------------------------------------------------ painting
      function paintKpis() {
        const rows = visible();
        const done = rows.filter((r) => r.state === 'CONFIRMED');
        const sum = (list) => list.reduce((t, r) => t + num(r.amount), 0);
        const waiting = rows.filter((r) => r.state === 'PENDING').length;
        kpisEl.innerHTML =
          Kit.kpi('bi-wallet2', 'Received', UI.money(sum(done)), `<span class="gf-badge">${done.length} payments</span>`) +
          Kit.kpi('bi-cash-coin', 'Cash', UI.money(sum(done.filter((r) => r.method === 'CASH'))), '', 'cereal') +
          Kit.kpi('bi-phone', 'M-Pesa', UI.money(sum(done.filter((r) => isMpesa(r.method)))), '', 'mill') +
          Kit.kpi('bi-hourglass-split', 'Waiting on M-Pesa', String(waiting),
            waiting ? '<span class="gf-badge gf-badge-amber">Needs a look</span>' : '<span class="gf-badge gf-badge-green">None</span>');
      }

      const chip = (attr, key, label, on, outline) =>
        `<button type="button" class="fchip ${outline ? 'outline' : ''} ${on ? 'on' : ''}" data-${attr}="${esc(key)}">${esc(label)}</button>`;

      function paintToolbar() {
        const r = (key, label) => chip('range', key, label, s.rng === key, false);
        toolbarEl.innerHTML = `
          ${r('today', 'Today')}${r('week', '7 days')}${r('month', 'This month')}${r('all', 'All time')}
          <span class="sep"></span>
          <label class="date-box">From <input type="date" id="p-from" value="${esc(s.from || '')}"></label>
          <label class="date-box">To <input type="date" id="p-to" value="${esc(s.to || '')}"></label>
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="p-search" placeholder="Payment no, M-Pesa code, phone or customer" value="${esc(s.search)}" aria-label="Search payments"></label>`;

        const st = (key, label) => chip('state', key, label, s.state === key, true);
        const me = (key, label) => chip('method', key, label, s.method === key, true);
        const mo = (key, label) => chip('module', key, label, s.module === key, true);
        toolbar2El.innerHTML = `
          ${st('CONFIRMED', 'Confirmed')}${st('PENDING', 'Waiting')}${st('FAILED', 'Failed')}${st('CANCELLED', 'Cancelled')}${st('REVERSED', 'Reversed')}
          <span class="sep"></span>
          ${me('CASH', 'Cash')}${me('MPESA', 'M-Pesa')}${me('BANK', 'Bank')}${me('OTHER', 'Other')}
          ${multiModule ? `<span class="sep"></span>${mo('MILL', 'Mill')}${mo('CEREAL', 'Cereals')}${GF.isOwner ? mo('SHARED', 'Shared') : ''}` : ''}`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = Kit.loading('payments'); return; }
        const err = s.failed ? Kit.error(s.failed) : '';
        const rows = visible();
        if (!rows.length) {
          const filtered = s.search || s.state || s.method || s.module;
          hostEl.innerHTML = `${err}${Kit.empty('bi-wallet2', 'No payments found', filtered ? 'Try clearing the filters.' : 'No payment was taken in this period.')}`;
          return;
        }
        const body = rows.map((r) => {
          const live = r.state === 'CONFIRMED';
          const detail = r.mpesa_receipt || r.payer_phone || '';
          return `<tr class="click" data-id="${r.id}">
            <td><div class="cell-plain"><strong>${esc(r.payment_no || `#${r.id}`)}</strong><span>${esc(stamp(r.received_at))}</span></div></td>
            <td>${esc(r.customer_name || 'Walk-in')}</td>
            <td><div class="cell-plain"><strong>${esc(METHOD[r.method] || pretty(r.method))}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</div></td>
            ${multiModule ? `<td class="muted">${esc(MODULE[r.module] || pretty(r.module))}</td>` : ''}
            <td class="r ${live ? '' : 'muted'}" ${r.state === 'REVERSED' ? 'style="text-decoration:line-through"' : ''}>${UI.money(r.amount)}</td>
            <td>${statePill(r.state)}</td>
            <td class="muted">${esc(r.received_by_name || '')}</td></tr>`;
        }).join('');
        const heads = [['Payment'], ['Customer'], ['Method']];
        if (multiModule) heads.push(['Business']);
        heads.push(['Amount', 'r'], ['Status'], ['Received by']);
        hostEl.innerHTML = `${err}${s.total > s.rows.length ? Kit.note(`Showing the latest ${s.rows.length} of ${s.total} payments. Narrow the dates to see the rest.`, 'amber') : ''}
          ${Kit.table(heads, body)}`;
      }

      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const r = e.target.closest('[data-range]');
        if (!r) return;
        s.rng = r.dataset.range; Object.assign(s, { from: '', to: '' }, range(s.rng));
        load(); paintToolbar();
      });
      toolbarEl.addEventListener('change', (e) => {
        if (e.target.id !== 'p-from' && e.target.id !== 'p-to') return;
        s.from = toolbarEl.querySelector('#p-from').value; s.to = toolbarEl.querySelector('#p-to').value; s.rng = 'custom';
        load(); paintToolbar();
      });
      toolbarEl.addEventListener('input', UI.debounce(async (e) => {
        if (e.target.id !== 'p-search') return;
        s.search = e.target.value.trim();
        await load(true);
        const box = toolbarEl.querySelector('#p-search');
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }, 300));
      toolbar2El.addEventListener('click', (e) => {
        const st = e.target.closest('[data-state]');
        const me = e.target.closest('[data-method]');
        const mo = e.target.closest('[data-module]');
        if (st) { s.state = s.state === st.dataset.state ? '' : st.dataset.state; load(); }
        else if (me) { s.method = s.method === me.dataset.method ? '' : me.dataset.method; }
        else if (mo) { s.module = s.module === mo.dataset.module ? '' : mo.dataset.module; load(); }
        else return;
        paint();
      });
      hostEl.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (tr) openPayment(Number(tr.dataset.id));
      });

      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('spin');
        // close off prompts the customer never answered, so the list is honest
        if (GF.can('payments.create')) { try { await Api.post('/payments/expire-stale', {}); } catch (_) { /* not important */ } }
        await load(true);
        refreshBtn.classList.remove('spin');
      });
      if (receiveBtn) receiveBtn.addEventListener('click', () => openReceive());

      // ------------------------------------------------------------ one payment
      async function openPayment(id) {
        const m = UI.modal({ title: 'Payment', wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
        let p;
        try { p = await Api.get(`/payments/${id}`); }
        catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); return; }

        const canCreate = GF.can('payments.create');
        const canCode = GF.can('payments.mpesa_manual');
        const isStk = p.method === 'MPESA_STK';
        const allocs = p.allocations || [];
        const allocated = allocs.reduce((t, a) => t + num(a.amount), 0);
        const loose = Math.round((num(p.amount) - allocated) * 100) / 100;

        const allocRows = allocs.map((a) => `<tr><td>${esc(a.sale_no)}</td><td class="r">${UI.money(a.amount)}</td></tr>`).join('')
          + (p.state === 'CONFIRMED' && loose > 0.004 ? `<tr><td class="muted">Left on the customer’s account</td><td class="r">${UI.money(loose)}</td></tr>` : '');
        const tries = (p.stk_requests || []).map((r) => `<li><span class="dot"></span>
          <span>${esc(pretty(r.status))} · ${esc(r.phone || '')}${r.result_desc ? `<div class="muted" style="font-size:12px">${esc(r.result_desc)}</div>` : ''}${r.mpesa_receipt ? `<div class="muted" style="font-size:12px">Code ${esc(r.mpesa_receipt)}</div>` : ''}</span>
          <span class="when">${UI.money(r.amount)} · ${esc(stamp(r.initiated_at))}</span></li>`).join('');

        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        body.insertAdjacentHTML('beforeend', `
          <div class="who-head"><div class="grow"><h3>${esc(p.payment_no || `Payment #${p.id}`)} ${statePill(p.state)}</h3>
            <div class="sub">${esc(stamp(p.received_at))} · ${esc(p.customer_name || 'Walk-in')}</div></div></div>
          <div class="fact-grid">
            ${Kit.fact('Amount', UI.money(p.amount))}${Kit.fact('Method', esc(METHOD[p.method] || pretty(p.method)))}
            ${Kit.fact('M-Pesa code', esc(p.mpesa_receipt || '–'))}${Kit.fact('Phone', esc(p.payer_phone || '–'))}
            ${Kit.fact('Business', esc(MODULE[p.module] || pretty(p.module)))}${Kit.fact('Confirmed', esc(stamp(p.confirmed_at)))}
          </div>
          ${p.note ? `<div class="gf-hint">${esc(p.note)}</div>` : ''}
          ${p.state === 'PENDING' ? Kit.note('The customer has not answered the M-Pesa prompt yet. You can check with Safaricom, confirm with the SMS code, or cancel it.', 'amber', 'bi-hourglass-split') : ''}
          ${allocRows ? `<div class="form-section"><span class="gf-label">Applied to</span>
            <div class="mini-table"><table class="dt"><thead><tr><th>Sale</th><th class="r">Amount</th></tr></thead><tbody>${allocRows}</tbody></table></div></div>` : ''}
          ${tries ? `<div class="form-section"><span class="gf-label">M-Pesa attempts</span><ul class="timeline">${tries}</ul></div>` : ''}
          ${isStk && canCode && ['PENDING', 'FAILED', 'CANCELLED'].includes(p.state) ? `<div class="form-section"><span class="gf-label">Confirm with the M-Pesa code</span>
            <div class="gf-hint" style="margin-bottom:8px">Use this when the customer shows the confirmation SMS but the payment did not update.</div>
            <div class="field-inline"><input class="gf-input plain" id="pd-code" placeholder="e.g. SJK4N8XYZ1" autocomplete="off" style="text-transform:uppercase">
            <button type="button" class="gf-btn gf-btn-dark gf-btn-sm" data-confirm>Confirm</button></div></div>` : ''}`);

        const foot = document.createElement('div');
        foot.className = 'gf-modal-foot';
        foot.innerHTML = `<button class="gf-btn gf-btn-ghost" type="button" data-close>Close</button>
          ${isStk && p.state === 'PENDING' && canCreate ? '<button class="gf-btn gf-btn-ghost" type="button" data-query><i class="bi bi-search"></i>Check with Safaricom</button><button class="gf-btn gf-btn-ghost" type="button" data-cancel><i class="bi bi-x-circle"></i>Cancel prompt</button>' : ''}
          ${p.state === 'CONFIRMED' && p.customer_id && loose > 0.004 && canCreate ? '<button class="gf-btn gf-btn-green" type="button" data-allocate><i class="bi bi-diagram-3"></i>Apply to unpaid sales</button>' : ''}
          ${p.state === 'CONFIRMED' ? '<button class="gf-btn gf-btn-ghost" type="button" data-reverse><i class="bi bi-arrow-counterclockwise"></i>Reverse</button>' : ''}`;
        m.el.querySelector('.gf-modal').appendChild(foot);

        const again = () => { m.close(); load(true); openPayment(id); };
        m.el.addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-query], [data-cancel], [data-allocate], [data-reverse], [data-confirm]');
          if (!btn) return;
          m.error('');
          if (btn.hasAttribute('data-reverse')) { m.close(); openReverse(p); return; }
          if (btn.hasAttribute('data-confirm')) {
            const code = m.el.querySelector('#pd-code').value.trim().toUpperCase();
            if (!code) { m.error('Enter the M-Pesa transaction code.'); return; }
            m.busy(btn, true);
            try { await Api.post(`/payments/${id}/confirm-manually`, { mpesa_receipt: code }); UI.toast('Payment confirmed'); again(); }
            catch (err) { m.error(err.message); m.busy(btn, false); }
            return;
          }
          m.busy(btn, true);
          try {
            if (btn.hasAttribute('data-query')) {
              const r = await Api.post(`/payments/${id}/stk-query`, {});
              UI.toast(r.note || 'Checked with Safaricom');
            } else if (btn.hasAttribute('data-cancel')) {
              await Api.post(`/payments/${id}/cancel`, {});
              UI.toast('Prompt cancelled');
            } else if (btn.hasAttribute('data-allocate')) {
              const r = await Api.post(`/payments/${id}/allocate`, {});
              UI.toast(num(r.unallocated) > 0 ? `Applied. ${UI.money(r.unallocated)} is still on the customer’s account.` : 'Applied to the customer’s unpaid sales');
            }
            again();
          } catch (err) { m.error(err.message); m.busy(btn, false); }
        });
      }

      // ------------------------------------------------------------ reverse
      function openReverse(p) {
        const selfApprove = GF.can('payments.reverse');
        const m = UI.modal({
          title: `Reverse ${p.payment_no || 'payment'}`,
          body: `<div class="gf-note gf-note-amber"><i class="bi bi-exclamation-triangle"></i><span>${UI.money(p.amount)} is taken off what ${esc(p.customer_name || 'the customer')} has paid, and the sale balance goes back up. This cannot be undone.</span></div>
            <div class="gf-field"><label class="gf-label" for="rv-reason">Reason</label><textarea class="gf-input plain" id="rv-reason" placeholder="e.g. Entered twice by mistake"></textarea></div>
            ${selfApprove ? '' : `<div class="form-section"><span class="gf-label">Manager approval</span>
              <div class="gf-row2"><input class="gf-input plain" id="rv-u" placeholder="Manager username" autocomplete="off"><input class="gf-input plain" id="rv-p" type="password" placeholder="Manager password" autocomplete="off"></div></div>`}`,
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-dark" type="button" data-ok>Reverse payment</button>',
        });
        const okBtn = m.el.querySelector('[data-ok]');
        okBtn.addEventListener('click', async () => {
          m.error('');
          const reason = m.el.querySelector('#rv-reason').value.trim();
          if (!reason) { m.error('Give a reason for reversing this payment.'); return; }
          const b = { reason };
          if (!selfApprove) {
            b.approver_username = m.el.querySelector('#rv-u').value.trim();
            b.approver_password = m.el.querySelector('#rv-p').value;
            if (!b.approver_username || !b.approver_password) { m.error('Enter the manager’s username and password.'); return; }
          }
          m.busy(okBtn, true);
          try {
            // a wrong manager password answers 401, which must not sign this user out
            await Api.post(`/payments/${p.id}/reverse`, b, selfApprove ? undefined : { handle401: false });
            m.close();
            UI.toast('Payment reversed');
            load(true);
            openPayment(p.id);
          } catch (err) { m.error(err.message); m.busy(okBtn, false); }
        });
      }

      // ------------------------------------------------------------ receive a payment on account
      function openReceive() {
        const canCode = GF.can('payments.mpesa_manual');
        const methods = [['CASH', 'Cash']];
        if (canCode) methods.push(['MPESA_MANUAL', 'M-Pesa code']);
        methods.push(['BANK', 'Bank'], ['OTHER', 'Other']);

        const mods = GF.modules.map((k) => [k, MODULE[k] || pretty(k)]);
        if (GF.isOwner) mods.push(['SHARED', 'Shared (both businesses)']);
        const space = document.body.dataset.space;
        const startModule = (space === 'mill' && GF.inModule('MILL')) ? 'MILL' : (space === 'cereal' && GF.inModule('CEREAL')) ? 'CEREAL' : (mods[0] ? mods[0][0] : 'CEREAL');

        const f = { customer: null, lookup: [], module: startModule, method: 'CASH', amount: '', code: '', phone: '', note: '', allocate: true };
        const m = UI.modal({
          title: 'Receive payment',
          body: `<div class="gf-hint">For money a customer pays towards what they owe, not tied to one sale.</div>
            <div class="gf-field"><span class="gf-label">Customer</span><div class="pick" id="r-cust"></div></div>
            ${mods.length > 1 ? `<div class="gf-field"><label class="gf-label" for="r-module">Business</label>
              <select class="gf-input plain" id="r-module">${mods.map(([k, l]) => `<option value="${esc(k)}" ${k === f.module ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : ''}
            <div class="gf-seg pay-seg" id="r-seg">${methods.map(([k, l]) => `<button type="button" data-m="${k}">${l}</button>`).join('')}</div>
            <div id="r-panel" class="gf-stack"></div>
            <label class="gf-check"><input type="checkbox" id="r-alloc" checked> Spread it over the customer’s oldest unpaid sales</label>`,
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-green" type="button" data-ok>Record payment</button>',
        });
        const custEl = m.el.querySelector('#r-cust'), panel = m.el.querySelector('#r-panel'), okBtn = m.el.querySelector('[data-ok]');

        function paintCust() {
          if (f.customer) {
            const bal = num(f.customer.balance);
            custEl.innerHTML = `<div class="picked"><div class="who"><strong>${esc(nameOf(f.customer))}</strong>
              <span>${bal > 0 ? `Owes ${UI.money(bal)}` : bal < 0 ? `Has ${UI.money(-bal)} credit` : 'Nothing owed'}${f.customer.phone ? ` · ${esc(f.customer.phone)}` : ''}</span></div>
              <button class="icon-sq" type="button" data-clear aria-label="Change customer"><i class="bi bi-x-lg"></i></button></div>`;
          } else {
            custEl.innerHTML = '<input class="gf-input plain" id="r-q" placeholder="Search name, code or phone" autocomplete="off"><div class="pick-list gf-hidden" id="r-list"></div>';
          }
        }
        function paintPanel() {
          m.el.querySelectorAll('#r-seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === f.method));
          panel.innerHTML = `<div class="gf-field"><label class="gf-label" for="r-amount">Amount (KES)</label>
              <input class="gf-input plain" id="r-amount" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.amount)}"></div>
            ${f.method === 'MPESA_MANUAL' ? `<div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="r-code">M-Pesa code</label><input class="gf-input plain" id="r-code" placeholder="e.g. SJK4N8XYZ1" value="${esc(f.code)}" autocomplete="off" style="text-transform:uppercase"></div>
              <div class="gf-field"><label class="gf-label" for="r-phone">Payer’s phone (optional)</label><input class="gf-input plain" id="r-phone" inputmode="tel" value="${esc(f.phone)}" autocomplete="off"></div></div>` : ''}
            <div class="gf-field"><label class="gf-label" for="r-note">Note (optional)</label><input class="gf-input plain" id="r-note" value="${esc(f.note)}" autocomplete="off"></div>`;
        }
        paintCust(); paintPanel();

        const search = UI.debounce(async (term) => {
          const list = custEl.querySelector('#r-list'); if (!list) return;
          if (term.length < 2) { list.classList.add('gf-hidden'); return; }
          try {
            f.lookup = (await Api.get(`/customers/lookup?q=${encodeURIComponent(term)}`)) || [];
            list.classList.remove('gf-hidden');
            list.innerHTML = f.lookup.length
              ? f.lookup.map((c, i) => `<button type="button" data-i="${i}"><span>${esc(nameOf(c))}</span><small>${num(c.balance) > 0 ? `Owes ${esc(fmt(c.balance))}` : esc(c.phone || c.customer_code || '')}</small></button>`).join('')
              : '<div class="pick-empty">No customer found. Add the customer first.</div>';
          } catch (err) { m.error(err.message); }
        }, 250);

        custEl.addEventListener('input', (e) => { if (e.target.id === 'r-q') search(e.target.value.trim()); });
        custEl.addEventListener('click', (e) => {
          const pick = e.target.closest('[data-i]');
          if (pick) { f.customer = f.lookup[Number(pick.dataset.i)]; f.lookup = []; paintCust(); const a = panel.querySelector('#r-amount'); if (a) a.focus(); return; }
          if (e.target.closest('[data-clear]')) { f.customer = null; paintCust(); const q = custEl.querySelector('#r-q'); if (q) q.focus(); }
        });
        m.el.querySelector('#r-seg').addEventListener('click', (e) => {
          const b = e.target.closest('[data-m]'); if (!b) return;
          f.method = b.dataset.m; m.error(''); paintPanel();
        });
        panel.addEventListener('input', (e) => {
          const id = e.target.id;
          if (id === 'r-amount') f.amount = e.target.value;
          else if (id === 'r-code') f.code = e.target.value;
          else if (id === 'r-phone') f.phone = e.target.value;
          else if (id === 'r-note') f.note = e.target.value;
        });
        const modSel = m.el.querySelector('#r-module');
        if (modSel) modSel.addEventListener('change', () => { f.module = modSel.value; });
        m.el.querySelector('#r-alloc').addEventListener('change', (e) => { f.allocate = e.target.checked; });

        okBtn.addEventListener('click', async () => {
          m.error('');
          if (!f.customer) { m.error('Pick the customer who is paying.'); return; }
          const amount = num(f.amount);
          if (!(amount > 0)) { m.error('Enter the amount.'); return; }
          if (f.method === 'MPESA_MANUAL' && !f.code.trim()) { m.error('Enter the M-Pesa transaction code.'); return; }
          const b = { customer_id: f.customer.id, module: f.module, method: f.method, amount, allocate: f.allocate };
          if (f.method === 'MPESA_MANUAL') { b.mpesa_receipt = f.code.trim().toUpperCase(); if (f.phone.trim()) b.payer_phone = f.phone.trim(); }
          if (f.note.trim()) b.note = f.note.trim();
          m.busy(okBtn, true);
          try {
            const r = await Api.post('/payments/on-account', b);
            m.close();
            const left = num(r && r.unallocated);
            UI.toast(!f.allocate || left > 0.004 ? `Payment recorded. ${UI.money(left)} is on the customer’s account.` : 'Payment recorded and applied to unpaid sales');
            load(true);
          } catch (err) { m.error(err.message); m.busy(okBtn, false); }
        });
      }

      paint();
      load();
    },
  });
})();