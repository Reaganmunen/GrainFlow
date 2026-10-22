/**
 * Admin > Activity log  (#/shared/activity)   owner only
 * Read-only trail of who changed what. Filter by period, category and person, search the notes,
 * open any line to see the before and after values, export what is on screen to CSV.
 * Uses GET /api/activity-log (paged: page, limit, from, to, category, user_id, search),
 * GET /api/activity-log/categories and GET /api/users (for the person filter).
 */
(function () {
  const { esc } = UI;
  const LIMIT = 50;

  const when = (v) => (v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
  const whenFull = (v) => (v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'medium' }) : '–');
  const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

  // colour of the action pill
  const actionTone = (a) => {
    const x = String(a || '').toUpperCase();
    if (/DELETE|VOID|REVERSE|CANCEL|REMOVE|FAIL|LOCK/.test(x)) return 'red';
    if (/INSERT|CREATE|ADD|POST|LOGIN|OPEN/.test(x)) return 'green';
    if (/UPDATE|EDIT|CHANGE|ADJUST|RESET|CLOSE/.test(x)) return 'amber';
    return '';
  };

  const personName = (r) => r.user_name || r.username || (r.user_id ? `User #${r.user_id}` : 'System');
  const entityText = (r) => (r.entity_table ? `${pretty(r.entity_table)}${r.entity_id ? ' #' + r.entity_id : ''}` : '–');

  /** old_data / new_data may arrive as an object or as a JSON string */
  const asObject = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return { value: String(v) }; }
  };
  const show = (v) => {
    if (v === null || v === undefined || v === '') return '–';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  /** Table of the fields that changed (or all fields when there is only one side) */
  function diffTable(oldD, newD) {
    const o = asObject(oldD), n = asObject(newD);
    if (!o && !n) return '<div class="gf-hint">No before and after values were saved for this line.</div>';
    const keys = [...new Set([...Object.keys(o || {}), ...Object.keys(n || {})])];
    const changed = o && n ? keys.filter((k) => show(o[k]) !== show(n[k])) : keys;
    if (!changed.length) return '<div class="gf-hint">Nothing in the saved values actually changed.</div>';
    const body = changed.map((k) => `<tr>
      <td><strong>${esc(pretty(k))}</strong></td>
      <td class="muted" style="word-break:break-word">${o ? esc(show(o[k])) : '–'}</td>
      <td style="word-break:break-word">${n ? esc(show(n[k])) : '–'}</td></tr>`).join('');
    return Kit.table([['Field'], ['Before'], ['After']], body);
  }

  GF.page('shared/activity', {
    title: 'Activity log',
    render(el) {
      const r0 = Kit.range('week');
      const s = {
        rows: [], total: 0, page: 1, pages: 1,
        rng: 'week', from: r0.from, to: r0.to,
        category: '', user: '', search: '',
        categories: [], users: [],
        loading: true, failed: '',
      };

      el.innerHTML = `<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>`;
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

      // ------------------------------------------------------------ data
      let seq = 0; // ignore answers that arrive after a newer request
      async function load(quiet) {
        const mine = ++seq;
        s.loading = true; if (!quiet) paintTable();
        const q = new URLSearchParams({ limit: LIMIT, page: s.page });
        if (s.from) q.set('from', s.from);
        if (s.to) q.set('to', s.to);
        if (s.category) q.set('category', s.category);
        if (s.user) q.set('user_id', s.user);
        if (s.search) q.set('search', s.search);
        try {
          const rows = await Api.get(`/activity-log?${q}`);
          if (mine !== seq) return;
          const pg = (rows && rows.pagination) || {};
          s.rows = rows || []; s.total = Number(pg.total || s.rows.length); s.pages = Number(pg.pages || 1); s.failed = '';
          if (s.page > s.pages) { s.page = s.pages; return load(quiet); }
        } catch (err) {
          if (mine !== seq) return;
          s.failed = err.message; s.rows = [];
          if (!quiet) UI.toast(err.message, 'error');
        }
        s.loading = false;
        paintKpis(); paintTable();
      }

      async function loadFilters() {
        const [cats, users] = await Promise.all([
          Api.get('/activity-log/categories').catch(() => []),
          Api.get('/users').catch(() => []),
        ]);
        s.categories = cats || []; s.users = users || [];
        paintToolbar();
      }

      // ------------------------------------------------------------ painting
      function paintKpis() {
        const people = new Set(s.rows.map((r) => r.user_id).filter(Boolean)).size;
        const risky = s.rows.filter((r) => actionTone(r.action) === 'red').length;
        kpisEl.innerHTML =
          Kit.kpi('bi-clock-history', 'Entries in this view', Kit.fmt(s.total, 0)) +
          Kit.kpi('bi-people', 'People on this page', String(people)) +
          Kit.kpi('bi-exclamation-triangle', 'Voids and removals on this page', String(risky), '', risky ? 'mill' : '');
      }

      function paintToolbar() {
        const catOpts = `<option value="">All categories</option>${Kit.opts(s.categories, s.category, (c) => pretty(c), (c) => c)}`;
        const userOpts = `<option value="">Everyone</option>${Kit.opts(s.users, s.user, (u) => u.full_name || u.username, (u) => u.id)}`;
        toolbarEl.innerHTML = `
          ${Kit.chips('rng', s.rng, [['today', 'Today'], ['week', 'Last 7 days'], ['month', 'This month'], ['all', 'All time']])}
          <span class="field-inline"><input class="gf-input plain" id="a-from" type="date" value="${esc(s.from)}" aria-label="From date"><span class="muted">to</span><input class="gf-input plain" id="a-to" type="date" value="${esc(s.to)}" aria-label="To date"></span>
          <select class="gf-input plain" id="a-cat" style="width:auto;height:32px;font-size:13px" aria-label="Category">${catOpts}</select>
          <select class="gf-input plain" id="a-user" style="width:auto;height:32px;font-size:13px" aria-label="Person">${userOpts}</select>
          <span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="a-search" placeholder="Search notes and actions" value="${esc(s.search)}" aria-label="Search the log"></label>`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = Kit.loading('activity'); return; }
        const err = s.failed ? Kit.error(s.failed) : '';
        if (!s.rows.length) {
          const filtered = s.search || s.category || s.user || s.rng !== 'all';
          hostEl.innerHTML = err + Kit.empty('bi-clock-history', 'No activity found',
            filtered ? 'Nothing was recorded for these filters. Try a longer period or clear the filters.' : 'Changes made in the system will show up here.');
          GF.setActions('');
          return;
        }
        GF.setActions('<button class="gf-btn gf-btn-ghost gf-btn-sm" id="a-csv" type="button"><i class="bi bi-download"></i>Export page</button>');
        const csvBtn = document.getElementById('a-csv');
        if (csvBtn) csvBtn.addEventListener('click', exportCsv);

        const body = s.rows.map((r, i) => `<tr class="click" data-i="${i}">
          <td class="nowrap muted">${esc(when(r.occurred_at))}</td>
          <td><div class="cell-who"><span class="gf-avatar" style="background:${UI.avatarColor(personName(r))}">${esc(UI.initials(personName(r)))}</span>
            <div><strong>${esc(personName(r))}</strong><span>${esc(pretty(r.category))}</span></div></div></td>
          <td>${Kit.pill(actionTone(r.action), pretty(r.action))}</td>
          <td class="nowrap">${esc(entityText(r))}</td>
          <td class="muted">${esc(r.note || '')}</td>
          <td class="r muted"><i class="bi bi-chevron-right"></i></td></tr>`).join('');

        hostEl.innerHTML = err + Kit.table([['When'], ['Who'], ['What'], ['Record'], ['Note'], ['']], body) +
          `<div class="pager"><span>Page ${s.page} of ${s.pages} · ${Kit.fmt(s.total, 0)} entries</span>
            <button type="button" data-pg="-1" ${s.page <= 1 ? 'disabled' : ''}>Previous</button>
            <button type="button" data-pg="1" ${s.page >= s.pages ? 'disabled' : ''}>Next</button></div>`;
      }

      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      // ------------------------------------------------------------ one entry
      function openEntry(r) {
        const m = UI.modal({
          title: 'Activity entry',
          wide: true,
          body: `
            <div class="who-head"><span class="gf-avatar" style="background:${UI.avatarColor(personName(r))}">${esc(UI.initials(personName(r)))}</span>
              <div class="grow"><h3>${esc(personName(r))}</h3><div class="sub">${esc(whenFull(r.occurred_at))}</div></div>
              ${Kit.pill(actionTone(r.action), pretty(r.action))}</div>
            <div class="fact-grid" style="grid-template-columns:repeat(2,1fr)">
              ${Kit.fact('Category', esc(pretty(r.category)))}
              ${Kit.fact('Record', esc(entityText(r)))}
              ${Kit.fact('Device address', esc(r.ip_address || '–'))}
              ${Kit.fact('Username', esc(r.username || '–'))}
            </div>
            ${r.note ? `<div class="gf-hint">${esc(r.note)}</div>` : ''}
            <h3 style="font-size:14px;margin:6px 0 0">What changed</h3>
            ${diffTable(r.old_data, r.new_data)}`,
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Close</button>',
        });
        return m;
      }

      function exportCsv() {
        Kit.csv(
          s.rows.map((r) => [when(r.occurred_at), personName(r), pretty(r.category), pretty(r.action), entityText(r), r.note || '', r.ip_address || '']),
          ['When', 'Who', 'Category', 'Action', 'Record', 'Note', 'Device address'],
          'activity-log'
        );
      }

      // ------------------------------------------------------------ events
      const setRange = (key) => {
        s.rng = key;
        const r = Kit.range(key);
        s.from = r.from || ''; s.to = r.to || '';
      };

      toolbarEl.addEventListener('click', (e) => {
        const c = e.target.closest('[data-rng]');
        if (!c) return;
        setRange(c.dataset.rng); s.page = 1; paintToolbar(); load();
      });
      toolbarEl.addEventListener('change', (e) => {
        const id = e.target.id;
        if (id === 'a-from' || id === 'a-to') {
          s[id === 'a-from' ? 'from' : 'to'] = e.target.value; s.rng = ''; s.page = 1; paintToolbar(); load();
        } else if (id === 'a-cat') { s.category = e.target.value; s.page = 1; load(); }
        else if (id === 'a-user') { s.user = e.target.value; s.page = 1; load(); }
      });
      toolbarEl.addEventListener('input', UI.debounce((e) => {
        if (e.target.id !== 'a-search') return;
        s.search = e.target.value.trim(); s.page = 1; load();
      }, 350));

      hostEl.addEventListener('click', (e) => {
        const pg = e.target.closest('[data-pg]');
        if (pg) { s.page = Math.min(Math.max(1, s.page + Number(pg.dataset.pg)), s.pages); load(); view_top(); return; }
        const tr = e.target.closest('tr[data-i]');
        if (tr && s.rows[Number(tr.dataset.i)]) openEntry(s.rows[Number(tr.dataset.i)]);
      });
      const view_top = () => { const v = document.getElementById('view'); if (v) v.scrollTop = 0; };

      paint();
      load();
      loadFilters();
    },
  });
})();