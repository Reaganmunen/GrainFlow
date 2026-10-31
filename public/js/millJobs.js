/**
 * Mill > Job board  (#/mill/jobs)
 * Waiting -> Milling -> Ready -> Collected. Talks to /api/mill/jobs, /api/mill/yield-alerts, /api/customers/lookup,
 * /api/items, /api/milling-rates/current/:id and /api/mill/machines.
 */
(function () {
  const { esc } = UI;

  const WARN_MIN = 15;     // card time turns amber
  const BREACH_MIN = 20;   // card time turns red, counted as "waiting too long"
  const REFRESH_MS = 30000;

  const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the browser's time zone
  const num = (v) => Number(v || 0);
  const fmtKg = (n) => `${num(n).toLocaleString('en-KE', { maximumFractionDigits: 1 })} kg`;

  GF.page('mill/jobs', {
    title: 'Job board',
    render(el) {
      const s = { open: [], done: [], alerts: [], mine: false, chip: '', search: '', loading: true, failed: '' };
      const alertByJob = () => new Map(s.alerts.map((a) => [a.job_id, a]));
      let timer = null;

      el.innerHTML = `
        <div class="kpis" id="kpis"></div>
        <div class="toolbar" id="toolbar"></div>
        <div id="board-host"></div>`;
      const kpisEl = el.querySelector('#kpis');
      const toolbarEl = el.querySelector('#toolbar');
      const boardEl = el.querySelector('#board-host');

      GF.setActions(GF.can('mill.create')
        ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="new-job" type="button"><i class="bi bi-plus-lg"></i>New job ticket</button>' : '');
      const newBtn = document.getElementById('new-job');
      if (newBtn) newBtn.addEventListener('click', () => openNewJob());

      // ---------------------------------------------------------- data
      async function load(quiet) {
        const refresh = toolbarEl.querySelector('[data-act="refresh"]');
        if (refresh) refresh.classList.add('spin');
        try {
          const day = todayStr();
          const [open, done, alerts] = await Promise.all([
            Api.get('/mill/jobs?status=WAITING,MILLING,READY&limit=200'),
            Api.get(`/mill/jobs?status=COLLECTED&from=${day}&to=${day}&limit=200`),
            GF.can('mill.yield') ? Api.get('/mill/yield-alerts?status=OPEN&limit=200').catch(() => []) : Promise.resolve([]),
          ]);
          s.open = open || []; s.done = done || []; s.alerts = alerts || [];
          s.failed = '';
        } catch (err) {
          s.failed = err.message;
          if (!quiet) UI.toast(err.message, 'error');
        }
        s.loading = false;
        paint();
      }

      function startTimer() {
        timer = setInterval(() => {
          if (!document.body.contains(boardEl)) { clearInterval(timer); return; } // user left this screen
          if (!document.hidden && !document.querySelector('.gf-backdrop')) load(true);
        }, REFRESH_MS);
      }

      // ---------------------------------------------------------- filtering
      const myName = (GF.user.full_name || GF.user.name || '').toLowerCase();
      function visible(j) {
        const alerts = alertByJob();
        if (s.mine && String(j.miller_name || '').toLowerCase() !== myName) return false;
        if (s.chip === 'slow' && !(j.status === 'WAITING' && UI.minsSince(j.received_at) >= BREACH_MIN)) return false;
        if (s.chip === 'yield' && !alerts.has(j.id)) return false;
        if (s.chip === 'unbilled' && !isUnbilled(j)) return false;
        if (s.chip === 'own' && j.job_type !== 'OWN') return false;
        if (s.search) {
          const q = s.search.toLowerCase();
          if (![j.ticket_no, j.customer_name, j.grain_name].some((v) => String(v || '').toLowerCase().includes(q))) return false;
        }
        return true;
      }
      const isUnbilled = (j) => j.job_type === 'CUSTOMER' && num(j.charge_amount) > 0 && !j.sale_id;

      // ---------------------------------------------------------- painting
      function paintKpis() {
        const waiting = s.open.filter((j) => j.status === 'WAITING');
        const inMill = s.open.filter((j) => j.status !== 'READY');
        const grainKg = inMill.reduce((t, j) => t + num(j.weight_in_kg), 0);
        const waits = waiting.map((j) => UI.minsSince(j.received_at));
        const avg = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
        const slow = waits.filter((m) => m >= BREACH_MIN).length;
        const canYield = GF.can('mill.yield');
        const ready = s.open.filter((j) => j.status === 'READY').length;

        const kpi = (icon, label, value, badge) => `
          <div class="kpi"><div class="tile mill"><i class="bi ${icon}"></i></div>
            <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${badge || ''}</div>`;

        kpisEl.innerHTML =
          kpi('bi-box-seam', 'Grain in the mill now', `${num(grainKg).toLocaleString('en-KE', { maximumFractionDigits: 0 })} <small>kg</small>`,
            `<span class="gf-badge gf-badge-amber">${inMill.length} ${inMill.length === 1 ? 'job' : 'jobs'}</span>`) +
          kpi('bi-stopwatch', 'Avg wait right now', avg === null ? '<small>No one waiting</small>' : `${Math.round(avg)}<small>min</small>`,
            avg === null ? '' : avg <= WARN_MIN ? '<span class="gf-badge gf-badge-green">On target</span>' : '<span class="gf-badge gf-badge-amber">Slow</span>') +
          kpi('bi-hourglass-split', `Waiting over ${BREACH_MIN} min`, String(slow),
            slow ? '<span class="gf-badge gf-badge-red">Breach</span>' : '<span class="gf-badge gf-badge-green">Clear</span>') +
          (canYield
            ? kpi('bi-exclamation-triangle', 'Yield alerts to review', String(s.alerts.length),
                s.alerts.length ? '<span class="gf-badge gf-badge-red">Review</span>' : '<span class="gf-badge gf-badge-green">Clear</span>')
            : kpi('bi-bag-check', 'Ready to collect', String(ready), ready ? '<span class="gf-badge gf-badge-amber">Waiting</span>' : ''));
      }

      function paintToolbar() {
        const alerts = alertByJob();
        const c = {
          slow: s.open.filter((j) => j.status === 'WAITING' && UI.minsSince(j.received_at) >= BREACH_MIN).length,
          yield: s.open.filter((j) => alerts.has(j.id)).length,
          unbilled: [...s.open, ...s.done].filter(isUnbilled).length,
          own: s.open.filter((j) => j.job_type === 'OWN').length,
        };
        const chip = (key, label, n, cls = '') =>
          `<button type="button" class="fchip ${cls} ${s.chip === key ? 'on' : ''}" data-chip="${key}">${label}${n !== undefined ? ` <span class="n">${n}</span>` : ''}</button>`;
        const all = s.open.length + s.done.length;
        const shown = s.open.filter(visible).length + s.done.filter(visible).length;

        toolbarEl.innerHTML = `
          <button type="button" class="fchip ${s.mine ? '' : 'on'}" data-mine="0">Everyone</button>
          <button type="button" class="fchip ${s.mine ? 'on' : ''}" data-mine="1">My jobs</button>
          <span class="sep"></span>
          ${chip('slow', 'Waiting too long', c.slow, 'outline')}
          ${GF.can('mill.yield') ? chip('yield', 'Yield to review', c.yield, 'outline') : ''}
          ${chip('unbilled', 'Not billed yet', c.unbilled, 'outline')}
          ${chip('own', 'Own grain', c.own, 'outline')}
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="job-search" placeholder="Find ticket or customer" value="${esc(s.search)}" aria-label="Find ticket or customer"></label>
          <button type="button" class="icon-sq" data-act="refresh" title="Refresh" aria-label="Refresh"><i class="bi bi-arrow-clockwise"></i></button>
          <span class="count-note">Showing ${shown} of ${all} jobs</span>`;
      }

      function card(j, stage) {
        const alerts = alertByJob();
        const alert = alerts.get(j.id);
        const mins = UI.minsSince(j.received_at);
        const own = j.job_type === 'OWN';
        const name = j.customer_name || (own ? 'Mill stock' : 'Walk-in');
        const timeCls = stage === 'WAITING' ? (mins >= BREACH_MIN ? 'red' : mins >= WARN_MIN ? 'amber' : '') : '';
        const avatar = own
          ? '<span class="gf-avatar own"><i class="bi bi-box-seam"></i></span>'
          : `<span class="gf-avatar" style="background:${UI.avatarColor(name)}">${esc(UI.initials(name))}</span>`;

        const weights = stage === 'READY'
          ? `<span class="pill">${fmtKg(j.weight_out_kg)} flour</span>`
          : `<span class="pill">${fmtKg(j.weight_in_kg)} in</span>`;
        const charge = !own && num(j.charge_amount) > 0 ? `<span class="pill">${UI.money(j.charge_amount)}</span>` : '';

        let note = '';
        if (alert) {
          const pct = j.yield_pct !== null && j.yield_pct !== undefined ? ` Flour came out at ${num(j.yield_pct).toFixed(1)}% of the grain.` : '';
          note = `<div class="gf-note gf-note-amber"><i class="bi bi-exclamation-circle"></i><span>Below the expected yield.${esc(pct)} ${GF.can('mill.yield') ? 'Review it on the Yield alerts screen.' : ''}</span></div>`;
        } else if (stage === 'READY' && isUnbilled(j)) {
          note = '<div class="gf-note gf-note-amber"><i class="bi bi-receipt"></i><span>Milling charge not billed yet. Bill it at the mill till.</span></div>';
        }

        const actions = [];
        if (stage === 'WAITING' && GF.can('mill.update')) actions.push(`<button class="job-btn mill" data-act="start" data-id="${j.id}"><i class="bi bi-play-fill"></i>Start milling</button>`);
        if (stage === 'MILLING' && GF.can('mill.update')) actions.push(`<button class="job-btn primary" data-act="complete" data-id="${j.id}"><i class="bi bi-speedometer2"></i>Weigh out</button>`);
        if (stage === 'READY' && GF.can('mill.collect')) actions.push(`<button class="job-btn primary" data-act="collect" data-id="${j.id}"><i class="bi bi-bag-check"></i>Hand over</button>`);
        if ((stage === 'WAITING' || stage === 'MILLING') && GF.can('mill.cancel')) {
          actions.push(`<button class="job-btn quiet" data-act="cancel" data-id="${j.id}" title="Cancel ticket" aria-label="Cancel ticket ${esc(j.ticket_no)}"><i class="bi bi-x-lg"></i></button>`);
        }

        return `<article class="job ${alert ? 'is-alert' : ''}">
          <div class="job-top" data-act="view" data-id="${j.id}" role="button" tabindex="0">
            ${avatar}<div class="job-who"><strong>${esc(name)}</strong><span>${esc(j.grain_name)}${j.miller_name ? ` · ${esc(j.miller_name)}` : ''}</span></div>
          </div>
          <div class="job-meta"><span class="tk">${esc(j.ticket_no)}</span>${weights}${charge}
            <span class="pill ${timeCls}" title="Since weigh-in at ${UI.clock(j.received_at)}"><i class="bi bi-clock"></i>${UI.dur(mins)}</span></div>
          ${note}
          ${actions.length ? `<div class="job-actions">${actions.join('')}</div>` : ''}
        </article>`;
      }

      function doneCard(j) {
        const name = j.customer_name || (j.job_type === 'OWN' ? 'Mill stock' : 'Walk-in');
        return `<article class="job done">
          <div class="job-top" data-act="view" data-id="${j.id}" role="button" tabindex="0">
            <span class="gf-avatar" style="background:${j.job_type === 'OWN' ? 'var(--dark)' : UI.avatarColor(name)}">${j.job_type === 'OWN' ? '<i class="bi bi-box-seam"></i>' : esc(UI.initials(name))}</span>
            <div class="job-who"><strong>${esc(name)}</strong><span>${esc(j.grain_name)} · ${esc(j.ticket_no)}</span></div>
          </div>
          <div class="job-meta"><span class="tk">${UI.clock(j.received_at)} in</span><span class="pill green">${fmtKg(j.weight_in_kg)}</span>
            ${isUnbilled(j) ? '<span class="pill amber">Not billed</span>' : ''}</div>
        </article>`;
      }

      function summary() {
        const total = s.done.length;
        const kg = s.done.reduce((t, j) => t + num(j.weight_in_kg), 0);
        const charges = s.done.filter((j) => j.job_type === 'CUSTOMER');
        const sum = (arr) => arr.reduce((t, j) => t + num(j.charge_amount), 0);
        const billed = sum(charges.filter((j) => j.sale_id));
        const unbilled = sum(charges.filter((j) => !j.sale_id));
        const share = billed + unbilled > 0 ? Math.round((billed / (billed + unbilled)) * 100) : 0;
        return `<div class="today"><h4>Today so far</h4>
          <div class="line"><span>Jobs collected</span><b>${total}</b></div>
          <div class="line"><span>Grain milled</span><b>${fmtKg(kg)}</b></div>
          <div class="line"><span>Billed</span><b>${UI.money(billed)}</b></div>
          <div class="line"><span>Not billed yet</span><b>${UI.money(unbilled)}</b></div>
          <div class="bar" aria-hidden="true"><i style="width:${share}%"></i></div>
          <small>${share}% of milling charges billed</small></div>`;
      }

      function column(key, title, meta, jobs, extra = '') {
        const cards = jobs.length ? jobs.map((j) => card(j, key)).join('') : `<div class="col-empty">${key === 'WAITING' ? 'No one waiting' : key === 'MILLING' ? 'Nothing on the mill' : 'Nothing to hand over'}</div>`;
        return `<section class="col" aria-label="${title}">
          <div class="col-head"><h3>${title}</h3><span class="n">${jobs.length}</span><span class="meta">${meta}</span></div>
          ${cards}${extra}</section>`;
      }

      function paintBoard() {
        if (s.loading) { boardEl.innerHTML = '<div class="col-empty">Loading jobs…</div>'; return; }
        const by = (st) => s.open.filter((j) => j.status === st && visible(j));
        const addBtn = GF.can('mill.create') ? '<button type="button" class="col-add" data-act="new">+ Add job</button>' : '';
        const done = s.done.filter(visible);
        boardEl.innerHTML = `
          ${s.failed ? `<div class="gf-note gf-note-red" style="margin-bottom:12px"><i class="bi bi-wifi-off"></i><span>${esc(s.failed)} Showing the last loaded jobs.</span></div>` : ''}
          <div class="board">
            ${column('WAITING', 'Waiting', `target ${WARN_MIN}m`, by('WAITING'), addBtn)}
            ${column('MILLING', 'Milling', 'on the machine', by('MILLING'))}
            ${column('READY', 'Ready', 'hand over', by('READY'))}
            <section class="col is-done" aria-label="Collected today">
              <div class="col-head"><h3>Collected today</h3><span class="n">${done.length}</span></div>
              ${summary()}${done.map(doneCard).join('')}
            </section>
          </div>`;
      }

      function paint() { paintKpis(); paintToolbar(); paintBoard(); }

      // ---------------------------------------------------------- events
      toolbarEl.addEventListener('click', (e) => {
        const mine = e.target.closest('[data-mine]');
        const chip = e.target.closest('[data-chip]');
        if (mine) { s.mine = mine.dataset.mine === '1'; paint(); }
        else if (chip) { s.chip = s.chip === chip.dataset.chip ? '' : chip.dataset.chip; paint(); }
        else if (e.target.closest('[data-act="refresh"]')) load();
      });
      toolbarEl.addEventListener('input', UI.debounce((e) => {
        if (e.target.id !== 'job-search') return;
        s.search = e.target.value.trim();
        const pos = e.target.selectionStart;
        paintBoard(); paintToolbar();
        const box = toolbarEl.querySelector('#job-search');
        if (box) { box.focus(); box.setSelectionRange(pos, pos); }
      }, 200));

      boardEl.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (!t) return;
        const id = Number(t.dataset.id);
        const job = [...s.open, ...s.done].find((j) => j.id === id);
        switch (t.dataset.act) {
          case 'new': openNewJob(); break;
          case 'view': openDetails(id); break;
          case 'start': startJob(t, id); break;
          case 'complete': openComplete(job); break;
          case 'collect': collectJob(t, job); break;
          case 'cancel': openCancel(job); break;
          default: break;
        }
      });
      boardEl.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.job-top')) { e.preventDefault(); openDetails(Number(e.target.dataset.id)); }
      });

      // ---------------------------------------------------------- actions
      async function startJob(btn, id) {
        btn.disabled = true;
        try {
          await Api.post(`/mill/jobs/${id}/start`, {});
          UI.toast('Milling started');
          await load(true);
        } catch (err) { UI.toast(err.message, 'error'); btn.disabled = false; }
      }

      function collectJob(btn, job) {
        const go = async (trigger, m) => {
          if (m) m.busy(trigger, true); else btn.disabled = true;
          try {
            await Api.post(`/mill/jobs/${job.id}/collect`, {});
            if (m) m.close();
            UI.toast(`${job.ticket_no} handed over`);
            await load(true);
          } catch (err) {
            if (m) { m.busy(trigger, false); m.error(err.message); } else { UI.toast(err.message, 'error'); btn.disabled = false; }
          }
        };
        if (!isUnbilled(job)) { go(btn); return; }
        const m = UI.modal({
          title: `Hand over ${job.ticket_no}?`,
          body: `<p>The milling charge of <b>${UI.money(job.charge_amount)}</b> has not been billed yet. You can still hand over the flour and bill it at the mill till afterwards.</p>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Not yet</button><button class="gf-btn gf-btn-green" data-ok type="button">Hand over</button>',
        });
        m.el.querySelector('[data-ok]').addEventListener('click', (e) => go(e.currentTarget, m));
      }

      function openCancel(job) {
        const m = UI.modal({
          title: `Cancel ${job.ticket_no}?`,
          body: `<p>${esc(job.customer_name || 'This job')}'s grain (${fmtKg(job.weight_in_kg)}) is booked back out of the customer's grain held. Tell the owner why the ticket is being cancelled.</p>
            <div class="gf-field"><label class="gf-label" for="c-reason">Reason</label>
            <textarea class="gf-input plain" id="c-reason" placeholder="e.g. Customer took the grain back"></textarea></div>`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Keep ticket</button><button class="gf-btn gf-btn-dark" data-ok type="button">Cancel ticket</button>',
        });
        m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
          const reason = m.el.querySelector('#c-reason').value.trim();
          if (!reason) { m.error('Enter a reason for cancelling.'); return; }
          m.error(''); m.busy(e.currentTarget, true);
          try {
            await Api.post(`/mill/jobs/${job.id}/cancel`, { reason });
            m.close(); UI.toast(`${job.ticket_no} cancelled`); await load(true);
          } catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      function openComplete(job) {
        const customerJob = job.job_type === 'CUSTOMER';
        const m = UI.modal({
          title: `Weigh out ${job.ticket_no}`,
          body: `<p><b>${esc(job.customer_name || 'Mill stock')}</b> · ${esc(job.grain_name)} · ${fmtKg(job.weight_in_kg)} in</p>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="w-out">Flour out (kg)</label><input class="gf-input plain" id="w-out" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0.0"></div>
              <div class="gf-field"><label class="gf-label" for="w-bran">Bran (kg)</label><input class="gf-input plain" id="w-bran" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0.0"></div>
            </div>
            <div class="gf-hint" id="w-hint">Type the flour weight to see the yield.</div>
            ${customerJob ? '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="w-takebran"> The customer takes the bran home</label>' : ''}`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">Mark ready</button>',
        });
        const out = m.el.querySelector('#w-out'), bran = m.el.querySelector('#w-bran'), hint = m.el.querySelector('#w-hint');
        const upd = () => {
          const o = parseFloat(out.value), b = parseFloat(bran.value) || 0;
          if (!(o >= 0)) { hint.textContent = 'Type the flour weight to see the yield.'; return; }
          const inKg = num(job.weight_in_kg);
          const lossKg = inKg - o - b;
          hint.innerHTML = `Flour is <b>${((o / inKg) * 100).toFixed(1)}%</b> of the grain in. Unaccounted: <b>${lossKg.toFixed(1)} kg</b>.`;
        };
        out.addEventListener('input', upd); bran.addEventListener('input', upd);
        m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
          if (out.value === '') { m.error('Enter the flour weight.'); return; }
          const body = { weight_out_kg: parseFloat(out.value) };
          if (bran.value !== '') body.bran_kg = parseFloat(bran.value);
          if (customerJob && m.el.querySelector('#w-takebran').checked) body.bran_destination = 'RETURNED_TO_CUSTOMER';
          m.error(''); m.busy(e.currentTarget, true);
          try {
            await Api.post(`/mill/jobs/${job.id}/complete`, body);
            m.close(); UI.toast(`${job.ticket_no} is ready`); await load(true);
          } catch (err) { m.busy(e.currentTarget, false); m.error(err.message); }
        });
      }

      async function openDetails(id) {
        const m = UI.modal({ title: 'Job details', wide: true, body: '<div class="gf-hint">Loading…</div>' });
        try {
          const j = await Api.get(`/mill/jobs/${id}`);
          const row = (label, v) => `<div class="fact"><span>${label}</span><b>${v === null || v === undefined || v === '' ? '–' : v}</b></div>`;
          const history = (j.history || []).map((h) =>
            `<li><span class="dot"></span><span>${esc(String(h.new_status || h.status || '').toLowerCase()) || 'updated'}${h.changed_by_name ? ` by ${esc(h.changed_by_name)}` : ''}</span><span class="when">${esc(new Date(h.changed_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }))}</span></li>`).join('');
          const outputs = (j.outputs || []).map((o) => `<li><span class="dot"></span><span>${esc(o.item_name)} · ${fmtKg(o.quantity_kg)}</span><span class="when">${esc(String(o.destination || '').replace(/_/g, ' ').toLowerCase())}</span></li>`).join('');
          m.el.querySelector('.gf-modal-body').insertAdjacentHTML('beforeend', `
            <div><div style="font-size:18px;font-weight:600">${esc(j.customer_name || 'Mill stock')}</div>
              <div class="gf-hint">${esc(j.ticket_no)} · ${esc(j.grain_name)} · <span class="pill">${esc(String(j.status).toLowerCase())}</span></div></div>
            <div class="fact-grid">
              ${row('Grain in', fmtKg(j.weight_in_kg))}${row('Flour out', j.weight_out_kg === null ? null : fmtKg(j.weight_out_kg))}
              ${row('Bran', j.bran_kg === null ? null : fmtKg(j.bran_kg))}${row('Yield', j.yield_pct === null || j.yield_pct === undefined ? null : `${num(j.yield_pct).toFixed(1)}%`)}
              ${row('Milling charge', j.job_type === 'OWN' ? 'None (own grain)' : UI.money(j.charge_amount))}${row('Billed on sale', j.sale_no)}
              ${row('Miller', esc(j.miller_name))}${row('Machine', esc(j.machine_name))}
              ${row('Phone', esc(j.customer_phone || j.walkin_phone))}${row('Special request', esc(j.special_request || j.blend_description))}
            </div>
            ${outputs ? `<div><div class="gf-label" style="margin-bottom:6px">Where the output went</div><ul class="timeline">${outputs}</ul></div>` : ''}
            ${history ? `<div><div class="gf-label" style="margin-bottom:6px">History</div><ul class="timeline">${history}</ul></div>` : ''}`);
          m.el.querySelector('.gf-modal-body > .gf-hint').remove();
        } catch (err) { m.error(err.message); }
      }

      // ---------------------------------------------------------- new job ticket
      async function openNewJob() {
        const m = UI.modal({
          title: 'New job ticket', wide: true,
          body: '<div class="gf-hint" data-loading>Loading grains and rates…</div>',
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button" disabled>Create ticket</button>',
        });
        let grains = [], machines = [];
        try {
          [grains, machines] = await Promise.all([
            Api.get('/items?millable=true&active=true&limit=200'),
            Api.get('/mill/machines?active=true').catch(() => []),
          ]);
        } catch (err) { m.error(err.message); return; }
        if (!grains.length) { m.error('No millable grains are set up yet. Add one under Products in the menu first (tick “Can be milled”).'); return; }

        const f = { type: 'CUSTOMER', who: 'registered', customer: null, rate: null };
        const body = m.el.querySelector('.gf-modal-body');
        body.querySelector('[data-loading]').remove();
        body.insertAdjacentHTML('beforeend', `
          <div class="gf-seg" id="nj-type" role="tablist">
            <button type="button" class="on" data-type="CUSTOMER">Customer grain</button>
            <button type="button" data-type="OWN">Our own grain</button>
          </div>
          <div id="nj-who" class="gf-stack">
            <div class="gf-seg" id="nj-whoseg">
              <button type="button" class="on" data-who="registered">Registered customer</button>
              <button type="button" data-who="walkin">Walk-in</button>
            </div>
            <div id="nj-registered" class="pick">
              <label class="gf-label" for="nj-q">Customer</label>
              <input class="gf-input plain" id="nj-q" type="search" placeholder="Name, code or phone" autocomplete="off">
              <div class="pick-list gf-hidden" id="nj-list"></div>
              <div class="picked gf-hidden" id="nj-picked"></div>
            </div>
            <div id="nj-walkin" class="gf-row2 gf-hidden">
              <div class="gf-field"><label class="gf-label" for="nj-wname">Name</label><input class="gf-input plain" id="nj-wname" placeholder="Walk-in customer"></div>
              <div class="gf-field"><label class="gf-label" for="nj-wphone">Phone (optional)</label><input class="gf-input plain" id="nj-wphone" inputmode="tel" placeholder="0712345678"></div>
            </div>
          </div>
          <div class="gf-row2">
            <div class="gf-field"><label class="gf-label" for="nj-grain">Grain</label>
              <select class="gf-input plain" id="nj-grain">${grains.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>
            <div class="gf-field"><label class="gf-label" for="nj-kg">Weight in (kg)</label>
              <input class="gf-input plain" id="nj-kg" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0.0"></div>
          </div>
          <div class="gf-row2 gf-hidden" id="nj-tinsrow">
            <div class="gf-field"><label class="gf-label" for="nj-tins">Number of tins</label><input class="gf-input plain" id="nj-tins" type="number" inputmode="numeric" min="1" step="1"></div>
          </div>
          <div class="gf-row2" id="nj-charge-row">
            <div class="gf-field"><label class="gf-label" for="nj-extra">Extra charge (optional)</label><input class="gf-input plain" id="nj-extra" type="number" inputmode="decimal" min="0" step="1" placeholder="0"></div>
            <div class="gf-field"><label class="gf-label">Milling charge</label><div class="gf-hint" id="nj-rate" style="padding-top:12px">Pick a grain to see the rate.</div></div>
          </div>
          ${machines.length ? `<div class="gf-field"><label class="gf-label" for="nj-machine">Machine (optional)</label>
            <select class="gf-input plain" id="nj-machine"><option value="">Any machine</option>${machines.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>` : ''}
          <div class="gf-field"><label class="gf-label" for="nj-note">Special request (optional)</label>
            <textarea class="gf-input plain" id="nj-note" placeholder="e.g. Fine flour, mix with 10 kg millet"></textarea></div>`);

        const $ = (sel) => body.querySelector(sel);
        const submit = m.el.querySelector('[data-ok]');
        submit.disabled = false;

        // --- type and who
        $('#nj-type').addEventListener('click', (e) => {
          const b = e.target.closest('[data-type]'); if (!b) return;
          f.type = b.dataset.type;
          $('#nj-type').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          $('#nj-who').classList.toggle('gf-hidden', f.type === 'OWN');
          $('#nj-charge-row').classList.toggle('gf-hidden', f.type === 'OWN');
          refreshRate();
        });
        $('#nj-whoseg').addEventListener('click', (e) => {
          const b = e.target.closest('[data-who]'); if (!b) return;
          f.who = b.dataset.who;
          $('#nj-whoseg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          $('#nj-registered').classList.toggle('gf-hidden', f.who !== 'registered');
          $('#nj-walkin').classList.toggle('gf-hidden', f.who !== 'walkin');
        });

        // --- customer lookup
        const list = $('#nj-list'), picked = $('#nj-picked'), q = $('#nj-q');
        const choose = (c) => {
          f.customer = c;
          list.classList.add('gf-hidden'); q.classList.add('gf-hidden');
          const nm = c.full_name || c.name || c.business_name || 'Customer';
          picked.classList.remove('gf-hidden');
          picked.innerHTML = `<span class="gf-avatar" style="background:${UI.avatarColor(nm)}">${esc(UI.initials(nm))}</span>
            <div class="who"><strong>${esc(nm)}</strong><span>${esc(c.phone || c.customer_code || '')}</span></div>
            <button type="button" class="icon-sq" data-clear aria-label="Choose a different customer"><i class="bi bi-x-lg"></i></button>`;
        };
        picked.addEventListener('click', (e) => {
          if (!e.target.closest('[data-clear]')) return;
          f.customer = null; picked.classList.add('gf-hidden'); q.classList.remove('gf-hidden'); q.value = ''; q.focus();
        });
        q.addEventListener('input', UI.debounce(async () => {
          const term = q.value.trim();
          if (term.length < 2) { list.classList.add('gf-hidden'); return; }
          try {
            const rows = await Api.get(`/customers/lookup?q=${encodeURIComponent(term)}`);
            list.classList.remove('gf-hidden');
            list.innerHTML = rows.length
              ? rows.map((c, i) => `<button type="button" data-i="${i}"><span>${esc(c.full_name || c.name || c.business_name)}</span><small>${esc(c.phone || c.customer_code || '')}</small></button>`).join('')
              : '<div class="pick-empty">No customer found. Use Walk-in, or add the customer first.</div>';
            list.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) choose(rows[Number(b.dataset.i)]); };
          } catch (err) { m.error(err.message); }
        }, 250));

        // --- rate preview
        const kg = $('#nj-kg'), tins = $('#nj-tins'), extra = $('#nj-extra'), rateEl = $('#nj-rate'), grainSel = $('#nj-grain');
        function showCharge() {
          if (f.type === 'OWN') return;
          if (!f.rate) { rateEl.textContent = 'No milling rate is set for this grain. Ask the owner to add one.'; return; }
          const perTin = f.rate.rate_basis === 'PER_TIN';
          $('#nj-tinsrow').classList.toggle('gf-hidden', !perTin);
          const base = perTin ? num(tins.value) : num(kg.value);
          const total = base * num(f.rate.rate) + num(extra.value);
          rateEl.innerHTML = `${UI.money(f.rate.rate)} ${perTin ? 'per tin' : 'per kg'} → <b>${UI.money(total)}</b>`;
        }
        async function refreshRate() {
          f.rate = null;
          try { f.rate = await Api.get(`/milling-rates/current/${grainSel.value}`); } catch (_) { /* shown as missing below */ }
          showCharge();
        }
        grainSel.addEventListener('change', refreshRate);
        [kg, tins, extra].forEach((x) => x.addEventListener('input', showCharge));
        refreshRate();

        // --- submit
        submit.addEventListener('click', async () => {
          const weight = parseFloat(kg.value);
          if (!(weight > 0)) { m.error('Enter the weight of the grain in kg.'); return; }
          const payload = { job_type: f.type, grain_item_id: Number(grainSel.value), weight_in_kg: weight };
          if (f.type === 'CUSTOMER') {
            if (f.who === 'registered') {
              if (!f.customer) { m.error('Pick a customer, or switch to Walk-in.'); return; }
              payload.customer_id = f.customer.id;
            } else {
              const nm = $('#nj-wname').value.trim();
              if (!nm) { m.error('Enter the walk-in customer’s name.'); return; }
              payload.walkin_name = nm;
              if ($('#nj-wphone').value.trim()) payload.walkin_phone = $('#nj-wphone').value.trim();
            }
            if (f.rate && f.rate.rate_basis === 'PER_TIN') {
              if (!(num(tins.value) > 0)) { m.error('This grain is charged per tin. Enter the number of tins.'); return; }
              payload.tins_in = Number(tins.value);
            }
            if (extra.value !== '') payload.extra_charge = Number(extra.value);
          }
          const machine = $('#nj-machine'); if (machine && machine.value) payload.machine_id = Number(machine.value);
          const note = $('#nj-note').value.trim(); if (note) payload.special_request = note;

          m.error(''); m.busy(submit, true);
          try {
            const job = await Api.post('/mill/jobs', payload);
            m.close(); UI.toast(`Ticket ${job.ticket_no} created`); await load(true);
          } catch (err) { m.busy(submit, false); m.error(err.message); }
        });
      }

      // ---------------------------------------------------------- go
      paint();
      load();
      startTimer();
    },
  });
})();