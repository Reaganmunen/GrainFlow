/**
 * Till screens: Cereals > Cereal till (#/cereal/till) and Mill > Mill till (#/mill/till).
 * One factory, two modules. Pick items (by the kg, bag or tin), choose a customer, take payment, issue the receipt.
 *
 * Flow on Charge:
 *   1. POST /sales { module, lines, post: true, on_credit? }      saves and posts the sale (stock out)
 *   2. payment: POST /sales/:id/payments            (cash, M-Pesa code)
 *              POST /sales/:id/mpesa-stk            (M-Pesa prompt) then poll GET /payments/:id/stk-status
 *   3. POST /sales/:id/receipt                      print / WhatsApp
 * If step 2 fails the sale stays posted and the till asks for the payment again, so nothing is posted twice.
 *
 * Uses /sales/catalogue, /customers/lookup, /mill/jobs/billable (mill only), /payments/:id/*, /receipts/:id/*.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = (n) => num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  const METHOD_KEY = 'gf_till_method';
  const METHOD_NAME = { MPESA_STK: 'M-Pesa', MPESA_MANUAL: 'M-Pesa', CASH: 'Cash', BANK: 'Bank', OTHER: 'Other' };
  const CANCELLED = Symbol('cancelled');
  const PHONE_OK = (v) => /^(?:\+?254|0)?[17]\d{8}$/.test(String(v || '').replace(/[\s-]/g, ''));
  let keySeq = 0;

  /** Runs fn once when a modal (appended to <body>) has been removed. Returns a function that stops watching. */
  function onGone(node, fn) {
    const obs = new MutationObserver(() => { if (!document.body.contains(node)) { obs.disconnect(); fn(); } });
    obs.observe(document.body, { childList: true });
    return () => obs.disconnect();
  }

  /** Manager username and password, for selling below the minimum price. Resolves null if dismissed. */
  function askApproval() {
    return new Promise((resolve) => {
      let settled = false;
      const m = UI.modal({
        title: 'Manager approval',
        body: `<div class="gf-note gf-note-amber"><i class="bi bi-shield-lock"></i><span>One or more prices are below the minimum. A manager must approve before this sale can go through.</span></div>
          <div class="gf-field"><label class="gf-label" for="ap-u">Manager username</label><input class="gf-input plain" id="ap-u" autocomplete="off"></div>
          <div class="gf-field"><label class="gf-label" for="ap-p">Manager password</label><input class="gf-input plain" id="ap-p" type="password" autocomplete="off"></div>`,
        foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-dark" type="button" data-ok>Approve</button>',
      });
      const stop = onGone(m.el, () => { if (!settled) { settled = true; resolve(null); } });
      m.el.querySelector('[data-ok]').addEventListener('click', () => {
        const u = m.el.querySelector('#ap-u').value.trim(), p = m.el.querySelector('#ap-p').value;
        if (!u || !p) { m.error('Enter the manager’s username and password.'); return; }
        settled = true; stop(); m.close();
        resolve({ approver_username: u, approver_password: p });
      });
    });
  }

  // ---------------------------------------------------------------- receipt
  function paperHtml(p) {
    const b = p.business || {}, r = p.receipt, sale = p.sale || {};
    const when = new Date(r.issued_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
    const who = sale.customer_name || sale.walkin_name || 'Walk-in';
    const rows = (p.lines || []).map((l) =>
      `<tr><td colspan="2" class="d">${esc(l.description)}</td></tr>
       <tr><td class="q">${fmt(l.quantity)} ${esc(l.unit_code || '')} × ${fmt(l.unit_price)}</td><td class="r">${fmt(l.line_total)}</td></tr>`).join('');
    const pays = (p.payments || []).map((x) =>
      `<div class="row"><span>${esc(METHOD_NAME[x.method] || x.method)}${x.mpesa_receipt ? ` · ${esc(x.mpesa_receipt)}` : ''}</span><span>${fmt(x.amount)}</span></div>`).join('');
    return `<div class="rc-paper">
      <div class="rc-biz"><strong>${esc(b.business_name || 'Receipt')}</strong>${b.receipt_header ? `<div>${esc(b.receipt_header)}</div>` : ''}</div>
      ${p.provisional ? '<div class="rc-prov">PROVISIONAL RECEIPT<br>Made offline. The final receipt is issued when it is sent.</div>' : ''}
      <div class="rc-line"></div>
      <div class="row"><span>Receipt</span><span>${esc(r.receipt_no)}${r.is_duplicate ? ' (DUPLICATE)' : ''}</span></div>
      <div class="row"><span>Date</span><span>${esc(when)}</span></div>
      <div class="row"><span>Customer</span><span>${esc(who)}</span></div>
      ${sale.cashier_name ? `<div class="row"><span>Served by</span><span>${esc(sale.cashier_name)}</span></div>` : ''}
      <div class="rc-line"></div>
      <table>${rows}</table>
      <div class="rc-line"></div>
      ${num(sale.discount_amount) > 0 ? `<div class="row"><span>Discount</span><span>- ${fmt(sale.discount_amount)}</span></div>` : ''}
      <div class="row big"><span>Total</span><span>KES ${fmt(r.total_amount)}</span></div>
      ${pays}
      <div class="row"><span>Paid</span><span>KES ${fmt(r.amount_paid)}</span></div>
      ${num(r.balance_due) > 0 ? `<div class="row bal"><span>Balance</span><span>KES ${fmt(r.balance_due)}</span></div>` : ''}
      ${b.receipt_footer ? `<div class="rc-foot">${esc(b.receipt_footer)}</div>` : ''}
    </div>`;
  }

  const PRINT_CSS =
    '@page{margin:0}body{margin:0;padding:4mm;width:72mm;font:12px/1.4 "Courier New",monospace;color:#000}' +
    '.rc-biz{text-align:center;margin-bottom:4px}.rc-biz strong{font-size:14px;display:block}' +
    '.rc-line{border-top:1px dashed #000;margin:6px 0}.row{display:flex;justify-content:space-between;gap:8px}' +
    '.big{font-weight:700;font-size:14px}.bal{font-weight:700}table{width:100%;border-collapse:collapse}' +
    'td{padding:1px 0;vertical-align:top}td.r{text-align:right}td.d{font-weight:700}.rc-foot{text-align:center;margin-top:8px}' +
    '.rc-prov{text-align:center;font-weight:700;margin:6px 0}';

  function printReceipt(p) {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.receipt.receipt_no)}</title><style>${PRINT_CSS}</style></head><body>${paperHtml(p)}</body></html>`);
    d.close();
    setTimeout(() => {
      f.contentWindow.focus();
      f.contentWindow.print();
      setTimeout(() => f.remove(), 2000);
    }, 250);
    if (p.receipt.id) Api.post(`/receipts/${p.receipt.id}/printed`, {}).catch(() => {});
  }

  /** Plain text of a provisional receipt (the server makes the text for real receipts). */
  function localText(p) {
    const r = p.receipt, sale = p.sale || {}, b = p.business || {};
    const out = [b.business_name || 'Receipt', `Receipt ${r.receipt_no} (PROVISIONAL)`, new Date(r.issued_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }),
      `Customer: ${sale.customer_name || sale.walkin_name || 'Walk-in'}`, '------------------------'];
    (p.lines || []).forEach((l) => { out.push(l.description); out.push(`  ${fmt(l.quantity)} ${l.unit_code || ''} x ${fmt(l.unit_price)} = ${fmt(l.line_total)}`); });
    out.push('------------------------', `TOTAL: KES ${fmt(r.total_amount)}`, `Paid: KES ${fmt(r.amount_paid)}`);
    if (num(r.balance_due) > 0) out.push(`Balance: KES ${fmt(r.balance_due)}`);
    if (b.receipt_footer) out.push(b.receipt_footer);
    return out.join('\n');
  }

  function showReceipt(p, change, opts = {}) {
    const phone = (p.sale && (p.sale.customer_phone || p.sale.walkin_phone)) || '';
    const m = UI.modal({
      title: opts.title || 'Sale complete',
      body: `${opts.note ? `<div class="gf-note gf-note-amber"><i class="bi bi-wifi-off"></i><span>${esc(opts.note)}</span></div>` : ''}
        ${change > 0 ? `<div class="gf-note gf-note-amber"><i class="bi bi-cash-coin"></i><span>Change to give: <b>KES ${fmt(change)}</b></span></div>` : ''}
        ${paperHtml(p)}
        <div class="gf-field"><label class="gf-label" for="rc-phone">WhatsApp number</label>
          <input class="gf-input plain" id="rc-phone" inputmode="tel" placeholder="0712345678" value="${esc(phone)}" autocomplete="off"></div>
        <div class="gf-hint gf-hidden" id="rc-wa"></div>`,
      foot: `<button class="gf-btn gf-btn-ghost" type="button" data-print><i class="bi bi-printer"></i>Print</button>
        <button class="gf-btn gf-btn-ghost" type="button" data-wa><i class="bi bi-whatsapp"></i>WhatsApp</button>
        <button class="gf-btn gf-btn-green" type="button" data-close>${esc(opts.closeLabel || 'New sale')}</button>`,
    });
    m.el.querySelector('[data-print]').addEventListener('click', () => printReceipt(p));
    m.el.querySelector('[data-wa]').addEventListener('click', async (e) => {
      const phoneVal = m.el.querySelector('#rc-phone').value.trim();
      if (!phoneVal) { m.error('Enter the customer’s WhatsApp number.'); return; }
      m.error('');
      if (p.provisional) { // no receipt on the server yet: build the message here
        const d = phoneVal.replace(/\D/g, '');
        const to = d.startsWith('0') ? `254${d.slice(1)}` : d;
        window.open(`https://wa.me/${to}?text=${encodeURIComponent(localText(p))}`, '_blank', 'noopener');
        return;
      }
      m.busy(e.currentTarget, true);
      try {
        const r = await Api.post(`/receipts/${p.receipt.id}/whatsapp`, { phone: phoneVal });
        const w = window.open(r.whatsapp_url, '_blank', 'noopener');
        if (!w) {
          const hint = m.el.querySelector('#rc-wa');
          hint.classList.remove('gf-hidden');
          hint.innerHTML = `Your browser blocked the new tab. <a href="${esc(r.whatsapp_url)}" target="_blank" rel="noopener">Open WhatsApp</a>`;
        }
      } catch (err) { m.error(err.message); }
      m.busy(e.currentTarget, false);
    });
  }

  /** M-Pesa prompt waiting screen. Calls onPaid() when confirmed, onRetry() when the cashier needs to pick another way. */
  function stkWait({ paymentId, phone, amount, onPaid, onRetry }) {
    const canCode = GF.can('payments.mpesa_manual');
    const m = UI.modal({
      title: 'M-Pesa payment',
      body: `<div class="stk">
          <div class="stk-ico" id="stk-ico"><i class="bi bi-phone-vibrate"></i></div>
          <h3 id="stk-h">Waiting for the customer</h3>
          <p id="stk-p">A prompt for ${UI.money(amount)} was sent to ${esc(phone)}. Ask the customer to enter their M-Pesa PIN.</p>
          <div class="stk-time" id="stk-t">0s</div>
        </div>
        <div id="stk-rescue" class="gf-stack gf-hidden">
          <div class="gf-hint" id="stk-note">Taking long? The customer may have missed the prompt.</div>
          <button type="button" class="gf-btn gf-btn-ghost" data-query>Check with Safaricom</button>
          ${canCode ? `<div class="gf-field"><label class="gf-label" for="stk-code">Or enter the code from the M-Pesa SMS</label>
            <div class="field-inline"><input class="gf-input plain" id="stk-code" placeholder="e.g. SJK4N8XYZ1" autocomplete="off" style="text-transform:uppercase"><button type="button" class="gf-btn gf-btn-dark gf-btn-sm" data-confirm>Confirm</button></div></div>` : ''}
        </div>`,
      foot: '<button class="gf-btn gf-btn-ghost" type="button" data-cancel>Cancel prompt</button>',
    });
    let done = false, expired = false;
    const started = Date.now();
    const alive = () => document.body.contains(m.el) && !done;
    const $m = (sel) => m.el.querySelector(sel);

    const fail = (text) => {
      done = true;
      $m('#stk-ico').innerHTML = '<i class="bi bi-x-circle"></i>';
      $m('#stk-ico').classList.add('is-bad');
      $m('#stk-h').textContent = 'Payment not completed';
      $m('#stk-p').textContent = text || 'The payment did not go through.';
      $m('#stk-t').textContent = '';
      $m('#stk-rescue').classList.add('gf-hidden');
      const foot = $m('.gf-modal-foot');
      foot.innerHTML = '<button class="gf-btn gf-btn-ghost" type="button" data-close>Close</button><button class="gf-btn gf-btn-dark" type="button" data-retry>Try another way</button>';
      foot.querySelector('[data-retry]').addEventListener('click', () => { m.close(); onRetry(); });
    };
    const paid = () => { done = true; m.close(); UI.toast('M-Pesa payment received'); onPaid(); };

    async function tick() {
      if (!alive()) return;
      try {
        const st = await Api.get(`/payments/${paymentId}/stk-status`);
        if (!alive()) return;
        if (st.state === 'CONFIRMED') { paid(); return; }
        if (st.state === 'FAILED' || st.state === 'CANCELLED') { fail(st.result_desc); return; }
      } catch (_) { /* keep polling */ }
      const secs = Math.round((Date.now() - started) / 1000);
      $m('#stk-t').textContent = `${secs}s`;
      if (secs >= 35) $m('#stk-rescue').classList.remove('gf-hidden');
      if (secs >= 65 && !expired) { expired = true; Api.post('/payments/expire-stale', {}).catch(() => {}); }
      setTimeout(tick, 2500);
    }
    setTimeout(tick, 2500);

    m.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cancel]')) {
        done = true;
        try { await Api.post(`/payments/${paymentId}/cancel`, {}); } catch (_) { /* may already be closed */ }
        m.close(); onRetry();
      } else if (e.target.closest('[data-query]')) {
        const b = e.target.closest('[data-query]');
        m.busy(b, true);
        try {
          const r = await Api.post(`/payments/${paymentId}/stk-query`, {});
          $m('#stk-note').textContent = r.note || 'No result yet.';
          if (r.current && r.current.state === 'CONFIRMED') paid();
          else if (r.current && (r.current.state === 'FAILED' || r.current.state === 'CANCELLED')) fail(r.note);
        } catch (err) { m.error(err.message); }
        m.busy(b, false);
      } else if (e.target.closest('[data-confirm]')) {
        const b = e.target.closest('[data-confirm]');
        const code = $m('#stk-code').value.trim().toUpperCase();
        if (!code) { m.error('Enter the M-Pesa transaction code.'); return; }
        m.error(''); m.busy(b, true);
        try { await Api.post(`/payments/${paymentId}/confirm-manually`, { mpesa_receipt: code }); paid(); }
        catch (err) { m.error(err.message); m.busy(b, false); }
      }
    });
  }

  // ---------------------------------------------------------------- page
  function tillPage({ path, module, title }) {
    GF.page(path, {
      title,
      render(el) {
        const mill = module === 'MILL';
        const s = {
          tier: 'RETAIL', items: [], loading: true, failed: '', search: '',
          cart: [], who: 'walkin', customer: null, walkinName: '', walkinPhone: '', discount: '',
          lookup: [], billable: [], sale: null, locked: false,
        };

        el.innerHTML = `
          <div class="till">
            <section class="till-main">
              <div class="till-bar">
                <label class="search till-search"><i class="bi bi-search"></i><input type="search" id="t-search" placeholder="Search item or SKU" autocomplete="off" aria-label="Search items"></label>
                ${mill ? '' : `<div class="gf-seg till-tier" id="t-tier"><button type="button" class="on" data-tier="RETAIL">Retail</button><button type="button" data-tier="WHOLESALE">Wholesale</button></div>`}
                <button type="button" class="icon-sq" id="t-refresh" aria-label="Refresh items"><i class="bi bi-arrow-clockwise"></i></button>
              </div>
              ${mill ? '<div id="t-jobs"></div>' : ''}
              <div id="t-grid"></div>
            </section>
            <aside class="till-cart" id="t-cart" aria-label="Current sale">
              <div class="tc-head"><h2>Current sale</h2><button type="button" class="tc-clear" id="t-clear">Clear</button></div>
              <div id="t-lock"></div>
              <div id="t-cust" class="tc-cust"></div>
              <div id="t-lines" class="tc-lines"></div>
              <div id="t-totals" class="tc-totals"></div>
            </aside>
          </div>
          <button type="button" class="till-fab" id="t-fab"></button>`;

        const $ = (sel) => el.querySelector(sel);
        const gridEl = $('#t-grid'), cartEl = $('#t-cart'), lockEl = $('#t-lock'), custEl = $('#t-cust');
        const linesEl = $('#t-lines'), totalsEl = $('#t-totals'), jobsEl = $('#t-jobs'), fab = $('#t-fab');

        // ------------------------------------------------------------ helpers
        const units = (it) => (it.prices || [])
          .map((p) => ({ unit_id: p.unit_id, code: p.unit_code, name: p.unit_name, kg: num(p.kg_per_unit) || 1, price: num(p.price) }))
          .filter((u) => u.price > 0);
        const defUnit = (it) => { const us = units(it); return us.find((u) => u.kg === 1) || us[0]; };
        const unitLabel = (u) => (u.kg === 1 ? u.name : `${u.name} (${fmt(u.kg)} kg)`);
        const itemOf = (id) => s.items.find((i) => i.id === id);
        const lineAmt = (l) => (l.kind === 'MILLING' ? num(l.amount) : r2(num(l.qty) * num(l.price)));
        const isCustom = (l) => Math.abs(num(l.price) - num(l.listPrice)) > 0.0001;
        const minUnit = (l) => { const it = itemOf(l.item_id); return it ? num(it.min_price_per_kg) * l.kg : 0; };
        const isBelow = (l) => l.kind === 'ITEM' && minUnit(l) > 0 && num(l.price) + 0.0001 < minUnit(l);
        const kgUsed = (itemId) => s.cart.filter((l) => l.kind === 'ITEM' && l.item_id === itemId).reduce((t, l) => t + num(l.qty) * l.kg, 0);
        const calc = () => {
          const sub = r2(s.cart.reduce((t, l) => t + lineAmt(l), 0));
          const disc = Math.min(Math.max(num(s.discount), 0), sub);
          return { sub, disc, total: r2(sub - disc) };
        };
        const dueNow = () => (s.sale ? num(s.sale.balance_due) : calc().total);
        const registered = () => s.who === 'registered' && !!s.customer;
        const canDiscount = GF.can('sales.discount');

        const warn = (l) => {
          if (l.kind !== 'ITEM') return '';
          const out = [];
          if (isBelow(l)) out.push(`<span class="w red"><i class="bi bi-shield-lock"></i>Below the minimum of KES ${fmt(minUnit(l))} per ${esc(l.unit_name)}. Manager approval needed.</span>`);
          const it = itemOf(l.item_id);
          if (it && kgUsed(l.item_id) > num(it.stock_kg) + 0.0001) out.push(`<span class="w amber"><i class="bi bi-exclamation-triangle"></i>Only ${UI.kg(it.stock_kg)} in stock.</span>`);
          return out.join('');
        };

        // ------------------------------------------------------------ data
        async function loadItems(quiet) {
          try {
            s.items = (await Api.get(`/sales/catalogue?module=${module}&tier=${s.tier}`)) || [];
            s.failed = '';
          } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
          s.loading = false;
          reprice();
          paintGrid();
          paintLines();
          updateTotals();
        }

        async function loadBillable() {
          if (!mill) return;
          try {
            const q = registered() ? `?customer_id=${s.customer.id}` : '';
            s.billable = (await Api.get(`/mill/jobs/billable${q}`)) || [];
          } catch (_) { s.billable = []; }
          paintJobs();
        }

        /** After a tier change or refresh: lines still on the list price follow the new list price. */
        function reprice() {
          s.cart.forEach((l) => {
            if (l.kind !== 'ITEM') return;
            const it = itemOf(l.item_id);
            const u = it && units(it).find((x) => x.unit_id === l.unit_id);
            if (!u) return;
            const followed = !isCustom(l);
            l.listPrice = u.price;
            if (followed) l.price = u.price;
          });
        }

        // ------------------------------------------------------------ painting: items
        function paintGrid() {
          if (s.loading) { gridEl.innerHTML = '<div class="dt-empty">Loading items…</div>'; return; }
          const upd = Offline.lastUpdated();
          const off = Offline.isOffline()
            ? `<div class="gf-note gf-note-amber till-offline-note"><i class="bi bi-wifi-off"></i><span>Offline. Prices and stock are from ${upd ? upd.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false }) : 'the last time this computer was online'}. Sales are saved here and sent when the connection is back.</span></div>` : '';
          const err = off + (s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)}</span></div>` : '');
          const term = s.search.toLowerCase();
          const rows = s.items.filter((i) => !term || String(i.name).toLowerCase().includes(term) || String(i.sku || '').toLowerCase().includes(term));
          if (!rows.length) {
            gridEl.innerHTML = `${err}<div class="dt-empty"><div class="tile"><i class="bi bi-basket"></i></div>
              <h3>${term ? 'No items match' : 'No items to sell yet'}</h3>
              <p>${term ? 'Try a different name or SKU.' : 'Items need a sellable unit and a price before they show up here.'}</p></div>`;
            return;
          }
          gridEl.innerHTML = `${err}<div class="item-grid">${rows.map((it) => {
            const us = units(it);
            const out = num(it.stock_kg) <= 0;
            return `<div class="ic ${out ? 'is-out' : ''} ${us.length ? '' : 'is-noprice'}" data-item="${it.id}" tabindex="0" role="button" aria-label="Add ${esc(it.name)}">
              <div class="ic-name">${esc(it.name)}</div>
              <div class="ic-stock ${out ? 'red' : ''}">${out ? 'Out of stock' : `${UI.kg(it.stock_kg)} in stock`}</div>
              <div class="ic-units">${us.length
                ? us.map((u) => `<button type="button" class="uchip" data-unit="${u.unit_id}"><span>${esc(unitLabel(u))}</span><b>${fmt(u.price)}</b></button>`).join('')
                : `<span class="muted">No ${s.tier === 'WHOLESALE' ? 'wholesale' : 'retail'} price set</span>`}</div>
            </div>`;
          }).join('')}</div>`;
        }

        function paintJobs() {
          if (!jobsEl) return;
          if (!s.billable.length) { jobsEl.innerHTML = ''; return; }
          jobsEl.innerHTML = `<div class="jobs-strip"><div class="jobs-head"><i class="bi bi-gear-wide-connected"></i><strong>Milling jobs ready to bill</strong><span class="pill amber">${s.billable.length}</span></div>
            <div class="jobs-row">${s.billable.map((j) => {
              const added = s.cart.some((l) => l.kind === 'MILLING' && l.job_id === j.id);
              return `<div class="jc"><div><strong>${esc(j.ticket_no)}</strong><span>${esc(j.customer_name || 'Walk-in')} · ${esc(j.grain_name)} · ${UI.kg(j.weight_in_kg)}</span></div>
                <div class="jc-foot"><b>${UI.money(j.charge_amount)}</b>
                <button type="button" class="job-btn mill" data-job="${j.id}" ${added || s.locked ? 'disabled' : ''}>${added ? 'Added' : 'Add'}</button></div></div>`;
            }).join('')}</div></div>`;
        }

        // ------------------------------------------------------------ painting: cart
        function paintCust() {
          const c = s.customer;
          const seg = `<div class="gf-seg" id="c-seg"><button type="button" data-who="walkin" class="${s.who === 'walkin' ? 'on' : ''}">Walk-in</button><button type="button" data-who="registered" class="${s.who === 'registered' ? 'on' : ''}">Customer</button></div>`;
          let inner;
          if (s.who === 'walkin') {
            inner = `<div class="gf-row2"><input class="gf-input plain" id="c-wname" placeholder="Name (optional)" value="${esc(s.walkinName)}" autocomplete="off" aria-label="Walk-in name">
              <input class="gf-input plain" id="c-wphone" inputmode="tel" placeholder="Phone (optional)" value="${esc(s.walkinPhone)}" autocomplete="off" aria-label="Walk-in phone"></div>`;
          } else if (c) {
            const nm = c.full_name || c.business_name || 'Customer';
            const bal = num(c.balance);
            inner = `<div class="picked"><span class="gf-avatar" style="background:${UI.avatarColor(nm)}">${esc(UI.initials(nm))}</span>
              <div class="who"><strong>${esc(nm)}</strong><span>${esc(c.phone || c.customer_code || '')}${bal > 0 ? ` · owes ${UI.money(bal)}` : ''}${c.credit_allowed ? ' · credit allowed' : ''}</span></div>
              <button type="button" class="icon-sq" data-clear aria-label="Choose a different customer"><i class="bi bi-x-lg"></i></button></div>`;
          } else {
            inner = `<div class="pick"><input class="gf-input plain" id="c-q" type="search" placeholder="Name, code or phone" autocomplete="off" aria-label="Find customer">
              <div class="pick-list gf-hidden" id="c-list"></div></div>`;
          }
          custEl.innerHTML = seg + inner;
        }

        function lineHtml(l) {
          if (l.kind === 'MILLING') {
            return `<div class="cl is-mill" data-key="${l.key}">
              <div class="cl-top"><strong><i class="bi bi-gear-wide-connected"></i> ${esc(l.label)}</strong><button type="button" class="cl-x" data-remove aria-label="Remove"><i class="bi bi-x-lg"></i></button></div>
              <div class="cl-foot"><span class="muted">Ticket ${esc(l.ticket)}${l.customer_name ? ` · ${esc(l.customer_name)}` : ''}</span><b data-total>${fmt(l.amount)}</b></div></div>`;
          }
          const it = itemOf(l.item_id);
          const us = it ? units(it) : [];
          const opts = us.length
            ? us.map((u) => `<option value="${u.unit_id}" ${u.unit_id === l.unit_id ? 'selected' : ''}>${esc(unitLabel(u))}</option>`).join('')
            : `<option value="${l.unit_id}" selected>${esc(l.unit_name)}</option>`;
          return `<div class="cl" data-key="${l.key}">
            <div class="cl-top"><strong>${esc(l.name)}</strong><button type="button" class="cl-x" data-remove aria-label="Remove ${esc(l.name)}"><i class="bi bi-x-lg"></i></button></div>
            <div class="cl-ctl">
              <input class="gf-input plain cl-qty" data-qty type="number" inputmode="decimal" min="0" step="any" value="${l.qty}" aria-label="Quantity">
              <select class="gf-input plain cl-unit" data-unit aria-label="Unit">${opts}</select>
              <span class="cl-at">@</span>
              <input class="gf-input plain cl-price" data-price type="number" inputmode="decimal" min="0" step="any" value="${l.price}" aria-label="Price per unit">
            </div>
            <div class="cl-foot"><span class="cl-warns" data-warn>${warn(l)}</span><b data-total>${fmt(lineAmt(l))}</b></div></div>`;
        }

        function paintLines() {
          linesEl.innerHTML = s.cart.length
            ? s.cart.map(lineHtml).join('')
            : '<div class="tc-empty"><i class="bi bi-basket"></i><p>Tap an item to add it to the sale.</p></div>';
        }

        function paintLock() {
          cartEl.classList.toggle('is-locked', s.locked);
          $('#t-clear').classList.toggle('gf-hidden', s.locked);
          lockEl.innerHTML = s.sale
            ? `<div class="gf-note gf-note-amber"><i class="bi bi-receipt"></i><span>Sale <b>${esc(s.sale.sale_no)}</b> is posted with <b>${UI.money(s.sale.balance_due)}</b> unpaid. Collect the payment to finish.
               <button type="button" class="tc-link" data-leave>Leave unpaid</button></span></div>`
            : '';
          paintJobs();
        }

        function paintTotals() {
          totalsEl.innerHTML = `
            <div class="tr"><span>Subtotal</span><b id="t-sub"></b></div>
            ${canDiscount ? `<div class="tr"><label for="t-disc">Discount</label><input class="gf-input plain" id="t-disc" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(s.discount)}"></div>` : ''}
            <div class="tr total"><span>Total</span><b id="t-total"></b></div>
            <button type="button" class="gf-btn gf-btn-green gf-btn-block" id="t-charge"></button>`;
        }

        function updateTotals() {
          const t = calc();
          const sub = $('#t-sub'), tot = $('#t-total'), btn = $('#t-charge');
          if (sub) sub.textContent = UI.money(t.sub);
          if (tot) tot.textContent = UI.money(s.sale ? num(s.sale.total_amount) : t.total);
          if (btn) {
            btn.disabled = !s.cart.length;
            btn.innerHTML = s.sale ? `<i class="bi bi-wallet2"></i>Collect ${UI.money(s.sale.balance_due)}` : `<i class="bi bi-wallet2"></i>Charge ${UI.money(t.total)}`;
          }
          s.cart.forEach((l) => {
            const row = linesEl.querySelector(`[data-key="${l.key}"]`);
            if (!row) return;
            const tt = row.querySelector('[data-total]'); if (tt) tt.textContent = fmt(lineAmt(l));
            const w = row.querySelector('[data-warn]'); if (w) w.innerHTML = warn(l);
          });
          const n = s.cart.length;
          fab.classList.toggle('gf-hidden', !n);
          fab.innerHTML = `<i class="bi bi-basket"></i>View sale · ${UI.money(t.total)} <span class="n">${n}</span>`;
        }

        // ------------------------------------------------------------ cart actions
        function addItem(it, unitId) {
          if (s.locked) { UI.toast('This sale is already posted. Collect the payment or leave it unpaid first.', 'error'); return; }
          const us = units(it);
          const u = unitId ? us.find((x) => String(x.unit_id) === String(unitId)) : defUnit(it);
          if (!u) { UI.toast(`No ${s.tier === 'WHOLESALE' ? 'wholesale' : 'retail'} price is set for ${it.name}.`, 'error'); return; }
          const ex = s.cart.find((l) => l.kind === 'ITEM' && l.item_id === it.id && l.unit_id === u.unit_id && !isCustom(l));
          if (ex) ex.qty = Math.round((num(ex.qty) + 1) * 1000) / 1000;
          else s.cart.push({ key: ++keySeq, kind: 'ITEM', item_id: it.id, name: it.name, unit_id: u.unit_id, unit_name: u.name, kg: u.kg, qty: 1, price: u.price, listPrice: u.price });
          paintLines();
          updateTotals();
          const row = linesEl.querySelector(`[data-key="${(ex || s.cart[s.cart.length - 1]).key}"]`);
          if (row) row.scrollIntoView({ block: 'nearest' });
        }

        async function addJob(id) {
          if (s.locked) return;
          const j = s.billable.find((x) => x.id === id);
          if (!j || s.cart.some((l) => l.kind === 'MILLING' && l.job_id === id)) return;
          s.cart.push({ key: ++keySeq, kind: 'MILLING', job_id: j.id, ticket: j.ticket_no, label: `${j.grain_name} milling · ${UI.kg(j.weight_in_kg)}`, customer_name: j.customer_name, amount: num(j.charge_amount) });
          if (!registered()) {
            if (j.customer_id) {
              let c = { id: j.customer_id, full_name: j.customer_name };
              try {
                const rows = await Api.get(`/customers/lookup?q=${encodeURIComponent(j.customer_name || '')}`);
                c = rows.find((r) => r.id === j.customer_id) || c;
              } catch (_) { /* the minimal record is enough */ }
              s.who = 'registered'; s.customer = c;
            } else if (!s.walkinName) {
              s.walkinName = j.customer_name || '';
            }
            paintCust();
          }
          paintLines(); paintJobs(); updateTotals();
        }

        function resetTill(message) {
          s.cart = []; s.sale = null; s.locked = false; s.who = 'walkin'; s.customer = null;
          s.walkinName = ''; s.walkinPhone = ''; s.discount = ''; s.lookup = [];
          paintCust(); paintLines(); paintLock(); paintTotals(); updateTotals();
          loadItems(true); loadBillable();
          if (message) UI.toast(message);
        }

        function checkSale() {
          if (!s.cart.length) return 'Add at least one item to the sale.';
          const bad = s.cart.find((l) => l.kind === 'ITEM' && (!(num(l.qty) > 0) || !(num(l.price) > 0)));
          if (bad) return `Check the quantity and price for ${bad.name}.`;
          if (s.who === 'registered' && !s.customer) return 'Pick a customer, or switch to Walk-in.';
          if (num(s.discount) > calc().sub) return 'The discount is more than the sale.';
          return '';
        }

        // ------------------------------------------------------------ sale + payment
        function saleBody(onCredit) {
          const body = {
            module, on_credit: !!onCredit,
            lines: s.cart.map((l) => {
              if (l.kind === 'MILLING') return { line_type: 'MILLING', mill_job_id: l.job_id };
              const line = { item_id: l.item_id, unit_id: l.unit_id, quantity: num(l.qty) };
              if (isCustom(l)) line.unit_price = num(l.price);
              if (isBelow(l)) line.override_reason = 'Below minimum price, approved at the till';
              return line;
            }),
          };
          if (!mill) body.channel = s.tier === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
          if (registered()) body.customer_id = s.customer.id;
          else { body.walkin_name = s.walkinName.trim() || 'Walk-in'; if (s.walkinPhone.trim()) body.walkin_phone = s.walkinPhone.trim(); }
          if (canDiscount && calc().disc > 0) body.discount_amount = calc().disc;
          return body;
        }

        async function createSale(onCredit) {
          let approval = null;
          if (s.cart.some(isBelow) && !GF.can('price.override')) {
            approval = await askApproval();
            if (!approval) throw CANCELLED;
          }
          const body = { ...saleBody(onCredit), post: true };
          if (approval) Object.assign(body, approval);
          // a wrong manager password answers 401, which must not sign the cashier out
          return Api.post('/sales', body, approval ? { handle401: false } : undefined);
        }

        async function finish(change) {
          let p;
          try { p = await Api.post(`/sales/${s.sale.id}/receipt`, {}); }
          catch (err) {
            const no = s.sale.sale_no;
            resetTill();
            UI.toast(`Sale ${no} is saved, but the receipt could not be made: ${err.message}`, 'error');
            return;
          }
          resetTill();
          showReceipt(p, change);
        }

        async function completeAfterStk() {
          try { s.sale = await Api.get(`/sales/${s.sale.id}`); } catch (_) { /* receipt still works */ }
          await finish(0);
        }

        /**
         * Cash, M-Pesa code and credit sales: the sale, its payment and its receipt go to the server as ONE saved step.
         * With no connection (or if it drops half way) the step is kept on this computer and sent later, and a
         * provisional receipt is printed. The server never records the same step twice.
         */
        async function chargeDirect(m, v) {
          const reg = registered();
          const body = saleBody(v.method === 'CREDIT');
          const total = calc().total;
          const payments = [];
          let change = 0;
          if (v.method === 'CASH') {
            payments.push({ method: 'CASH', amount: r2(Math.min(v.tendered, total)) });
            change = r2(Math.max(0, v.tendered - total));
          } else if (v.method === 'MPESA_MANUAL') {
            payments.push({ method: 'MPESA_MANUAL', amount: r2(Math.min(v.amount, total)), mpesa_receipt: v.code, payer_phone: v.phone || undefined });
          } else if (v.payNow > 0) {
            payments.push({ method: 'CASH', amount: r2(Math.min(v.payNow, total)) });
          }
          if (v.method === 'CREDIT' && Offline.isOffline()) { // the server checks again when it receives the sale
            const c = s.customer || {};
            if (num(c.credit_limit) > 0 && num(c.balance) + total > num(c.credit_limit) + 0.005) {
              throw new Error(`This would take ${c.full_name || 'the customer'} over their credit limit of ${UI.money(c.credit_limit)}.`);
            }
          }
          const paid = r2(payments.reduce((t, p) => t + p.amount, 0));
          const balance = r2(total - paid);
          const localNo = await Offline.nextLocalNo();
          const cust = reg ? (s.customer.full_name || s.customer.business_name || 'Customer') : (body.walkin_name || 'Walk-in');
          const snapshot = {
            provisional: true,
            receipt: { id: null, receipt_no: localNo, issued_at: new Date().toISOString(), is_duplicate: false, total_amount: total, amount_paid: paid, balance_due: balance },
            business: Offline.business() || {},
            sale: { customer_name: reg ? cust : null, walkin_name: reg ? null : cust, customer_phone: reg ? s.customer.phone : body.walkin_phone, cashier_name: GF.user.full_name || GF.user.name || '', discount_amount: body.discount_amount || 0 },
            lines: s.cart.map((l) => (l.kind === 'MILLING'
              ? { description: l.label, quantity: 1, unit_code: '', unit_price: l.amount, line_total: l.amount }
              : { description: l.name, quantity: num(l.qty), unit_code: l.unit_name, unit_price: num(l.price), line_total: lineAmt(l) })),
            payments: payments.map((p) => ({ method: p.method, amount: p.amount, mpesa_receipt: p.mpesa_receipt })),
          };
          const res = await Offline.submit('sale', { ...body, payments }, {
            local_no: localNo,
            meta: {
              label: `${mill ? 'Mill' : 'Cereal'} sale · ${UI.money(total)} · ${cust}`,
              balance_due: balance,
              stock: s.cart.filter((l) => l.kind === 'ITEM').map((l) => ({ item_id: l.item_id, kg: num(l.qty) * l.kg })),
            },
          });
          const queued = res.status === 'queued';
          m.close();
          resetTill();
          showReceipt(queued ? snapshot : res.result.printable, change, queued ? {
            title: 'Sale saved on this computer',
            note: res.reason === 'AUTH'
              ? 'Your sign-in has expired. This sale is safe on this computer; sign in again and it will be sent.'
              : 'Saved on this computer. It is sent to the server by itself when the connection is back. Give the customer this provisional receipt.',
          } : {});
        }

        function openPay() {
          const reg = registered();
          const estDue = dueNow();
          let preferred = 'CASH';
          try { preferred = localStorage.getItem(METHOD_KEY) || 'CASH'; } catch (_) { /* storage can be off */ }
          const canCredit = !s.sale && reg && !!s.customer.credit_allowed;
          const canCode = GF.can('payments.mpesa_manual');
          const methods = [['CASH', 'Cash'], ['MPESA_STK', 'M-Pesa prompt']];
          if (canCode) methods.push(['MPESA_MANUAL', 'M-Pesa code']);
          if (canCredit) methods.push(['CREDIT', 'On credit']);
          const f = {
            method: methods.some((x) => x[0] === preferred) ? preferred : 'CASH',
            phone: (reg ? s.customer.phone : s.walkinPhone) || '', amount: String(estDue), tendered: '', code: '', payNow: '',
          };
          const OK_LABEL = { CASH: 'Take cash', MPESA_STK: 'Send M-Pesa prompt', MPESA_MANUAL: 'Record payment', CREDIT: 'Sell on credit' };

          const m = UI.modal({
            title: s.sale ? 'Collect payment' : 'Take payment',
            body: `<div class="pay-total"><span>${s.sale ? 'Balance to collect' : 'Total'}</span><b>${UI.money(estDue)}</b></div>
              <div class="gf-seg pay-seg" id="p-seg">${methods.map(([k, label]) => `<button type="button" data-m="${k}">${label}</button>`).join('')}</div>
              <div id="p-panel" class="gf-stack"></div>`,
            foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-green" type="button" data-ok></button>',
          });
          const panel = m.el.querySelector('#p-panel'), okBtn = m.el.querySelector('[data-ok]');
          const amountField = (label) => `<div class="gf-field"><label class="gf-label" for="p-amount">${label}</label>
            <input class="gf-input plain" id="p-amount" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.amount)}" ${reg ? '' : 'readonly'}>
            ${reg ? '<span class="gf-hint">Anything less than the full amount stays on the customer’s account.</span>' : ''}</div>`;

          function showChange() {
            const out = panel.querySelector('#p-change');
            if (!out) return;
            const t = num(f.tendered);
            if (!(t > 0)) { out.innerHTML = ''; return; }
            out.innerHTML = t >= estDue - 0.005
              ? `Change to give: <b>${UI.money(Math.max(0, r2(t - estDue)))}</b>`
              : (reg ? `Balance <b>${UI.money(r2(estDue - t))}</b> goes on the customer’s account` : `<span class="neg">Short by ${UI.money(r2(estDue - t))}</span>`);
          }

          function paintPanel() {
            m.el.querySelectorAll('#p-seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === f.method));
            okBtn.textContent = OK_LABEL[f.method];
            if (f.method === 'CASH') {
              const chips = (() => {
                const set = new Set([r2(estDue)]);
                [100, 500, 1000, 2000, 5000].forEach((d) => { const v = Math.ceil(estDue / d) * d; if (v >= estDue) set.add(v); });
                return [...set].sort((a, b) => a - b).slice(0, 4);
              })();
              panel.innerHTML = `<div class="gf-field"><label class="gf-label" for="p-tender">Cash received (KES)</label>
                <input class="gf-input plain" id="p-tender" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.tendered)}" placeholder="0"></div>
                <div class="chips-row">${chips.map((v) => `<button type="button" class="fchip outline" data-cash="${v}">${v === r2(estDue) ? 'Exact' : fmt(v)}</button>`).join('')}</div>
                <div class="pay-change" id="p-change"></div>`;
              showChange();
            } else if (f.method === 'MPESA_STK') {
              panel.innerHTML = `<div class="gf-field"><label class="gf-label" for="p-phone">Customer’s M-Pesa number</label>
                <input class="gf-input plain" id="p-phone" inputmode="tel" placeholder="0712345678" value="${esc(f.phone)}" autocomplete="off"></div>
                ${amountField('Amount (KES)')}
                <span class="gf-hint">The customer gets a PIN prompt on their phone. The sale is marked paid when Safaricom confirms.</span>`;
            } else if (f.method === 'MPESA_MANUAL') {
              panel.innerHTML = `<div class="gf-field"><label class="gf-label" for="p-code">M-Pesa transaction code</label>
                <input class="gf-input plain" id="p-code" placeholder="e.g. SJK4N8XYZ1" value="${esc(f.code)}" autocomplete="off" style="text-transform:uppercase"></div>
                ${amountField('Amount (KES)')}`;
            } else {
              const c = s.customer || {};
              panel.innerHTML = `<div class="gf-note gf-note-amber"><i class="bi bi-journal-text"></i><span>The full ${UI.money(estDue)} goes on ${esc(c.full_name || c.business_name || 'the customer')}’s account.${num(c.credit_limit) > 0 ? ` Credit limit ${UI.money(c.credit_limit)}.` : ''}${num(c.balance) > 0 ? ` They already owe ${UI.money(c.balance)}.` : ''}</span></div>
                <div class="gf-field"><label class="gf-label" for="p-paynow">Pay part now in cash (optional)</label>
                <input class="gf-input plain" id="p-paynow" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.payNow)}" placeholder="0"></div>`;
            }
            const first = panel.querySelector('input:not([readonly])');
            if (first) first.focus();
          }

          m.el.querySelector('#p-seg').addEventListener('click', (e) => {
            const b = e.target.closest('[data-m]'); if (!b) return;
            f.method = b.dataset.m; m.error(''); paintPanel();
          });
          panel.addEventListener('input', (e) => {
            const id = e.target.id;
            if (id === 'p-phone') f.phone = e.target.value;
            else if (id === 'p-amount') f.amount = e.target.value;
            else if (id === 'p-tender') { f.tendered = e.target.value; showChange(); }
            else if (id === 'p-code') f.code = e.target.value;
            else if (id === 'p-paynow') f.payNow = e.target.value;
          });
          panel.addEventListener('click', (e) => {
            const c = e.target.closest('[data-cash]'); if (!c) return;
            f.tendered = c.dataset.cash;
            const box = panel.querySelector('#p-tender'); if (box) box.value = f.tendered;
            showChange();
          });
          paintPanel();

          okBtn.addEventListener('click', async () => {
            m.error('');
            const method = f.method;
            let amount = 0, tendered = 0, code = '', payNow = 0;
            if (method === 'CASH') {
              tendered = num(f.tendered);
              if (!(tendered > 0)) { m.error('Enter the cash received.'); return; }
              if (tendered + 0.005 < estDue && !reg) { m.error('The cash received is less than the total.'); return; }
            } else if (method === 'MPESA_STK' || method === 'MPESA_MANUAL') {
              amount = f.amount === '' ? estDue : num(f.amount);
              if (!(amount > 0)) { m.error('Enter the amount.'); return; }
              if (amount > estDue + 0.005) { m.error('The amount is more than the balance.'); return; }
              if (amount + 0.005 < estDue && !reg) { m.error('A walk-in customer must pay the full amount.'); return; }
              if (method === 'MPESA_STK' && !PHONE_OK(f.phone)) { m.error('Enter a valid Safaricom number, e.g. 0712345678.'); return; }
              code = f.code.trim().toUpperCase();
              if (method === 'MPESA_MANUAL' && !code) { m.error('Enter the M-Pesa transaction code.'); return; }
            } else {
              payNow = num(f.payNow);
              if (payNow < 0 || payNow > estDue + 0.005) { m.error('Check the amount paid now.'); return; }
            }
            try { localStorage.setItem(METHOD_KEY, method); } catch (_) { /* optional */ }

            // things that need the server's answer on the spot cannot be saved for later
            const needsApproval = !s.sale && s.cart.some(isBelow) && !GF.can('price.override');
            if (Offline.isOffline()) {
              if (method === 'MPESA_STK') { m.error(`M-Pesa prompts need the internet. Take cash${canCode ? ', or choose “M-Pesa code” and enter the code from the customer’s SMS' : ''}.`); return; }
              if (needsApproval) { m.error('Selling below the minimum price needs a manager’s approval, and that needs the internet. Change the price, or wait until the connection is back.'); return; }
            }
            if (!s.sale && method !== 'MPESA_STK' && !needsApproval) {
              m.busy(okBtn, true);
              try { await chargeDirect(m, { method, tendered, amount, code, payNow, phone: f.phone }); }
              catch (err) { m.error(err.message || 'Something went wrong. Try again.'); m.busy(okBtn, false); }
              return;
            }

            m.busy(okBtn, true);
            try {
              if (!s.sale) {
                s.sale = await createSale(method === 'CREDIT');
                s.locked = true;
                paintLock(); updateTotals();
              }
              const due = num(s.sale.balance_due);
              const full = (v) => (Math.abs(v - estDue) < 0.005 ? due : v); // full payment uses the server's balance
              let change = 0;

              if (method === 'CASH') {
                const applied = Math.min(tendered, due);
                await Api.post(`/sales/${s.sale.id}/payments`, { method: 'CASH', amount: applied });
                change = r2(Math.max(0, tendered - due));
              } else if (method === 'MPESA_MANUAL') {
                await Api.post(`/sales/${s.sale.id}/payments`, { method: 'MPESA_MANUAL', amount: full(amount), mpesa_receipt: code, payer_phone: f.phone || undefined });
              } else if (method === 'MPESA_STK') {
                const r = await Api.post(`/sales/${s.sale.id}/mpesa-stk`, { phone: f.phone.trim(), amount: full(amount) });
                m.close();
                waitStk({ paymentId: r.payment_id, phone: f.phone.trim(), amount: full(amount) });
                return;
              } else if (payNow > 0) {
                await Api.post(`/sales/${s.sale.id}/payments`, { method: 'CASH', amount: Math.min(payNow, due) });
              }
              m.close();
              try { s.sale = await Api.get(`/sales/${s.sale.id}`); } catch (_) { /* receipt still works */ }
              await finish(change);
            } catch (err) {
              if (err !== CANCELLED) m.error(err.message || 'Something went wrong. Try again.');
              m.busy(okBtn, false);
            }
          });
        }

        const waitStk = (args) => stkWait({ ...args, onPaid: completeAfterStk, onRetry: openPay });

        // ------------------------------------------------------------ events
        $('#t-search').addEventListener('input', (e) => { s.search = e.target.value.trim(); paintGrid(); });
        $('#t-search').addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          const term = s.search.toLowerCase();
          const hit = s.items.find((i) => term && (String(i.sku || '').toLowerCase() === term)) ||
            s.items.filter((i) => !term || String(i.name).toLowerCase().includes(term))[0];
          if (hit && term) { addItem(hit); e.target.value = ''; s.search = ''; paintGrid(); }
        });
        $('#t-refresh').addEventListener('click', async (e) => {
          const b = e.currentTarget; b.classList.add('spin');
          await Promise.all([loadItems(), loadBillable()]);
          b.classList.remove('spin');
        });
        const tierEl = $('#t-tier');
        if (tierEl) tierEl.addEventListener('click', (e) => {
          const b = e.target.closest('[data-tier]'); if (!b || b.dataset.tier === s.tier) return;
          if (s.locked) { UI.toast('Finish the posted sale before changing the price list.', 'error'); return; }
          s.tier = b.dataset.tier;
          tierEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          loadItems();
        });

        gridEl.addEventListener('click', (e) => {
          const card = e.target.closest('[data-item]'); if (!card) return;
          const it = itemOf(Number(card.dataset.item)); if (!it) return;
          const chip = e.target.closest('[data-unit]');
          addItem(it, chip ? chip.dataset.unit : undefined);
        });
        gridEl.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || e.target.closest('[data-unit]')) return;
          const card = e.target.closest('[data-item]'); if (!card) return;
          const it = itemOf(Number(card.dataset.item)); if (it) addItem(it);
        });
        if (jobsEl) jobsEl.addEventListener('click', (e) => {
          const b = e.target.closest('[data-job]'); if (b && !b.disabled) addJob(/^\d+$/.test(b.dataset.job) ? Number(b.dataset.job) : b.dataset.job);
        });

        linesEl.addEventListener('input', (e) => {
          const row = e.target.closest('[data-key]'); if (!row) return;
          const l = s.cart.find((x) => String(x.key) === row.dataset.key); if (!l) return;
          if (e.target.matches('[data-qty]')) l.qty = e.target.value === '' ? 0 : num(e.target.value);
          else if (e.target.matches('[data-price]')) l.price = e.target.value === '' ? 0 : num(e.target.value);
          updateTotals();
        });
        linesEl.addEventListener('change', (e) => {
          if (!e.target.matches('[data-unit]')) return;
          const row = e.target.closest('[data-key]');
          const l = s.cart.find((x) => String(x.key) === row.dataset.key);
          const it = l && itemOf(l.item_id);
          const u = it && units(it).find((x) => String(x.unit_id) === e.target.value);
          if (!u) return;
          l.unit_id = u.unit_id; l.unit_name = u.name; l.kg = u.kg; l.price = u.price; l.listPrice = u.price;
          paintLines(); updateTotals();
        });
        linesEl.addEventListener('click', (e) => {
          if (!e.target.closest('[data-remove]')) return;
          const key = e.target.closest('[data-key]').dataset.key;
          s.cart = s.cart.filter((x) => String(x.key) !== key);
          paintLines(); paintJobs(); updateTotals();
        });

        custEl.addEventListener('click', (e) => {
          const w = e.target.closest('[data-who]');
          if (w) {
            if (w.dataset.who === s.who) return;
            s.who = w.dataset.who;
            if (s.who === 'walkin') s.customer = null;
            paintCust(); loadBillable();
            return;
          }
          if (e.target.closest('[data-clear]')) { s.customer = null; paintCust(); loadBillable(); const q = custEl.querySelector('#c-q'); if (q) q.focus(); return; }
          const pick = e.target.closest('[data-i]');
          if (pick) { s.customer = s.lookup[Number(pick.dataset.i)]; s.lookup = []; paintCust(); loadBillable(); }
        });
        const lookup = UI.debounce(async (term) => {
          const list = custEl.querySelector('#c-list'); if (!list) return;
          if (term.length < 2) { list.classList.add('gf-hidden'); return; }
          try {
            s.lookup = (await Api.get(`/customers/lookup?q=${encodeURIComponent(term)}`)) || [];
            list.classList.remove('gf-hidden');
            list.innerHTML = s.lookup.length
              ? s.lookup.map((c, i) => `<button type="button" data-i="${i}"><span>${esc(c.full_name || c.business_name)}</span><small>${esc(c.phone || c.customer_code || '')}</small></button>`).join('')
              : '<div class="pick-empty">No customer found. Use Walk-in, or add the customer first.</div>';
          } catch (err) { UI.toast(err.message, 'error'); }
        }, 250);
        custEl.addEventListener('input', (e) => {
          if (e.target.id === 'c-wname') s.walkinName = e.target.value;
          else if (e.target.id === 'c-wphone') s.walkinPhone = e.target.value;
          else if (e.target.id === 'c-q') lookup(e.target.value.trim());
        });

        lockEl.addEventListener('click', (e) => {
          if (!e.target.closest('[data-leave]')) return;
          const no = s.sale.sale_no, due = s.sale.balance_due;
          resetTill(`Sale ${no} left with ${UI.money(due)} unpaid.`);
        });
        $('#t-clear').addEventListener('click', () => { if (s.cart.length) resetTill(); });

        totalsEl.addEventListener('input', (e) => { if (e.target.id === 't-disc') { s.discount = e.target.value; updateTotals(); } });
        totalsEl.addEventListener('click', (e) => {
          if (!e.target.closest('#t-charge')) return;
          if (!s.sale) { const problem = checkSale(); if (problem) { UI.toast(problem, 'error'); return; } }
          openPay();
        });
        fab.addEventListener('click', () => cartEl.scrollIntoView({ behavior: 'smooth', block: 'start' }));

        // ------------------------------------------------------------ start
        paintCust(); paintLines(); paintLock(); paintTotals(); updateTotals(); paintGrid();
        loadItems(); loadBillable();
      },
    });
  }

  window.GFPay = { showReceipt, printReceipt, stkWait, PHONE_OK, METHOD_NAME };

  tillPage({ path: 'cereal/till', module: 'CEREAL', title: 'Cereal till' });
  tillPage({ path: 'mill/till', module: 'MILL', title: 'Mill till' });
})();