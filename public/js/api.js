/**
 * Shared by every page. Exposes window.Api (requests) and window.Session (token + user).
 * Backend envelope: { success: true, data } or { success: false, message, code?, details? }
 */
(function () {
  const TOKEN = 'gf_token', USER = 'gf_user', EXPIRES = 'gf_expires';
  const LOGIN_PAGE = '/login.html';

  const Session = {
    get token() { return localStorage.getItem(TOKEN); },
    get user() { try { return JSON.parse(localStorage.getItem(USER)); } catch { return null; } },
    get expired() { const e = localStorage.getItem(EXPIRES); return e ? Date.now() >= new Date(e).getTime() : false; },
    get active() { return !!this.token && !this.expired; },
    save({ token, expires_at, user }) {
      localStorage.setItem(TOKEN, token);
      if (expires_at) localStorage.setItem(EXPIRES, expires_at);
      if (user) localStorage.setItem(USER, JSON.stringify(user));
    },
    clear() { [TOKEN, USER, EXPIRES].forEach((k) => localStorage.removeItem(k)); },
    can(permission) { const u = this.user; return !!(u && Array.isArray(u.permissions) && u.permissions.includes(permission)); },
  };

  class ApiError extends Error {
    constructor(message, status, code, details) { super(message); this.status = status; this.code = code; this.details = details; }
  }

  async function request(method, path, body, opts = {}) {
    const { auth = true, handle401 = true } = opts;
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && Session.token) headers.Authorization = `Bearer ${Session.token}`;

    let res;
    try {
      res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError('Cannot reach the server. Check the internet connection and try again.', 0, 'NETWORK');
    }

    let json = null;
    try { json = await res.json(); } catch { /* non-JSON response */ }

    if (res.status === 401 && auth && handle401) {
      Session.clear();
      if (!location.pathname.endsWith(LOGIN_PAGE)) location.href = LOGIN_PAGE;
    }
    if (!res.ok || (json && json.success === false)) {
      throw new ApiError((json && json.message) || 'Something went wrong. Try again.', res.status, json && json.code, json && json.details);
    }
    return json ? json.data : null;
  }

  window.Session = Session;
  window.ApiError = ApiError;
  window.Api = {
    get: (p, o) => request('GET', p, undefined, o),
    post: (p, b, o) => request('POST', p, b === undefined ? {} : b, o),
    put: (p, b, o) => request('PUT', p, b === undefined ? {} : b, o),
    del: (p, o) => request('DELETE', p, undefined, o),
  };
})();