/**
 * Admin > Settings  (#/shared/settings)   owner only
 * Tabs: Business (profile and receipt wording), M-Pesa (non-secret Daraja settings), System settings (app_settings keys), Backups.
 * The Daraja consumer key, secret and passkey live in the server .env file and are never shown or saved here.
 * Uses GET/PUT /api/settings/profile, GET/PUT /settings/mpesa, GET /settings, PUT /settings/:key, GET /backups and /backups/last.
 */
(function () {
  const { esc } = UI;
  const when = (v) => (v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
  const pretty = (s) => String(s || '').replace(/[_.]/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const size = (b) => {
    const n = Number(b || 0);
    if (!n) return '–';
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };
  const kind = (v) => (typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? 'number' : typeof v === 'string' ? 'text' : 'json');
  const shown = (v) => {
    if (v === null || v === undefined) return '–';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  const card = (inner) => `<div style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;max-width:760px">${inner}</div>`;

  const ENVIRONMENTS = [['sandbox', 'Sandbox (testing)'], ['production', 'Production (real money)']];
  const TXN_TYPES = [['CustomerBuyGoodsOnline', 'Buy Goods (till number)'], ['CustomerPayBillOnline', 'Paybill']];

  GF.page('shared/settings', {
    title: 'Settings',
    render(el) {
      const canManage = GF.can('settings.manage');
      const canBackups = GF.can('backups.view');
      const tabs = [['business', 'Business'], ['mpesa', 'M-Pesa'], ['system', 'System settings']];
      if (canBackups) tabs.push(['backups', 'Backups']);

      const s = {
        tab: 'business', loading: true, failed: '',
        profile: null, mpesa: null, mpesaDenied: false, settings: [], backups: [], lastBackup: null,
        search: '',
      };

      el.innerHTML = `<div class="toolbar" id="toolbar"></div><div id="body"></div>`;
      const toolbarEl = el.querySelector('#toolbar'), bodyEl = el.querySelector('#body');

      // ------------------------------------------------------------ data
      async function load() {
        s.loading = true; paintBody();
        try {
          const [profile, settings] = await Promise.all([Api.get('/settings/profile'), Api.get('/settings')]);
          s.profile = profile || {}; s.settings = settings || [];
          s.failed = '';
        } catch (err) { s.failed = err.message; UI.toast(err.message, 'error'); }
        if (canManage) {
          try { s.mpesa = (await Api.get('/settings/mpesa')) || {}; s.mpesaDenied = false; }
          catch (err) { s.mpesa = null; s.mpesaDenied = true; }
        } else { s.mpesaDenied = true; }
        if (canBackups) {
          try {
            const [list, last] = await Promise.all([Api.get('/backups?limit=30'), Api.get('/backups/last')]);
            s.backups = list || []; s.lastBackup = last || null;
          } catch (_) { s.backups = []; s.lastBackup = null; }
        }
        s.loading = false;
        paintBody();
      }

      // ------------------------------------------------------------ painting
      function paintToolbar() {
        toolbarEl.innerHTML = `<div class="gf-seg" style="min-width:${tabs.length * 130}px">${tabs.map(([k, l]) =>
          `<button type="button" class="${s.tab === k ? 'on' : ''}" data-tab="${k}">${esc(l)}</button>`).join('')}</div>`;
      }

      function paintBody() {
        GF.setActions('');
        if (s.loading) { bodyEl.innerHTML = Kit.loading('settings'); return; }
        const err = s.failed ? Kit.error(s.failed) : '';
        if (s.tab === 'business') bodyEl.innerHTML = err + businessHtml();
        else if (s.tab === 'mpesa') bodyEl.innerHTML = err + mpesaHtml();
        else if (s.tab === 'system') bodyEl.innerHTML = err + systemHtml();
        else bodyEl.innerHTML = err + backupsHtml();
      }

      const field = (id, label, value, opts = {}) => `
        <div class="gf-field"><label class="gf-label" for="${id}">${esc(label)}</label>
          <input class="gf-input plain" id="${id}" type="${opts.type || 'text'}" value="${esc(value ?? '')}" placeholder="${esc(opts.placeholder || '')}" ${canManage ? '' : 'disabled'}>
          ${opts.hint ? `<div class="gf-hint" style="margin-top:6px">${esc(opts.hint)}</div>` : ''}</div>`;
      const area = (id, label, value, hint) => `
        <div class="gf-field"><label class="gf-label" for="${id}">${esc(label)}</label>
          <textarea class="gf-input plain" id="${id}" rows="3" style="height:auto;padding:10px 12px" ${canManage ? '' : 'disabled'}>${esc(value ?? '')}</textarea>
          ${hint ? `<div class="gf-hint" style="margin-top:6px">${esc(hint)}</div>` : ''}</div>`;
      const select = (id, label, list, sel) => `
        <div class="gf-field"><label class="gf-label" for="${id}">${esc(label)}</label>
          <select class="gf-input plain" id="${id}" ${canManage ? '' : 'disabled'}>${Kit.opts(list, sel, (x) => x[1], (x) => x[0])}</select></div>`;
      const saveRow = (id, text) => (canManage
        ? `<div style="display:flex;justify-content:flex-end;margin-top:6px"><button class="gf-btn gf-btn-dark" id="${id}" type="button">${esc(text)}</button></div>`
        : Kit.note('You can view these settings but only the owner can change them.', 'amber', 'bi-lock'));

      function businessHtml() {
        const p = s.profile || {};
        return card(`
          <h3 style="font-size:15px;margin:0 0 12px">Business details</h3>
          <div class="gf-note gf-note-red gf-hidden" id="biz-error" role="alert"><i class="bi bi-exclamation-circle"></i><span></span></div>
          ${field('b-name', 'Business name', p.business_name, { placeholder: 'Shown on receipts' })}
          <div class="gf-row2">
            ${field('b-owner', 'Owner name', p.owner_name)}
            ${field('b-phone', 'Phone', p.phone, { type: 'tel', placeholder: '07XX XXX XXX' })}
          </div>
          <div class="gf-row2">
            ${field('b-email', 'Email', p.email, { type: 'email' })}
            ${field('b-kra', 'KRA PIN', p.kra_pin)}
          </div>
          ${field('b-address', 'Address', p.address, { placeholder: 'Town, street or building' })}
          ${field('b-till', 'M-Pesa till number (printed on receipts)', p.mpesa_till_number, { type: 'text' })}
          <h3 style="font-size:15px;margin:14px 0 12px">Receipt wording</h3>
          ${area('b-header', 'Receipt header', p.receipt_header, 'A line under the business name, for example a slogan.')}
          ${area('b-footer', 'Receipt footer', p.receipt_footer, 'For example: Goods once sold are not returnable. Thank you.')}
          ${saveRow('biz-save', 'Save business details')}`);
      }

      function mpesaHtml() {
        if (s.mpesaDenied || !s.mpesa) {
          return Kit.empty('bi-lock', 'M-Pesa settings are hidden', 'Only the owner can see and change the M-Pesa settings.');
        }
        const c = s.mpesa;
        return card(`
          <h3 style="font-size:15px;margin:0 0 12px">M-Pesa prompts (Daraja)</h3>
          ${Kit.note('The consumer key, secret and passkey are kept in the server .env file for safety. They are not shown or saved here.', 'amber', 'bi-shield-lock')}
          <div class="gf-note gf-note-red gf-hidden" id="mp-error" role="alert"><i class="bi bi-exclamation-circle"></i><span></span></div>
          <div class="gf-row2">
            ${select('m-env', 'Environment', ENVIRONMENTS, c.environment || 'sandbox')}
            ${select('m-type', 'Payment type', TXN_TYPES, c.transaction_type || 'CustomerBuyGoodsOnline')}
          </div>
          <div class="gf-row2">
            ${field('m-short', 'Business shortcode', c.business_shortcode, { hint: 'The store or head office number for Buy Goods, or the paybill number.' })}
            ${field('m-till', 'Till number', c.till_number)}
          </div>
          ${field('m-url', 'Callback URL', c.callback_url, { placeholder: 'https://your-site.com/api/mpesa/stk-callback/…', hint: 'Safaricom sends payment confirmations here. It must be a public https address.' })}
          <div class="gf-field"><label class="gf-label" for="m-active">M-Pesa prompts</label>
            <select class="gf-input plain" id="m-active" ${canManage ? '' : 'disabled'}>
              <option value="true" ${c.is_active ? 'selected' : ''}>Switched on</option>
              <option value="false" ${!c.is_active ? 'selected' : ''}>Switched off</option></select></div>
          ${saveRow('mp-save', 'Save M-Pesa settings')}`);
      }

      function systemHtml() {
        const q = s.search.toLowerCase();
        const rows = s.settings.filter((r) => !q || `${r.key} ${r.description || ''}`.toLowerCase().includes(q));
        const search = `<div class="toolbar"><span class="grow"></span><label class="search"><i class="bi bi-search"></i><input type="search" id="s-search" placeholder="Find a setting" value="${esc(s.search)}" aria-label="Find a setting"></label></div>`;
        if (!rows.length) {
          return search + Kit.empty('bi-gear', s.search ? 'No settings match' : 'No system settings yet', s.search ? 'Try a different word.' : 'Settings added to the system will show up here.');
        }
        const body = rows.map((r) => `<tr class="click" data-key="${esc(r.key)}">
          <td><strong>${esc(pretty(r.key))}</strong><div class="muted" style="font-size:12.5px">${esc(r.description || r.key)}</div></td>
          <td style="max-width:280px;word-break:break-word">${esc(shown(r.value))}</td>
          <td class="nowrap muted">${esc(when(r.updated_at))}</td>
          <td class="r muted"><i class="bi bi-${canManage ? 'pencil' : 'chevron-right'}"></i></td></tr>`).join('');
        return search + Kit.table([['Setting'], ['Value'], ['Changed'], ['']], body);
      }

      function backupsHtml() {
        const last = s.lastBackup;
        const kpi = Kit.kpi('bi-cloud-check', 'Last good backup', last ? esc(when(last.finished_at || last.started_at)) : 'None yet', '', last ? 'cereal' : 'mill') +
          Kit.kpi('bi-hdd', 'Size', last ? esc(size(last.size_bytes)) : '–');
        const warn = !last ? Kit.note('No successful backup is recorded. Check that the nightly backup job is running.', 'amber', 'bi-exclamation-triangle') : '';
        const body = s.backups.map((b) => {
          const tone = b.status === 'SUCCESS' ? 'green' : b.status === 'FAILED' ? 'red' : 'amber';
          return `<tr>
            <td class="nowrap">${esc(when(b.started_at))}</td>
            <td>${Kit.pill(tone, pretty(b.status))}</td>
            <td>${esc(b.file_name || '–')}${b.error_text ? `<div class="muted" style="font-size:12.5px;color:var(--red-ink)">${esc(b.error_text)}</div>` : ''}</td>
            <td class="nowrap muted">${esc(b.location || '–')}</td>
            <td class="r nowrap">${esc(size(b.size_bytes))}</td></tr>`;
        }).join('');
        return `<div class="kpis">${kpi}</div>${warn}` + (s.backups.length
          ? Kit.table([['Started'], ['Result'], ['File'], ['Saved to'], ['Size', 'r']], body)
          : Kit.empty('bi-cloud', 'No backups recorded', 'Backups appear here once the backup job has run.'));
      }

      // ------------------------------------------------------------ saving
      const val = (id) => { const n = bodyEl.querySelector('#' + id); return n ? n.value.trim() : ''; };
      const showErr = (id, msg) => {
        const n = bodyEl.querySelector('#' + id); if (!n) return;
        n.querySelector('span').textContent = msg || '';
        n.classList.toggle('gf-hidden', !msg);
        if (msg) n.scrollIntoView({ block: 'nearest' });
      };
      const busy = (btn, on) => {
        btn.disabled = !!on;
        if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="gf-spinner"></span>'; }
        else if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
      };

      async function saveBusiness(btn) {
        showErr('biz-error', '');
        if (!val('b-name')) { showErr('biz-error', 'Enter the business name.'); return; }
        const body = {
          business_name: val('b-name'), owner_name: val('b-owner'), phone: val('b-phone'), email: val('b-email'),
          address: val('b-address'), kra_pin: val('b-kra'), mpesa_till_number: val('b-till'),
          receipt_header: val('b-header'), receipt_footer: val('b-footer'),
        };
        busy(btn, true);
        try { s.profile = (await Api.put('/settings/profile', body)) || { ...s.profile, ...body }; UI.toast('Business details saved'); paintBody(); }
        catch (err) { busy(btn, false); showErr('biz-error', err.message); }
      }

      async function saveMpesa(btn) {
        showErr('mp-error', '');
        const body = {
          environment: val('m-env'), transaction_type: val('m-type'), business_shortcode: val('m-short'),
          till_number: val('m-till'), callback_url: val('m-url'), is_active: val('m-active') === 'true',
        };
        if (body.is_active) {
          if (!body.business_shortcode || !body.till_number || !body.callback_url) { showErr('mp-error', 'To switch M-Pesa on, fill in the shortcode, till number and callback URL.'); return; }
          if (!/^https:\/\//i.test(body.callback_url)) { showErr('mp-error', 'The callback URL must start with https://'); return; }
        }
        if (body.environment === 'production' && body.is_active && s.mpesa.environment !== 'production' &&
          !confirm('Switch to Production? Customers will be charged real money.')) return;
        busy(btn, true);
        try { s.mpesa = (await Api.put('/settings/mpesa', body)) || { ...s.mpesa, ...body }; UI.toast('M-Pesa settings saved'); paintBody(); }
        catch (err) { busy(btn, false); showErr('mp-error', err.message); }
      }

      function openSetting(key) {
        const row = s.settings.find((r) => r.key === key); if (!row) return;
        const k = kind(row.value);
        let input;
        if (k === 'bool') {
          input = `<select class="gf-input plain" id="v-input" ${canManage ? '' : 'disabled'}><option value="true" ${row.value ? 'selected' : ''}>Yes</option><option value="false" ${!row.value ? 'selected' : ''}>No</option></select>`;
        } else if (k === 'number') {
          input = `<input class="gf-input plain" id="v-input" type="number" inputmode="decimal" step="any" value="${esc(row.value)}" ${canManage ? '' : 'disabled'}>`;
        } else if (k === 'text') {
          input = `<input class="gf-input plain" id="v-input" type="text" value="${esc(row.value)}" ${canManage ? '' : 'disabled'}>`;
        } else {
          input = `<textarea class="gf-input plain" id="v-input" rows="6" style="height:auto;padding:10px 12px;font-family:monospace" ${canManage ? '' : 'disabled'}>${esc(JSON.stringify(row.value, null, 2))}</textarea>
            <div class="gf-hint" style="margin-top:6px">This value is structured data. Keep the format valid.</div>`;
        }
        const m = UI.modal({
          title: pretty(row.key),
          body: `${row.description ? `<p>${esc(row.description)}</p>` : ''}
            <div class="gf-field"><label class="gf-label" for="v-input">Value</label>${input}</div>
            <div class="muted" style="font-size:12.5px">Key: ${esc(row.key)} · Last changed ${esc(when(row.updated_at))}</div>`,
          foot: canManage
            ? '<button class="gf-btn gf-btn-ghost" data-close type="button">Cancel</button><button class="gf-btn gf-btn-dark" data-ok type="button">Save</button>'
            : '<button class="gf-btn gf-btn-ghost" data-close type="button">Close</button>',
        });
        const ok = m.el.querySelector('[data-ok]');
        if (!ok) return;
        ok.addEventListener('click', async () => {
          const raw = m.el.querySelector('#v-input').value;
          let value;
          if (k === 'bool') value = raw === 'true';
          else if (k === 'number') { if (raw.trim() === '' || !Number.isFinite(Number(raw))) { m.error('Enter a number.'); return; } value = Number(raw); }
          else if (k === 'text') value = raw;
          else { try { value = JSON.parse(raw); } catch (_) { m.error('That is not valid JSON. Check the brackets, commas and quotes.'); return; } }
          m.error(''); m.busy(ok, true);
          try {
            const saved = await Api.put(`/settings/${encodeURIComponent(row.key)}`, { value });
            Object.assign(row, saved || { value, updated_at: new Date().toISOString() });
            m.close(); UI.toast('Setting saved'); paintBody();
          } catch (err) { m.busy(ok, false); m.error(err.message); }
        });
      }

      // ------------------------------------------------------------ events
      toolbarEl.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]');
        if (!t) return;
        s.tab = t.dataset.tab; paintToolbar(); paintBody();
      });
      bodyEl.addEventListener('click', (e) => {
        const b = e.target.closest('button[id]');
        if (b && b.id === 'biz-save') return saveBusiness(b);
        if (b && b.id === 'mp-save') return saveMpesa(b);
        const tr = e.target.closest('tr[data-key]');
        if (tr) openSetting(tr.dataset.key);
      });
      bodyEl.addEventListener('input', UI.debounce((e) => {
        if (e.target.id !== 's-search') return;
        s.search = e.target.value.trim();
        const pos = e.target.selectionStart;
        paintBody();
        const again = bodyEl.querySelector('#s-search');
        if (again) { again.focus(); again.setSelectionRange(pos, pos); }
      }, 250));

      paintToolbar();
      load();
    },
  });
})();