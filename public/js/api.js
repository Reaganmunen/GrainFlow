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
    // an expired sign-in stays usable on a computer that cannot reach the server: it is checked again when the connection is back
    get active() { return !!this.token && (!this.expired || !!(window.Offline && Offline.looksOffline())); },
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
    const O = window.Offline;
    const offlineError = () => new ApiError('You are offline. This needs the internet.', 0, 'NETWORK');

    // a job ticket made offline has a temporary id the server does not know: it can only be answered from this computer
    if (O && method === 'GET' && path.includes('tmp:')) {
      const local = await O.read(path);
      if (local !== undefined) return local;
    }

    // already known to be offline: answer from the copy kept on this computer, or fail at once instead of waiting
    if (O && O.isOffline()) {
      if (method === 'GET') { const local = await O.read(path); if (local !== undefined) return local; }
      throw offlineError();
    }

    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && Session.token) headers.Authorization = `Bearer ${Session.token}`;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), method === 'GET' ? 30000 : 45000);
    let res;
    try {
      res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl.signal });
    } catch (e) {
      clearTimeout(timer);
      if (O) {
        if (e && e.name === 'AbortError') O.probe(); else O.markDown(); // a slow answer is not proof we are offline: ask the server
        if (method === 'GET') { const local = await O.read(path); if (local !== undefined) return local; }
      }
      throw new ApiError('Cannot reach the server. Check the internet connection and try again.', 0, 'NETWORK');
    }
    clearTimeout(timer);
    if (O) O.markUp();

    let json = null;
    try { json = await res.json(); } catch { /* non-JSON response */ }

    if (res.status === 401 && auth && handle401) {
      Session.clear();
      if (!location.pathname.endsWith(LOGIN_PAGE)) location.href = LOGIN_PAGE;
    }
    if (!res.ok || (json && json.success === false)) {
      throw new ApiError((json && json.message) || 'Something went wrong. Try again.', res.status, json && json.code, json && json.details);
    }
    // paged lists: keep the array as the return value, and expose { total, page, limit, pages } on it as .pagination
    if (json && Array.isArray(json.data) && json.pagination) {
      Object.defineProperty(json.data, 'pagination', { value: json.pagination, enumerable: false });
    }
    let data = json ? json.data : null;
    if (method === 'GET' && O && data !== null) { O.remember(path, data); data = O.decorate(path, data); }
    return data;
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