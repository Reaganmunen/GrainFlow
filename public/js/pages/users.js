/**
 * Admin > Users and roles  (#/shared/users)   owner only
 * Staff list with search and role filter, add / edit, reset password, unlock, switch off.
 * Each role has fixed modules (a cereal cashier can never be put in the posho mill), so the form shows them instead of asking.
 * Uses GET/POST /api/users, PUT /users/:id, PUT /users/:id/password, POST /users/:id/unlock and GET /roles.
 */
(function () {
  const { esc } = UI;
  const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

  // what each role is for, and the modules it is fixed to (the server enforces the same rules)
  const ROLE_INFO = {
    OWNER:          { modules: ['MILL', 'CEREAL'], text: 'Sees and runs both businesses, the owner dashboard and all admin.', tone: 'dark' },
    MILL_MANAGER:   { modules: ['MILL'],   text: 'Posho mill only. Tickets, charging, rates, machines, yield, stock, expenses and closing the mill day.', tone: 'amber' },
    MILLER:         { modules: ['MILL'],   text: 'Posho mill only. Adds tickets, runs jobs and charges on the mill till.', tone: 'amber' },
    CEREAL_MANAGER: { modules: ['CEREAL'], text: 'Cereals only. Selling, buying, prices, stock, expenses and closing the cereal day.', tone: 'green' },
    CEREAL_CASHIER: { modules: ['CEREAL'], text: 'Cereals only. Selling and taking payment. Never on the posho mill side.', tone: 'green' },
    CASHIER:        { modules: ['CEREAL'], text: 'Old role: works like a cereal cashier.', tone: 'green' },
  };
  const MODULE_NAME = { MILL: 'Posho mill', CEREAL: 'Cereals' };
  const modText = (list) => (list || []).map((m) => MODULE_NAME[m] || m).join(' and ') || 'None';
  const fixedModules = (code) => (ROLE_INFO[String(code || '').toUpperCase()] || {}).modules || null;
  const when = (v) => (v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');
  const locked = (u) => !!u.locked_until && new Date(u.locked_until) > new Date();

  GF.page('shared/users', {
    title: 'Users and roles',
    render(el) {
      const s = { rows: [], roles: [], search: '', role: '', loading: true, failed: '' };
      const canCreate = GF.can('users.create'), canUpdate = GF.can('users.update');

      el.innerHTML = `<div class="kpis" id="kpis"></div><div class="toolbar" id="toolbar"></div><div id="table-host"></div>`;
      const kpisEl = el.querySelector('#kpis'), toolbarEl = el.querySelector('#toolbar'), hostEl = el.querySelector('#table-host');

      GF.setActions(canCreate ? '<button class="gf-btn gf-btn-dark gf-btn-sm" id="add-user" type="button"><i class="bi bi-plus-lg"></i>Add user</button>' : '');
      const addBtn = document.getElementById('add-user');
      if (addBtn) addBtn.addEventListener('click', () => openForm());

      // ------------------------------------------------------------ data
      async function load(quiet) {
        try {
          const [users, roles] = await Promise.all([Api.get('/users'), s.roles.length ? s.roles : Api.get('/roles')]);
          s.rows = users || []; s.roles = roles || []; s.failed = '';
        } catch (err) { s.failed = err.message; if (!quiet) UI.toast(err.message, 'error'); }
        s.loading = false;
        paint();
      }

      const visible = (u) => {
        if (s.role && String(u.role_id) !== String(s.role)) return false;
        const q = s.search.toLowerCase();
        return !q || [u.full_name, u.username, u.email, u.phone].some((x) => String(x || '').toLowerCase().includes(q));
      };

      // ------------------------------------------------------------ painting
      function paintKpis() {
        const active = s.rows.filter((u) => u.is_active);
        const count = (m) => active.filter((u) => (u.allowed_modules || []).includes(m)).length;
        kpisEl.innerHTML =
          Kit.kpi('bi-people', 'Active users', String(active.length)) +
          Kit.kpi('bi-gear-wide-connected', 'Posho mill staff', String(count('MILL')), '', 'mill') +
          Kit.kpi('bi-basket', 'Cereal staff', String(count('CEREAL')), '', 'cereal') +
          Kit.kpi('bi-lock', 'Locked or switched off', String(s.rows.filter((u) => !u.is_active || locked(u)).length));
      }

      function paintToolbar() {
        const roleChips = [['', 'All roles'], ...s.roles.map((r) => [r.id, r.name])];
        toolbarEl.innerHTML = `${Kit.chips('role', s.role, roleChips)}<span class="grow"></span>
          <label class="search"><i class="bi bi-search"></i><input type="search" id="u-search" placeholder="Name, username or phone" value="${esc(s.search)}" aria-label="Search users"></label>`;
      }

      function paintTable() {
        if (s.loading) { hostEl.innerHTML = Kit.loading('users'); return; }
        const err = s.failed ? Kit.error(s.failed) : '';
        const rows = s.rows.filter(visible);
        if (!rows.length) {
          hostEl.innerHTML = err + Kit.empty('bi-people', s.search || s.role ? 'No users match' : 'No users yet',
            s.search || s.role ? 'Try a different name or clear the role filter.' : 'Add your staff so each person signs in with their own account.');
          return;
        }
        const body = rows.map((u) => {
          const info = ROLE_INFO[String(u.role_code).toUpperCase()] || {};
          const state = !u.is_active ? Kit.pill('', 'Switched off') : locked(u) ? Kit.pill('amber', 'Locked') : Kit.pill('green', 'Active');
          return `<tr class="click" data-id="${u.id}">
            <td><div class="cell-who"><span class="gf-avatar" style="background:${UI.avatarColor(u.full_name)}">${esc(UI.initials(u.full_name))}</span>
              <div><strong>${esc(u.full_name)}</strong><span>${esc(u.username)}${u.phone ? ' · ' + esc(u.phone) : ''}</span></div></div></td>
            <td>${Kit.pill(info.tone || '', u.role_name || pretty(u.role_code))}</td>
            <td>${esc(modText(u.allowed_modules))}</td>
            <td class="nowrap muted">${esc(when(u.last_login_at))}</td>
            <td>${state}</td>
            <td class="r muted"><i class="bi bi-chevron-right"></i></td></tr>`;
        }).join('');
        hostEl.innerHTML = err + Kit.table([['Person'], ['Role'], ['Works in'], ['Last sign-in'], ['Status'], ['']], body);
      }

      function paint() { paintKpis(); paintToolbar(); paintTable(); }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const c = e.target.closest('[data-role]');
        if (c) { s.role = c.dataset.role; paint(); }
      });
      toolbarEl.addEventListener('input', UI.debounce((e) => {
        if (e.target.id !== 'u-search') return;
        s.search = e.target.value.trim(); paintTable();
      }, 200));
      hostEl.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (tr) openUser(Number(tr.dataset.id));
      });

      // ------------------------------------------------------------ one user
      function openUser(id) {
        const u = s.rows.find((x) => x.id === id); if (!u) return;
        const info = ROLE_INFO[String(u.role_code).toUpperCase()] || {};
        const fact = (label, v) => Kit.fact(label, v);
        const m = UI.modal({
          title: 'User',
          body: `
            <div class="who-head"><span class="gf-avatar" style="background:${UI.avatarColor(u.full_name)}">${esc(UI.initials(u.full_name))}</span>
              <div class="grow"><h3>${esc(u.full_name)}</h3><div class="sub">${esc(u.username)}</div></div>
              ${canUpdate ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" data-edit type="button"><i class="bi bi-pencil"></i>Edit</button>' : ''}</div>
            <div class="fact-grid" style="grid-template-columns:repeat(2,1fr)">
              ${fact('Role', esc(u.role_name || pretty(u.role_code)))}${fact('Works in', esc(modText(u.allowed_modules)))}
              ${fact('Phone', esc(u.phone || '–'))}${fact('Email', esc(u.email || '–'))}
              ${fact('Last sign-in', esc(when(u.last_login_at)))}${fact('Status', !u.is_active ? 'Switched off' : locked(u) ? 'Locked after failed sign-ins' : 'Active')}
            </div>
            ${info.text ? `<div class="gf-hint">${esc(info.text)}</div>` : ''}
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${GF.can('users.reset_password') ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" data-reset type="button"><i class="bi bi-key"></i>Reset password</button>' : ''}
              ${GF.can('users.unlock') && locked(u) ? '<button class="gf-btn gf-btn-ghost gf-btn-sm" data-unlock type="button"><i class="bi bi-unlock"></i>Unlock</button>' : ''}
            </div>`,
        });
        const on = (sel, fn) => { const b = m.el.querySelector(sel); if (b) b.addEventListener('click', () => fn(b)); };
        on('[data-edit]', () => { m.close(); openForm(id); });
        on('[data-reset]', () => { m.close(); openReset(u); });
        on('[data-unlock]', async (b) => {
          m.busy(b, true);
          try { await Api.post(`/users/${id}/unlock`); m.close(); UI.toast('Account unlocked'); await load(true); }
          catch (err) { m.busy(b, false); m.error(err.message); }
        });
      }

      // ------------------------------------------------------------ add / edit
      function openForm(id) {
        const editing = !!id;
        const u = editing ? s.rows.find((x) => x.id === id) : {};
        if (editing && !u) return;
        const roleOf = (rid) => s.roles.find((r) => String(r.id) === String(rid));
        const firstRole = (roleOf(u.role_id) || s.roles.find((r) => r.code !== 'OWNER') || s.roles[0] || {});
        const m = UI.modal({
          title: editing ? 'Edit user' : 'Add user', wide: true,
          foot: `<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">${editing ? 'Save changes' : 'Add user'}</button>`,
          body: `
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="uf-name">Full name</label><input class="gf-input plain" id="uf-name" value="${esc(u.full_name || '')}" autocomplete="off"></div>
              <div class="gf-field"><label class="gf-label" for="uf-user">Username (used to sign in)</label><input class="gf-input plain" id="uf-user" value="${esc(u.username || '')}" ${editing ? 'disabled' : ''} autocomplete="off" autocapitalize="off"></div>
            </div>
            <div class="gf-row2">
              <div class="gf-field"><label class="gf-label" for="uf-phone">Phone (optional)</label><input class="gf-input plain" id="uf-phone" inputmode="tel" value="${esc(u.phone || '')}"></div>
              <div class="gf-field"><label class="gf-label" for="uf-email">Email (optional)</label><input class="gf-input plain" id="uf-email" type="email" value="${esc(u.email || '')}"></div>
            </div>
            <div class="gf-field"><label class="gf-label" for="uf-role">Role</label>
              <select class="gf-input plain" id="uf-role">${Kit.opts(s.roles, firstRole.id, (r) => r.name, (r) => r.id)}</select></div>
            <div id="uf-mods"></div>
            ${editing ? '' : `<div class="gf-field"><label class="gf-label" for="uf-pw">First password (at least 8 characters)</label><input class="gf-input plain" id="uf-pw" type="text" autocomplete="off">
              <div class="gf-hint">They will be asked to choose their own password the first time they sign in.</div></div>`}
            ${editing ? `<label class="gf-check"><input type="checkbox" id="uf-active" ${u.is_active === false ? '' : 'checked'} ${u.id === (GF.user || {}).id ? 'disabled' : ''}> Active (untick to stop this person signing in)</label>` : ''}`,
        });
        const $ = (q) => m.el.querySelector(q);

        // modules: fixed by the role, or ticked for roles the system does not know
        const paintMods = () => {
          const role = roleOf($('#uf-role').value) || {};
          const fixed = fixedModules(role.code);
          const info = ROLE_INFO[String(role.code).toUpperCase()] || {};
          $('#uf-mods').innerHTML = fixed
            ? `<div class="gf-note gf-note-amber" style="margin-bottom:12px"><i class="bi bi-shield-lock"></i><span><b>${esc(modText(fixed))} only.</b> ${esc(info.text || '')}</span></div>`
            : `<div class="gf-field"><span class="gf-label">Works in</span>${['MILL', 'CEREAL'].map((k) =>
                `<label class="gf-check"><input type="checkbox" data-mod="${k}" ${(u.allowed_modules || ['MILL', 'CEREAL']).includes(k) ? 'checked' : ''}> ${MODULE_NAME[k]}</label>`).join('')}</div>`;
        };
        $('#uf-role').addEventListener('change', paintMods);
        paintMods();

        $('[data-ok]').addEventListener('click', async () => {
          const full_name = $('#uf-name').value.trim();
          const username = $('#uf-user').value.trim();
          const role = roleOf($('#uf-role').value);
          if (!full_name) { m.error('Enter the person’s name.'); return; }
          if (!editing && !username) { m.error('Enter a username.'); return; }
          if (!role) { m.error('Pick a role.'); return; }
          const body = { full_name, phone: $('#uf-phone').value.trim(), email: $('#uf-email').value.trim(), role_id: Number(role.id) };
          if (!fixedModules(role.code)) {
            body.allowed_modules = [...m.el.querySelectorAll('[data-mod]:checked')].map((x) => x.dataset.mod);
            if (!body.allowed_modules.length) { m.error('Tick at least one place they work in.'); return; }
          }
          if (editing) { const a = $('#uf-active'); if (a && !a.disabled) body.is_active = a.checked; }
          else {
            body.username = username; body.password = $('#uf-pw').value;
            if (body.password.length < 8) { m.error('The password must be at least 8 characters.'); return; }
          }
          const btn = $('[data-ok]');
          m.error(''); m.busy(btn, true);
          try {
            if (editing) await Api.put(`/users/${id}`, body); else await Api.post('/users', body);
            m.close(); UI.toast(editing ? 'User updated' : 'User added'); await load(true);
          } catch (err) { m.busy(btn, false); m.error(err.message); }
        });
      }

      // ------------------------------------------------------------ reset password
      function openReset(u) {
        const m = UI.modal({
          title: 'Reset password',
          foot: '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-green" data-ok type="button">Reset password</button>',
          body: `<p style="margin-bottom:12px">Set a new temporary password for <b>${esc(u.full_name)}</b>. They are signed out everywhere and must choose their own password next time.</p>
            <div class="gf-field"><label class="gf-label" for="rp-pw">New password (at least 8 characters)</label><input class="gf-input plain" id="rp-pw" type="text" autocomplete="off"></div>`,
        });
        const btn = m.el.querySelector('[data-ok]');
        btn.addEventListener('click', async () => {
          const pw = m.el.querySelector('#rp-pw').value;
          if (pw.length < 8) { m.error('The password must be at least 8 characters.'); return; }
          m.error(''); m.busy(btn, true);
          try { await Api.put(`/users/${u.id}/password`, { new_password: pw }); m.close(); UI.toast('Password reset'); await load(true); }
          catch (err) { m.busy(btn, false); m.error(err.message); }
        });
      }

      paint();
      load();
    },
  });
})();