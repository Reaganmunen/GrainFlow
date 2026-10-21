/**
 * Shared > Daily close  (#/shared/daily-close)
 * Top card: pick a date and a business (whole business, mill or cereals), see what the system expects in cash and
 * M-Pesa, enter what was actually counted, and close the day. A closed day shows its result and can be reopened.
 * Below: history of past closes with filters.
 *
 * Uses GET /daily-close/preview?date=&module=, POST /daily-close, POST /daily-close/:id/reopen, GET /daily-close.
 * Needs daily_close.view to see history, daily_close.perform to close a day, daily_close.reopen to reopen one.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const first = (r, ...keys) => { for (const k of keys) if (r && r[k] !== undefined && r[k] !== null) return r[k]; return undefined; };
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const nice = (v) => { const d = dateOnly(v); return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '–'; };
  const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '');

  const MODULES = [['SHARED', 'Whole business'], ['MILL', 'Posho mill'], ['CEREAL', 'Cereals']];
  const modLabel = (m) => (MODULES.find((x) => x[0] === m) || [, m || '–'])[1];
  const modPill = (m) => `<span class="pill ${m === 'MILL' ? 'amber' : m === 'CEREAL' ? 'green' : ''}">${esc(modLabel(m))}</span>`;

  /** counted minus expected: 0 is balanced, below 0 is short, above 0 is over */
  const diffPill = (v) => {
    const n = Math.round(num(v) * 100) / 100;
    if (Math.abs(n) < 0.005) return '<span class="pill green">Balanced</span>';
    return n < 0 ? `<span class="pill red">Short ${esc(UI.money(Math.abs(n)))}</span>` : `<span class="pill amber">Over ${esc(UI.money(n))}</span>`;
  };

  // values on a saved close row (column names tried in turn; falls back to counted minus expected)
  const rowExpCash = (r) => num(first(r, 'expected_cash', 'cash_expected'));
  const rowExpMp = (r) => num(first(r, 'expected_mpesa', 'mpesa_expected'));
  const rowCashDiff = (r) => { const v = first(r, 'cash_variance', 'variance_cash', 'cash_difference', 'cash_diff'); return v !== undefined ? num(v) : num(r.counted_cash) - rowExpCash(r) - num(r.opening_float); };
  const rowMpDiff = (r) => { const v = first(r, 'mpesa_variance', 'variance_mpesa', 'mpesa_difference', 'mpesa_diff'); return v !== undefined ? num(v) : num(r.counted_mpesa) - rowExpMp(r); };

  function periodRange(key) {
    const now = new Date(), to = ymd(now);
    if (key === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: ymd(d), to }; }
    if (key === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    return {};
  }

  GF.page('shared/daily-close', {
    title: 'Daily close',
    render(el) {
      const canPerform = GF.can('daily_close.perform');
      const canView = GF.can('daily_close.view');
      const canReopen = GF.can('daily_close.reopen');
      const s = {
        date: ymd(new Date()), module: 'SHARED', preview: null, pLoading: false, pFailed: '',
        rows: [], total: 0, period: 'month', hModule: '', status: '', hLoading: true, hFailed: '',
      };

      el.innerHTML = `<div class="dc">
        <section class="dash-card dc-card" id="close-card"></section>
        ${canView ? `<div class="dc-hist-head"><h3>Past closes</h3></div><div class="toolbar" id="h-toolbar"></div><div id="h-host"></div>` : ''}
      </div>`;
      const cardEl = el.querySelector('#close-card');
      const toolbarEl = el.querySelector('#h-toolbar'), hostEl = el.querySelector('#h-host');

      // ------------------------------------------------------------ the closing card
      function paintCardShell() {
        cardEl.innerHTML = `
          <header class="dc-top">
            <div><h3>Close the day</h3><p class="dc-sub">Count the drawer and your M-Pesa, then compare with what the system expects.</p></div>
            <div class="dc-pick">
              <label class="gf-label" for="dc-date">Date</label>
              <input class="gf-input plain" id="dc-date" type="date" max="${ymd(new Date())}" value="${esc(s.date)}">
            </div>
          </header>
          <div class="gf-seg dc-mods" id="dc-mods" role="group" aria-label="Which business">${MODULES.map(([v, l]) => `<button type="button" data-m="${v}" class="${s.module === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div id="dc-body"></div>`;
        cardEl.querySelector('#dc-date').addEventListener('change', (e) => { if (!e.target.value) return; s.date = e.target.value; loadPreview(); });
        cardEl.querySelector('#dc-mods').addEventListener('click', (e) => {
          const b = e.target.closest('button[data-m]'); if (!b || b.dataset.m === s.module) return;
          s.module = b.dataset.m;
          cardEl.querySelectorAll('#dc-mods button').forEach((x) => x.classList.toggle('on', x.dataset.m === s.module));
          loadPreview();
        });
      }

      async function loadPreview() {
        const body = cardEl.querySelector('#dc-body');
        if (!canPerform) {
          body.innerHTML = '<div class="gf-note gf-note-amber"><i class="bi bi-info-circle"></i><span>Your role can look at past closes but cannot close a day.</span></div>';
          return;
        }
        s.pLoading = true; s.pFailed = '';
        body.innerHTML = '<div class="dt-empty">Working out what is expected…</div>';
        const mine = `${s.date}|${s.module}`;
        s.token = mine;
        try {
          const p = await Api.get(`/daily-close/preview?date=${encodeURIComponent(s.date)}&module=${s.module}`);
          if (s.token !== mine) return; // a newer pick has replaced this one
          s.preview = p || {};
        } catch (e) {
          if (s.token !== mine) return;
          s.pFailed = e.message; s.preview = null;
        }
        s.pLoading = false;
        paintBody();
      }

      function paintBody() {
        const body = cardEl.querySelector('#dc-body');
        if (s.pFailed) {
          body.innerHTML = `<div class="gf-note gf-note-red" role="alert"><i class="bi bi-exclamation-circle"></i><span>${esc(s.pFailed)}</span></div>
            <div class="dt-empty"><button class="gf-btn gf-btn-dark gf-btn-sm" id="dc-retry" type="button">Try again</button></div>`;
          body.querySelector('#dc-retry').addEventListener('click', loadPreview);
          return;
        }
        const p = s.preview || {};
        const ex = p.existing;
        if (ex && String(ex.status).toUpperCase() === 'CLOSED') {
          body.innerHTML = `<div class="gf-note gf-note-amber" style="margin-bottom:12px"><i class="bi bi-lock"></i><span>${esc(nice(s.date))} is already closed for ${esc(modLabel(s.module).toLowerCase())}.</span></div>${closedHtml(ex)}
            ${canReopen ? `<div class="dc-actions"><button class="gf-btn gf-btn-ghost gf-btn-sm" id="dc-reopen" type="button"><i class="bi bi-unlock"></i>Reopen this day</button></div>` : ''}`;
          const rb = body.querySelector('#dc-reopen'); if (rb) rb.addEventListener('click', () => confirmReopen(ex));
          return;
        }
        paintForm(body, p, ex);
      }

      function paintForm(body, p, ex) {
        const expCash = num(first(p, 'expected_cash', 'cash_expected'));
        const expMp = num(first(p, 'expected_mpesa', 'mpesa_expected'));
        const pre = (k) => (ex && ex[k] !== undefined && ex[k] !== null ? esc(ex[k]) : '');
        body.innerHTML = `
          ${ex ? '<div class="gf-note gf-note-amber" style="margin-bottom:12px"><i class="bi bi-info-circle"></i><span>This day was started but not finished. Your earlier numbers are filled in.</span></div>' : ''}
          <div class="dc-expect">
            <div class="dc-box"><span>Expected cash</span><b>${UI.money(expCash)}</b><small>Cash sales and payments less cash expenses</small></div>
            <div class="dc-box"><span>Expected M-Pesa</span><b>${UI.money(expMp)}</b><small>Confirmed M-Pesa payments</small></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="dc-float">Opening float (KES)</label>
              <input class="gf-input plain" id="dc-float" type="number" inputmode="decimal" min="0" step="1" value="${pre('opening_float') || '0'}">
              <div class="gf-hint">Cash that was already in the drawer when the day started.</div></div>
            <div class="gf-field"><label class="gf-label" for="dc-cash">Cash counted (KES)</label>
              <input class="gf-input plain" id="dc-cash" type="number" inputmode="decimal" min="0" step="1" value="${pre('counted_cash')}" placeholder="0">
              <div class="dc-live" id="dc-cash-diff"></div></div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="dc-mp">M-Pesa counted (KES)</label>
              <input class="gf-input plain" id="dc-mp" type="number" inputmode="decimal" min="0" step="1" value="${pre('counted_mpesa')}" placeholder="0">
              <div class="dc-live" id="dc-mp-diff"></div></div>
            <div class="gf-field"><label class="gf-label" for="dc-notes">Notes</label>
              <input class="gf-input plain" id="dc-notes" value="${pre('notes')}" placeholder="Explain any difference">
              <div class="gf-hint" id="dc-notes-hint"></div></div>
          </div>
          <div class="dc-actions"><button class="gf-btn gf-btn-green" id="dc-close" type="button"><i class="bi bi-journal-check"></i>Close the day</button></div>`;

        const $ = (q) => body.querySelector(q);
        const diffs = () => {
          const fl = num($('#dc-float').value);
          const cashIn = $('#dc-cash').value !== '', mpIn = $('#dc-mp').value !== '';
          return {
            cash: cashIn ? num($('#dc-cash').value) - (expCash + fl) : null,
            mp: mpIn ? num($('#dc-mp').value) - expMp : null,
          };
        };
        const refresh = () => {
          const d = diffs();
          $('#dc-cash-diff').innerHTML = d.cash === null ? '' : diffPill(d.cash);
          $('#dc-mp-diff').innerHTML = d.mp === null ? '' : diffPill(d.mp);
          const off = (d.cash !== null && Math.abs(d.cash) >= 0.005) || (d.mp !== null && Math.abs(d.mp) >= 0.005);
          $('#dc-notes-hint').textContent = off ? 'Required: say what caused the difference.' : '';
        };
        ['#dc-float', '#dc-cash', '#dc-mp'].forEach((q) => $(q).addEventListener('input', refresh));
        refresh();

        $('#dc-close').addEventListener('click', () => {
          if ($('#dc-cash').value === '' || $('#dc-mp').value === '') { UI.toast('Enter the cash and M-Pesa you counted. Use 0 if there is none.', 'error'); return; }
          if (num($('#dc-cash').value) < 0 || num($('#dc-mp').value) < 0 || num($('#dc-float').value) < 0) { UI.toast('Amounts cannot be negative.', 'error'); return; }
          const d = diffs();
          const off = Math.abs(d.cash) >= 0.005 || Math.abs(d.mp) >= 0.005;
          const notes = $('#dc-notes').value.trim();
          if (off && !notes) { $('#dc-notes').focus(); UI.toast('Add a note that explains the difference.', 'error'); return; }
          confirmClose({
            date: s.date, module: s.module, opening_float: num($('#dc-float').value),
            counted_cash: num($('#dc-cash').value), counted_mpesa: num($('#dc-mp').value), notes: notes || null,
          }, d);
        });
      }

      function confirmClose(payload, d) {
        const m = UI.modal({
          title: `Close ${nice(payload.date)}?`,
          body: `<p style="margin-bottom:12px">${esc(modLabel(payload.module))}. Once closed, the numbers are locked. Only the owner can reopen the day.</p>
            <div class="fact-grid">
              <div class="fact"><span>Cash counted</span><b>${UI.money(payload.counted_cash)}</b></div><div class="fact"><span>Cash</span>${diffPill(d.cash)}</div>
              <div class="fact"><span>M-Pesa counted</span><b>${UI.money(payload.counted_mpesa)}</b></div><div class="fact"><span>M-Pesa</span>${diffPill(d.mp)}</div>
            </div>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Go back</button><button class="gf-btn gf-btn-green" data-ok type="button">Close the day</button>',
        });
        m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
          m.error(''); m.busy(e.currentTarget, true);
          try {
            await Api.post('/daily-close', payload);
            m.close(); UI.toast('Day closed');
            await Promise.all([loadPreview(), loadHistory(true)]);
          } catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      function confirmReopen(row) {
        const m = UI.modal({
          title: `Reopen ${nice(row.close_date)}?`,
          body: `<p>${esc(modLabel(row.module))} will be open again so the counts can be corrected and the day closed once more.</p>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-dark" data-ok type="button">Reopen day</button>',
        });
        m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
          m.error(''); m.busy(e.currentTarget, true);
          try {
            await Api.post(`/daily-close/${row.id}/reopen`);
            m.close(); UI.toast('Day reopened');
            await Promise.all([loadPreview(), loadHistory(true)]);
          } catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      /** The result of a close: expected, counted and difference for cash and M-Pesa. */
      function closedHtml(r) {
        const by = r.closed_by_name ? ` by ${esc(r.closed_by_name)}` : '';
        const when = first(r, 'closed_at', 'updated_at', 'created_at');
        const fl = num(r.opening_float);
        return `<div class="dc-result">
          <div class="dc-meta">${modPill(r.module)}<span class="pill ${String(r.status).toUpperCase() === 'CLOSED' ? 'green' : 'amber'}">${String(r.status).toUpperCase() === 'CLOSED' ? 'Closed' : 'Open'}</span>
            <span class="muted">${esc(nice(r.close_date))}${by}${when ? ` · ${esc(stamp(when))}` : ''}</span></div>
          <div class="dt-wrap"><table class="dt"><thead><tr><th></th><th class="r">Expected</th><th class="r">Counted</th><th class="r">Difference</th></tr></thead><tbody>
            <tr><td><strong>Cash</strong>${fl ? `<div class="muted" style="font-size:12px">Opening float ${esc(UI.money(fl))}</div>` : ''}</td><td class="r">${UI.money(rowExpCash(r))}</td><td class="r">${UI.money(r.counted_cash)}</td><td class="r">${diffPill(rowCashDiff(r))}</td></tr>
            <tr><td><strong>M-Pesa</strong></td><td class="r">${UI.money(rowExpMp(r))}</td><td class="r">${UI.money(r.counted_mpesa)}</td><td class="r">${diffPill(rowMpDiff(r))}</td></tr>
          </tbody></table></div>
          ${r.notes ? `<div class="dc-notes"><span>Notes</span><p>${esc(r.notes)}</p></div>` : ''}
        </div>`;
      }

      // ------------------------------------------------------------ history
      async function loadHistory(quiet) {
        if (!canView) return;
        if (!quiet) { s.hLoading = true; paintHistory(); }
        s.hFailed = '';
        try {
          const q = new URLSearchParams({ limit: 100 });
          const r = periodRange(s.period);
          if (r.from) { q.set('from', r.from); q.set('to', r.to); }
          if (s.hModule) q.set('module', s.hModule);
          if (s.status) q.set('status', s.status);
          const rows = await Api.get(`/daily-close?${q}`);
          s.rows = rows || [];
          s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
        } catch (e) { s.hFailed = e.message; }
        s.hLoading = false; paintHistory();
      }

      function paintToolbar() {
        const chip = (attr, val, label, on) => `<button type="button" class="fchip ${on ? 'on' : 'outline'}" data-${attr}="${val}">${label}</button>`;
        toolbarEl.innerHTML =
          [['week', 'Last 7 days'], ['month', 'This month'], ['all', 'All time']].map(([v, l]) => chip('period', v, l, s.period === v)).join('') +
          '<span class="sep"></span>' +
          [['', 'All businesses'], ...MODULES].map(([v, l]) => chip('hmodule', v, l, s.hModule === v)).join('') +
          '<span class="sep"></span>' +
          [['', 'Any status'], ['CLOSED', 'Closed'], ['OPEN', 'Open']].map(([v, l]) => chip('status', v, l, s.status === v)).join('');
      }

      function paintHistory() {
        if (!canView) return;
        if (s.hLoading) { hostEl.innerHTML = '<div class="dt-empty">Loading past closes…</div>'; return; }
        const err = s.hFailed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.hFailed)}</span></div>` : '';
        if (!s.rows.length) {
          hostEl.innerHTML = `${err}<div class="dt-empty"><div class="tile"><i class="bi bi-journal-check"></i></div><h3>No closes found</h3>
            <p>${s.period !== 'all' || s.hModule || s.status ? 'Nothing matches these filters. Try All time.' : 'Closed days will be listed here so you can see where cash or M-Pesa did not add up.'}</p></div>`;
          return;
        }
        const body = s.rows.map((r) => `<tr class="click" data-id="${r.id}">
            <td class="nowrap"><strong>${esc(nice(r.close_date))}</strong></td>
            <td>${modPill(r.module)}</td>
            <td class="r">${diffPill(rowCashDiff(r))}</td>
            <td class="r">${diffPill(rowMpDiff(r))}</td>
            <td>${String(r.status).toUpperCase() === 'CLOSED' ? '<span class="pill green">Closed</span>' : '<span class="pill amber">Open</span>'}</td>
            <td class="muted">${esc(r.closed_by_name || '')}</td>
            <td class="r muted"><i class="bi bi-chevron-right"></i></td></tr>`).join('');
        hostEl.innerHTML = `${err}${s.total > s.rows.length ? `<div class="gf-note gf-note-amber" style="margin-bottom:10px"><i class="bi bi-info-circle"></i><span>Showing the latest ${s.rows.length} of ${s.total}. Narrow the period to see the rest.</span></div>` : ''}
          <div class="dt-wrap"><table class="dt"><thead><tr><th>Date</th><th>For</th><th class="r">Cash</th><th class="r">M-Pesa</th><th>Status</th><th>Closed by</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
      }

      function openRow(id) {
        const r = s.rows.find((x) => String(x.id) === String(id)); if (!r) return;
        const closed = String(r.status).toUpperCase() === 'CLOSED';
        const m = UI.modal({
          title: `${nice(r.close_date)}`, wide: true,
          body: closedHtml(r),
          foot: `<button class="gf-btn gf-btn-ghost" data-close type="button">Close</button>${closed && canReopen ? '<button class="gf-btn gf-btn-dark" data-reopen type="button"><i class="bi bi-unlock"></i>Reopen this day</button>' : ''}`,
        });
        const rb = m.el.querySelector('[data-reopen]');
        if (rb) rb.addEventListener('click', () => { m.close(); confirmReopen(r); });
      }

      if (canView) {
        toolbarEl.addEventListener('click', (e) => {
          const b = e.target.closest('[data-period], [data-hmodule], [data-status]'); if (!b) return;
          if ('period' in b.dataset) s.period = b.dataset.period;
          else if ('hmodule' in b.dataset) s.hModule = b.dataset.hmodule;
          else s.status = b.dataset.status;
          paintToolbar(); loadHistory(false);
        });
        hostEl.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openRow(tr.dataset.id); });
        paintToolbar();
      }

      paintCardShell();
      loadPreview();
      loadHistory(false);
    },
  });
})();