/** Small helpers shared by every screen. */
window.UI = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  initials(name) {
    const p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  },

  /** Same name always gets the same avatar colour. */
  avatarColor(name) {
    const palette = ['#6fc1b0', '#a98bd6', '#e8935a', '#d96a7f', '#6a9fd9', '#c9a24b', '#5fb37a'];
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  },

  greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  },

  money: (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`,
  kg: (n) => `${Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })} kg`,
};

/** Shared screen helpers: toast, modal, durations. */
Object.assign(window.UI, {
  debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },

  /** 75 -> "1h 15m", 9 -> "9m" */
  dur(mins) {
    const m = Math.max(0, Math.round(mins));
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  },
  minsSince: (iso) => (Date.now() - new Date(iso).getTime()) / 60000,
  clock: (iso) => new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false }),

  toast(message, type = 'ok') {
    let box = document.getElementById('gf-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'gf-toasts'; box.className = 'gf-toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = `gf-toast ${type === 'error' ? 'is-error' : ''}`;
    t.innerHTML = `<i class="bi ${type === 'error' ? 'bi-exclamation-circle' : 'bi-check-circle'}"></i><span>${UI.esc(message)}</span>`;
    box.appendChild(t);
    setTimeout(() => t.remove(), type === 'error' ? 6000 : 3200);
  },

  /**
   * UI.modal({ title, body, foot, wide }) -> { el, close(), error(msg), busy(button, on) }
   * body / foot are HTML strings. Elements with data-close close it. Escape and a click outside close it too.
   */
  modal({ title, body = '', foot = '', wide = false }) {
    const back = document.createElement('div');
    back.className = 'gf-backdrop';
    back.innerHTML = `<div class="gf-modal ${wide ? 'is-wide' : ''}" role="dialog" aria-modal="true" aria-label="${UI.esc(title)}">
      <div class="gf-modal-head"><h2>${UI.esc(title)}</h2><button class="gf-x" type="button" data-close aria-label="Close"><i class="bi bi-x-lg"></i></button></div>
      <div class="gf-modal-body"><div class="gf-note gf-note-red gf-hidden" data-error role="alert"><i class="bi bi-exclamation-circle"></i><span></span></div>${body}</div>
      ${foot ? `<div class="gf-modal-foot">${foot}</div>` : ''}</div>`;
    document.body.appendChild(back);
    const prevFocus = document.activeElement;
    const close = () => { document.removeEventListener('keydown', onKey); back.remove(); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    const first = back.querySelector('input:not([type=hidden]), select, textarea');
    if (first) first.focus();
    return {
      el: back, close,
      error(msg) {
        const n = back.querySelector('[data-error]');
        n.querySelector('span').textContent = msg || '';
        n.classList.toggle('gf-hidden', !msg);
        if (msg) n.scrollIntoView({ block: 'nearest' });
      },
      busy(btn, on) {
        if (!btn) return;
        btn.disabled = !!on;
        if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="gf-spinner"></span>'; }
        else if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
      },
    };
  },
});