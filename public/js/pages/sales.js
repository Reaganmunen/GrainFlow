/**
 * Sales lists: Mill > Sales (#/mill/sales) and Cereals > Sales (#/cereal/sales).
 * Filter by date, unpaid, credit or voided; open a sale to see its lines and payments, collect a balance,
 * reprint the receipt or void it.
 * Uses GET /sales, GET /sales/:id, POST /sales/:id/payments, /mpesa-stk, /receipt, /void.
 * Shares the receipt and M-Pesa waiting screens with the till through window.GFPay (js/pages/till.js).
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = (n) => num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const stamp = (v) => new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
  const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

  function range(key) {
    const now = new Date();
    if (key === 'today') return { from: ymd(now), to: ymd(now) };
    if (key === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: ymd(d), to: ymd(now) }; }
    if (key === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    return { from: '', to: '' };
  }

  const statusPill = (r) => {
    if (r.status === 'VOIDED') return '<span class="pill red">Voided</span>';
    if (r.status === 'DRAFT') return '<span class="pill">Draft</span>';
    if (num(r.balance_due) > 0) return num(r.amount_paid) > 0 ? '<span class="pill amber">Part paid</span>' : '<span class="pill amber">Unpaid</span>';
    return '<span class="pill green">Paid</span>';
  };

  function salesPage({ path, module, title }) {
    GF.page(path, {
      title,
      render(el) {
        const s = { rows: [], total: 0, loading: true, failed: '', rng: 'today', from: range('today').from, to: range('today').to, chip: '', search: '' };

        el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>';
        const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

        // ------------------------------------------------------------ data
        async function load(quiet) {
          try {
            const q = new URLSearchParams({ module, limit: '500' });
            if (s.from) q.set('from', s.from);
            if (s.to) q.set('to', s.to);
            if (s.search) q.set('search', s.search);
            if (s.chip === 'owing') q.set('owing', 'true');
            if (s.chip === 'credit') q.set('is_credit', 'true');
            if (s.chip === 'voided') q.set('status', 'VOIDED');
            const rows = await Api.get(`/sales?${q}`);
            s.rows = rows || [];
            s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
            s.failed = '';
          } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
          s.loading = false;
          paint();
        }

        // ------------------------------------------------------------ painting
        function paintKpis() {
          const live = s.rows.filter((r) => r.status === 'POSTED');
          const sum = (k) => live.reduce((t, r) => t + num(r[k]), 0);
          const unpaidN = live.filter((r) => num(r.balance_due) > 0).length;
          const kpi = (icon, label, value, badge) => `<div class="kpi"><div class="tile"><i class="bi ${icon}"></i></div>
            <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${badge || ''}</div>`;
          kpisEl.innerHTML =
            kpi('bi-receipt', 'Sales', String(live.length)) +
            kpi('bi-bar-chart', 'Total sold', UI.money(sum('total_amount'))) +
            kpi('bi-cash-coin', 'Collected', UI.money(sum('amount_paid'))) +
            kpi('bi-hourglass-split', 'Still unpaid', UI.money(sum('balance_due')),
              unpaidN ? `<span class="gf-badge gf-badge-amber">${unpaidN} sales</span>` : '<span class="gf-badge gf-badge-green">None</span>');
        }

        function paintToolbar() {
          const rchip = (key, label) => `<button type="button" class="fchip ${s.rng === key ? 'on' : ''}" data-range="${key}">${label}</button>`;
          const cchip = (key, label) => `<button type="button" class="fchip outline ${s.chip === key ? 'on' : ''}" data-chip="${key}">${label}</button>`;
          toolbarEl.innerHTML = `
            ${rchip('today', 'Today')}${rchip('week', '7 days')}${rchip('month', 'This month')}${rchip('all', 'All time')}
            <span class="sep"></span>
            <label class="date-box">From <input type="date" id="s-from" value="${esc(s.from)}"></label>
            <label class="date-box">To <input type="date" id="s-to" value="${esc(s.to)}"></label>
            <span class="sep"></span>
            ${cchip('owing', 'Unpaid')}${cchip('credit', 'On credit')}${cchip('voided', 'Voided')}
            <span class="grow"></span>
            <label class="search"><i class="bi bi-search"></i><input type="search" id="s-search" placeholder="Sale no, customer or phone" value="${esc(s.search)}" aria-label="Search sales"></label>`;
        }

        function paintTable() {
          if (s.loading) { hostEl.innerHTML = '<div class="dt-empty">Loading sales…</div>'; return; }
          const err = s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)}</span></div>` : '';
          if (!s.rows.length) {
            hostEl.innerHTML = `${err}<div class="dt-empty"><div class="tile"><i class="bi bi-receipt"></i></div><h3>No sales found</h3>
              <p>${s.search || s.chip ? 'Try clearing the filters.' : 'Nothing was sold in this period.'}</p></div>`;
            return;
          }
          const body = s.rows.map((r) => {
            const bal = num(r.balance_due);
            return `<tr class="click" data-id="${r.id}">
              <td><div class="cell-plain"><strong>${esc(r.sale_no)}</strong><span>${esc(stamp(r.sale_date))}</span></div></td>
              <td>${esc(r.customer_name || 'Walk-in')}${r.is_credit ? ' <span class="pill">Credit</span>' : ''}</td>
              <td class="muted">${esc(pretty(r.channel))}</td>
              <td class="r">${UI.money(r.total_amount)}</td>
              <td class="r">${UI.money(r.amount_paid)}</td>
              <td class="r ${bal > 0 && r.status === 'POSTED' ? 'neg' : 'muted'}">${bal > 0 && r.status === 'POSTED' ? UI.money(bal) : '–'}</td>
              <td>${statusPill(r)}</td>
              <td class="muted">${esc(r.cashier_name || '')}</td></tr>`;
          }).join('');
          hostEl.innerHTML = `${err}${s.total > s.rows.length ? `<div class="gf-note gf-note-amber" style="margin-bottom:10px"><i class="bi bi-info-circle"></i><span>Showing the latest ${s.rows.length} of ${s.total} sales. Narrow the dates to see the rest.</span></div>` : ''}
            <div class="dt-wrap"><table class="dt"><thead><tr><th>Sale</th><th>Customer</th><th>Type</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th><th>Cashier</th></tr></thead><tbody>${body}</tbody></table></div>`;
        }

        function paint() { paintKpis(); paintToolbar(); paintTable(); }

        // ------------------------------------------------------------ events
        toolbarEl.addEventListener('click', (e) => {
          const r = e.target.closest('[data-range]');
          if (r) { s.rng = r.dataset.range; Object.assign(s, range(s.rng)); load(); paintToolbar(); return; }
          const c = e.target.closest('[data-chip]');
          if (c) { s.chip = s.chip === c.dataset.chip ? '' : c.dataset.chip; load(); paintToolbar(); }
        });
        toolbarEl.addEventListener('change', (e) => {
          if (e.target.id === 's-from' || e.target.id === 's-to') {
            s.from = toolbarEl.querySelector('#s-from').value; s.to = toolbarEl.querySelector('#s-to').value; s.rng = 'custom';
            load(); paintToolbar();
          }
        });
        toolbarEl.addEventListener('input', UI.debounce(async (e) => {
          if (e.target.id !== 's-search') return;
          s.search = e.target.value.trim();
          await load(true);
          const box = toolbarEl.querySelector('#s-search');
          if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        }, 300));
        hostEl.addEventListener('click', (e) => {
          const tr = e.target.closest('tr[data-id]');
          if (tr) openSale(Number(tr.dataset.id));
        });

        // ------------------------------------------------------------ one sale
        async function openSale(id) {
          const m = UI.modal({ title: 'Sale', wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
          let sale;
          try { sale = await Api.get(`/sales/${id}`); }
          catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); return; }

          const bal = num(sale.balance_due);
          const posted = sale.status === 'POSTED';
          const lines = (sale.lines || []).map((l) => `<tr>
            <td>${esc(l.line_type === 'MILLING' ? `Milling ${l.ticket_no || ''}` : (l.item_name || l.description || 'Item'))}${l.line_type === 'MILLING' && l.description ? `<div class="muted" style="font-size:12px">${esc(l.description)}</div>` : ''}</td>
            <td class="r">${l.line_type === 'MILLING' ? '–' : `${fmt(l.quantity)} ${esc(l.unit_code || '')}`}</td>
            <td class="r">${l.line_type === 'MILLING' ? '–' : fmt(l.unit_price)}</td>
            <td class="r"><b>${fmt(l.line_total)}</b></td></tr>`).join('');
          const pays = (sale.payments || []).map((p) => `<li><span class="dot"></span>
            <span>${esc((window.GFPay && GFPay.METHOD_NAME[p.method]) || pretty(p.method))}${p.mpesa_receipt ? ` · ${esc(p.mpesa_receipt)}` : ''}${p.state !== 'CONFIRMED' ? ` <span class="pill ${p.state === 'PENDING' ? 'amber' : 'red'}">${esc(pretty(p.state))}</span>` : ''}</span>
            <span class="when">${UI.money(p.allocated)} · ${esc(stamp(p.confirmed_at || p.received_at))}</span></li>`).join('');
          const fact = (label, v) => `<div class="fact"><span>${label}</span><b>${v}</b></div>`;

          const body = m.el.querySelector('.gf-modal-body');
          body.querySelector('[data-loading]').remove();
          body.insertAdjacentHTML('beforeend', `
            <div class="who-head"><div class="grow"><h3>${esc(sale.sale_no)} ${statusPill(sale)}</h3>
              <div class="sub">${esc(stamp(sale.sale_date))} · ${esc(sale.customer_name || sale.walkin_name || 'Walk-in')}${sale.cashier_name ? ` · served by ${esc(sale.cashier_name)}` : ''}</div></div></div>
            <div class="fact-grid">
              ${fact('Total', UI.money(sale.total_amount))}${fact('Paid', UI.money(sale.amount_paid))}
              ${fact('Balance', bal > 0 && posted ? `<span class="neg-text">${UI.money(bal)}</span>` : '–')}
              ${fact('Discount', num(sale.discount_amount) > 0 ? UI.money(sale.discount_amount) : '–')}
            </div>
            ${sale.status === 'VOIDED' ? `<div class="gf-note gf-note-red"><i class="bi bi-slash-circle"></i><span>This sale was voided${sale.void_reason ? `: ${esc(sale.void_reason)}` : '.'}</span></div>` : ''}
            <div class="mini-table"><table class="dt"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${lines}</tbody></table></div>
            <div class="form-section"><span class="gf-label">Payments</span>
              ${pays ? `<ul class="timeline">${pays}</ul>` : '<div class="gf-hint">No payments recorded.</div>'}</div>`);

          const foot = document.createElement('div');
          foot.className = 'gf-modal-foot';
          foot.innerHTML = `<button class="gf-btn gf-btn-ghost" type="button" data-close>Close</button>
            ${sale.status !== 'DRAFT' ? '<button class="gf-btn gf-btn-ghost" type="button" data-receipt><i class="bi bi-printer"></i>Receipt</button>' : ''}
            ${posted && GF.can('sales.void') || posted && GF.can('sales.view') ? '<button class="gf-btn gf-btn-ghost" type="button" data-void><i class="bi bi-slash-circle"></i>Void</button>' : ''}
            ${posted && bal > 0 && GF.can('payments.create') ? '<button class="gf-btn gf-btn-green" type="button" data-collect><i class="bi bi-wallet2"></i>Collect payment</button>' : ''}`;
          m.el.querySelector('.gf-modal').appendChild(foot);

          foot.addEventListener('click', async (e) => {
            if (e.target.closest('[data-receipt]')) {
              const b = e.target.closest('[data-receipt]'); m.busy(b, true);
              try {
                const p = await Api.post(`/sales/${id}/receipt`, {});
                GFPay.showReceipt(p, 0, { title: 'Receipt', closeLabel: 'Close' });
              } catch (err) { m.error(err.message); }
              m.busy(b, false);
            } else if (e.target.closest('[data-collect]')) {
              m.close(); openCollect(sale);
            } else if (e.target.closest('[data-void]')) {
              m.close(); openVoid(sale);
            }
          });
        }

        // ------------------------------------------------------------ collect a balance
        function openCollect(sale) {
          const due = num(sale.balance_due);
          const canCode = GF.can('payments.mpesa_manual');
          const methods = [['CASH', 'Cash'], ['MPESA_STK', 'M-Pesa prompt']];
          if (canCode) methods.push(['MPESA_MANUAL', 'M-Pesa code']);
          const f = { method: 'CASH', amount: String(due), phone: sale.customer_phone || sale.walkin_phone || '', tendered: '', code: '' };
          const OK = { CASH: 'Take cash', MPESA_STK: 'Send M-Pesa prompt', MPESA_MANUAL: 'Record payment' };

          const m = UI.modal({
            title: `Collect payment · ${sale.sale_no}`,
            body: `<div class="pay-total"><span>Balance</span><b>${UI.money(due)}</b></div>
              <div class="gf-seg pay-seg" id="c-seg">${methods.map(([k, l]) => `<button type="button" data-m="${k}">${l}</button>`).join('')}</div>
              <div id="c-panel" class="gf-stack"></div>`,
            foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-green" type="button" data-ok></button>',
          });
          const panel = m.el.querySelector('#c-panel'), okBtn = m.el.querySelector('[data-ok]');

          function paintPanel() {
            m.el.querySelectorAll('#c-seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === f.method));
            okBtn.textContent = OK[f.method];
            const amount = `<div class="gf-field"><label class="gf-label" for="c-amount">Amount (KES)</label>
              <input class="gf-input plain" id="c-amount" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.amount)}"></div>`;
            if (f.method === 'CASH') {
              panel.innerHTML = `${amount}<div class="gf-field"><label class="gf-label" for="c-tender">Cash received (optional, to work out change)</label>
                <input class="gf-input plain" id="c-tender" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.tendered)}"></div><div class="pay-change" id="c-change"></div>`;
            } else if (f.method === 'MPESA_STK') {
              panel.innerHTML = `<div class="gf-field"><label class="gf-label" for="c-phone">Customer’s M-Pesa number</label>
                <input class="gf-input plain" id="c-phone" inputmode="tel" placeholder="0712345678" value="${esc(f.phone)}" autocomplete="off"></div>${amount}`;
            } else {
              panel.innerHTML = `<div class="gf-field"><label class="gf-label" for="c-code">M-Pesa transaction code</label>
                <input class="gf-input plain" id="c-code" placeholder="e.g. SJK4N8XYZ1" value="${esc(f.code)}" autocomplete="off" style="text-transform:uppercase"></div>${amount}`;
            }
            const first = panel.querySelector('input'); if (first) first.focus();
          }
          m.el.querySelector('#c-seg').addEventListener('click', (e) => {
            const b = e.target.closest('[data-m]'); if (!b) return;
            f.method = b.dataset.m; m.error(''); paintPanel();
          });
          panel.addEventListener('input', (e) => {
            const id = e.target.id;
            if (id === 'c-amount') f.amount = e.target.value;
            else if (id === 'c-phone') f.phone = e.target.value;
            else if (id === 'c-code') f.code = e.target.value;
            else if (id === 'c-tender') f.tendered = e.target.value;
            if (id === 'c-tender' || id === 'c-amount') {
              const out = panel.querySelector('#c-change');
              const t = num(f.tendered), a = num(f.amount);
              if (out) out.innerHTML = t > 0 && t >= a ? `Change to give: <b>${UI.money(r2(t - a))}</b>` : (t > 0 ? `<span class="neg">Short by ${UI.money(r2(a - t))}</span>` : '');
            }
          });
          paintPanel();

          const reopen = () => openSale(sale.id);
          okBtn.addEventListener('click', async () => {
            m.error('');
            const amount = num(f.amount);
            if (!(amount > 0)) { m.error('Enter the amount.'); return; }
            if (amount > due + 0.005) { m.error('The amount is more than the balance.'); return; }
            const applied = Math.abs(amount - due) < 0.005 ? due : amount;
            if (f.method === 'CASH' && num(f.tendered) > 0 && num(f.tendered) + 0.005 < amount) { m.error('The cash received is less than the amount.'); return; }
            if (f.method === 'MPESA_STK' && !GFPay.PHONE_OK(f.phone)) { m.error('Enter a valid Safaricom number, e.g. 0712345678.'); return; }
            if (f.method === 'MPESA_MANUAL' && !f.code.trim()) { m.error('Enter the M-Pesa transaction code.'); return; }

            m.busy(okBtn, true);
            try {
              if (f.method === 'MPESA_STK') {
                const r = await Api.post(`/sales/${sale.id}/mpesa-stk`, { phone: f.phone.trim(), amount: applied });
                m.close();
                GFPay.stkWait({ paymentId: r.payment_id, phone: f.phone.trim(), amount: applied, onPaid: () => { load(true); reopen(); }, onRetry: () => openCollect(sale) });
                return;
              }
              const body = f.method === 'CASH'
                ? { method: 'CASH', amount: applied }
                : { method: 'MPESA_MANUAL', amount: applied, mpesa_receipt: f.code.trim().toUpperCase() };
              await Api.post(`/sales/${sale.id}/payments`, body);
              m.close();
              UI.toast('Payment recorded');
              load(true);
              reopen();
            } catch (err) { m.error(err.message); m.busy(okBtn, false); }
          });
        }

        // ------------------------------------------------------------ void
        function openVoid(sale) {
          const selfApprove = GF.can('sales.void');
          const m = UI.modal({
            title: `Void ${sale.sale_no}`,
            body: `<div class="gf-note gf-note-amber"><i class="bi bi-exclamation-triangle"></i><span>Stock goes back and the customer’s balance is reversed. This cannot be undone.</span></div>
              <div class="gf-field"><label class="gf-label" for="v-reason">Reason</label><textarea class="gf-input plain" id="v-reason" placeholder="e.g. Wrong item rung up"></textarea></div>
              ${GF.can('payments.reverse') && num(sale.amount_paid) > 0 ? '<label class="gf-check"><input type="checkbox" id="v-rev" checked> Also reverse the payments made for this sale</label>' : ''}
              ${selfApprove ? '' : `<div class="form-section"><span class="gf-label">Manager approval</span>
                <div class="gf-row2"><input class="gf-input plain" id="v-u" placeholder="Manager username" autocomplete="off"><input class="gf-input plain" id="v-p" type="password" placeholder="Manager password" autocomplete="off"></div></div>`}`,
            foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-dark" type="button" data-ok>Void sale</button>',
          });
          const okBtn = m.el.querySelector('[data-ok]');
          okBtn.addEventListener('click', async () => {
            m.error('');
            const reason = m.el.querySelector('#v-reason').value.trim();
            if (!reason) { m.error('Give a reason for voiding this sale.'); return; }
            const body = { reason };
            const rev = m.el.querySelector('#v-rev');
            if (rev && rev.checked) body.reverse_payments = true;
            if (!selfApprove) {
              body.approver_username = m.el.querySelector('#v-u').value.trim();
              body.approver_password = m.el.querySelector('#v-p').value;
              if (!body.approver_username || !body.approver_password) { m.error('Enter the manager’s username and password.'); return; }
            }
            m.busy(okBtn, true);
            try {
              // a wrong manager password answers 401, which must not sign this user out
              const r = await Api.post(`/sales/${sale.id}/void`, body, selfApprove ? undefined : { handle401: false });
              m.close();
              if (r && r.needs_manual_reversal && r.needs_manual_reversal.length) {
                UI.toast(`Sale voided. Reverse these shared payments by hand: ${r.needs_manual_reversal.join(', ')}`, 'error');
              } else UI.toast('Sale voided');
              load(true);
            } catch (err) { m.error(err.message); m.busy(okBtn, false); }
          });
        }

        paint();
        load();
      },
    });
  }

  salesPage({ path: 'cereal/sales', module: 'CEREAL', title: 'Sales' });
  salesPage({ path: 'mill/sales', module: 'MILL', title: 'Sales' });
})();