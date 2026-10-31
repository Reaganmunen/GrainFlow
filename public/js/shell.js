/**
 * App shell: module chooser, sidebar per space (mill / cereal / owner), top bar, hash router.
 * Screens register themselves with GF.page('mill/jobs', { title, render(el) }).
 * Anything not registered yet shows a "not built yet" card.
 */
(function () {
  if (!Session.active) { Session.clear(); location.replace('/login.html'); return; }

  const $ = (s) => document.querySelector(s);
  const { esc } = UI;

  const user = Session.user || {};
  const userName = user.full_name || user.name || user.username || 'User';
  const roleName = user.role_name || user.role_code || '';
  // UI only: the server checks every permission and every module on every request, this just hides what you cannot use.
  const isOwner = !!user.is_owner || String(user.role_code || '').toUpperCase() === 'OWNER';
  const modules = isOwner ? ['MILL', 'CEREAL'] : (Array.isArray(user.allowed_modules) ? user.allowed_modules : []);
  const can = (p) => isOwner || Session.can(p);
  const canAny = (perm) => !perm || [].concat(perm).some(can);
  const inModule = (m) => modules.includes(m);

  // ---------- navigation map ----------
  const item = (to, label, icon, perm) => ({ to, label, icon, perm });

  const SHARED_PEOPLE = { label: 'People', items: [
    item('shared/customers', 'Customers', 'bi-people', ['customers.view', 'sales.create', 'mill.create']),
    item('shared/suppliers', 'Suppliers', 'bi-person-lines-fill', 'suppliers.view'),
  ]};
  const SHARED_MONEY = { label: 'Money', items: [
    item('shared/payments', 'Payments', 'bi-wallet2', 'payments.view'),
    item('shared/expenses', 'Expenses', 'bi-cash-stack', 'expenses.view'),
    item('shared/daily-close', 'Daily close', 'bi-journal-check', 'daily_close.view'),
  ]};
  const ADMIN = { label: 'Admin', items: [
    item('shared/users', 'Users and roles', 'bi-shield-check', 'users.view'),
    item('shared/activity', 'Activity log', 'bi-clock-history', 'activity.view'),
    item('shared/settings', 'Settings', 'bi-gear', 'settings.view'),
  ]};

  const SPACES = {
    mill: {
      module: 'MILL',
      label: 'Posho mill', short: 'Mill', icon: 'bi-gear-wide-connected', dot: 'var(--mill)',
      blurb: 'Job tickets, flour and bran sales, and the yield check on every job.',
      start: '#/mill/jobs', access: ['mill.view', 'sales.create'],
      groups: [
        { label: 'Operations', items: [
          item('mill/jobs', 'Job board', 'bi-columns-gap', 'mill.view'),
          item('mill/till', 'Mill till', 'bi-calculator', 'sales.create'),
          item('mill/sales', 'Sales', 'bi-receipt', 'sales.view'),
        ]},
        { label: 'Mill', items: [
          item('mill/yield', 'Yield alerts', 'bi-exclamation-triangle', 'mill.yield'),
          item('mill/machines', 'Machines and power', 'bi-lightning-charge', 'mill.view'),
          item('mill/rates', 'Milling rates', 'bi-tag', 'mill.view'),
          item('mill/stock', 'Mill stock', 'bi-boxes', 'stock.view'),
          item('mill/catalogue', 'Products', 'bi-box-seam', ['catalogue.items', 'catalogue.manage']),
        ]},
        SHARED_PEOPLE, SHARED_MONEY, ADMIN,
      ],
    },
    cereal: {
      module: 'CEREAL',
      label: 'Cereals', short: 'Cereals', icon: 'bi-basket', dot: 'var(--green)',
      blurb: 'Buying, stock, price lists and sales by the bag or by the kilo.',
      start: '#/cereal/till', access: ['sales.create', 'purchases.view'],
      groups: [
        { label: 'Operations', items: [
          item('cereal/till', 'Cereal till', 'bi-calculator', 'sales.create'),
          item('cereal/sales', 'Sales', 'bi-receipt', 'sales.view'),
          item('cereal/deliveries', 'Deliveries', 'bi-truck', 'deliveries.view'),
        ]},
        { label: 'Stock and buying', items: [
          item('cereal/stock', 'Stock', 'bi-boxes', 'stock.view'),
          item('cereal/catalogue', 'Products', 'bi-box-seam', ['catalogue.items', 'catalogue.manage']),
          item('cereal/purchases', 'Purchases', 'bi-cart-plus', 'purchases.view'),
          item('cereal/adjustments', 'Losses and stock takes', 'bi-clipboard-data', 'stock.view'),
          item('shared/transfers', 'Mill transfers', 'bi-arrow-left-right', 'stock.transfer'),
        ]},
        { label: 'Prices and margin', items: [
          item('cereal/prices', 'Price list', 'bi-tags', 'purchases.view'),
          item('cereal/min-prices', 'Minimum prices', 'bi-shield-lock', 'prices.min_price'),
          item('cereal/margin', 'Margin per grain', 'bi-percent', 'reports.profit'),
        ]},
        SHARED_PEOPLE, SHARED_MONEY, ADMIN,
      ],
    },
    owner: {
      ownerOnly: true,
      label: 'Owner dashboard', short: 'Owner', icon: 'bi-graph-up-arrow', dot: 'var(--dark)',
      blurb: 'Sales, cash against M-Pesa, stock and credit for both modules.',
      start: '#/owner/dashboard', access: ['dashboard.view'],
      groups: [
        { label: 'Overview', items: [item('owner/dashboard', 'Dashboard', 'bi-speedometer2', 'dashboard.view')] },
        { label: 'Reports', items: [
          item('owner/sales', 'Sales', 'bi-bar-chart', 'reports.view'),
          item('owner/profit', 'Profit and margin', 'bi-percent', 'reports.profit'),
          item('owner/customer-balances', 'Customer balances', 'bi-people', 'reports.view'),
          item('owner/credit-overdue', 'Credit overdue', 'bi-hourglass-split', 'reports.view'),
          item('owner/supplier-balances', 'Supplier balances', 'bi-person-lines-fill', 'reports.view'),
          item('owner/stock-value', 'Stock value', 'bi-boxes', 'reports.profit'),
        ]},
        ADMIN,
      ],
    },
  };

  // a space is open only to someone who works in that module (the owner works in both and also gets the owner dashboard)
  const spaceOpen = (sp) => (sp.ownerOnly ? isOwner : inModule(sp.module)) && canAny(sp.access);
  const available = () => Object.keys(SPACES).filter((k) => spaceOpen(SPACES[k]));
  const lastSpace = () => {
    const s = localStorage.getItem('gf_space');
    const list = available();
    return list.includes(s) ? s : list[0] || 'cereal';
  };

  // all nav items, for page titles
  const titles = {};
  Object.values(SPACES).forEach((sp) => sp.groups.forEach((g) => g.items.forEach((i) => { titles[i.to] = i; })));

  // ---------- public API for screens ----------
  const pages = {};
  window.GF = {
    page(path, def) { pages[path] = def; },
    setActions(html) { $('#page-actions').innerHTML = html || ''; },
    can, user, isOwner, modules, inModule, get space() { return document.body.dataset.space; },
  };

  // ---------- chrome ----------
  const win = $('#window'), view = $('#view'), sidebar = $('#sidebar');

  function renderUser() {
    $('#user-avatar').textContent = UI.initials(userName);
    $('#user-avatar').style.background = UI.avatarColor(userName);
    $('#user-name').textContent = userName.split(' ')[0];
    $('#menu-name').textContent = userName;
    $('#menu-role').textContent = roleName;
  }

  function renderSidebar(space, activePath) {
    const list = available();
    const seg = list.length > 1
      ? `<nav class="seg" aria-label="Switch module">${list.map((k) =>
          `<a href="${SPACES[k].start}" class="${k === space ? 'on' : ''}"><span class="dot" style="background:${SPACES[k].dot}"></span>${SPACES[k].short}</a>`).join('')}</nav>`
      : '';

    const groups = SPACES[space].groups.map((g) => {
      const links = g.items.filter((i) => canAny(i.perm)).map((i) =>
        `<a class="nav-link ${i.to === activePath ? 'active' : ''}" href="#/${i.to}"><i class="bi ${i.icon}"></i><span>${esc(i.label)}</span></a>`).join('');
      return links ? `<div class="nav-label">${esc(g.label)}</div>${links}` : '';
    }).join('');

    sidebar.innerHTML = `
      <div class="gf-brand"><div class="gf-logo">${$('#logo-svg').innerHTML}</div><span class="gf-wordmark">GrainFlow</span></div>
      ${seg}${groups}`;
  }

  function setSpace(space) {
    document.body.dataset.space = space;
    localStorage.setItem('gf_space', space);
  }

  // ---------- screens ----------
  function renderHome(list) {
    win.classList.add('is-home');
    document.body.dataset.space = '';
    document.title = 'GrainFlow';
    GF.setActions('');
    if (!list.length) {
      view.innerHTML = `<div class="home"><div class="empty-card"><div class="tile"><i class="bi bi-lock"></i></div>
        <h2>No modules assigned yet</h2><p>Your account is not allowed into the mill or the cereal side. Ask the owner to give your role access.</p></div></div>`;
      return;
    }
    const cards = list.map((k) => {
      const s = SPACES[k];
      return `<a class="space-card" href="${s.start}">
        <div class="tile ${k === 'owner' ? '' : k}"><i class="bi ${s.icon}"></i></div>
        <div><h2>${esc(s.label)}</h2><p>${esc(s.blurb)}</p></div>
        <span class="go"><i class="bi bi-chevron-right"></i></span></a>`;
    }).join('');
    view.innerHTML = `<div class="home">
      <h1>${UI.greeting()}, ${esc(userName.split(' ')[0])}</h1>
      <p class="lead">Where are you working today?</p>
      <div class="space-grid">${cards}</div></div>`;
  }

  function renderPlaceholder(path, title) {
    view.innerHTML = `<div class="empty-card"><div class="tile"><i class="bi bi-hammer"></i></div>
      <h2>${esc(title)} is not built yet</h2><p>This screen is coming in a later step. The menu and permissions around it already work.</p></div>`;
  }

  function route() {
    win.classList.remove('drawer-open');
    const path = location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
    const list = available();

    if (!path) {
      if (list.length === 1) { location.replace(SPACES[list[0]].start); return; }
      renderHome(list);
      return;
    }

    win.classList.remove('is-home');
    const seg0 = path.split('/')[0];
    const space = SPACES[seg0] ? seg0 : lastSpace(); // shared screens keep the current space
    setSpace(space);
    renderSidebar(space, path);

    const nav = titles[path];
    const page = pages[path];
    const title = (page && page.title) || (nav && nav.label) || 'Not found';
    $('#page-title').textContent = title;
    document.title = `${title} | GrainFlow`;
    GF.setActions('');
    view.scrollTop = 0;

    if (SPACES[seg0] && !list.includes(seg0)) {
      view.innerHTML = `<div class="empty-card"><div class="tile"><i class="bi bi-lock"></i></div><h2>You do not have access here</h2><p>Ask the owner to give your role access to this module.</p></div>`;
    } else if (nav && !canAny(nav.perm)) {
      view.innerHTML = `<div class="empty-card"><div class="tile"><i class="bi bi-lock"></i></div><h2>You do not have access to this screen</h2><p>Ask the owner if you need it.</p></div>`;
    } else if (page) {
      view.innerHTML = '';
      page.render(view);
    } else if (nav) {
      renderPlaceholder(path, title);
    } else {
      view.innerHTML = `<div class="empty-card"><div class="tile"><i class="bi bi-question-lg"></i></div><h2>Screen not found</h2><p>Pick something from the menu.</p></div>`;
    }
  }

  // ---------- behaviour ----------
  $('#menu-btn').addEventListener('click', () => win.classList.add('drawer-open'));
  $('#scrim').addEventListener('click', () => win.classList.remove('drawer-open'));

  const menu = $('#user-dropdown'), menuBtn = $('#user-btn');
  const closeMenu = () => { menu.classList.add('gf-hidden'); menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle('gf-hidden') === false;
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); win.classList.remove('drawer-open'); } });

  $('#logout-btn').addEventListener('click', async () => {
    try { await Api.post('/auth/logout'); } catch (e) { /* sign out locally anyway */ }
    Session.clear();
    location.replace('/login.html');
  });

  const offline = $('#offline');
  const syncOnline = () => offline.classList.toggle('gf-hidden', navigator.onLine);
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();

  window.addEventListener('hashchange', route);
  renderUser();

  // pick up a changed role / module (the server already applies it on every request): refresh the saved copy and reload once
  Api.get('/auth/me', { handle401: true }).then((fresh) => {
    if (!fresh) return;
    const mine = (u) => JSON.stringify([u.role_code, u.is_owner, [...(u.allowed_modules || [])].sort(), [...(u.permissions || [])].sort()]);
    if (mine(fresh) !== mine(user)) { localStorage.setItem('gf_user', JSON.stringify(fresh)); location.reload(); }
  }).catch(() => { /* offline: keep what we have */ });
  // page scripts load after this file, so route once they have all registered
  if (document.readyState === 'complete') route(); else window.addEventListener('load', route);
})();