/**
 * Mill screens that sit around the job board:
 *   Mill > Yield alerts        (#/mill/yield)     review low-flour alerts, yield report by grain / miller / job
 *   Mill > Machines and power  (#/mill/machines)  machine list and the daily hours / fuel / electricity log
 *   Mill > Milling rates       (#/mill/rates)     rate list (base, blend, special) and yield standards
 * Uses /api/mill/yield-alerts, /mill/yield-report(/by-grain, /by-miller), /mill/machines(/logs),
 *      /api/milling-rates, /api/yield-standards and /api/items.
 */
(function () {
  const { esc, num, first, pretty, stamp, dateOnly, fmt, pct, fact, pill, opts } = Kit;
  const money = (n) => UI.money(n);

  const onClick = (root, sel, fn) => root.addEventListener('click', (e) => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(t, e); });

  // ===================================================================== YIELD ALERTS
  const ALERT_STATUS = { OPEN: ['amber', 'Open'], EXPLAINED: ['green', 'Explained'], CONFIRMED_LOSS: ['red', 'Confirmed loss'], DISMISSED: ['', 'Dismissed'] };
  const alertPill = (st) => { const x = ALERT_STATUS[st] || ['', pretty(st)]; return pill(x[0], x[1]); };

  GF.page('mill/yield', {
    title: 'Yield alerts',
    render(el) {
      const s = { tab: 'alerts', status: 'OPEN', period: 'month', rows: [], total: 0, grain: [], miller: [], jobs: [], loading: true, failed: '' };
      el.innerHTML = `<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="host"></div>`;
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#host');
      GF.setActions('');

      const rangeQ = () => { const r = Kit.range(s.period); const p = new URLSearchParams(); if (r.from) { p.set('from', r.from); p.set('to', r.to); } return p; };

      async function load(quiet) {
        s.loading = true; paint();
        try {
          if (s.tab === 'alerts') {
            const p = rangeQ(); p.set('limit', 200); if (s.status) p.set('status', s.status);
            const rows = await Api.get(`/mill/yield-alerts?${p}`);
            s.rows = rows || []; s.total = (rows && rows.pagination && rows.pagination.total) || s.rows.length;
          } else {
            const p = rangeQ(), jp = new URLSearchParams(p); jp.set('limit', 200);
            const [g, m, j] = await Promise.all([Api.get(`/mill/yield-report/by-grain?${p}`), Api.get(`/mill/yield-report/by-miller?${p}`), Api.get(`/mill/yield-report?${jp}`)]);
            s.grain = g || []; s.miller = m || []; s.jobs = j || [];
            s.total = (j && j.pagination && j.pagination.total) || s.jobs.length;
          }
          s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false; paint();
      }

      function paintToolbar() {
        toolbarEl.innerHTML = `
          <div class="gf-seg" id="tabs"><button type="button" data-tab="alerts" class="${s.tab === 'alerts' ? 'on' : ''}">Alerts</button><button type="button" data-tab="report" class="${s.tab === 'report' ? 'on' : ''}">Yield report</button></div>
          <span class="sep"></span>
          ${s.tab === 'alerts' ? Kit.chips('status', s.status, [['OPEN', 'Open'], ['EXPLAINED', 'Explained'], ['CONFIRMED_LOSS', 'Confirmed loss'], ['DISMISSED', 'Dismissed'], ['', 'All']]) + '<span class="sep"></span>' : ''}
          ${Kit.chips('period', s.period, [['week', 'Last 7 days'], ['month', 'This month'], ['all', 'All time']])}`;
      }

      function paintKpis() {
        if (s.tab === 'alerts') {
          kpisEl.innerHTML = Kit.kpi('bi-exclamation-triangle', s.status ? `${pretty(s.status)} alerts` : 'Alerts', String(s.total), s.status === 'OPEN' && s.total ? '<span class="gf-badge gf-badge-red">Review</span>' : '', 'mill');
          return;
        }
        const kgIn = s.grain.reduce((t, r) => t + num(r.kg_in), 0), kgOut = s.grain.reduce((t, r) => t + num(r.kg_out), 0);
        const low = s.grain.reduce((t, r) => t + num(r.low_yield_jobs), 0), jobs = s.grain.reduce((t, r) => t + num(r.jobs), 0);
        kpisEl.innerHTML = Kit.kpi('bi-gear-wide-connected', 'Jobs weighed', String(jobs)) +
          Kit.kpi('bi-percent', 'Average yield', kgIn ? pct((kgOut / kgIn) * 100) : '–', '', 'mill') +
          Kit.kpi('bi-box-arrow-in-down', 'Grain milled', UI.kg(kgIn)) +
          Kit.kpi('bi-exclamation-triangle', 'Low-yield jobs', String(low), low ? '<span class="gf-badge gf-badge-red">Check</span>' : '<span class="gf-badge gf-badge-green">None</span>');
      }

      const yieldOf = (r) => {
        const v = first(r, 'yield_pct', 'actual_yield_pct');
        if (v !== undefined) return num(v);
        const a = num(r.weight_in_kg), b = num(first(r, 'weight_out_kg', 'flour_kg'));
        return a ? (b / a) * 100 : null;
      };

      function paintAlerts() {
        if (!s.rows.length) return Kit.empty('bi-check-circle', s.status === 'OPEN' ? 'No alerts to review' : 'No alerts found', s.status === 'OPEN' ? 'Every job came out at or above the yield floor.' : 'Nothing matches this filter.');
        const body = s.rows.map((r) => {
          const y = yieldOf(r);
          return `<tr class="click" data-id="${r.id}"><td class="nowrap">${esc(stamp(r.received_at))}</td>
            <td><strong>${esc(r.ticket_no)}</strong><div class="muted" style="font-size:12px">${esc(r.customer_name || 'Walk-in')}</div></td>
            <td>${esc(r.grain_name)}</td><td>${esc(r.miller_name || '–')}</td>
            <td class="r">${esc(UI.kg(r.weight_in_kg))}</td><td class="r">${y === null ? '–' : `<b>${pct(y)}</b>`}</td>
            <td>${alertPill(r.status)}</td><td class="r muted"><i class="bi bi-chevron-right"></i></td></tr>`;
        }).join('');
        return (s.total > s.rows.length ? Kit.note(`Showing the latest ${s.rows.length} of ${s.total} alerts.`) : '') +
          Kit.table([['Received'], ['Ticket'], ['Grain'], ['Miller'], ['Grain in', 'r'], ['Flour yield', 'r'], ['Status'], ['']], body);
      }

      function yieldTable(rows, key, label) {
        if (!rows.length) return `<div class="dt-empty" style="padding:18px">No jobs in this period.</div>`;
        const body = rows.map((r) => {
          const p = num(r.avg_yield_pct);
          return `<tr><td><strong>${esc(r[key])}</strong></td><td class="r">${fmt(r.jobs, 0)}</td><td class="r">${esc(UI.kg(r.kg_in))}</td><td class="r">${esc(UI.kg(r.kg_out))}</td>
            <td class="r"><b>${pct(p)}</b></td><td class="r">${num(r.low_yield_jobs) ? pill('red', r.low_yield_jobs) : '<span class="muted">0</span>'}</td></tr>`;
        }).join('');
        return Kit.table([[label], ['Jobs', 'r'], ['In', 'r'], ['Out', 'r'], ['Avg yield', 'r'], ['Low', 'r']], body);
      }

      function paintReport() {
        const jobs = s.jobs.map((r) => {
          const y = yieldOf(r), low = String(r.yield_status || '').toUpperCase() === 'LOW';
          return `<tr><td class="nowrap">${esc(dateOnly(r.day))}</td><td>${esc(first(r, 'ticket_no', 'job_id') ?? '')}</td><td>${esc(r.grain)}</td><td>${esc(r.miller || '–')}</td>
            <td class="r">${esc(UI.kg(r.weight_in_kg))}</td><td class="r">${esc(UI.kg(r.weight_out_kg))}</td><td class="r"><b>${y === null ? '–' : pct(y)}</b></td><td>${low ? pill('red', 'Low') : pill('green', 'OK')}</td></tr>`;
        }).join('');
        return `<div class="gf-row2" style="align-items:start;gap:16px"><div><h3 style="margin:0 0 8px;font-size:14px">By grain</h3>${yieldTable(s.grain, 'grain', 'Grain')}</div>
          <div><h3 style="margin:0 0 8px;font-size:14px">By miller</h3>${yieldTable(s.miller, 'miller', 'Miller')}</div></div>
          <h3 style="margin:18px 0 8px;font-size:14px">Every weighed job</h3>
          ${s.jobs.length ? (s.total > s.jobs.length ? Kit.note(`Showing the latest ${s.jobs.length} of ${s.total} jobs.`) : '') + Kit.table([['Day'], ['Ticket'], ['Grain'], ['Miller'], ['In', 'r'], ['Out', 'r'], ['Yield', 'r'], ['Check']], jobs) : '<div class="dt-empty">No weighed jobs in this period.</div>'}`;
      }

      function paint() {
        paintKpis();
        paintToolbar();
        if (s.loading) { hostEl.innerHTML = Kit.loading(s.tab === 'alerts' ? 'alerts' : 'the yield report'); return; }
        hostEl.innerHTML = (s.failed ? Kit.error(s.failed) : '') + (s.tab === 'alerts' ? paintAlerts() : paintReport());
      }

      toolbarEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab],[data-status],[data-period]'); if (!b) return;
        if ('tab' in b.dataset) s.tab = b.dataset.tab; else if ('status' in b.dataset) s.status = b.dataset.status; else s.period = b.dataset.period;
        load(true);
      });
      onClick(hostEl, 'tr[data-id]', (tr) => openAlert(Number(tr.dataset.id)));

      function openAlert(id) {
        const a = s.rows.find((r) => r.id === id); if (!a) return;
        const y = yieldOf(a);
        const skip = /^(id|job_id|reviewed_by|created_at|updated_at|status|review_note|reviewed_at|ticket_no|received_at|weight_in_kg|job_type|grain_name|miller_name|customer_name|reviewed_by_name)$/;
        const extra = Object.keys(a).filter((k) => !skip.test(k) && a[k] !== null && typeof a[k] !== 'object')
          .map((k) => fact(esc(pretty(k)), esc(/_kg|_pct|per_100/.test(k) ? fmt(a[k], 2) : a[k]))).join('');
        const canReview = a.status === 'OPEN';
        const m = UI.modal({
          title: `Yield alert · ${a.ticket_no}`, wide: true,
          body: `<div class="who-head"><div class="grow"><h3>${y === null ? 'Low yield' : pct(y) + ' flour'}</h3><div class="sub">${esc(a.grain_name)} · ${esc(UI.kg(a.weight_in_kg))} in · ${esc(a.miller_name || 'No miller')}</div></div>${alertPill(a.status)}</div>
            <div class="fact-grid">${fact('Received', esc(stamp(a.received_at)))}${fact('Customer', esc(a.customer_name || 'Walk-in'))}${extra}</div>
            ${a.review_note ? `<div class="gf-note"><i class="bi bi-chat-left-text"></i><span><b>${esc(a.reviewed_by_name || 'Reviewer')}:</b> ${esc(a.review_note)}</span></div>` : ''}
            ${canReview ? `<div class="gf-field"><label class="gf-label" for="ya-status">Decision</label>
              <select class="gf-input plain" id="ya-status"><option value="EXPLAINED">Explained (e.g. damp or dirty grain)</option><option value="CONFIRMED_LOSS">Confirmed loss</option><option value="DISMISSED">Dismiss</option></select></div>
              <div class="gf-field"><label class="gf-label" for="ya-note">Note (required)</label><input class="gf-input plain" id="ya-note" placeholder="What did you find?"></div>` : ''}`,
          foot: canReview ? '<button class="gf-btn gf-btn-ghost" data-close type="button">Close</button><button class="gf-btn gf-btn-green" data-ok type="button">Save review</button>' : '<button class="gf-btn gf-btn-ghost" data-close type="button">Close</button>',
        });
        const ok = m.el.querySelector('[data-ok]');
        if (ok) ok.addEventListener('click', async () => {
          const note = m.el.querySelector('#ya-note').value.trim();
          if (!note) { m.error('Write a short note about what you found.'); return; }
          m.error(''); m.busy(ok, true);
          try { await Api.put(`/mill/yield-alerts/${id}/review`, { status: m.el.querySelector('#ya-status').value, review_note: note }); m.close(); UI.toast('Alert reviewed'); load(true); }
          catch (err) { m.busy(ok, false); m.error(err.message); }
        });
      }

      load();
    },
  });

  // ===================================================================== MACHINES AND POWER
  GF.page('mill/machines', {
    title: 'Machines and power',
    render(el) {
      const canEdit = GF.can('mill.machines');
      const s = { tab: 'logs', machines: [], logs: [], period: 'month', machine: '', loading: true, failed: '' };
      el.innerHTML = `<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="host"></div>`;
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#host');
      GF.setActions(canEdit ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" id="add-m" type="button"><i class="bi bi-plus-lg"></i>Add machine</button> <button class="gf-btn gf-btn-dark gf-btn-sm" id="add-l" type="button"><i class="bi bi-journal-plus"></i>Log a day</button>' : '');
      const bm = document.getElementById('add-m'), bl = document.getElementById('add-l');
      if (bm) bm.addEventListener('click', () => openMachine());
      if (bl) bl.addEventListener('click', () => openLog());

      async function load(quiet) {
        try {
          const p = new URLSearchParams(); const r = Kit.range(s.period);
          if (r.from) { p.set('from', r.from); p.set('to', r.to); }
          if (s.machine) p.set('machine_id', s.machine);
          const [machines, logs] = await Promise.all([Api.get('/mill/machines'), Api.get(`/mill/machines/logs?${p}`)]);
          s.machines = machines || []; s.logs = logs || []; s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false; paint();
      }

      function paint() {
        const hours = s.logs.reduce((t, r) => t + num(r.hours_run), 0), power = s.logs.reduce((t, r) => t + num(r.power_cost), 0);
        const fuel = s.logs.reduce((t, r) => t + num(r.fuel_litres), 0), kwh = s.logs.reduce((t, r) => t + num(r.electricity_kwh), 0);
        kpisEl.innerHTML = Kit.kpi('bi-lightning-charge', 'Power cost', money(power), '', 'mill') + Kit.kpi('bi-clock', 'Hours run', fmt(hours, 1)) +
          Kit.kpi('bi-fuel-pump', 'Fuel', `${fmt(fuel, 1)} L`) + Kit.kpi('bi-plug', 'Electricity', `${fmt(kwh, 1)} kWh`);
        toolbarEl.innerHTML = `<div class="gf-seg"><button type="button" data-tab="logs" class="${s.tab === 'logs' ? 'on' : ''}">Daily log</button><button type="button" data-tab="machines" class="${s.tab === 'machines' ? 'on' : ''}">Machines</button></div>
          ${s.tab === 'logs' ? `<span class="sep"></span>${Kit.chips('period', s.period, [['week', 'Last 7 days'], ['month', 'This month'], ['all', 'All time']])}<span class="grow"></span>
            <select class="gf-input plain" id="mf" style="height:32px;width:auto;font-size:13px" aria-label="Machine"><option value="">All machines</option>${opts(s.machines, s.machine, (x) => x.name)}</select>` : ''}`;
        if (s.loading) { hostEl.innerHTML = Kit.loading('machines'); return; }
        hostEl.innerHTML = (s.failed ? Kit.error(s.failed) : '') + (s.tab === 'logs' ? logsHtml() : machinesHtml());
      }

      function logsHtml() {
        if (!s.logs.length) return Kit.empty('bi-lightning-charge', 'No power log yet', 'Record hours run, fuel and electricity each day to see what each machine costs.', canEdit ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-log type="button">Log a day</button>' : '');
        const body = s.logs.map((r) => `<tr class="${canEdit ? 'click' : ''}" data-log-id="${r.id}"><td class="nowrap">${esc(dateOnly(r.log_date))}</td><td><strong>${esc(r.machine_name)}</strong><div class="muted" style="font-size:12px">${esc(r.notes || r.operator_name || '')}</div></td>
          <td class="r">${fmt(r.hours_run, 1)}</td><td class="r">${num(r.fuel_litres) ? `${fmt(r.fuel_litres, 1)} L` : '–'}</td><td class="r">${num(r.electricity_kwh) ? `${fmt(r.electricity_kwh, 1)} kWh` : '–'}</td><td class="r"><b>${money(r.power_cost)}</b></td></tr>`).join('');
        return Kit.table([['Date'], ['Machine'], ['Hours', 'r'], ['Fuel', 'r'], ['Electricity', 'r'], ['Power cost', 'r']], body);
      }
      function machinesHtml() {
        if (!s.machines.length) return Kit.empty('bi-gear-wide-connected', 'No machines yet', 'Add the mill engines and motors so jobs and power costs can be tied to them.', canEdit ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add-m type="button">Add machine</button>' : '');
        const body = s.machines.map((m) => `<tr class="${canEdit ? 'click' : ''}" data-mid="${m.id}"><td><strong>${esc(m.name)}</strong></td><td>${esc(pretty(m.kind) || '–')}</td><td>${esc(pretty(m.power_source) || '–')}</td>
          <td>${m.is_active === false ? pill('red', 'Inactive') : pill('green', 'Active')}</td>${canEdit ? '<td class="r muted"><i class="bi bi-pencil"></i></td>' : '<td></td>'}</tr>`).join('');
        return Kit.table([['Machine'], ['Type'], ['Power'], ['Status'], ['']], body);
      }

      toolbarEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab],[data-period]'); if (!b) return;
        if ('tab' in b.dataset) { s.tab = b.dataset.tab; paint(); } else { s.period = b.dataset.period; load(true); }
      });
      toolbarEl.addEventListener('change', (e) => { if (e.target.id === 'mf') { s.machine = e.target.value; load(true); } });
      hostEl.addEventListener('click', (e) => {
        if (!canEdit) return;
        if (e.target.closest('[data-log]')) return openLog();
        if (e.target.closest('[data-add-m]')) return openMachine();
        const lr = e.target.closest('tr[data-log-id]'); if (lr) return openLog(s.logs.find((x) => String(x.id) === lr.dataset.logId));
        const mr = e.target.closest('tr[data-mid]'); if (mr) openMachine(s.machines.find((x) => String(x.id) === mr.dataset.mid));
      });

      function openMachine(mc) {
        const editing = !!mc; mc = mc || { is_active: true };
        const m = UI.modal({
          title: editing ? 'Edit machine' : 'Add machine',
          body: `<div class="gf-field"><label class="gf-label" for="mc-name">Name</label><input class="gf-input plain" id="mc-name" value="${esc(mc.name || '')}" placeholder="e.g. Hammer mill 1"></div>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="mc-kind">Type (optional)</label><input class="gf-input plain" id="mc-kind" value="${esc(mc.kind || '')}" placeholder="e.g. Hammer mill"></div>
            <div class="gf-field"><label class="gf-label" for="mc-pow">Power source (optional)</label><input class="gf-input plain" id="mc-pow" value="${esc(mc.power_source || '')}" placeholder="e.g. Electric or Diesel"></div></div>
            <label class="gf-check"><input type="checkbox" id="mc-active" ${mc.is_active === false ? '' : 'checked'}><span>Machine is in use</span></label>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">Save machine</button>',
        });
        m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
          const name = m.el.querySelector('#mc-name').value.trim();
          if (!name) { m.error('Enter the machine name.'); return; }
          const body = { name, kind: m.el.querySelector('#mc-kind').value.trim() || null, power_source: m.el.querySelector('#mc-pow').value.trim() || null, is_active: m.el.querySelector('#mc-active').checked };
          m.error(''); m.busy(e.currentTarget, true);
          try { if (editing) await Api.put(`/mill/machines/${mc.id}`, body); else await Api.post('/mill/machines', body); m.close(); UI.toast('Machine saved'); load(true); }
          catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      function openLog(log) {
        const active = s.machines.filter((x) => x.is_active !== false);
        if (!active.length) { UI.toast('Add a machine first.', 'error'); return; }
        log = log || {};
        const v = (k) => esc(log[k] ?? '');
        const m = UI.modal({
          title: log.id ? 'Edit daily log' : 'Log a day', wide: true,
          body: `<div class="gf-row2"><div class="gf-field"><label class="gf-label" for="lg-m">Machine</label><select class="gf-input plain" id="lg-m">${opts(active, log.machine_id, (x) => x.name)}</select></div>
            <div class="gf-field"><label class="gf-label" for="lg-d">Date</label><input class="gf-input plain" id="lg-d" type="date" value="${esc(dateOnly(log.log_date) || Kit.ymd(new Date()))}"></div></div>
            <div class="gf-hint">Saving a machine and date that already has a log replaces that log.</div>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="lg-h">Hours run</label><input class="gf-input plain" id="lg-h" type="number" min="0" step="0.1" value="${v('hours_run')}"></div>
            <div class="gf-field"><label class="gf-label" for="lg-fl">Fuel (litres)</label><input class="gf-input plain" id="lg-fl" type="number" min="0" step="0.1" value="${v('fuel_litres')}"></div></div>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="lg-fc">Fuel cost (KES)</label><input class="gf-input plain" id="lg-fc" type="number" min="0" step="1" value="${v('fuel_cost')}"></div>
            <div class="gf-field"><label class="gf-label" for="lg-kw">Electricity (kWh)</label><input class="gf-input plain" id="lg-kw" type="number" min="0" step="0.1" value="${v('electricity_kwh')}"></div></div>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="lg-ec">Electricity cost (KES)</label><input class="gf-input plain" id="lg-ec" type="number" min="0" step="1" value="${v('electricity_cost')}"></div>
            <div class="gf-field"><label class="gf-label" for="lg-n">Notes (optional)</label><input class="gf-input plain" id="lg-n" value="${v('notes')}"></div></div>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">Save log</button>',
        });
        const q = (id) => m.el.querySelector(id);
        q('[data-ok]').addEventListener('click', async (e) => {
          const n = (id) => { const x = q(id).value; return x === '' ? 0 : parseFloat(x); };
          const vals = ['#lg-h', '#lg-fl', '#lg-fc', '#lg-kw', '#lg-ec'].map(n);
          if (vals.some((x) => !(x >= 0))) { m.error('Hours, fuel and electricity cannot be negative.'); return; }
          if (!q('#lg-d').value) { m.error('Choose the date.'); return; }
          const body = { machine_id: Number(q('#lg-m').value), log_date: q('#lg-d').value, hours_run: vals[0], fuel_litres: vals[1], fuel_cost: vals[2], electricity_kwh: vals[3], electricity_cost: vals[4], notes: q('#lg-n').value.trim() || null };
          m.error(''); m.busy(e.currentTarget, true);
          try { await Api.post('/mill/machines/logs', body); m.close(); UI.toast('Log saved'); load(true); }
          catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      paint(); load();
    },
  });

  // ===================================================================== MILLING RATES + YIELD STANDARDS
  const RATE_TYPES = [['BASE', 'Base rate'], ['BLEND', 'Blend add-on'], ['SPECIAL', 'Special add-on']];
  const BASES = [['PER_KG', 'per kg'], ['PER_TIN', 'per tin']];
  const basisLabel = (b) => (BASES.find((x) => x[0] === b) || [, pretty(b)])[1];
  const typeLabel = (t) => (RATE_TYPES.find((x) => x[0] === t) || [, pretty(t)])[1];

  GF.page('mill/rates', {
    title: 'Milling rates',
    render(el) {
      const canEdit = GF.can('rates.manage');
      const s = { tab: 'rates', rates: [], standards: [], grains: [], flours: [], loading: true, failed: '', showInactive: false };
      el.innerHTML = `<div class="toolbar" id="toolbar"></div><div id="host"></div>`;
      const toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#host');
      GF.setActions(canEdit ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="add-r" type="button"><i class="bi bi-plus-lg"></i>Add</button>' : '');
      const addBtn = document.getElementById('add-r');
      if (addBtn) addBtn.addEventListener('click', () => (s.tab === 'rates' ? openRate() : openStandard()));

      async function load(quiet) {
        try {
          const [rates, standards, items] = await Promise.all([
            Api.get('/milling-rates'), Api.get('/yield-standards').catch(() => []), Api.get('/items?limit=500').catch(() => []),
          ]);
          s.rates = rates || []; s.standards = standards || []; s.failed = '';
          const all = items || [];
          s.grains = all.filter((i) => /grain|raw/i.test(String(i.item_type || i.kind || i.type || '')) || /GRAIN/i.test(String(i.category || '')));
          if (!s.grains.length) s.grains = all;   // item type field unknown: fall back to every item
          s.flours = all;
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false; paint();
      }

      function paint() {
        toolbarEl.innerHTML = `<div class="gf-seg"><button type="button" data-tab="rates" class="${s.tab === 'rates' ? 'on' : ''}">Milling rates</button><button type="button" data-tab="standards" class="${s.tab === 'standards' ? 'on' : ''}">Yield standards</button></div>
          ${s.tab === 'rates' ? `<span class="sep"></span><button type="button" class="fchip ${s.showInactive ? 'on' : 'outline'}" data-inactive>Show retired rates</button>` : ''}`;
        if (addBtn) addBtn.lastChild.textContent = s.tab === 'rates' ? 'Add rate' : 'Add standard';
        if (s.loading) { hostEl.innerHTML = Kit.loading('rates'); return; }
        hostEl.innerHTML = (s.failed ? Kit.error(s.failed) : '') + (s.tab === 'rates' ? ratesHtml() : standardsHtml());
      }

      function ratesHtml() {
        const today = Kit.ymd(new Date());
        const live = (r) => r.is_active !== false && (!r.effective_to || dateOnly(r.effective_to) >= today);
        const rows = s.rates.filter((r) => s.showInactive || live(r));
        if (!rows.length) return Kit.empty('bi-tag', 'No milling rates', 'Add a base rate for each grain so job tickets can be priced.', canEdit ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">Add rate</button>' : '');
        const body = rows.map((r) => `<tr class="${canEdit ? 'click' : ''}" data-id="${r.id}"><td><strong>${esc(r.name)}</strong><div class="muted" style="font-size:12px">${esc(typeLabel(r.rate_type))}</div></td>
          <td>${esc(r.grain_name || 'Any grain')}</td><td class="r"><b>${money(r.rate)}</b> <span class="muted">${esc(basisLabel(r.rate_basis))}</span></td>
          <td class="nowrap">${esc(dateOnly(r.effective_from) || '–')}${r.effective_to ? ` to ${esc(dateOnly(r.effective_to))}` : ''}</td><td>${live(r) ? pill('green', 'Current') : pill('', 'Retired')}</td></tr>`).join('');
        return Kit.table([['Rate'], ['Grain'], ['Charge', 'r'], ['Effective'], ['Status']], body);
      }
      function standardsHtml() {
        if (!s.standards.length) return Kit.empty('bi-percent', 'No yield standards', 'A standard says how much flour 100 kg of grain should give, and the floor that raises a yield alert.', canEdit ? '<button class="gf-btn gf-btn-dark gf-btn-sm" data-add type="button">Add standard</button>' : '');
        const body = s.standards.map((r) => `<tr class="${canEdit ? 'click' : ''}" data-sid="${r.id}"><td><strong>${esc(r.grain_name)}</strong><div class="muted" style="font-size:12px">${esc(r.flour_name || '')}${r.bran_name ? ` + ${esc(r.bran_name)}` : ''}</div></td>
          <td class="r">${fmt(r.expected_flour_kg_per_100, 1)} kg</td><td class="r">${r.expected_bran_kg_per_100 != null ? `${fmt(r.expected_bran_kg_per_100, 1)} kg` : '–'}</td>
          <td class="r"><b>${fmt(r.alert_below_kg_per_100, 1)} kg</b></td><td class="nowrap">${esc(dateOnly(r.effective_from) || '–')}</td></tr>`).join('');
        return Kit.table([['Grain'], ['Flour per 100 kg', 'r'], ['Bran per 100 kg', 'r'], ['Alert below', 'r'], ['From']], body);
      }

      toolbarEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab],[data-inactive]'); if (!b) return;
        if ('tab' in b.dataset) s.tab = b.dataset.tab; else s.showInactive = !s.showInactive;
        paint();
      });
      hostEl.addEventListener('click', (e) => {
        if (!canEdit) return;
        if (e.target.closest('[data-add]')) return s.tab === 'rates' ? openRate() : openStandard();
        const r = e.target.closest('tr[data-id]'); if (r) return openRate(s.rates.find((x) => String(x.id) === r.dataset.id));
        const t = e.target.closest('tr[data-sid]'); if (t) openStandard(s.standards.find((x) => String(x.id) === t.dataset.sid));
      });

      function openRate(r) {
        const editing = !!r; r = r || { rate_type: 'BASE', rate_basis: 'PER_KG', is_active: true, effective_from: Kit.ymd(new Date()) };
        const m = UI.modal({
          title: editing ? 'Edit milling rate' : 'Add milling rate', wide: true,
          body: `<div class="gf-row2"><div class="gf-field"><label class="gf-label" for="r-name">Name</label><input class="gf-input plain" id="r-name" value="${esc(r.name || '')}" placeholder="e.g. Maize milling"></div>
            <div class="gf-field"><label class="gf-label" for="r-type">Kind of rate</label><select class="gf-input plain" id="r-type">${opts(RATE_TYPES, r.rate_type, (x) => x[1])}</select></div></div>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="r-grain">Grain</label><select class="gf-input plain" id="r-grain"><option value="">Any grain</option>${opts(s.grains, r.grain_item_id, (x) => x.name)}</select></div>
            <div class="gf-field"><label class="gf-label" for="r-basis">Charged</label><select class="gf-input plain" id="r-basis">${opts(BASES, r.rate_basis, (x) => x[1])}</select></div></div>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="r-rate">Rate (KES)</label><input class="gf-input plain" id="r-rate" type="number" min="0" step="0.5" value="${esc(r.rate ?? '')}"></div>
            <div class="gf-field"><label class="gf-label" for="r-from">Effective from</label><input class="gf-input plain" id="r-from" type="date" value="${esc(dateOnly(r.effective_from))}"></div></div>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="r-to">Effective to (optional)</label><input class="gf-input plain" id="r-to" type="date" value="${esc(dateOnly(r.effective_to))}"></div>
            <div class="gf-field" style="align-self:end"><label class="gf-check"><input type="checkbox" id="r-active" ${r.is_active === false ? '' : 'checked'}><span>Rate is in use</span></label></div></div>
            <div class="gf-hint">To change a price, add a new rate from today and set an end date on the old one so past jobs keep the rate they were charged.</div>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">Save rate</button>',
        });
        const q = (id) => m.el.querySelector(id);
        q('[data-ok]').addEventListener('click', async (e) => {
          const rate = parseFloat(q('#r-rate').value);
          if (!q('#r-name').value.trim()) { m.error('Enter a name.'); return; }
          if (!(rate >= 0)) { m.error('Enter the rate.'); return; }
          if (!q('#r-from').value) { m.error('Choose the date it starts.'); return; }
          const body = { name: q('#r-name').value.trim(), rate_type: q('#r-type').value, grain_item_id: q('#r-grain').value ? Number(q('#r-grain').value) : null,
            rate_basis: q('#r-basis').value, rate, effective_from: q('#r-from').value, effective_to: q('#r-to').value || null, is_active: q('#r-active').checked };
          m.error(''); m.busy(e.currentTarget, true);
          try { if (editing) await Api.put(`/milling-rates/${r.id}`, body); else await Api.post('/milling-rates', body); m.close(); UI.toast('Rate saved'); load(true); }
          catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      function openStandard(r) {
        const editing = !!r; r = r || { effective_from: Kit.ymd(new Date()) };
        const m = UI.modal({
          title: editing ? 'Edit yield standard' : 'Add yield standard', wide: true,
          body: `<div class="gf-row2"><div class="gf-field"><label class="gf-label" for="y-grain">Grain</label><select class="gf-input plain" id="y-grain" ${editing ? 'disabled' : ''}><option value="">Choose…</option>${opts(s.grains, r.grain_item_id, (x) => x.name)}</select></div>
            <div class="gf-field"><label class="gf-label" for="y-from">Effective from</label><input class="gf-input plain" id="y-from" type="date" value="${esc(dateOnly(r.effective_from))}"></div></div>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="y-fl">Flour item (optional)</label><select class="gf-input plain" id="y-fl"><option value="">None</option>${opts(s.flours, r.flour_item_id, (x) => x.name)}</select></div>
            <div class="gf-field"><label class="gf-label" for="y-br">Bran item (optional)</label><select class="gf-input plain" id="y-br"><option value="">None</option>${opts(s.flours, r.bran_item_id, (x) => x.name)}</select></div></div>
            <div class="gf-row2"><div class="gf-field"><label class="gf-label" for="y-ef">Expected flour per 100 kg</label><input class="gf-input plain" id="y-ef" type="number" min="0" max="100" step="0.1" value="${esc(r.expected_flour_kg_per_100 ?? '')}"></div>
            <div class="gf-field"><label class="gf-label" for="y-eb">Expected bran per 100 kg (optional)</label><input class="gf-input plain" id="y-eb" type="number" min="0" max="100" step="0.1" value="${esc(r.expected_bran_kg_per_100 ?? '')}"></div></div>
            <div class="gf-field"><label class="gf-label" for="y-al">Raise an alert when flour is below (kg per 100 kg)</label><input class="gf-input plain" id="y-al" type="number" min="0" max="100" step="0.1" value="${esc(r.alert_below_kg_per_100 ?? '')}"></div>
            <div class="gf-field"><label class="gf-label" for="y-n">Notes (optional)</label><input class="gf-input plain" id="y-n" value="${esc(r.notes || '')}"></div>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">Save standard</button>',
        });
        const q = (id) => m.el.querySelector(id);
        q('[data-ok]').addEventListener('click', async (e) => {
          const ef = parseFloat(q('#y-ef').value), al = parseFloat(q('#y-al').value), eb = q('#y-eb').value;
          if (!editing && !q('#y-grain').value) { m.error('Choose the grain.'); return; }
          if (!(ef > 0 && ef <= 100)) { m.error('Enter the expected flour, between 0 and 100 kg.'); return; }
          if (!(al > 0 && al <= ef)) { m.error('The alert level must be above 0 and not more than the expected flour.'); return; }
          const body = { expected_flour_kg_per_100: ef, expected_bran_kg_per_100: eb === '' ? null : parseFloat(eb), alert_below_kg_per_100: al, effective_from: q('#y-from').value || null,
            flour_item_id: q('#y-fl').value ? Number(q('#y-fl').value) : null, bran_item_id: q('#y-br').value ? Number(q('#y-br').value) : null, notes: q('#y-n').value.trim() || null };
          if (!editing) body.grain_item_id = Number(q('#y-grain').value);
          m.error(''); m.busy(e.currentTarget, true);
          try { if (editing) await Api.put(`/yield-standards/${r.id}`, body); else await Api.post('/yield-standards', body); m.close(); UI.toast('Standard saved'); load(true); }
          catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      paint(); load();
    },
  });
})();