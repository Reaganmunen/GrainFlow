/**
 * ONE place that decides who may do what, and in which business (module).
 *
 *   OWNER           both businesses + the owner dashboard + all admin (users, settings, activity log ...)
 *   MILL_MANAGER    posho mill only: tickets, charging, rates, machines, yield, stock, mill purchases, expenses
 *   MILLER          posho mill only: add tickets, run jobs, hand over, and CHARGE (till + payments)
 *   CEREAL_MANAGER  cereals only: everything cereal (selling, buying, prices, stock, expenses)
 *   CEREAL_CASHIER  cereals only: selling and taking payment. NEVER on the posho mill side.
 *
 * Old role codes keep working: CASHIER = CEREAL_CASHIER, MANAGER = a manager of whichever module(s) are ticked on the user.
 *
 * Roles listed here get EXACTLY the permissions written below (the role_permissions table is ignored for them),
 * and their modules are fixed by the role. A role that is not listed here keeps its table permissions, is limited
 * to the modules ticked on the user, and can never see a module it was not given.
 */
const MODULES = ['MILL', 'CEREAL'];

/** Stock pools that belong to each module. Customer grain waiting to be milled belongs to the mill. */
const POOLS = {
  MILL: ['MILL_STOCK', 'CUSTOMER_GRAIN'],
  CEREAL: ['CEREAL_STOCK'],
};
const POOL_MODULE = { MILL_STOCK: 'MILL', CUSTOMER_GRAIN: 'MILL', CEREAL_STOCK: 'CEREAL' };

// ---- permission building blocks ----
const COUNTER = [
  'customers.view', 'customers.create', 'customers.update',
  'sales.view', 'sales.create',
  'payments.view', 'payments.create',
  'stock.view',
];

const MANAGEMENT = [
  'sales.discount', 'sales.void', 'price.override',
  'payments.mpesa_manual', 'payments.reverse', 'credit.grant',
  'purchases.view', 'purchases.create', 'purchases.post',
  'suppliers.view', 'suppliers.create', 'suppliers.update',
  'stock.adjust', 'stock.take', 'stock.take_post',
  'prices.update', 'prices.min_price',
  'expenses.view', 'expenses.create', 'expenses.void',
  'daily_close.view', 'daily_close.perform',
  'reports.view', 'reports.profit',
  'deliveries.view', 'deliveries.manage',
];

const MILLER_PERMS = [...COUNTER, 'mill.view', 'mill.create', 'mill.update', 'mill.collect'];
const MILL_MANAGER_PERMS = [...MILLER_PERMS, ...MANAGEMENT, 'mill.cancel', 'mill.machines', 'mill.yield', 'rates.manage'];
const CEREAL_CASHIER_PERMS = [...COUNTER, 'deliveries.view', 'deliveries.manage'];
const CEREAL_MANAGER_PERMS = [...CEREAL_CASHIER_PERMS, ...MANAGEMENT];

/** Only the owner ever gets these (they reach across both businesses, or are administration). */
const OWNER_ONLY = [
  'dashboard.view',
  'users.view', 'users.create', 'users.update', 'users.reset_password', 'users.unlock',
  'roles.view', 'roles.manage',
  'settings.view', 'settings.manage', 'activity.view', 'backups.view',
  'catalogue.manage', 'expenses.manage', 'daily_close.reopen',
  'customers.opening_balance', 'suppliers.opening_balance',
  'stock.opening', 'stock.transfer',
];

const ROLES = {
  OWNER:          { label: 'Owner',          modules: MODULES,   owner: true },
  MILL_MANAGER:   { label: 'Mill manager',   modules: ['MILL'],   permissions: MILL_MANAGER_PERMS },
  MILLER:         { label: 'Miller',         modules: ['MILL'],   permissions: MILLER_PERMS },
  CEREAL_MANAGER: { label: 'Cereal manager', modules: ['CEREAL'], permissions: CEREAL_MANAGER_PERMS },
  CEREAL_CASHIER: { label: 'Cereal cashier', modules: ['CEREAL'], permissions: CEREAL_CASHIER_PERMS },
};

/** Old role codes -> what they now mean. */
const ALIASES = {
  CASHIER: 'CEREAL_CASHIER',
  MANAGER: 'LEGACY_MANAGER',
};
// a plain MANAGER: manager permissions, modules = whatever is ticked on the user
const LEGACY_MANAGER = {
  label: 'Manager', modules: null,
  permissions: [...new Set([...MILL_MANAGER_PERMS, ...CEREAL_MANAGER_PERMS])],
};

const canon = (code) => String(code || '').trim().toUpperCase();
const policyFor = (code) => {
  const c = canon(code);
  const key = ALIASES[c] || c;
  return key === 'LEGACY_MANAGER' ? LEGACY_MANAGER : ROLES[key] || null;
};

const onlyModules = (list) => [...new Set((list || []).map(canon))].filter((m) => MODULES.includes(m));
const poolsOf = (modules) => [...new Set(modules.flatMap((m) => POOLS[m] || []))];

/**
 * Turns a user's role + ticked modules + the role_permissions rows into what they may really do.
 * Returns { owner, modules, pools, permissions }. Always fails closed: no module = no module data.
 */
function resolveAccess({ role_code, allowed_modules }, dbPermissions = [], allPermissions = []) {
  const policy = policyFor(role_code);
  const ticked = onlyModules(allowed_modules);

  if (policy && policy.owner) {
    const permissions = [...new Set([...allPermissions, ...dbPermissions, 'sales.mill', 'sales.cereal'])].sort();
    return { owner: true, modules: [...MODULES], pools: poolsOf(MODULES), permissions };
  }

  let modules;
  let perms;
  if (policy) {
    modules = policy.modules ? policy.modules.filter((m) => ticked.includes(m)) : ticked;
    perms = [...policy.permissions];
  } else {
    // a role this file does not know: its table permissions, limited to the ticked modules
    modules = ticked;
    perms = [...dbPermissions];
  }

  if (policy) perms = perms.filter((p) => !OWNER_ONLY.includes(p)); // known roles can never hold owner-only permissions
  if (!modules.includes('MILL')) perms = perms.filter((p) => !/^mill\./.test(p) && p !== 'rates.manage');
  perms = perms.filter((p) => p !== 'sales.mill' && p !== 'sales.cereal');
  if (modules.includes('MILL')) perms.push('sales.mill');
  if (modules.includes('CEREAL')) perms.push('sales.cereal');
  if (!modules.length) perms = [];

  return { owner: false, modules, pools: poolsOf(modules), permissions: [...new Set(perms)].sort() };
}

/**
 * For creating/editing a user. Returns the modules to store, or { error } when the request breaks the role
 * (e.g. a cereal cashier asked to work in the posho mill).
 *   no modules asked for -> the role's own modules (OWNER: both; an unknown role / plain MANAGER: both)
 */
function checkModules(roleCode, requested) {
  const policy = policyFor(roleCode);
  const asked = onlyModules(requested);
  if (policy && policy.owner) return { modules: [...MODULES] };
  const fixed = policy && policy.modules;
  if (!asked.length) return { modules: fixed ? [...fixed] : [...MODULES] };
  const bad = fixed ? asked.filter((m) => !fixed.includes(m)) : [];
  if (bad.length) {
    return { error: `${policy.label} can only work in the ${fixed.map((m) => (m === 'MILL' ? 'posho mill' : 'cereal')).join(' and ')} module` };
  }
  return { modules: asked };
}

/** Is this one of the roles managed from this file (so its permissions cannot be edited in the table)? */
const isManagedRole = (code) => !!policyFor(code);

module.exports = {
  MODULES, POOLS, POOL_MODULE, ROLES, OWNER_ONLY,
  resolveAccess, checkModules, isManagedRole, poolsOf, onlyModules, canon,
};
