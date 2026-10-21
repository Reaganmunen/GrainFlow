/**
 * Small helpers shared by the later screens (deliveries, payments, admin, reports, mill setup).
 * Exposes window.Kit. Nothing here talks to the server.
 */
(function () {
  const { esc } = UI;
  const num = (v) => Number(v || 0);
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const Kit = {
    esc, num, ymd,
    first(r, ...keys) { for (const k of keys) if (r && r[k] !== undefined && r[k] !== null) return r[k]; return undefined; },
    dateOnly: (v) => (v ? String(v).slice(0, 10) : ''),
    stamp: (v) => (v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '–'),
    pretty: (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
    fmt: (n, d = 2) => num(n).toLocaleString('en-KE', { maximumFractionDigits: d }),
    pct: (n) => `${num(n).toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`,

    /** today | week | month | all  ->  { from, to } */
    range(key) {
      const now = new Date(), to = ymd(now);
      if (key === 'today') return { from: to, to };
      if (key === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: ymd(d), to }; }
      if (key === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
      if (key === '30') { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: ymd(d), to }; }
      return {};
    },
    PERIODS: [['today', 'Today'], ['week', 'Last 7 days'], ['month', 'This month'], ['all', 'All time']],

    chips(group, current, list) {
      return list.map(([k, l]) => `<button type="button" class="fchip ${String(current) === String(k) ? 'on' : 'outline'}" data-${group}="${esc(k)}">${esc(l)}</button>`).join('');
    },
    kpi(icon, label, value, badge, tone) {
      return `<div class="kpi"><div class="tile ${tone || ''}"><i class="bi ${icon}"></i></div>
        <div class="kpi-body"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${badge || ''}</div>`;
    },
    fact: (label, v) => `<div class="fact"><span>${label}</span><b>${v}</b></div>`,
    loading: (what) => `<div class="dt-empty">Loading ${esc(what || '')}…</div>`,
    error: (msg) => `<div class="gf-note gf-note-red" style="margin-bottom:12px" role="alert"><i class="bi bi-wifi-off"></i><span>${esc(msg)}</span></div>`,
    note: (msg, tone = 'amber', icon = 'bi-info-circle') => `<div class="gf-note gf-note-${tone}" style="margin-bottom:10px"><i class="bi ${icon}"></i><span>${esc(msg)}</span></div>`,
    empty(icon, title, text, button) {
      return `<div class="dt-empty"><div class="tile"><i class="bi ${icon}"></i></div><h3>${esc(title)}</h3><p>${esc(text)}</p>${button || ''}</div>`;
    },
    table(heads, rows, opts = {}) {
      return `<div class="dt-wrap"><table class="dt"><thead><tr>${heads.map(([h, cls]) => `<th class="${cls || ''}">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>${opts.foot ? `<tfoot>${opts.foot}</tfoot>` : ''}</table></div>`;
    },
    pill: (tone, text) => `<span class="pill ${tone}">${esc(text)}</span>`,
    opts(list, sel, label, value) {
      return list.map((x) => { const v = value ? value(x) : (x.id ?? x[0]); return `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label(x))}</option>`; }).join('');
    },
    /** Escape a cell for CSV */
    csv(rows, headers, name) {
      const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const text = [headers.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      a.download = `${name}-${ymd(new Date())}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };
  window.Kit = Kit;
})();