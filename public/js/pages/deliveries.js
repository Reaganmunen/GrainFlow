/**
 * Cereals > Deliveries  (#/cereal/deliveries)
 * Delivery notes for sales that go out on a vehicle: To dispatch -> On the road -> Delivered (or Cancelled).
 * Create a delivery for a posted sale, edit the driver / vehicle / address, move it along, print the delivery note.
 * Uses GET /deliveries, GET /deliveries/:id, POST /deliveries, PUT /deliveries/:id, PUT /deliveries/:id/status,
 * GET /deliveries/:id/note and GET /sales (to pick the sale).
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const fmt = (n) => num(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  const stamp = (v) => (v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
  const dateOnly = (v) => (v ? new Date(v).toLocaleDateString('en-KE', { dateStyle: 'medium' }) : '');

  const STATUS = {
    PENDING: ['amber', 'To dispatch'], DISPATCHED: ['', 'On the road'], DELIVERED: ['green', 'Delivered'], CANCELLED: ['red', 'Cancelled'],
  };
  const pill = (st) => { const [tone, label] = STATUS[st] || ['', st]; return `<span class="pill ${tone}">${esc(label)}</span>`; };
  const isOpen = (st) => st === 'PENDING' || st === 'DISPATCHED';

  // ---------------------------------------------------------------- printable delivery note
  const PRINT_CSS =
    '@page{margin:14mm}body{margin:0;font:13px/1.45 Arial,Helvetica,sans-serif;color:#000}' +
    'h1{font-size:20px;margin:0 0 2px}h2{font-size:15px;margin:18px 0 6px;letter-spacing:.04em}' +
    '.biz{margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #000}.biz div{font-size:12px}' +
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.grid span{color:#555}' +
    'table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #000;padding:6px 8px;text-align:left}' +
    'th{background:#eee}td.r,th.r{text-align:right}' +
    '.sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:46px}.sign div{border-top:1px solid #000;padding-top:4px;font-size:12px}' +
    '.notes{margin-top:12px;font-size:12px}';

  function noteHtml(n) {
    const d = n.delivery || {}, b = n.business || {};
    const rows = (n.lines || []).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description || '')}</td>
      <td class="r">${esc(fmt(l.quantity))} ${esc(l.unit_code || '')}</td><td class="r">${l.quantity_kg != null ? esc(fmt(l.quantity_kg)) : ''}</td></tr>`).join('');
    return `<div class="biz"><h1>${esc(b.business_name || 'Delivery note')}</h1>
        ${b.address ? `<div>${esc(b.address)}</div>` : ''}${b.phone ? `<div>Tel: ${esc(b.phone)}</div>` : ''}</div>
      <h2>DELIVERY NOTE ${esc(d.delivery_no || '')}</h2>
      <div class="grid">
        <div><span>Date: </span>${esc(dateOnly(d.created_at))}</div><div><span>Sale: </span>${esc(d.sale_no || '')}</div>
        <div><span>Customer: </span>${esc(d.customer_name || '')}</div><div><span>Phone: </span>${esc(d.contact_phone || '')}</div>
        <div style="grid-column:1/3"><span>Deliver to: </span>${esc(d.delivery_address || '')}</div>
        <div><span>Driver: </span>${esc(d.driver_name || '')}</div><div><span>Vehicle: </span>${esc(d.vehicle_reg || '')}</div>
      </div>
      <table><thead><tr><th>#</th><th>Goods</th><th class="r">Quantity</th><th class="r">Weight (kg)</th></tr></thead><tbody>${rows}</tbody></table>
      ${d.notes ? `<div class="notes"><b>Notes:</b> ${esc(d.notes)}</div>` : ''}
      <div class="sign"><div>Dispatched by (name and signature)</div><div>Received by (name and signature)</div></div>`;
  }

  function printNote(n) {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const doc = f.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc((n.delivery && n.delivery.delivery_no) || 'Delivery note')}</title><style>${PRINT_CSS}</style></head><body>${noteHtml(n)}</body></html>`);
    doc.close();
    setTimeout(() => {
      f.contentWindow.focus();
      f.contentWindow.print();
      setTimeout(() => f.remove(), 2000);
    }, 250);
  }

  // ---------------------------------------------------------------- page
  GF.page('cereal/deliveries', {
    title: 'Deliveries',
    render(el) {
      const canManage = GF.can('deliveries.manage');
      const r0 = Kit.range('month');
      const s = { rows: [], total: 0, loading: true, failed: '', rng: 'month', from: r0.from, to: r0.to, status: '', search: '' };

      el.innerHTML = '<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div class="toolbar" id="toolbar2"></div><div id="table-host"></div>';
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'),
        toolbar2El = el.querySelector('#toolbar2'), hostEl = el.querySelector('#table-host');

      GF.setActions(canManage ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="dl-new" type="button"><i class="bi bi-plus-lg"></i>New delivery</button>' : '');
      const newBtn = document.getElementById('dl-new');

      // ------------------------------------------------------------ data
      async function load(quiet) {
        try {
          const q = new URLSearchParams({ limit: '500' });
          // deliveries still open are always shown, whatever the dates say
          const openOnly = isOpen(s.status);
          if (s.from && !openOnly) q.set('from', s.from);
          if (s.to && !openOnly) q.set('to', s.to);
          if (s.status) q.set('status', s.status);
          if (s.search) q.set('search', s.search);
          const rows = await Api.get(`/deliveries?${q}`);
          s.rows = rows || [];
          s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false;
        paint();
      }

      // ------------------------------------------------------------ painting
      function paintKpis() {
        const by = (st) => s.rows.filter((r) => r.status === st);
        const owed = s.rows.filter((r) => r.status !== 'CANCELLED').reduce((t, r) => t + num(r.balance_due), 0);
        kpisEl.innerHTML =
          Kit.kpi('bi-box-seam', 'To dispatch', String(by('PENDING').length), by('PENDING').length ? '<span class="gf-badge gf-badge-amber">Waiting</span>' : '', 'mill') +
          Kit.kpi('bi-truck', 'On the road', String(by('DISPATCHED').length)) +
          Kit.kpi('bi-check2-circle', 'Delivered', String(by('DELIVERED').length), '', 'cereal') +
          Kit.kpi('bi-hourglass-split', 'Still unpaid on these', UI.money(owed));
      }

      function paintToolbar() {
        const rc = (key, label) => `<button type="button" class="fchip ${s.rng === key ? 'on' : ''}" data-range="${key}">${label}</button>`;
        const sc = (key) => `<button type="button" class="fchip outline ${s.status === key ? 'on' : ''}" data-status="${key}">${esc(STATUS[key][1])}</button>`;
        toolbarEl.innerHTML = `
          ${rc('today', 'Today')}${rc('week', '7 days')}${rc('month', 'This month')}${rc('all', 'All time')}
          <span class="sep"></span>
          <label class="date-box">From <input type="date" id="d-from" value="${esc(s.from || '')}"></label>
          <label class="date-box">To <input type="date" id="d-to" value="${esc(s.to || '')}"></label>
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="d-search" placeholder="Delivery, sale, customer, driver or vehicle" value="${esc(s.search)}" aria-label="Search deliveries"></label>`;
        toolbar2El.innerHTML = `${sc('PENDING')}${sc('DISPATCHED')}${sc('DELIVERED')}${sc('CANCELLED')}
          ${isOpen(s.status) ? '<span class="gf-hint">Showing every open delivery, whatever the dates.</span>' : ''}`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = Kit.loading('deliveries'); return; }
        const err = s.failed ? Kit.error(s.failed) : '';
        if (!s.rows.length) {
          hostEl.innerHTML = `${err}${Kit.empty('bi-truck', 'No deliveries found', s.search || s.status ? 'Try clearing the filters.' : 'No delivery was set up in this period.',
            canManage && !s.search && !s.status ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">New delivery</button>' : '')}`;
          return;
        }
        const body = s.rows.map((r) => {
          const bal = num(r.balance_due);
          return `<tr class="click" data-id="${r.id}">
            <td><div class="cell-plain"><strong>${esc(r.delivery_no || `#${r.id}`)}</strong><span>${esc(stamp(r.created_at))}</span></div></td>
            <td><div class="cell-plain"><strong>${esc(r.customer_name || 'Walk-in')}</strong><span>${esc(r.delivery_address || r.contact_phone || '')}</span></div></td>
            <td class="muted">${esc(r.sale_no || '')}</td>
            <td><div class="cell-plain"><strong>${esc(r.driver_name || '–')}</strong><span>${esc(r.vehicle_reg || '')}</span></div></td>
            <td class="r ${bal > 0 && r.status !== 'CANCELLED' ? 'neg' : 'muted'}">${bal > 0 && r.status !== 'CANCELLED' ? UI.money(bal) : '–'}</td>
            <td>${pill(r.status)}</td></tr>`;
        }).join('');
        hostEl.innerHTML = `${err}${s.total > s.rows.length ? Kit.note(`Showing the latest ${s.rows.length} of ${s.total} deliveries. Narrow the dates to see the rest.`, 'amber') : ''}
          ${Kit.table([['Delivery'], ['Customer and place'], ['Sale'], ['Driver and vehicle'], ['Unpaid', 'r'], ['Status']], body)}`;
      }

      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const r = e.target.closest('[data-range]'); if (!r) return;
        s.rng = r.dataset.range; Object.assign(s, { from: '', to: '' }, Kit.range(s.rng));
        load(); paintToolbar();
      });
      toolbarEl.addEventListener('change', (e) => {
        if (e.target.id !== 'd-from' && e.target.id !== 'd-to') return;
        s.from = toolbarEl.querySelector('#d-from').value; s.to = toolbarEl.querySelector('#d-to').value; s.rng = 'custom';
        load(); paintToolbar();
      });
      toolbarEl.addEventListener('input', UI.debounce(async (e) => {
        if (e.target.id !== 'd-search') return;
        s.search = e.target.value.trim();
        await load(true);
        const box = toolbarEl.querySelector('#d-search');
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }, 300));
      toolbar2El.addEventListener('click', (e) => {
        const c = e.target.closest('[data-status]'); if (!c) return;
        s.status = s.status === c.dataset.status ? '' : c.dataset.status;
        load(); paintToolbar();
      });
      hostEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) { openForm(); return; }
        const tr = e.target.closest('tr[data-id]');
        if (tr) openDelivery(Number(tr.dataset.id));
      });
      if (newBtn) newBtn.addEventListener('click', () => openForm());

      // ------------------------------------------------------------ one delivery
      async function openDelivery(id) {
        const m = UI.modal({ title: 'Delivery', wide: true, body: '<div class="gf-hint" data-loading>Loading…</div>' });
        let d;
        try { d = await Api.get(`/deliveries/${id}`); }
        catch (err) { m.error(err.message); m.el.querySelector('[data-loading]').remove(); return; }

        const open = isOpen(d.status);
        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        body.insertAdjacentHTML('beforeend', `
          <div class="who-head"><div class="grow"><h3>${esc(d.delivery_no || `Delivery #${d.id}`)} ${pill(d.status)}</h3>
            <div class="sub">${esc(d.customer_name || 'Walk-in')} · sale ${esc(d.sale_no || '')}</div></div></div>
          ${d.status === 'DELIVERED' ? `<div class="gf-note"><i class="bi bi-check2-circle"></i><span>${esc(`Delivered ${stamp(d.delivered_at)}${d.received_by_name ? `, received by ${d.received_by_name}` : ''}.`)}</span></div>` : ''}
          ${d.status === 'CANCELLED' ? Kit.note('This delivery was cancelled.', 'red', 'bi-slash-circle') : ''}
          <div class="fact-grid">
            ${Kit.fact('Deliver to', esc(d.delivery_address || '–'))}${Kit.fact('Contact phone', esc(d.contact_phone || '–'))}
            ${Kit.fact('Driver', esc(d.driver_name || '–'))}${Kit.fact('Vehicle', esc(d.vehicle_reg || '–'))}
            ${Kit.fact('Set up', esc(stamp(d.created_at)))}${Kit.fact('Dispatched', esc(stamp(d.dispatched_at)))}
          </div>
          ${d.notes ? `<div class="form-section"><span class="gf-label">Notes</span><div>${esc(d.notes)}</div></div>` : ''}`);

        const foot = document.createElement('div');
        foot.className = 'gf-modal-foot';
        foot.innerHTML = `<button class="gf-btn gf-btn-ghost" type="button" data-close>Close</button>
          <button class="gf-btn gf-btn-ghost" type="button" data-print><i class="bi bi-printer"></i>Delivery note</button>
          ${canManage && open ? '<button class="gf-btn gf-btn-ghost" type="button" data-edit><i class="bi bi-pencil"></i>Edit</button><button class="gf-btn gf-btn-ghost" type="button" data-cancel><i class="bi bi-x-circle"></i>Cancel</button>' : ''}
          ${canManage && d.status === 'PENDING' ? '<button class="gf-btn gf-btn-dark" type="button" data-dispatch><i class="bi bi-truck"></i>Dispatch</button>' : ''}
          ${canManage && open ? '<button class="gf-btn gf-btn-green" type="button" data-deliver><i class="bi bi-check2-circle"></i>Mark delivered</button>' : ''}`;
        m.el.querySelector('.gf-modal').appendChild(foot);

        const again = () => { m.close(); load(true); openDelivery(id); };
        foot.addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-print], [data-edit], [data-cancel], [data-dispatch], [data-deliver]');
          if (!btn) return;
          m.error('');
          if (btn.hasAttribute('data-edit')) { m.close(); openForm(d); return; }
          if (btn.hasAttribute('data-deliver')) { m.close(); openDelivered(d); return; }
          if (btn.hasAttribute('data-cancel')) { m.close(); openCancel(d); return; }
          m.busy(btn, true);
          try {
            if (btn.hasAttribute('data-print')) {
              printNote(await Api.get(`/deliveries/${id}/note`));
              m.busy(btn, false);
            } else if (btn.hasAttribute('data-dispatch')) {
              await Api.put(`/deliveries/${id}/status`, { status: 'DISPATCHED' });
              UI.toast('Marked as on the road');
              again();
            }
          } catch (err) { m.error(err.message); m.busy(btn, false); }
        });
      }

      // ------------------------------------------------------------ mark delivered
      function openDelivered(d) {
        const m = UI.modal({
          title: `Delivered · ${d.delivery_no || ''}`,
          body: `<div class="gf-field"><label class="gf-label" for="dv-name">Who received the goods? (optional)</label>
            <input class="gf-input plain" id="dv-name" placeholder="Name of the person who signed" autocomplete="off"></div>`,
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-green" type="button" data-ok>Mark delivered</button>',
        });
        const okBtn = m.el.querySelector('[data-ok]');
        okBtn.addEventListener('click', async () => {
          m.error('');
          const name = m.el.querySelector('#dv-name').value.trim();
          m.busy(okBtn, true);
          try {
            await Api.put(`/deliveries/${d.id}/status`, { status: 'DELIVERED', received_by_name: name || undefined });
            m.close(); UI.toast('Marked as delivered'); load(true); openDelivery(d.id);
          } catch (err) { m.error(err.message); m.busy(okBtn, false); }
        });
      }

      // ------------------------------------------------------------ cancel
      function openCancel(d) {
        const m = UI.modal({
          title: `Cancel ${d.delivery_no || 'delivery'}`,
          body: '<div class="gf-note gf-note-amber"><i class="bi bi-exclamation-triangle"></i><span>The sale stays as it is. Only this delivery is closed, and it cannot be opened again.</span></div>',
          foot: '<button class="gf-btn gf-btn-ghost" type="button" data-close>Keep it</button><button class="gf-btn gf-btn-dark" type="button" data-ok>Cancel delivery</button>',
        });
        const okBtn = m.el.querySelector('[data-ok]');
        okBtn.addEventListener('click', async () => {
          m.error(''); m.busy(okBtn, true);
          try {
            await Api.put(`/deliveries/${d.id}/status`, { status: 'CANCELLED' });
            m.close(); UI.toast('Delivery cancelled'); load(true); openDelivery(d.id);
          } catch (err) { m.error(err.message); m.busy(okBtn, false); }
        });
      }

      // ------------------------------------------------------------ new / edit
      function openForm(existing) {
        const editing = !!existing;
        const f = {
          sale: null, sales: [], q: '',
          address: existing ? existing.delivery_address || '' : '', phone: existing ? existing.contact_phone || '' : '',
          driver: existing ? existing.driver_name || '' : '', vehicle: existing ? existing.vehicle_reg || '' : '', notes: existing ? existing.notes || '' : '',
        };
        const m = UI.modal({
          title: editing ? `Edit ${existing.delivery_no || 'delivery'}` : 'New delivery',
          wide: !editing,
          body: `${editing ? '' : '<div class="gf-field"><span class="gf-label">Sale to deliver</span><div id="f-sale"></div></div>'}
            <div class="gf-field"><label class="gf-label" for="f-address">Delivery address</label><input class="gf-input plain" id="f-address" value="${esc(f.address)}" autocomplete="off"></div>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="f-phone">Contact phone</label><input class="gf-input plain" id="f-phone" inputmode="tel" value="${esc(f.phone)}" autocomplete="off"></div>
              <div class="gf-field"><label class="gf-label" for="f-vehicle">Vehicle registration</label><input class="gf-input plain" id="f-vehicle" value="${esc(f.vehicle)}" autocomplete="off" style="text-transform:uppercase"></div>
            </div>
            <div class="gf-field"><label class="gf-label" for="f-driver">Driver</label><input class="gf-input plain" id="f-driver" value="${esc(f.driver)}" autocomplete="off"></div>
            <div class="gf-field"><label class="gf-label" for="f-notes">Notes</label><textarea class="gf-input plain" id="f-notes">${esc(f.notes)}</textarea></div>
            ${editing ? '' : '<div class="gf-hint">Leave the address and phone empty to use the ones on the sale.</div>'}`,
          foot: `<button class="gf-btn gf-btn-ghost" type="button" data-close>Cancel</button><button class="gf-btn gf-btn-dark" type="button" data-ok>${editing ? 'Save changes' : 'Create delivery'}</button>`,
        });
        const okBtn = m.el.querySelector('[data-ok]');
        const saleEl = m.el.querySelector('#f-sale');

        // ---- pick the sale (new deliveries only)
        async function loadSales() {
          try {
            const q = new URLSearchParams({ status: 'POSTED', limit: '15' });
            if (GF.inModule('CEREAL')) q.set('module', 'CEREAL');
            if (f.q) q.set('search', f.q);
            const rows = (await Api.get(`/sales?${q}`)) || [];
            // sales marked as delivery come first
            f.sales = rows.slice().sort((a, b) => Number(!!b.is_delivery) - Number(!!a.is_delivery));
          } catch (err) { m.error(err.message); f.sales = []; }
          paintSale();
        }
        function paintSale() {
          if (!saleEl) return;
          if (f.sale) {
            saleEl.innerHTML = `<div class="picked"><div class="who"><strong>${esc(f.sale.sale_no)} · ${esc(f.sale.customer_name || 'Walk-in')}</strong>
              <span>${UI.money(f.sale.total_amount)}${num(f.sale.balance_due) > 0 ? ` · ${UI.money(f.sale.balance_due)} unpaid` : ''}</span></div>
              <button class="icon-sq" type="button" data-clear aria-label="Change sale"><i class="bi bi-x-lg"></i></button></div>`;
            return;
          }
          const rows = f.sales.map((r, i) => `<tr class="click" data-i="${i}">
            <td><div class="cell-plain"><strong>${esc(r.sale_no)}</strong><span>${esc(dateOnly(r.sale_date))}</span></div></td>
            <td>${esc(r.customer_name || 'Walk-in')}${r.is_delivery ? ' <span class="pill green">Delivery</span>' : ''}</td>
            <td class="r">${UI.money(r.total_amount)}</td></tr>`).join('');
          saleEl.innerHTML = `<input class="gf-input plain" id="f-q" placeholder="Search by sale number, customer or phone" value="${esc(f.q)}" autocomplete="off" style="margin-bottom:8px">
            ${rows ? `<div class="mini-table" style="max-height:200px"><table class="dt"><tbody>${rows}</tbody></table></div>` : '<div class="gf-hint">No posted sales found.</div>'}`;
        }
        if (!editing) {
          paintSale(); loadSales();
          const search = UI.debounce(async (term) => {
            f.q = term; await loadSales();
            const box = saleEl.querySelector('#f-q');
            if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
          }, 300);
          saleEl.addEventListener('input', (e) => { if (e.target.id === 'f-q') search(e.target.value.trim()); });
          saleEl.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-i]');
            if (row) {
              f.sale = f.sales[Number(row.dataset.i)]; paintSale();
              // show what the sale already knows, as a hint rather than a value
              const a = m.el.querySelector('#f-address'); if (a && !a.value) a.placeholder = 'Taken from the sale if left empty';
              return;
            }
            if (e.target.closest('[data-clear]')) { f.sale = null; paintSale(); loadSales(); }
          });
        }

        okBtn.addEventListener('click', async () => {
          m.error('');
          const v = (id) => m.el.querySelector(id).value.trim();
          const body = {};
          const put = (key, val) => { if (val) body[key] = val; else if (editing) body[key] = ''; };
          put('delivery_address', v('#f-address'));
          put('contact_phone', v('#f-phone'));
          put('vehicle_reg', v('#f-vehicle').toUpperCase());
          put('driver_name', v('#f-driver'));
          put('notes', v('#f-notes'));
          if (!editing && !f.sale) { m.error('Pick the sale that is being delivered.'); return; }
          m.busy(okBtn, true);
          try {
            if (editing) {
              await Api.put(`/deliveries/${existing.id}`, body);
              m.close(); UI.toast('Delivery updated'); load(true); openDelivery(existing.id);
            } else {
              const created = await Api.post('/deliveries', { sale_id: f.sale.id, ...body });
              m.close(); UI.toast('Delivery created'); load(true);
              if (created && created.id) openDelivery(created.id);
            }
          } catch (err) { m.error(err.message); m.busy(okBtn, false); }
        });
      }

      paint();
      load();
    },
  });
})();