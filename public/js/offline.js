/**
 * Offline mode for GrainFlow.  window.Offline
 *
 *  - Keeps the app itself on the computer (service worker, see src/services/sw.template.js).
 *  - Keeps what the till needs to sell: prices, stock, customers, job tickets (downloaded from /api/offline/bootstrap
 *    and refreshed whenever the screens load online). Screens read it through Api.get, which falls back to Offline.read().
 *  - Sales and job-ticket steps made while the connection is down are saved in IndexedDB (the "queue") the moment they are
 *    made, then sent one by one to /api/offline/apply when the server can be reached again. Each one has its own id, so
 *    sending it twice can never record it twice.
 *  - Screens call Offline.submit(type, payload, opts): it saves first, then sends straight away if it can.
 *
 * Everything here is per computer (browser profile). Nothing leaves the queue until the server confirms it.
 */
(function () {
  'use strict';
  if (window.Offline) return;

  const DAY = 24 * 3600 * 1000;
  const KEEP_DONE_MS = 7 * DAY;           // sent items stay listed this long (so a provisional receipt can be matched to the real one)
  const SYNC_EVERY_MS = 30 * 1000;        // retry while there is something waiting
  const PROBE_ONLINE_MS = 45 * 1000;      // how often we check the server is still there
  const PROBE_OFFLINE_MS = 8 * 1000;      // how often we check whether it is back
  const BOOTSTRAP_EVERY_MS = 15 * 60 * 1000;
  const GET_TIMEOUT_MS = 15 * 1000;
  const WRITE_TIMEOUT_MS = 30 * 1000;

  const num = (v) => Number(v || 0);
  const esc = (s) => (window.UI ? UI.esc(s) : String(s ?? ''));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const me = () => (window.Session && Session.user && Session.user.id) || null;
  const todayStr = () => new Date().toLocaleDateString('en-CA');

  // ================================================================ storage (IndexedDB, with a memory fallback)
  const mem = { kv: new Map(), ops: new Map() };
  let dbPromise = null;
  let usingMemory = false;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) { usingMemory = true; resolve(null); return; }
      let req;
      try { req = indexedDB.open('grainflow-offline', 1); } catch (_) { usingMemory = true; resolve(null); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('ops')) d.createObjectStore('ops', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { usingMemory = true; resolve(null); };
      req.onblocked = () => { usingMemory = true; resolve(null); };
    });
    return dbPromise;
  }
  const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

  async function kvGet(key) {
    const d = await openDb();
    if (!d) return mem.kv.get(key);
    return wrap(d.transaction('kv').objectStore('kv').get(key));
  }
  async function kvSet(key, value) {
    const d = await openDb();
    if (!d) { mem.kv.set(key, value); return; }
    const t = d.transaction('kv', 'readwrite');
    t.objectStore('kv').put(value, key);
    await done(t);
  }
  async function opsAll() {
    const d = await openDb();
    const rows = d ? await wrap(d.transaction('ops').objectStore('ops').getAll()) : [...mem.ops.values()];
    return rows.sort((a, b) => a.seq - b.seq);
  }
  async function opPut(op) {
    const d = await openDb();
    if (!d) { mem.ops.set(op.id, JSON.parse(JSON.stringify(op))); return; }
    const t = d.transaction('ops', 'readwrite');
    t.objectStore('ops').put(JSON.parse(JSON.stringify(op)));
    await done(t);
  }
  async function opDelete(id) {
    const d = await openDb();
    if (!d) { mem.ops.delete(id); return; }
    const t = d.transaction('ops', 'readwrite');
    t.objectStore('ops').delete(id);
    await done(t);
  }

  // ================================================================ state
  const state = { ops: [], ref: null, refmap: {}, device: null };
  let markReady;
  const ready = new Promise((r) => { markReady = r; });
  const conn = { online: navigator.onLine !== false, probing: null, lastOk: null };
  let syncing = false;
  let started = false;
  let needsLogin = false;
  let bootstrapping = null;
  let lastSeq = 0;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gf-offline') : null;
  const listeners = new Set();

  const pending = () => state.ops.filter((o) => o.status !== 'done');
  const mine = (o) => o.user_id === me();

  async function loadAll(startup) {
    state.ops = await opsAll();
    state.refmap = (await kvGet('refmap')) || {};
    state.ref = (await kvGet('ref')) || null;
    state.device = (await kvGet('device')) || null;
    if (!state.device) {
      state.device = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
      await kvSet('device', state.device);
    }
    for (const o of state.ops) {
      // the page was closed mid-send: the server's op_id check makes sending it again safe
      if (startup === true && o.status === 'syncing') { o.status = 'pending'; await opPut(o); }
      lastSeq = Math.max(lastSeq, o.seq || 0);
    }
  }

  function emit(fromOtherTab) {
    paintShell();
    listeners.forEach((fn) => { try { fn(); } catch (_) { /* a screen listener must not break the queue */ } });
    if (!fromOtherTab && channel) channel.postMessage({ type: 'changed' });
  }
  if (channel) {
    channel.onmessage = async () => { await loadAll(); emit(true); };
  }

  // ================================================================ connectivity
  function setOnline(v) {
    const changed = conn.online !== v;
    conn.online = v;
    try { localStorage.setItem('gf_offline', v ? '0' : '1'); } catch (_) { /* storage may be off */ }
    if (v) conn.lastOk = Date.now();
    if (!changed) return;
    emit();
    if (v) { syncAll(); bootstrap(); }
  }

  /** Asks the server directly. A reply of any kind means we are online. */
  function probe() {
    if (conn.probing) return conn.probing;
    conn.probing = (async () => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      try {
        const res = await fetch(`/api/health?_=${Date.now()}`, { cache: 'no-store', signal: ctl.signal });
        setOnline(res.ok);
      } catch (_) { setOnline(false); }
      finally { clearTimeout(timer); conn.probing = null; }
    })();
    return conn.probing;
  }

  function scheduleProbe() {
    setTimeout(async () => { await probe(); scheduleProbe(); }, conn.online ? PROBE_ONLINE_MS : PROBE_OFFLINE_MS);
  }

  const isOnline = () => conn.online;
  // only once the app has started its connection checks (the sign-in page never does, so it never blocks a request)
  const isOffline = () => started && !conn.online;
  /** For the sign-in check: an expired login stays usable on a computer that cannot reach the server (it is re-checked when it can). */
  function looksOffline() {
    if (!conn.online) return true;
    try { return localStorage.getItem('gf_offline') === '1'; } catch (_) { return false; }
  }

  // ================================================================ reference data (what the till needs)
  let saveTimer = null;
  function saveRef() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (state.ref) kvSet('ref', state.ref).catch(() => {}); }, 400);
  }

  async function bootstrap(force) {
    if (!conn.online || !window.Session || !Session.active) return null;
    if (bootstrapping) return bootstrapping;
    const age = state.ref && state.ref.fetched_at ? Date.now() - state.ref.fetched_at : Infinity;
    if (!force && state.ref && state.ref.user_id === me() && age < BOOTSTRAP_EVERY_MS) return null;
    bootstrapping = (async () => {
      try {
        const data = await Api.get('/offline/bootstrap', { handle401: false });
        if (data) {
          state.ref = { ...data, fetched_at: Date.now() };
          await kvSet('ref', state.ref);
          emit();
        }
        return data;
      } catch (_) { return null; }
      finally { bootstrapping = null; }
    })();
    return bootstrapping;
  }

  /** Called by Api.get after a normal online answer, so what the screens already load keeps the saved copy fresh. */
  function remember(path, data) {
    const r = route(path);
    if (!r || data === undefined || !state.ref || state.ref.user_id !== me()) return;
    const ref = state.ref;
    ref.mill = ref.mill || null;
    switch (r.kind) {
      case 'catalogue':
        ref.catalogue = ref.catalogue || {};
        ref.catalogue[r.module] = ref.catalogue[r.module] || {};
        ref.catalogue[r.module][r.tier] = data;
        break;
      case 'lookup': {
        const known = new Map((ref.customers || []).map((c) => [c.id, c]));
        for (const c of data || []) known.set(c.id, { ...(known.get(c.id) || {}), ...c });
        ref.customers = [...known.values()];
        break;
      }
      case 'billable': if (ref.mill && !r.customer) ref.mill.billable = data; break;
      case 'jobsOpen': if (ref.mill) ref.mill.jobs_open = data; break;
      case 'jobsDone': if (ref.mill) { ref.mill.jobs_done = data; ref.mill.day = r.q.get('from') || todayStr(); } break;
      case 'grains': if (ref.mill) ref.mill.grains = data; break;
      case 'machines': if (ref.mill) ref.mill.machines = data; break;
      case 'rate': if (ref.mill) ref.mill.rates[r.id] = data; break;
      default: return;
    }
    saveRef();
  }

  function route(path) {
    const [p, qs] = String(path).split('?');
    const q = new URLSearchParams(qs || '');
    if (p === '/sales/catalogue') return { kind: 'catalogue', module: (q.get('module') || '').toUpperCase(), tier: (q.get('tier') || 'RETAIL').toUpperCase() };
    if (p === '/customers/lookup') return { kind: 'lookup', q: q.get('q') || '' };
    if (p === '/mill/jobs/billable') return { kind: 'billable', customer: q.get('customer_id') };
    if (p === '/mill/jobs') return { kind: (q.get('status') || '').includes('COLLECTED') ? 'jobsDone' : 'jobsOpen', q };
    const j = p.match(/^\/mill\/jobs\/([^/]+)$/);
    if (j && j[1] !== 'open') return { kind: 'job', id: decodeURIComponent(j[1]) };
    if (p === '/items' && q.get('millable') === 'true') return { kind: 'grains' };
    if (p === '/mill/machines') return { kind: 'machines' };
    const r = p.match(/^\/milling-rates\/current\/(\d+)$/);
    if (r) return { kind: 'rate', id: r[1] };
    return null;
  }

  // ---------------------------------------------------------------- what the waiting items change on screen
  const saleOps = (module) => pending().filter((o) => o.type === 'sale' && (!module || o.payload.module === module));

  function decorateCatalogue(list, module) {
    const ops = saleOps(module);
    if (!ops.length) return list;
    const used = new Map();
    for (const o of ops) for (const s of (o.meta && o.meta.stock) || []) used.set(s.item_id, (used.get(s.item_id) || 0) + num(s.kg));
    return list.map((it) => (used.has(it.id) ? { ...it, stock_kg: Math.max(0, num(it.stock_kg) - used.get(it.id)) } : it));
  }

  function decorateCustomers(list) {
    const ops = saleOps();
    if (!ops.length) return list;
    const owed = new Map();
    for (const o of ops) if (o.payload.customer_id) owed.set(o.payload.customer_id, (owed.get(o.payload.customer_id) || 0) + num(o.meta && o.meta.balance_due));
    return list.map((c) => (owed.has(c.id) ? { ...c, balance: num(c.balance) + owed.get(c.id) } : c));
  }

  /** Job rows as the board shows them, with the waiting create / start / weigh-out / hand-over / cancel steps applied. */
  function overlayJobs(base) {
    const open = base.jobs_open || [], doneRows = base.jobs_done || [];
    const ops = pending().filter((o) => o.type.startsWith('mill.') || (o.type === 'sale' && o.payload.module === 'MILL'));
    if (!ops.length) return { open, done: doneRows, all: null };
    const rows = new Map();
    [...open, ...doneRows].forEach((j) => rows.set(String(j.id), { ...j }));
    for (const o of ops) {
      if (o.type === 'mill.create') { rows.set(o.ref, { ...o.meta.job, id: o.ref, status: 'WAITING', _offline: true }); continue; }
      if (o.type === 'sale') {
        for (const l of o.payload.lines || []) {
          const row = l.line_type === 'MILLING' && rows.get(String(l.mill_job_id));
          if (row) row.sale_id = 'pending';
        }
        continue;
      }
      const row = rows.get(String(o.payload.job_id));
      if (!row) continue;
      row._offline = true;
      if (o.type === 'mill.start') row.status = 'MILLING';
      else if (o.type === 'mill.complete') {
        row.status = 'READY';
        row.weight_out_kg = num(o.payload.weight_out_kg);
        row.bran_kg = o.payload.bran_kg === undefined ? null : num(o.payload.bran_kg);
        row.yield_pct = num(row.weight_in_kg) > 0 ? (num(o.payload.weight_out_kg) / num(row.weight_in_kg)) * 100 : null;
      } else if (o.type === 'mill.collect') row.status = 'COLLECTED';
      else if (o.type === 'mill.cancel') row.status = 'CANCELLED';
    }
    const all = [...rows.values()];
    return {
      open: all.filter((j) => ['WAITING', 'MILLING', 'READY'].includes(j.status)).sort((a, b) => new Date(a.received_at) - new Date(b.received_at)),
      done: all.filter((j) => j.status === 'COLLECTED' && (j._offline || doneRows.some((d) => d.id === j.id))).sort((a, b) => new Date(b.received_at) - new Date(a.received_at)),
      all,
    };
  }

  function billableJobs(baseBillable, mill, customer) {
    const map = new Map((baseBillable || []).map((j) => [String(j.id), j]));
    const o = overlayJobs({ jobs_open: mill.jobs_open, jobs_done: mill.jobs_done });
    for (const j of o.all || []) {
      const ok = j.job_type === 'CUSTOMER' && ['READY', 'COLLECTED'].includes(j.status) && num(j.charge_amount) > 0 && !j.sale_id;
      if (ok) map.set(String(j.id), j); else if (j._offline || j.sale_id) map.delete(String(j.id));
    }
    return [...map.values()].filter((j) => !customer || String(j.customer_id) === String(customer));
  }

  function searchCustomers(term) {
    const t = String(term || '').trim().toLowerCase();
    if (!t || !state.ref) return [];
    const digits = t.replace(/\D/g, '').replace(/^0/, '');
    return (state.ref.customers || []).filter((c) =>
      String(c.full_name || '').toLowerCase().includes(t) || String(c.business_name || '').toLowerCase().includes(t)
      || String(c.customer_code || '').toLowerCase().includes(t) || (digits.length >= 3 && String(c.phone || '').includes(digits))).slice(0, 15);
  }

  /** The saved answer for a GET the server cannot be asked right now. undefined = nothing saved for it. */
  async function read(path) {
    await ready;
    const r = route(path);
    const ref = state.ref;
    if (!r || !ref || ref.user_id !== me()) return undefined;
    const mill = ref.mill;
    switch (r.kind) {
      case 'catalogue': { const l = ref.catalogue && ref.catalogue[r.module] && ref.catalogue[r.module][r.tier]; return l ? decorateCatalogue(l, r.module) : undefined; }
      case 'lookup': return decorateCustomers(searchCustomers(r.q));
      case 'billable': return mill ? billableJobs(mill.billable, mill, r.customer) : undefined;
      case 'jobsOpen': return mill ? overlayJobs(mill).open : undefined;
      case 'jobsDone': return mill ? overlayJobs({ ...mill, jobs_done: mill.day === todayStr() ? mill.jobs_done : [] }).done : undefined;
      case 'job': {
        if (!mill) return undefined;
        const row = (overlayJobs(mill).all || [...(mill.jobs_open || []), ...(mill.jobs_done || [])]).find((j) => String(j.id) === r.id);
        return row ? { ...row, history: [], outputs: [], blends: [] } : undefined;
      }
      case 'grains': return mill ? mill.grains : undefined;
      case 'machines': return mill ? mill.machines : undefined;
      case 'rate': return mill && Object.prototype.hasOwnProperty.call(mill.rates || {}, r.id) ? mill.rates[r.id] : undefined;
      default: return undefined;
    }
  }

  /** Online answers also show the waiting items (a sale still in the queue has not reached the server's numbers yet). */
  function decorate(path, data) {
    if (!pending().length || data == null) return data;
    const r = route(path);
    if (!r) return data;
    const mill = state.ref && state.ref.mill ? state.ref.mill : {};
    switch (r.kind) {
      case 'catalogue': return decorateCatalogue(data, r.module);
      case 'lookup': return decorateCustomers(data);
      case 'billable': return billableJobs(data, mill, r.customer);
      case 'jobsOpen': return overlayJobs({ ...mill, jobs_open: data }).open;
      case 'jobsDone': return overlayJobs({ ...mill, jobs_done: data }).done;
      default: return data;
    }
  }

  // ================================================================ the queue
  function walk(value, fn) {
    if (Array.isArray(value)) return value.map((v) => walk(v, fn));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, fn)]));
    return fn(value);
  }
  const isTmp = (v) => typeof v === 'string' && v.startsWith('tmp:');
  const withRealIds = (payload) => walk(payload, (v) => (isTmp(v) && state.refmap[v] !== undefined ? state.refmap[v] : v));
  function tmpRefsIn(op) {
    const out = [];
    walk(op.payload, (v) => { if (isTmp(v) && state.refmap[v] === undefined) out.push(v); return v; });
    return out;
  }
  /** The things an operation touches. Steps on the same job go in the order they were made. */
  function keysOf(op) {
    const real = (v) => String(state.refmap[v] !== undefined ? state.refmap[v] : v);
    if (op.type === 'mill.create') return [real(op.ref)];
    if (op.type.startsWith('mill.')) return [real(op.payload.job_id)];
    if (op.type === 'sale') return (op.payload.lines || []).filter((l) => l.line_type === 'MILLING').map((l) => real(l.mill_job_id));
    return [];
  }

  async function nextLocalNo() {
    await ready;
    const n = ((await kvGet('localSeq')) || 0) + 1;
    await kvSet('localSeq', n);
    return `OFF-${state.device}-${String(n).padStart(4, '0')}`;
  }

  async function enqueue(type, payload, opts = {}) {
    await ready;
    if (!me()) throw new ApiError('Please sign in first.', 401, 'NO_SESSION');
    lastSeq = Math.max(lastSeq + 1, Date.now());
    const op = {
      id: uuid(), seq: lastSeq, type, payload, ref: opts.ref || null, local_no: opts.local_no || null,
      meta: opts.meta || {}, user_id: me(), user_name: (Session.user && (Session.user.full_name || Session.user.username)) || '',
      status: 'pending', attempts: 0, error: null, created_at: new Date().toISOString(), synced_at: null, result: null,
    };
    state.ops.push(op);
    await opPut(op);
    emit();
    return op;
  }

  class NetErr extends Error { constructor(m, code) { super(m); this.code = code || 'NETWORK'; this.transient = true; } }

  /** Sends one operation. Resolves with the server's result; throws NetErr (try again later) or ApiError (refused for good). */
  async function send(op) {
    const payload = withRealIds(op.payload);
    op.status = 'syncing';
    await opPut(op);
    emit();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), WRITE_TIMEOUT_MS);
    let res;
    try {
      res = await fetch('/api/offline/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${Session.token}` },
        body: JSON.stringify({ op_id: op.id, type: op.type, client_time: op.created_at, device_id: state.device, local_no: op.local_no, ref: op.ref, payload }),
        signal: ctl.signal,
      });
    } catch (_) {
      clearTimeout(timer);
      op.status = 'pending'; op.attempts += 1;
      await opPut(op); setOnline(false); emit();
      throw new NetErr('Cannot reach the server.');
    }
    clearTimeout(timer);
    setOnline(true);
    let json = null;
    try { json = await res.json(); } catch (_) { /* not JSON */ }

    if (res.ok && json && json.success) {
      op.status = 'done'; op.result = json.data; op.synced_at = new Date().toISOString(); op.error = null;
      const refs = (json.data && json.data.refs) || {};
      if (Object.keys(refs).length) { Object.assign(state.refmap, refs); await kvSet('refmap', state.refmap); }
      await opPut(op); emit();
      return json.data;
    }
    const message = (json && json.message) || 'The server could not save this.';
    if (res.status === 401) {
      op.status = 'pending'; await opPut(op);
      needsLogin = true; emit();
      throw new NetErr('Your sign-in has expired. Sign in again and this will be sent.', 'AUTH');
    }
    if (res.status === 408 || res.status === 429 || res.status >= 500) {
      op.status = 'pending'; op.attempts += 1; op.error = message;
      await opPut(op); emit();
      throw new NetErr(message, 'SERVER');
    }
    op.status = 'failed'; op.error = message; op.attempts += 1;
    await opPut(op); emit();
    throw new ApiError(message, res.status, json && json.code, json && json.details);
  }

  /**
   * Save an operation, and send it now if the server can be reached.
   *   -> { status: 'applied', result }   the server has it
   *   -> { status: 'queued' }            saved on this computer, will be sent when the connection is back
   * Throws ApiError when the server refuses it (not enough stock, price rule ...): then nothing is kept.
   */
  async function submit(type, payload, opts = {}) {
    const op = await enqueue(type, payload, opts);
    if (!conn.online || tmpRefsIn(op).length) return { status: 'queued', op };
    try {
      const result = await send(op);
      return { status: 'applied', op, result };
    } catch (err) {
      if (err instanceof NetErr) return { status: 'queued', op, reason: err.code };
      state.ops = state.ops.filter((o) => o.id !== op.id);
      await opDelete(op.id);
      emit();
      throw err;
    }
  }

  // ---------------------------------------------------------------- sending the queue
  async function syncAll(opts = {}) {
    if (syncing || (!conn.online && !opts.manual)) return;
    const run = async () => {
      if (!window.Session || !Session.active) return;
      syncing = true; needsLogin = false; emit();
      let sent = 0;
      try {
        // jobs with a refused step: later steps on the same job wait until someone decides about it
        const blocked = new Set(state.ops.filter((o) => o.status === 'failed' && mine(o)).flatMap(keysOf));
        for (const op of state.ops.filter((o) => (o.status === 'pending' || o.status === 'blocked') && mine(o)).sort((a, b) => a.seq - b.seq)) {
          const keys = keysOf(op);
          if (keys.some((k) => blocked.has(k))) {
            if (op.status === 'pending') { op.status = 'blocked'; op.error = 'Waiting for an earlier step on the same job that did not go through.'; await opPut(op); }
            continue;
          }
          if (op.status === 'blocked') continue; // only "Try again" releases a blocked item
          const missing = tmpRefsIn(op);
          if (missing.length) {
            const source = state.ops.find((o) => o.ref === missing[0]);
            if (source && (source.status === 'pending' || source.status === 'syncing')) { keys.forEach((k) => blocked.add(k)); continue; }
            op.status = 'blocked';
            op.error = source ? `The job ticket ${source.local_no || ''} did not go through, so this cannot be sent.` : 'The job ticket this refers to was removed.';
            await opPut(op); keys.forEach((k) => blocked.add(k));
            continue;
          }
          try { await send(op); sent += 1; }
          catch (err) {
            if (err instanceof NetErr) break;              // connection or sign-in problem: stop here, try again later
            keys.forEach((k) => blocked.add(k));            // refused for good: later steps on the same job wait for a decision
          }
        }
      } finally {
        syncing = false;
        await purgeOld();
        emit();
      }
      if (sent) bootstrap(true);
    };
    if (navigator.locks && navigator.locks.request) await navigator.locks.request('gf-sync', { ifAvailable: true }, (lock) => (lock ? run() : null));
    else await run();
  }

  async function purgeOld() {
    const cut = Date.now() - KEEP_DONE_MS;
    const old = state.ops.filter((o) => o.status === 'done' && new Date(o.synced_at || o.created_at).getTime() < cut);
    for (const o of old) await opDelete(o.id);
    if (old.length) state.ops = state.ops.filter((o) => !old.includes(o));
  }

  async function retry(id) {
    const op = state.ops.find((o) => o.id === id);
    if (!op || !['failed', 'blocked'].includes(op.status)) return;
    op.status = 'pending'; op.error = null;
    await opPut(op); emit();
    syncAll({ manual: true });
  }

  async function discard(id) {
    const op = state.ops.find((o) => o.id === id);
    if (!op || op.status === 'done' || op.status === 'syncing') return;
    state.ops = state.ops.filter((o) => o.id !== id);
    await opDelete(id);
    emit();
  }

  function counts() {
    const list = state.ops.filter(mine);
    return {
      waiting: list.filter((o) => o.status === 'pending' || o.status === 'syncing').length,
      attention: list.filter((o) => o.status === 'failed' || o.status === 'blocked').length,
      others: state.ops.filter((o) => !mine(o) && o.status !== 'done').length,
      done: list.filter((o) => o.status === 'done').length,
    };
  }

  // ================================================================ what the person sees
  const $ = (s) => document.querySelector(s);
  const fmtTime = (iso) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

  function paintShell() {
    const c = counts();
    const banner = $('#offline');
    if (banner) {
      banner.classList.toggle('gf-hidden', conn.online);
      const span = banner.querySelector('span');
      if (span) span.textContent = 'You are offline. Sales and job tickets are saved on this computer and sent when the connection is back. M-Pesa prompts need the internet: take cash or enter the M-Pesa code instead.';
    }
    const pill = $('#sync-pill');
    if (!pill) return;
    let cls = 'is-online', icon = 'bi-wifi', label = 'Online';
    if (!conn.online) { cls = 'is-offline'; icon = 'bi-wifi-off'; label = c.waiting ? `Offline · ${c.waiting} saved` : 'Offline'; }
    else if (c.attention) { cls = 'is-attention'; icon = 'bi-exclamation-triangle'; label = `${c.attention} need${c.attention === 1 ? 's' : ''} attention`; }
    else if (syncing) { cls = 'is-syncing'; icon = 'bi-arrow-repeat'; label = 'Sending…'; }
    else if (c.waiting) { cls = 'is-waiting'; icon = 'bi-cloud-upload'; label = `${c.waiting} waiting to send`; }
    else if (needsLogin) { cls = 'is-attention'; icon = 'bi-key'; label = 'Sign in again'; }
    pill.className = `sync-pill ${cls}`;
    pill.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span>${esc(label)}</span>`;
  }

  const TYPE_ICON = { sale: 'bi-receipt', 'mill.create': 'bi-ticket-perforated', 'mill.start': 'bi-play-fill', 'mill.complete': 'bi-speedometer2', 'mill.collect': 'bi-bag-check', 'mill.cancel': 'bi-x-circle' };
  const STATUS_TEXT = { pending: 'Saved here, not sent yet', syncing: 'Sending…', failed: 'Could not be saved', blocked: 'On hold', done: 'Sent' };

  function rowHtml(o) {
    const real = o.status === 'done' && o.result ? (o.result.sale_no || o.result.ticket_no || '') : '';
    const num2 = o.local_no ? `<span class="pill">${esc(o.local_no)}</span>${real ? `<span class="so-arrow">→</span><span class="pill green">${esc(real)}</span>` : ''}` : (real ? `<span class="pill green">${esc(real)}</span>` : '');
    const otherUser = !mine(o) && o.status !== 'done' ? `<div class="so-sub">Waiting for ${esc(o.user_name || 'its owner')} to sign in on this computer.</div>` : '';
    const buttons = mine(o) && (o.status === 'failed' || o.status === 'blocked')
      ? `<div class="so-actions"><button type="button" class="gf-btn gf-btn-ghost gf-btn-sm" data-retry="${o.id}">Try again</button><button type="button" class="gf-btn gf-btn-ghost gf-btn-sm" data-discard="${o.id}">Remove</button></div>`
      : '';
    return `<div class="so is-${o.status}">
      <div class="so-ico"><i class="bi ${TYPE_ICON[o.type] || 'bi-circle'}"></i></div>
      <div class="so-main">
        <div class="so-top"><strong>${esc((o.meta && o.meta.label) || o.type)}</strong>${num2}</div>
        <div class="so-sub">${esc(fmtTime(o.created_at))} · ${esc(o.user_name || '')} · ${esc(STATUS_TEXT[o.status] || o.status)}</div>
        ${o.error ? `<div class="so-err"><i class="bi bi-exclamation-circle"></i>${esc(o.error)}</div>` : ''}
        ${otherUser}${buttons}
      </div></div>`;
  }

  let center = null;
  function openCenter() {
    if (center && document.body.contains(center.m.el)) return;
    const m = UI.modal({
      title: 'Offline and sending', wide: true,
      body: '<div id="oc-body"></div>',
      foot: '<button class="gf-btn gf-btn-ghost" type="button" id="oc-backup"><i class="bi bi-download"></i>Download a copy</button><button class="gf-btn gf-btn-ghost" type="button" id="oc-check"><i class="bi bi-arrow-repeat"></i>Check connection</button><button class="gf-btn gf-btn-green" type="button" id="oc-sync"><i class="bi bi-cloud-upload"></i>Send now</button>',
    });
    center = { m };
    const paint = () => {
      if (!document.body.contains(m.el)) { listeners.delete(paint); return; }
      const body = m.el.querySelector('#oc-body');
      const c = counts();
      const list = state.ops.slice().sort((a, b) => b.seq - a.seq);
      const attention = list.filter((o) => o.status === 'failed' || o.status === 'blocked');
      const waiting = list.filter((o) => o.status === 'pending' || o.status === 'syncing');
      const sent = list.filter((o) => o.status === 'done').slice(0, 30);
      const stamp = state.ref && state.ref.fetched_at ? new Date(state.ref.fetched_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
      const section = (title, rows, empty) => `<h4 class="oc-h">${title}<span class="pill">${rows.length}</span></h4>${rows.length ? rows.map(rowHtml).join('') : `<div class="oc-empty">${empty}</div>`}`;
      body.innerHTML = `
        <div class="gf-note ${conn.online ? 'gf-note-green' : 'gf-note-red'}"><i class="bi ${conn.online ? 'bi-wifi' : 'bi-wifi-off'}"></i>
          <span>${conn.online ? 'Connected to the server.' : 'Cannot reach the server. You can keep selling and writing job tickets; everything is saved on this computer.'}
          ${stamp ? ` Prices, stock and customers on this computer were updated at ${esc(stamp)}.` : ' Prices and customers have not been downloaded to this computer yet.'}</span></div>
        ${needsLogin ? '<div class="gf-note gf-note-amber"><i class="bi bi-key"></i><span>Your sign-in has expired. Sign in again to send what is waiting. Nothing is lost.</span></div>' : ''}
        ${usingMemory ? '<div class="gf-note gf-note-red"><i class="bi bi-exclamation-triangle"></i><span>This browser is not letting GrainFlow save data on the computer (private window?). Offline items will be lost if you close the page. Use a normal window.</span></div>' : ''}
        ${c.others ? `<div class="gf-note gf-note-amber"><i class="bi bi-people"></i><span>${c.others} item${c.others === 1 ? ' is' : 's are'} from another user and will be sent when that user signs in.</span></div>` : ''}
        ${section('Needs attention', attention, 'Nothing needs attention.')}
        ${section('Waiting to be sent', waiting, 'Nothing is waiting.')}
        ${section('Sent in the last 7 days', sent, 'Nothing sent yet.')}`;
    };
    listeners.add(paint);
    paint();
    m.el.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-retry]');
      const d = e.target.closest('[data-discard]');
      if (r) { retry(r.dataset.retry); return; }
      if (d) {
        const op = state.ops.find((o) => o.id === d.dataset.discard);
        const what = op && op.type === 'sale' ? 'This sale will NOT be recorded on the server. Only remove it if it was already entered another way.' : 'This step will not be recorded on the server.';
        if (confirm(`Remove this item from the computer?\n\n${what}`)) discard(d.dataset.discard);
        return;
      }
      if (e.target.closest('#oc-sync')) { await probe(); syncAll({ manual: true }); }
      else if (e.target.closest('#oc-check')) { await probe(); UI.toast(conn.online ? 'Connected to the server' : 'Still cannot reach the server', conn.online ? 'ok' : 'error'); }
      else if (e.target.closest('#oc-backup')) downloadCopy();
    });
  }

  /** A readable copy of everything still on this computer (for safekeeping if something goes wrong). */
  function downloadCopy() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), device: state.device, user: me(), items: state.ops }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `grainflow-offline-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ================================================================ start-up
  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* needs https or localhost */ }); });
  }

  async function init() {
    if (started) return;
    started = true;
    await ready;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    window.addEventListener('online', () => probe());
    window.addEventListener('offline', () => setOnline(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) probe(); });
    const pill = $('#sync-pill');
    if (pill) pill.addEventListener('click', openCenter);

    paintShell();
    await probe();
    scheduleProbe();
    setInterval(() => { if (conn.online && counts().waiting) syncAll(); }, SYNC_EVERY_MS);
    setInterval(() => { if (conn.online) bootstrap(); }, 60 * 1000);
    if (conn.online) { await syncAll(); bootstrap(state.ref && state.ref.user_id === me() ? false : true); }
  }

  registerWorker();
  openDb().then(() => loadAll(true)).then(markReady, markReady);

  window.Offline = {
    init, submit, read, decorate, remember, bootstrap, syncAll, probe, retry, discard,
    isOnline, isOffline, looksOffline, counts, nextLocalNo, openCenter,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    markUp() { if (started && !conn.online) setOnline(true); },
    markDown() { if (started && conn.online) setOnline(false); },
    pendingCount() { return counts().waiting + counts().attention; },
    lastUpdated() { return state.ref && state.ref.fetched_at ? new Date(state.ref.fetched_at) : null; },
    business() { return (state.ref && state.ref.business) || null; },
    /** After sign-out: the downloaded prices and customers go, the saved sales stay until they are sent. */
    async onLogout() { state.ref = null; try { await kvSet('ref', null); } catch (_) { /* ignore */ } },
  };
})();
