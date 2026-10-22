/* =====================================================================
   POSHO MILL & CEREALS MANAGEMENT SYSTEM  -  PostgreSQL schema
   Prepared for: Fred            Target: PostgreSQL 13+ (pgAdmin 4)
   ---------------------------------------------------------------------
   HOW TO RUN
     1. In pgAdmin create an empty database, e.g.  posho_cereals
     2. Open Query Tool on that database, paste / open this file, press F5.
     3. Everything is created inside the schema  pmc  (one transaction:
        if anything fails nothing is created).
     4. Set the owner's password right after (see the SEED section).
   To rebuild from scratch:  DROP SCHEMA pmc CASCADE;  then run again.

   CONTENTS
     1  Types (enums)               8  Mill module (jobs, yield, machines)
     2  Helper functions            9  Sales, payments, M-Pesa, receipts
     3  Security, settings, audit  10  Expenses, transfers, daily close
     4  Customers & suppliers      11  Business-logic functions
     5  Catalogue, units, prices   12  Triggers
     6  Stock (ledger + balances)  13  Reporting / dashboard views
     7  Purchases                  14  Seed data
   ---------------------------------------------------------------------
   KEY DESIGN IDEAS
     * Stock is always held in KILOGRAMS. Bags / tins / packets convert
       through item_units, so opening a bag reduces stock correctly.
     * Three stock "pools": MILL_STOCK, CEREAL_STOCK and CUSTOMER_GRAIN.
       Customer grain is never mixed with the mill's own stock.
     * stock_movements is an append-only ledger; stock_balances is kept
       in step automatically (weighted-average cost).
     * Customers and suppliers have ledgers (balance = sum of entries).
     * Posting functions (fn_post_sale, fn_post_purchase, ...) do the
       multi-table work atomically. The Node.js app should call them.
     * The app should call  SELECT fn_set_app_user(<user_id>, '<ip>');
       at the start of each transaction so the activity log knows who
       did what.
   ===================================================================== */

SET client_min_messages = warning;

-- DROP SCHEMA IF EXISTS pmc CASCADE;     -- <- uncomment ONLY to rebuild

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE SCHEMA IF NOT EXISTS pmc;
SET search_path = pmc, public;

BEGIN;

/* =====================================================================
   1. TYPES
   ===================================================================== */
CREATE TYPE module_code        AS ENUM ('MILL','CEREAL','SHARED');
CREATE TYPE stock_pool         AS ENUM ('MILL_STOCK','CEREAL_STOCK','CUSTOMER_GRAIN');
CREATE TYPE item_kind          AS ENUM ('GRAIN','FLOUR','BRAN','PACKAGING','OTHER');
CREATE TYPE stock_movement_type AS ENUM (
    'OPENING_BALANCE','PURCHASE','SALE','SALE_VOID',
    'MILL_INPUT','MILL_OUTPUT','CUSTOMER_GRAIN_IN','CUSTOMER_GRAIN_OUT',
    'TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','SUPPLIER_RETURN','CUSTOMER_RETURN');
CREATE TYPE adjustment_reason  AS ENUM (
    'WEIGHT_LOSS','MOISTURE','PESTS','SPOILAGE','DAMAGE','SPILLAGE',
    'THEFT_SUSPECTED','COUNT_CORRECTION','OTHER');
CREATE TYPE customer_type      AS ENUM ('INDIVIDUAL','KIOSK','HOTEL','SCHOOL','INSTITUTION','OTHER');
CREATE TYPE sale_channel       AS ENUM ('RETAIL','WHOLESALE','MILLING');
CREATE TYPE sale_status        AS ENUM ('DRAFT','POSTED','VOIDED');
CREATE TYPE payment_status     AS ENUM ('UNPAID','PARTIAL','PAID');
CREATE TYPE payment_method     AS ENUM ('CASH','MPESA_STK','MPESA_MANUAL','BANK','OTHER');
CREATE TYPE payment_state      AS ENUM ('PENDING','CONFIRMED','FAILED','CANCELLED','REVERSED');
CREATE TYPE stk_status         AS ENUM ('INITIATED','SENT','SUCCESS','FAILED','CANCELLED','TIMEOUT');
CREATE TYPE job_type           AS ENUM ('CUSTOMER','OWN');
CREATE TYPE job_status         AS ENUM ('WAITING','MILLING','READY','COLLECTED','CANCELLED');
CREATE TYPE rate_basis         AS ENUM ('PER_KG','PER_TIN');
CREATE TYPE ledger_entry_type  AS ENUM ('OPENING_BALANCE','SALE','PURCHASE','PAYMENT','VOID','ADJUSTMENT','REFUND');
CREATE TYPE delivery_status    AS ENUM ('PENDING','DISPATCHED','DELIVERED','CANCELLED');
CREATE TYPE receipt_style      AS ENUM ('PRINT','WHATSAPP','BOTH');
CREATE TYPE delivery_channel   AS ENUM ('PRINT','WHATSAPP','SMS');
CREATE TYPE message_status     AS ENUM ('QUEUED','SENT','DELIVERED','FAILED');
CREATE TYPE doc_status         AS ENUM ('DRAFT','POSTED','VOIDED');
CREATE TYPE close_status       AS ENUM ('OPEN','CLOSED');

/* =====================================================================
   2. HELPER OBJECTS
   ===================================================================== */
CREATE FUNCTION fn_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE FUNCTION fn_block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % is not allowed. Post a correcting entry instead.',
        TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END $$;

-- Kenyan numbers -> 2547XXXXXXXX / 2541XXXXXXXX (what Daraja expects)
CREATE FUNCTION fn_normalize_phone(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p IS NULL THEN NULL
        WHEN regexp_replace(p,'[^0-9]','','g') ~ '^0[17][0-9]{8}$'
            THEN '254' || substr(regexp_replace(p,'[^0-9]','','g'),2)
        WHEN regexp_replace(p,'[^0-9]','','g') ~ '^\+?254[17][0-9]{8}$'
            THEN regexp_replace(p,'[^0-9]','','g')
        WHEN regexp_replace(p,'[^0-9]','','g') ~ '^[17][0-9]{8}$'
            THEN '254' || regexp_replace(p,'[^0-9]','','g')
        ELSE p
    END
$$;

-- Business "today" in Nairobi time
CREATE FUNCTION fn_local_date(ts timestamptz) RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (ts AT TIME ZONE 'Africa/Nairobi')::date $$;

-- Document numbering: SALE-2610-0001 (type - yymm - running number)
CREATE TABLE doc_counters (
    doc_type   text    NOT NULL,
    period     text    NOT NULL,
    last_value integer NOT NULL DEFAULT 0,
    PRIMARY KEY (doc_type, period)
);

CREATE FUNCTION next_doc_no(p_type text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    v_period text := to_char(now() AT TIME ZONE 'Africa/Nairobi','YYMM');
    v_val    integer;
BEGIN
    INSERT INTO doc_counters AS d (doc_type, period, last_value)
    VALUES (p_type, v_period, 1)
    ON CONFLICT (doc_type, period)
    DO UPDATE SET last_value = d.last_value + 1
    RETURNING last_value INTO v_val;
    RETURN p_type || '-' || v_period || '-' || lpad(v_val::text, 4, '0');
END $$;

CREATE SEQUENCE seq_customer_code START 1;
CREATE SEQUENCE seq_supplier_code START 1;

/* =====================================================================
   3. SECURITY, SETTINGS, AUDIT
   ===================================================================== */
CREATE TABLE business_profile (
    id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- single row
    business_name         text NOT NULL,
    owner_name            text,
    phone                 text,
    email                 text,
    address               text,
    kra_pin               text,
    mpesa_till_number     text,
    currency_code         char(3) NOT NULL DEFAULT 'KES',
    timezone              text    NOT NULL DEFAULT 'Africa/Nairobi',
    default_receipt_style receipt_style NOT NULL DEFAULT 'BOTH',
    receipt_header        text,
    receipt_footer        text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    description text,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Non-secret Daraja settings. Keep consumer key/secret/passkey in the
-- app's environment variables, NOT in this table.
CREATE TABLE mpesa_config (
    id               smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    environment      text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
    business_shortcode text,                 -- store / head-office number used by Daraja
    till_number      text,                   -- the Till the customer pays to
    transaction_type text NOT NULL DEFAULT 'CustomerBuyGoodsOnline'
                     CHECK (transaction_type IN ('CustomerBuyGoodsOnline','CustomerPayBillOnline')),
    callback_url     text,
    is_active        boolean NOT NULL DEFAULT false,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text NOT NULL UNIQUE,
    name        text NOT NULL,
    description text,
    is_system   boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text NOT NULL UNIQUE,
    description text
);

CREATE TABLE role_permissions (
    role_id       bigint NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id bigint NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username             text NOT NULL,
    full_name            text NOT NULL,
    email                text,
    phone                text,
    password_hash        text NOT NULL,          -- bcrypt via pgcrypto crypt()/gen_salt('bf')
    role_id              bigint NOT NULL REFERENCES roles(id),
    allowed_modules      module_code[] NOT NULL DEFAULT ARRAY['MILL','CEREAL']::module_code[],
    is_active            boolean NOT NULL DEFAULT true,
    must_change_password boolean NOT NULL DEFAULT true,
    failed_login_count   integer NOT NULL DEFAULT 0,
    locked_until         timestamptz,
    last_login_at        timestamptz,
    password_changed_at  timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_users_username ON users (lower(username));

CREATE TABLE user_sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  text NOT NULL,
    ip_address  text,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz
);
CREATE INDEX ix_sessions_user ON user_sessions (user_id);
CREATE UNIQUE INDEX ux_sessions_token ON user_sessions (token_hash);

-- Who changed what: price changes, adjustments, voided sales, user changes ...
CREATE TABLE activity_log (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at  timestamptz NOT NULL DEFAULT now(),
    user_id      bigint REFERENCES users(id),
    category     text NOT NULL,        -- PRICE, ADJUSTMENT, SALE_STATUS, SECURITY, MASTER_DATA, FINANCE, LOGIN
    action       text NOT NULL,        -- INSERT / UPDATE / DELETE / custom
    entity_table text,
    entity_id    text,
    old_data     jsonb,
    new_data     jsonb,
    ip_address   text,
    note         text
);
CREATE INDEX ix_activity_time     ON activity_log (occurred_at DESC);
CREATE INDEX ix_activity_user     ON activity_log (user_id, occurred_at DESC);
CREATE INDEX ix_activity_category ON activity_log (category, occurred_at DESC);
CREATE INDEX ix_activity_entity   ON activity_log (entity_table, entity_id);

-- Daily backup records (written by the backup job)
CREATE TABLE backup_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    status      text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCESS','FAILED')),
    file_name   text,
    location    text,
    size_bytes  bigint,
    error_text  text
);

-- ---- helpers that read the tables above -----------------------------
CREATE FUNCTION fn_setting_bool(p_key text, p_default boolean) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT (value #>> '{}')::boolean FROM app_settings WHERE key = p_key), p_default)
$$;

CREATE FUNCTION fn_setting_num(p_key text, p_default numeric) RETURNS numeric
LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT (value #>> '{}')::numeric FROM app_settings WHERE key = p_key), p_default)
$$;

CREATE FUNCTION fn_user_has_permission(p_user bigint, p_perm text) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM users u
        JOIN role_permissions rp ON rp.role_id = u.role_id
        JOIN permissions p       ON p.id = rp.permission_id
        WHERE u.id = p_user AND u.is_active AND p.code = p_perm)
$$;

-- Call at the start of every app transaction so the audit trigger knows the user.
CREATE FUNCTION fn_set_app_user(p_user bigint, p_ip text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.user_id', coalesce(p_user::text,''), true);
    PERFORM set_config('app.ip',      coalesce(p_ip,''), true);
END $$;

-- Generic audit trigger. Usage: EXECUTE FUNCTION fn_audit('CATEGORY')
CREATE FUNCTION fn_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_user bigint; v_old jsonb; v_new jsonb; v_id text;
BEGIN
    BEGIN
        v_user := nullif(current_setting('app.user_id', true), '')::bigint;
    EXCEPTION WHEN others THEN
        v_user := NULL;
    END;
    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD); v_id := v_old->>'id';
    ELSIF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW); v_id := v_new->>'id';
    ELSE
        v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_id := v_new->>'id';
        IF v_old = v_new THEN RETURN NULL; END IF;
    END IF;
    v_old := v_old - 'password_hash';
    v_new := v_new - 'password_hash';
    INSERT INTO activity_log (user_id, category, action, entity_table, entity_id, old_data, new_data, ip_address)
    VALUES (v_user, coalesce(TG_ARGV[0],'GENERAL'), TG_OP, TG_TABLE_NAME, v_id, v_old, v_new,
            nullif(current_setting('app.ip', true), ''));
    RETURN NULL;
END $$;

/* =====================================================================
   4. CUSTOMERS & SUPPLIERS
   ===================================================================== */
CREATE TABLE customers (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_code text NOT NULL UNIQUE DEFAULT ('C' || lpad(nextval('seq_customer_code')::text, 5, '0')),
    full_name     text NOT NULL,
    business_name text,
    customer_type customer_type NOT NULL DEFAULT 'INDIVIDUAL',
    phone         text CHECK (phone IS NULL OR phone ~ '^254[17][0-9]{8}$'),
    alt_phone     text,
    email         text,
    address       text,
    credit_allowed boolean NOT NULL DEFAULT false,
    credit_limit   numeric(14,2) CHECK (credit_limit IS NULL OR credit_limit >= 0),  -- NULL = no limit
    credit_days    integer NOT NULL DEFAULT 7 CHECK (credit_days >= 0),
    notes         text,
    is_active     boolean NOT NULL DEFAULT true,
    created_by    bigint REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_customers_phone ON customers (phone) WHERE phone IS NOT NULL;
CREATE INDEX ix_customers_name ON customers (lower(full_name));

-- One ledger for ALL modules: balance = SUM(debit) - SUM(credit); positive = customer owes us
CREATE TABLE customer_ledger (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id bigint NOT NULL REFERENCES customers(id),
    entry_date  timestamptz NOT NULL DEFAULT now(),
    entry_type  ledger_entry_type NOT NULL,
    debit       numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
    credit      numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    sale_id     bigint,      -- FK added after sales exist
    payment_id  bigint,      -- FK added after payments exist
    description text,
    created_by  bigint REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX ix_cledger_customer ON customer_ledger (customer_id, entry_date);

CREATE TABLE suppliers (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_code text NOT NULL UNIQUE DEFAULT ('S' || lpad(nextval('seq_supplier_code')::text, 4, '0')),
    name          text NOT NULL,
    contact_person text,
    phone         text,
    email         text,
    address       text,
    payment_terms_days integer NOT NULL DEFAULT 0,
    notes         text,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- balance owed to supplier = SUM(credit) - SUM(debit)
CREATE TABLE supplier_ledger (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id bigint NOT NULL REFERENCES suppliers(id),
    entry_date  timestamptz NOT NULL DEFAULT now(),
    entry_type  ledger_entry_type NOT NULL,
    debit       numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),   -- we paid / returned
    credit      numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),   -- we owe more
    purchase_id bigint,
    supplier_payment_id bigint,
    description text,
    created_by  bigint REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX ix_sledger_supplier ON supplier_ledger (supplier_id, entry_date);

/* =====================================================================
   5. CATALOGUE, UNITS, PRICES, MILLING RATES, YIELD STANDARDS
   ===================================================================== */
CREATE TABLE units (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text NOT NULL UNIQUE,
    name        text NOT NULL,
    kg_per_unit numeric(12,4) CHECK (kg_per_unit > 0),  -- NULL = depends on item (see item_units, e.g. TIN)
    is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE grains (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        text NOT NULL UNIQUE,
    name        text NOT NULL,
    category    text NOT NULL DEFAULT 'CEREAL' CHECK (category IN ('CEREAL','PULSE','OTHER')),
    is_millable boolean NOT NULL DEFAULT false,
    is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE grades (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       text NOT NULL UNIQUE,
    name       text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE items (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku              text NOT NULL UNIQUE,
    name             text NOT NULL UNIQUE,
    kind             item_kind NOT NULL,
    grain_id         bigint REFERENCES grains(id),
    grade_id         bigint REFERENCES grades(id),
    owner_module     module_code NOT NULL DEFAULT 'CEREAL',
    is_millable      boolean NOT NULL DEFAULT false,
    track_stock      boolean NOT NULL DEFAULT true,
    reorder_level_kg numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level_kg >= 0),
    description      text,
    is_active        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_items_grain ON items (grain_id);
CREATE INDEX ix_items_kind  ON items (kind);

-- How many kg is 1 unit of this item (bag, tin, packet). KG row is added automatically.
CREATE TABLE item_units (
    item_id         bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    unit_id         bigint NOT NULL REFERENCES units(id),
    kg_per_unit     numeric(12,4) NOT NULL CHECK (kg_per_unit > 0),
    is_sellable     boolean NOT NULL DEFAULT true,
    is_purchasable  boolean NOT NULL DEFAULT true,
    PRIMARY KEY (item_id, unit_id)
);

CREATE FUNCTION fn_kg_per_unit(p_item bigint, p_unit bigint) RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE v numeric;
BEGIN
    SELECT iu.kg_per_unit INTO v FROM item_units iu WHERE iu.item_id = p_item AND iu.unit_id = p_unit;
    IF v IS NULL THEN
        SELECT u.kg_per_unit INTO v FROM units u WHERE u.id = p_unit;
    END IF;
    IF v IS NULL THEN
        RAISE EXCEPTION 'No kg conversion defined for item % and unit % (add a row in item_units)', p_item, p_unit;
    END IF;
    RETURN v;
END $$;

CREATE TABLE price_tiers (
    id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL
);

-- Price history: the row with effective_to IS NULL is the current price.
CREATE TABLE item_prices (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id        bigint NOT NULL REFERENCES items(id),
    tier_id        bigint NOT NULL REFERENCES price_tiers(id),
    unit_id        bigint NOT NULL REFERENCES units(id),
    price          numeric(14,2) NOT NULL CHECK (price >= 0),
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_to   timestamptz,
    set_by         bigint REFERENCES users(id)
);
CREATE UNIQUE INDEX ux_item_prices_current ON item_prices (item_id, tier_id, unit_id) WHERE effective_to IS NULL;
CREATE INDEX ix_item_prices_item ON item_prices (item_id, tier_id);

-- Lowest price per kg a cashier may charge without a manager override
CREATE TABLE item_min_prices (
    item_id          bigint PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    min_price_per_kg numeric(14,4) NOT NULL CHECK (min_price_per_kg >= 0),
    updated_by       bigint REFERENCES users(id),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Mill rate list: base per-kg / per-tin rate per grain, plus blends & special requests
CREATE TABLE milling_rates (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grain_item_id bigint REFERENCES items(id),      -- NULL = applies to any grain
    rate_type     text NOT NULL DEFAULT 'BASE' CHECK (rate_type IN ('BASE','BLEND','SPECIAL')),
    name          text NOT NULL,
    rate_basis    rate_basis NOT NULL DEFAULT 'PER_KG',
    rate          numeric(12,2) NOT NULL CHECK (rate >= 0),
    effective_from date NOT NULL DEFAULT current_date,
    effective_to   date,
    is_active     boolean NOT NULL DEFAULT true,
    created_by    bigint REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_milling_rates_grain ON milling_rates (grain_item_id, rate_type);

-- Expected flour/bran per 100 kg of grain; alert when a job falls below the floor
CREATE TABLE yield_standards (
    id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grain_item_id             bigint NOT NULL REFERENCES items(id),
    flour_item_id             bigint REFERENCES items(id),
    bran_item_id              bigint REFERENCES items(id),
    expected_flour_kg_per_100 numeric(6,2) NOT NULL CHECK (expected_flour_kg_per_100 BETWEEN 1 AND 100),
    expected_bran_kg_per_100  numeric(6,2) NOT NULL DEFAULT 0 CHECK (expected_bran_kg_per_100 >= 0),
    alert_below_kg_per_100    numeric(6,2) NOT NULL,   -- flour per 100 kg below this => alert
    effective_from            date NOT NULL DEFAULT current_date,
    notes                     text,
    created_by                bigint REFERENCES users(id),
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (grain_item_id, effective_from),
    CHECK (alert_below_kg_per_100 <= expected_flour_kg_per_100)
);

/* =====================================================================
   6. STOCK
   ===================================================================== */
CREATE TABLE stock_balances (
    item_id         bigint NOT NULL REFERENCES items(id),
    pool            stock_pool NOT NULL,
    quantity_kg     numeric(16,3) NOT NULL DEFAULT 0,
    avg_cost_per_kg numeric(14,4) NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, pool)
);

-- Append-only ledger. quantity_kg is signed (+in / -out).
CREATE TABLE stock_movements (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    movement_date   timestamptz NOT NULL DEFAULT now(),
    item_id         bigint NOT NULL REFERENCES items(id),
    pool            stock_pool NOT NULL,
    movement_type   stock_movement_type NOT NULL,
    quantity_kg     numeric(16,3) NOT NULL CHECK (quantity_kg <> 0),
    unit_cost_per_kg numeric(14,4),          -- filled automatically if NULL
    balance_after_kg numeric(16,3),          -- filled automatically
    customer_id     bigint REFERENCES customers(id),   -- for CUSTOMER_GRAIN movements
    ref_table       text,
    ref_id          bigint,
    note            text,
    created_by      bigint REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_stockmov_item   ON stock_movements (item_id, pool, movement_date);
CREATE INDEX ix_stockmov_ref    ON stock_movements (ref_table, ref_id);
CREATE INDEX ix_stockmov_type   ON stock_movements (movement_type, movement_date);

CREATE TABLE stock_adjustments (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    adjustment_no      text NOT NULL UNIQUE DEFAULT next_doc_no('ADJ'),
    adjustment_date    timestamptz NOT NULL DEFAULT now(),
    item_id            bigint NOT NULL REFERENCES items(id),
    pool               stock_pool NOT NULL,
    reason             adjustment_reason NOT NULL,
    quantity_kg_change numeric(16,3) NOT NULL CHECK (quantity_kg_change <> 0),   -- negative = loss
    unit_cost_per_kg   numeric(14,4),
    value_change       numeric(16,2) GENERATED ALWAYS AS (round(quantity_kg_change * coalesce(unit_cost_per_kg,0), 2)) STORED,
    note               text,
    approved_by        bigint REFERENCES users(id),
    created_by         bigint REFERENCES users(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    CHECK (reason <> 'OTHER' OR note IS NOT NULL)
);
CREATE INDEX ix_stockadj_item ON stock_adjustments (item_id, adjustment_date);

-- Physical stock counts
CREATE TABLE stock_takes (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    take_no    text NOT NULL UNIQUE DEFAULT next_doc_no('STK'),
    take_date  date NOT NULL DEFAULT current_date,
    pool       stock_pool NOT NULL,
    status     doc_status NOT NULL DEFAULT 'DRAFT',
    notes      text,
    created_by bigint REFERENCES users(id),
    posted_by  bigint REFERENCES users(id),
    posted_at  timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_take_lines (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    take_id     bigint NOT NULL REFERENCES stock_takes(id) ON DELETE CASCADE,
    item_id     bigint NOT NULL REFERENCES items(id),
    system_kg   numeric(16,3),                       -- filled automatically
    counted_kg  numeric(16,3) NOT NULL CHECK (counted_kg >= 0),
    variance_kg numeric(16,3) GENERATED ALWAYS AS (counted_kg - coalesce(system_kg,0)) STORED,
    note        text,
    UNIQUE (take_id, item_id)
);

/* =====================================================================
   7. PURCHASES
   ===================================================================== */
CREATE TABLE purchases (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_no    text NOT NULL UNIQUE DEFAULT next_doc_no('PUR'),
    supplier_id    bigint NOT NULL REFERENCES suppliers(id),
    stock_pool     stock_pool NOT NULL DEFAULT 'CEREAL_STOCK' CHECK (stock_pool <> 'CUSTOMER_GRAIN'),
    purchase_date  date NOT NULL DEFAULT current_date,
    supplier_invoice_ref text,
    status         doc_status NOT NULL DEFAULT 'DRAFT',
    subtotal       numeric(14,2) NOT NULL DEFAULT 0,
    transport_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (transport_cost >= 0),
    loading_cost   numeric(14,2) NOT NULL DEFAULT 0 CHECK (loading_cost   >= 0),
    other_cost     numeric(14,2) NOT NULL DEFAULT 0 CHECK (other_cost     >= 0),
    total_cost     numeric(14,2) GENERATED ALWAYS AS (subtotal + transport_cost + loading_cost + other_cost) STORED,
    amount_paid    numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    balance_due    numeric(14,2) GENERATED ALWAYS AS (subtotal + transport_cost + loading_cost + other_cost - amount_paid) STORED,
    payment_status payment_status GENERATED ALWAYS AS (
        CASE WHEN subtotal + transport_cost + loading_cost + other_cost > 0
                  AND amount_paid >= subtotal + transport_cost + loading_cost + other_cost THEN 'PAID'::payment_status
             WHEN amount_paid > 0 THEN 'PARTIAL'::payment_status
             ELSE 'UNPAID'::payment_status END) STORED,
    notes          text,
    created_by     bigint REFERENCES users(id),
    posted_at      timestamptz,
    voided_at      timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_purchases_supplier ON purchases (supplier_id, purchase_date);

CREATE TABLE purchase_lines (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_id      bigint NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    item_id          bigint NOT NULL REFERENCES items(id),
    unit_id          bigint NOT NULL REFERENCES units(id),
    quantity         numeric(14,3) NOT NULL CHECK (quantity > 0),
    quantity_kg      numeric(16,3),                        -- filled automatically
    unit_cost        numeric(14,2) NOT NULL CHECK (unit_cost >= 0),   -- per chosen unit (bag / kg)
    line_total       numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_cost, 2)) STORED,
    landed_cost_per_kg numeric(14,4),                      -- true cost incl. transport/loading, set on posting
    note             text
);
CREATE INDEX ix_purchase_lines_purchase ON purchase_lines (purchase_id);

CREATE TABLE supplier_payments (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_no  text NOT NULL UNIQUE DEFAULT next_doc_no('SPAY'),
    supplier_id bigint NOT NULL REFERENCES suppliers(id),
    purchase_id bigint REFERENCES purchases(id),
    module      module_code NOT NULL DEFAULT 'CEREAL',
    paid_on     timestamptz NOT NULL DEFAULT now(),
    amount      numeric(14,2) NOT NULL CHECK (amount > 0),
    method      payment_method NOT NULL DEFAULT 'CASH',
    mpesa_code  text,
    note        text,
    created_by  bigint REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_supplier_payments_supplier ON supplier_payments (supplier_id, paid_on);

ALTER TABLE supplier_ledger
    ADD CONSTRAINT fk_sledger_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id),
    ADD CONSTRAINT fk_sledger_spay     FOREIGN KEY (supplier_payment_id) REFERENCES supplier_payments(id);

/* =====================================================================
   9a. SALES HEADER (created before the mill tables, which link to it)
   ===================================================================== */
CREATE TABLE sales (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_no         text NOT NULL UNIQUE DEFAULT next_doc_no('SALE'),
    module          module_code NOT NULL CHECK (module IN ('MILL','CEREAL')),
    channel         sale_channel NOT NULL DEFAULT 'RETAIL',
    customer_id     bigint REFERENCES customers(id),          -- NULL = walk-in
    walkin_name     text,
    walkin_phone    text,
    sale_date       timestamptz NOT NULL DEFAULT now(),
    status          sale_status NOT NULL DEFAULT 'DRAFT',
    subtotal        numeric(14,2) NOT NULL DEFAULT 0,
    discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount    numeric(14,2) NOT NULL DEFAULT 0,
    amount_paid     numeric(14,2) NOT NULL DEFAULT 0,        -- confirmed payments only
    balance_due     numeric(14,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    payment_status  payment_status GENERATED ALWAYS AS (
        CASE WHEN total_amount > 0 AND amount_paid >= total_amount THEN 'PAID'::payment_status
             WHEN amount_paid > 0 THEN 'PARTIAL'::payment_status
             ELSE 'UNPAID'::payment_status END) STORED,
    is_credit       boolean NOT NULL DEFAULT false,
    due_date        date,
    is_delivery     boolean NOT NULL DEFAULT false,
    delivery_address text,
    notes           text,
    cashier_id      bigint REFERENCES users(id),
    posted_at       timestamptz,
    voided_at       timestamptz,
    voided_by       bigint REFERENCES users(id),
    void_approved_by bigint REFERENCES users(id),
    void_reason     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'VOIDED' OR void_reason IS NOT NULL)
);
CREATE INDEX ix_sales_date     ON sales (sale_date);
CREATE INDEX ix_sales_customer ON sales (customer_id, sale_date);
CREATE INDEX ix_sales_status   ON sales (status, module);
CREATE INDEX ix_sales_due      ON sales (due_date) WHERE status = 'POSTED';

ALTER TABLE customer_ledger
    ADD CONSTRAINT fk_cledger_sale FOREIGN KEY (sale_id) REFERENCES sales(id);

/* =====================================================================
   8. MILL MODULE
   ===================================================================== */
CREATE TABLE machines (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         text NOT NULL UNIQUE,
    kind         text NOT NULL DEFAULT 'HAMMER_MILL' CHECK (kind IN ('HAMMER_MILL','SIEVE','CLEANER','OTHER')),
    power_source text NOT NULL DEFAULT 'ELECTRIC' CHECK (power_source IN ('ELECTRIC','DIESEL','OTHER')),
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Optional machine and power log
CREATE TABLE machine_logs (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    machine_id       bigint NOT NULL REFERENCES machines(id),
    log_date         date NOT NULL DEFAULT current_date,
    hours_run        numeric(5,2) NOT NULL DEFAULT 0 CHECK (hours_run BETWEEN 0 AND 24),
    fuel_litres      numeric(10,2) NOT NULL DEFAULT 0 CHECK (fuel_litres >= 0),
    fuel_cost        numeric(12,2) NOT NULL DEFAULT 0 CHECK (fuel_cost >= 0),
    electricity_kwh  numeric(10,2) NOT NULL DEFAULT 0 CHECK (electricity_kwh >= 0),
    electricity_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (electricity_cost >= 0),
    operator_id      bigint REFERENCES users(id),
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (machine_id, log_date)
);

CREATE TABLE mill_jobs (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_no        text NOT NULL UNIQUE DEFAULT next_doc_no('JOB'),
    job_type         job_type NOT NULL DEFAULT 'CUSTOMER',   -- CUSTOMER = customer's grain, OWN = mill's own grain
    customer_id      bigint REFERENCES customers(id),
    walkin_name      text,
    walkin_phone     text,
    grain_item_id    bigint NOT NULL REFERENCES items(id),
    miller_id        bigint REFERENCES users(id),
    machine_id       bigint REFERENCES machines(id),
    received_at      timestamptz NOT NULL DEFAULT now(),
    weight_in_kg     numeric(12,3) NOT NULL CHECK (weight_in_kg > 0),
    tins_in          numeric(10,2) CHECK (tins_in IS NULL OR tins_in >= 0),
    rate_basis       rate_basis NOT NULL DEFAULT 'PER_KG',
    rate_applied     numeric(12,2) CHECK (rate_applied IS NULL OR rate_applied >= 0),
    extra_charge     numeric(12,2) NOT NULL DEFAULT 0 CHECK (extra_charge >= 0),   -- sifting, special requests
    charge_amount    numeric(12,2) NOT NULL DEFAULT 0 CHECK (charge_amount >= 0),
    blend_description text,
    special_request  text,
    weight_out_kg    numeric(12,3) CHECK (weight_out_kg IS NULL OR weight_out_kg >= 0),   -- flour out
    bran_kg          numeric(12,3) CHECK (bran_kg IS NULL OR bran_kg >= 0),
    expected_flour_kg numeric(12,3),
    yield_pct        numeric(6,2),
    yield_status     text NOT NULL DEFAULT 'NOT_CHECKED' CHECK (yield_status IN ('NOT_CHECKED','OK','LOW','NO_STANDARD')),
    status           job_status NOT NULL DEFAULT 'WAITING',
    started_at       timestamptz,
    ready_at         timestamptz,
    collected_at     timestamptz,
    cancel_reason    text,
    sale_id          bigint REFERENCES sales(id),
    created_by       bigint REFERENCES users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (job_type = 'OWN' OR customer_id IS NOT NULL OR walkin_name IS NOT NULL),
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL)
);
CREATE INDEX ix_milljobs_status   ON mill_jobs (status, received_at);
CREATE INDEX ix_milljobs_customer ON mill_jobs (customer_id, received_at);
CREATE INDEX ix_milljobs_grain    ON mill_jobs (grain_item_id, received_at);

CREATE TABLE mill_job_blends (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id        bigint NOT NULL REFERENCES mill_jobs(id) ON DELETE CASCADE,
    grain_item_id bigint NOT NULL REFERENCES items(id),
    weight_kg     numeric(12,3) NOT NULL CHECK (weight_kg > 0)
);

-- Products that came out of a job. Flour handed back to a customer needs no stock movement.
CREATE TABLE mill_job_outputs (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id         bigint NOT NULL REFERENCES mill_jobs(id) ON DELETE CASCADE,
    output_item_id bigint NOT NULL REFERENCES items(id),
    quantity_kg    numeric(12,3) NOT NULL CHECK (quantity_kg > 0),
    destination    text NOT NULL CHECK (destination IN ('RETURNED_TO_CUSTOMER','MILL_STOCK','CEREAL_STOCK')),
    unit_cost_per_kg numeric(14,4),            -- filled automatically for stock destinations
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_jobouts_job ON mill_job_outputs (job_id);

CREATE TABLE mill_job_status_history (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id      bigint NOT NULL REFERENCES mill_jobs(id) ON DELETE CASCADE,
    old_status  job_status,
    new_status  job_status NOT NULL,
    changed_by  bigint REFERENCES users(id),
    changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_jobhist_job ON mill_job_status_history (job_id, changed_at);

CREATE TABLE yield_alerts (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id        bigint NOT NULL UNIQUE REFERENCES mill_jobs(id) ON DELETE CASCADE,
    expected_kg   numeric(12,3) NOT NULL,
    actual_kg     numeric(12,3) NOT NULL,
    shortfall_kg  numeric(12,3) NOT NULL,
    shortfall_pct numeric(6,2)  NOT NULL,
    status        text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','EXPLAINED','CONFIRMED_LOSS','DISMISSED')),
    reviewed_by   bigint REFERENCES users(id),
    reviewed_at   timestamptz,
    review_note   text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_yieldalerts_status ON yield_alerts (status);

/* =====================================================================
   9b. SALE LINES, PAYMENTS, M-PESA, RECEIPTS, DELIVERIES
   ===================================================================== */
CREATE TABLE sale_lines (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id           bigint NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    line_type         text NOT NULL DEFAULT 'ITEM' CHECK (line_type IN ('ITEM','MILLING')),
    item_id           bigint REFERENCES items(id),
    mill_job_id       bigint REFERENCES mill_jobs(id),
    description       text,
    unit_id           bigint REFERENCES units(id),
    quantity          numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    quantity_kg       numeric(16,3),                       -- filled automatically for ITEM lines
    unit_price        numeric(14,2) NOT NULL CHECK (unit_price >= 0),
    line_total        numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
    stock_pool        stock_pool,                          -- defaults from sale module
    unit_cost_per_kg  numeric(14,4),                       -- cost snapshot taken when posted
    min_price_per_kg  numeric(14,4),                       -- minimum price in force at the time
    price_override_by bigint REFERENCES users(id),
    override_reason   text,
    CHECK ((line_type = 'ITEM'    AND item_id IS NOT NULL AND unit_id IS NOT NULL)
        OR (line_type = 'MILLING' AND mill_job_id IS NOT NULL))
);
CREATE INDEX ix_salelines_sale ON sale_lines (sale_id);
CREATE INDEX ix_salelines_item ON sale_lines (item_id);

CREATE TABLE payments (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_no    text NOT NULL UNIQUE DEFAULT next_doc_no('PAY'),
    customer_id   bigint REFERENCES customers(id),
    module        module_code NOT NULL DEFAULT 'CEREAL',     -- SHARED = on-account payment across modules
    method        payment_method NOT NULL,
    state         payment_state NOT NULL DEFAULT 'PENDING',
    amount        numeric(14,2) NOT NULL CHECK (amount > 0),
    payer_phone   text,
    mpesa_receipt text CHECK (mpesa_receipt IS NULL OR mpesa_receipt ~ '^[A-Z0-9]{10}$'),
    received_at   timestamptz NOT NULL DEFAULT now(),
    confirmed_at  timestamptz,
    received_by   bigint REFERENCES users(id),
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (method <> 'MPESA_MANUAL' OR mpesa_receipt IS NOT NULL),      -- manual M-Pesa needs the code
    CHECK (state <> 'CONFIRMED' OR method NOT IN ('MPESA_STK','MPESA_MANUAL') OR mpesa_receipt IS NOT NULL)
);
CREATE UNIQUE INDEX ux_payments_mpesa_receipt ON payments (mpesa_receipt) WHERE mpesa_receipt IS NOT NULL;
CREATE INDEX ix_payments_date     ON payments (received_at);
CREATE INDEX ix_payments_customer ON payments (customer_id, received_at);
CREATE INDEX ix_payments_state    ON payments (state, method);

ALTER TABLE customer_ledger
    ADD CONSTRAINT fk_cledger_payment FOREIGN KEY (payment_id) REFERENCES payments(id);

-- Which sale(s) a payment settles. A payment may also stay unallocated (on account).
CREATE TABLE payment_allocations (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id bigint NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    sale_id    bigint NOT NULL REFERENCES sales(id),
    amount     numeric(14,2) NOT NULL CHECK (amount > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (payment_id, sale_id)
);
CREATE INDEX ix_alloc_sale ON payment_allocations (sale_id);

-- STK push (Safaricom Daraja) requests and their results
CREATE TABLE mpesa_stk_requests (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id           bigint NOT NULL REFERENCES payments(id),
    merchant_request_id  text,
    checkout_request_id  text UNIQUE,
    phone                text NOT NULL CHECK (phone ~ '^254[17][0-9]{8}$'),
    amount               numeric(14,2) NOT NULL CHECK (amount > 0),
    account_reference    text,
    transaction_desc     text,
    status               stk_status NOT NULL DEFAULT 'INITIATED',
    result_code          integer,
    result_desc          text,
    mpesa_receipt        text,
    transaction_date     timestamptz,
    request_payload      jsonb,
    response_payload     jsonb,
    callback_payload     jsonb,
    initiated_by         bigint REFERENCES users(id),
    initiated_at         timestamptz NOT NULL DEFAULT now(),
    callback_at          timestamptz,
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_stk_payment ON mpesa_stk_requests (payment_id);
CREATE INDEX ix_stk_status  ON mpesa_stk_requests (status, initiated_at);

-- Raw copy of every callback Safaricom sends (for audit / replay)
CREATE TABLE mpesa_callback_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source      text NOT NULL DEFAULT 'STK',
    payload     jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed   boolean NOT NULL DEFAULT false,
    error_text  text
);

CREATE TABLE receipts (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_no     text NOT NULL UNIQUE DEFAULT next_doc_no('RCPT'),
    sale_id        bigint NOT NULL REFERENCES sales(id),
    issued_at      timestamptz NOT NULL DEFAULT now(),
    issued_by      bigint REFERENCES users(id),
    total_amount   numeric(14,2) NOT NULL,
    amount_paid    numeric(14,2) NOT NULL,
    balance_due    numeric(14,2) NOT NULL,
    payment_summary text,                 -- e.g. "CASH + MPESA_STK"
    mpesa_codes    text,                  -- M-Pesa code(s) shown on the receipt
    is_duplicate   boolean NOT NULL DEFAULT false,
    print_count    integer NOT NULL DEFAULT 0
);
CREATE INDEX ix_receipts_sale ON receipts (sale_id);

CREATE TABLE receipt_deliveries (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id          bigint NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    channel             delivery_channel NOT NULL,
    recipient_phone     text,
    status              message_status NOT NULL DEFAULT 'QUEUED',
    provider_message_id text,
    error_text          text,
    queued_at           timestamptz NOT NULL DEFAULT now(),
    sent_at             timestamptz
);
CREATE INDEX ix_rcptdeliv_receipt ON receipt_deliveries (receipt_id);

CREATE TABLE deliveries (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    delivery_no      text NOT NULL UNIQUE DEFAULT next_doc_no('DLV'),
    sale_id          bigint NOT NULL REFERENCES sales(id),
    customer_id      bigint REFERENCES customers(id),
    delivery_address text,
    contact_phone    text,
    driver_name      text,
    vehicle_reg      text,
    status           delivery_status NOT NULL DEFAULT 'PENDING',
    dispatched_at    timestamptz,
    delivered_at     timestamptz,
    received_by_name text,
    notes            text,
    created_by       bigint REFERENCES users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_deliveries_sale ON deliveries (sale_id);

/* =====================================================================
   10. EXPENSES, TRANSFERS, DAILY CLOSE
   ===================================================================== */
CREATE TABLE expense_categories (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code      text NOT NULL UNIQUE,
    name      text NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE expenses (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expense_no   text NOT NULL UNIQUE DEFAULT next_doc_no('EXP'),
    category_id  bigint NOT NULL REFERENCES expense_categories(id),
    module       module_code NOT NULL DEFAULT 'SHARED',
    expense_date date NOT NULL DEFAULT current_date,
    amount       numeric(14,2) NOT NULL CHECK (amount > 0),
    method       payment_method NOT NULL DEFAULT 'CASH',
    mpesa_code   text,
    supplier_id  bigint REFERENCES suppliers(id),
    machine_id   bigint REFERENCES machines(id),
    description  text,
    receipt_ref  text,
    is_voided    boolean NOT NULL DEFAULT false,
    void_reason  text,
    created_by   bigint REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT is_voided OR void_reason IS NOT NULL)
);
CREATE INDEX ix_expenses_date ON expenses (expense_date, module);

-- Mill <-> cereal movements. Same item moves between pools at cost (mill takes maize, cereal sells flour).
CREATE TABLE module_transfers (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transfer_no      text NOT NULL UNIQUE DEFAULT next_doc_no('TRF'),
    transfer_date    timestamptz NOT NULL DEFAULT now(),
    item_id          bigint NOT NULL REFERENCES items(id),
    from_pool        stock_pool NOT NULL CHECK (from_pool <> 'CUSTOMER_GRAIN'),
    to_pool          stock_pool NOT NULL CHECK (to_pool   <> 'CUSTOMER_GRAIN'),
    quantity_kg      numeric(16,3) NOT NULL CHECK (quantity_kg > 0),
    unit_cost_per_kg numeric(14,4),                 -- defaults to the source pool's average cost
    total_cost       numeric(16,2) GENERATED ALWAYS AS (round(quantity_kg * coalesce(unit_cost_per_kg,0), 2)) STORED,
    reason           text,
    created_by       bigint REFERENCES users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (from_pool <> to_pool)
);
CREATE INDEX ix_transfers_date ON module_transfers (transfer_date);

-- Daily close: expected vs counted cash and M-Pesa
CREATE TABLE daily_closes (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    close_date       date NOT NULL,
    module           module_code NOT NULL,          -- SHARED = whole business
    opening_float    numeric(14,2) NOT NULL DEFAULT 0,
    expected_cash    numeric(14,2) NOT NULL DEFAULT 0,   -- cash in minus cash paid out (excl. float)
    expected_mpesa   numeric(14,2) NOT NULL DEFAULT 0,
    counted_cash     numeric(14,2),                      -- cash physically in the drawer
    counted_mpesa    numeric(14,2),                      -- per Till statement
    cash_variance    numeric(14,2) GENERATED ALWAYS AS (counted_cash  - (opening_float + expected_cash)) STORED,
    mpesa_variance   numeric(14,2) GENERATED ALWAYS AS (counted_mpesa - expected_mpesa) STORED,
    status           close_status NOT NULL DEFAULT 'OPEN',
    notes            text,
    closed_by        bigint REFERENCES users(id),
    closed_at        timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (close_date, module)
);

/* =====================================================================
   11. BUSINESS-LOGIC FUNCTIONS
   ===================================================================== */

-- ---- balances --------------------------------------------------------
CREATE FUNCTION fn_customer_balance(p_customer bigint) RETURNS numeric
LANGUAGE sql STABLE AS $$
    SELECT coalesce(sum(debit - credit), 0) FROM customer_ledger WHERE customer_id = p_customer
$$;

CREATE FUNCTION fn_supplier_balance(p_supplier bigint) RETURNS numeric
LANGUAGE sql STABLE AS $$
    SELECT coalesce(sum(credit - debit), 0) FROM supplier_ledger WHERE supplier_id = p_supplier
$$;

-- ---- opening balances / opening stock (for go-live data load) --------
CREATE FUNCTION fn_set_customer_opening_balance(p_customer bigint, p_amount numeric,
        p_as_of date DEFAULT current_date, p_user bigint DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
    INSERT INTO customer_ledger (customer_id, entry_date, entry_type, debit, description, created_by)
    VALUES (p_customer, p_as_of::timestamptz, 'OPENING_BALANCE', p_amount, 'Opening balance', p_user)
$$;

CREATE FUNCTION fn_set_supplier_opening_balance(p_supplier bigint, p_amount numeric,
        p_as_of date DEFAULT current_date, p_user bigint DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
    INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, credit, description, created_by)
    VALUES (p_supplier, p_as_of::timestamptz, 'OPENING_BALANCE', p_amount, 'Opening balance', p_user)
$$;

CREATE FUNCTION fn_set_opening_stock(p_item bigint, p_pool stock_pool, p_kg numeric,
        p_cost_per_kg numeric DEFAULT 0, p_user bigint DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
    INSERT INTO stock_movements (item_id, pool, movement_type, quantity_kg, unit_cost_per_kg, note, created_by)
    VALUES (p_item, p_pool, 'OPENING_BALANCE', p_kg, p_cost_per_kg, 'Opening stock', p_user)
$$;

-- ---- stock ledger -> balances (weighted-average cost) ---------------
CREATE FUNCTION fn_stock_movement_before() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_qty numeric; v_avg numeric; v_new numeric;
BEGIN
    INSERT INTO stock_balances (item_id, pool, quantity_kg, avg_cost_per_kg)
    VALUES (NEW.item_id, NEW.pool, 0, 0)
    ON CONFLICT (item_id, pool) DO NOTHING;

    SELECT quantity_kg, avg_cost_per_kg INTO v_qty, v_avg
    FROM stock_balances WHERE item_id = NEW.item_id AND pool = NEW.pool FOR UPDATE;

    v_new := v_qty + NEW.quantity_kg;
    IF v_new < 0 AND NOT fn_setting_bool('allow_negative_stock', false) THEN
        RAISE EXCEPTION 'Insufficient stock: item % in % has % kg, cannot remove % kg',
            NEW.item_id, NEW.pool, v_qty, abs(NEW.quantity_kg)
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.quantity_kg > 0 THEN
        NEW.unit_cost_per_kg := coalesce(NEW.unit_cost_per_kg, v_avg, 0);
        IF v_qty > 0 THEN
            v_avg := round((v_qty * v_avg + NEW.quantity_kg * NEW.unit_cost_per_kg) / v_new, 4);
        ELSE
            v_avg := NEW.unit_cost_per_kg;
        END IF;
    ELSE
        NEW.unit_cost_per_kg := coalesce(NEW.unit_cost_per_kg, v_avg, 0);
    END IF;

    NEW.balance_after_kg := v_new;
    UPDATE stock_balances
       SET quantity_kg = v_new, avg_cost_per_kg = v_avg
     WHERE item_id = NEW.item_id AND pool = NEW.pool;
    RETURN NEW;
END $$;

-- ---- stock adjustments -> ledger ------------------------------------
CREATE FUNCTION fn_stock_adjustment_before() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.unit_cost_per_kg IS NULL THEN
        SELECT avg_cost_per_kg INTO NEW.unit_cost_per_kg
        FROM stock_balances WHERE item_id = NEW.item_id AND pool = NEW.pool;
        NEW.unit_cost_per_kg := coalesce(NEW.unit_cost_per_kg, 0);
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION fn_stock_adjustment_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO stock_movements (movement_date, item_id, pool, movement_type, quantity_kg,
                                 unit_cost_per_kg, ref_table, ref_id, note, created_by)
    VALUES (NEW.adjustment_date, NEW.item_id, NEW.pool, 'ADJUSTMENT', NEW.quantity_kg_change,
            NEW.unit_cost_per_kg, 'stock_adjustments', NEW.id,
            NEW.reason::text || coalesce(': ' || NEW.note, ''), NEW.created_by);
    RETURN NULL;
END $$;

-- ---- stock take ------------------------------------------------------
CREATE FUNCTION fn_stock_take_line_before() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_pool stock_pool;
BEGIN
    IF NEW.system_kg IS NULL THEN
        SELECT pool INTO v_pool FROM stock_takes WHERE id = NEW.take_id;
        SELECT quantity_kg INTO NEW.system_kg FROM stock_balances WHERE item_id = NEW.item_id AND pool = v_pool;
        NEW.system_kg := coalesce(NEW.system_kg, 0);
    END IF;
    RETURN NEW;
END $$;

-- Posts every non-zero variance as a COUNT_CORRECTION adjustment
CREATE FUNCTION fn_post_stock_take(p_take bigint, p_user bigint DEFAULT NULL) RETURNS stock_takes
LANGUAGE plpgsql AS $$
DECLARE t stock_takes%ROWTYPE; l record;
BEGIN
    SELECT * INTO t FROM stock_takes WHERE id = p_take FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stock take % not found', p_take; END IF;
    IF t.status <> 'DRAFT' THEN RAISE EXCEPTION 'Stock take % is already %', t.take_no, t.status; END IF;
    FOR l IN SELECT * FROM stock_take_lines WHERE take_id = p_take AND variance_kg <> 0 LOOP
        INSERT INTO stock_adjustments (item_id, pool, reason, quantity_kg_change, note, created_by)
        VALUES (l.item_id, t.pool, 'COUNT_CORRECTION', l.variance_kg, 'Stock take ' || t.take_no, p_user);
    END LOOP;
    UPDATE stock_takes SET status = 'POSTED', posted_by = p_user, posted_at = now() WHERE id = p_take
    RETURNING * INTO t;
    RETURN t;
END $$;

-- ---- customers: normalise phone numbers (0712... -> 254712...) -------
CREATE FUNCTION fn_customer_before() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.phone     := fn_normalize_phone(NEW.phone);
    NEW.alt_phone := fn_normalize_phone(NEW.alt_phone);
    RETURN NEW;
END $$;

-- ---- price rules -----------------------------------------------------
CREATE FUNCTION fn_item_price_before() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_min numeric; v_kg numeric;
BEGIN
    v_kg := fn_kg_per_unit(NEW.item_id, NEW.unit_id);
    SELECT min_price_per_kg INTO v_min FROM item_min_prices WHERE item_id = NEW.item_id;
    IF v_min IS NOT NULL AND NEW.price < v_min * v_kg THEN
        RAISE EXCEPTION 'Price % is below the minimum % for this item/unit (% per kg)',
            NEW.price, round(v_min * v_kg, 2), v_min;
    END IF;
    -- close the previous current price
    UPDATE item_prices SET effective_to = now()
     WHERE item_id = NEW.item_id AND tier_id = NEW.tier_id AND unit_id = NEW.unit_id
       AND effective_to IS NULL;
    RETURN NEW;
END $$;

CREATE FUNCTION fn_item_after_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO item_units (item_id, unit_id, kg_per_unit)
    SELECT NEW.id, u.id, 1 FROM units u WHERE u.code = 'KG'
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

-- ---- purchases -------------------------------------------------------
CREATE FUNCTION fn_purchase_line_before() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status doc_status;
BEGIN
    SELECT status INTO v_status FROM purchases WHERE id = coalesce(NEW.purchase_id, OLD.purchase_id);
    IF v_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Purchase lines can only be changed while the purchase is a DRAFT';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    NEW.quantity_kg := round(NEW.quantity * fn_kg_per_unit(NEW.item_id, NEW.unit_id), 3);
    RETURN NEW;
END $$;

CREATE FUNCTION fn_purchase_line_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id bigint := coalesce(NEW.purchase_id, OLD.purchase_id);
BEGIN
    UPDATE purchases
       SET subtotal = coalesce((SELECT sum(line_total) FROM purchase_lines WHERE purchase_id = v_id), 0)
     WHERE id = v_id;
    RETURN NULL;
END $$;

-- Posting: allocates transport/loading/other costs over the kg bought to get the TRUE cost per kg
CREATE FUNCTION fn_post_purchase(p_purchase bigint, p_user bigint DEFAULT NULL) RETURNS purchases
LANGUAGE plpgsql AS $$
DECLARE
    p purchases%ROWTYPE; l record; v_kg numeric; v_extra numeric; v_landed numeric;
BEGIN
    SELECT * INTO p FROM purchases WHERE id = p_purchase FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase % not found', p_purchase; END IF;
    IF p.status <> 'DRAFT' THEN RAISE EXCEPTION 'Purchase % is already %', p.purchase_no, p.status; END IF;
    SELECT coalesce(sum(quantity_kg),0) INTO v_kg FROM purchase_lines WHERE purchase_id = p_purchase;
    IF v_kg <= 0 THEN RAISE EXCEPTION 'Purchase % has no lines', p.purchase_no; END IF;
    v_extra := p.transport_cost + p.loading_cost + p.other_cost;

    FOR l IN SELECT * FROM purchase_lines WHERE purchase_id = p_purchase ORDER BY id LOOP
        v_landed := round((l.line_total + v_extra * l.quantity_kg / v_kg) / l.quantity_kg, 4);
        INSERT INTO stock_movements (movement_date, item_id, pool, movement_type, quantity_kg,
                                     unit_cost_per_kg, ref_table, ref_id, note, created_by)
        VALUES (p.purchase_date::timestamptz, l.item_id, p.stock_pool, 'PURCHASE', l.quantity_kg,
                v_landed, 'purchases', p.id, 'Purchase ' || p.purchase_no, p_user);
        UPDATE purchase_lines SET landed_cost_per_kg = v_landed WHERE id = l.id;
    END LOOP;

    SELECT * INTO p FROM purchases WHERE id = p_purchase;      -- re-read refreshed subtotal / total
    INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, credit, purchase_id, description, created_by)
    VALUES (p.supplier_id, p.purchase_date::timestamptz, 'PURCHASE', p.total_cost, p.id,
            'Purchase ' || p.purchase_no, p_user);
    UPDATE purchases SET status = 'POSTED', posted_at = now() WHERE id = p_purchase RETURNING * INTO p;
    RETURN p;
END $$;

CREATE FUNCTION fn_supplier_payment_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_sup bigint;
BEGIN
    IF NEW.purchase_id IS NOT NULL THEN
        SELECT supplier_id INTO v_sup FROM purchases WHERE id = NEW.purchase_id;
        IF v_sup <> NEW.supplier_id THEN
            RAISE EXCEPTION 'Purchase % does not belong to supplier %', NEW.purchase_id, NEW.supplier_id;
        END IF;
        UPDATE purchases SET amount_paid = amount_paid + NEW.amount WHERE id = NEW.purchase_id;
    END IF;
    INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, debit, supplier_payment_id, purchase_id, description, created_by)
    VALUES (NEW.supplier_id, NEW.paid_on, 'PAYMENT', NEW.amount, NEW.id, NEW.purchase_id,
            'Payment ' || NEW.payment_no, NEW.created_by);
    RETURN NULL;
END $$;

-- ---- transfers between modules --------------------------------------
CREATE FUNCTION fn_transfer_before() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.unit_cost_per_kg IS NULL THEN
        SELECT avg_cost_per_kg INTO NEW.unit_cost_per_kg
        FROM stock_balances WHERE item_id = NEW.item_id AND pool = NEW.from_pool;
        NEW.unit_cost_per_kg := coalesce(NEW.unit_cost_per_kg, 0);
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION fn_transfer_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO stock_movements (movement_date, item_id, pool, movement_type, quantity_kg,
                                 unit_cost_per_kg, ref_table, ref_id, note, created_by)
    VALUES (NEW.transfer_date, NEW.item_id, NEW.from_pool, 'TRANSFER_OUT', -NEW.quantity_kg,
            NEW.unit_cost_per_kg, 'module_transfers', NEW.id, 'Transfer ' || NEW.transfer_no, NEW.created_by);
    INSERT INTO stock_movements (movement_date, item_id, pool, movement_type, quantity_kg,
                                 unit_cost_per_kg, ref_table, ref_id, note, created_by)
    VALUES (NEW.transfer_date, NEW.item_id, NEW.to_pool, 'TRANSFER_IN', NEW.quantity_kg,
            NEW.unit_cost_per_kg, 'module_transfers', NEW.id, 'Transfer ' || NEW.transfer_no, NEW.created_by);
    RETURN NULL;
END $$;

-- ---- mill jobs -------------------------------------------------------
CREATE FUNCTION fn_mill_job_before() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    std yield_standards%ROWTYPE;
    v_basis rate_basis; v_rate numeric;
    rank_old int; rank_new int;
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.status := 'WAITING';
        -- look up the rate list if the app did not supply a rate
        IF NEW.job_type = 'CUSTOMER' AND NEW.rate_applied IS NULL THEN
            SELECT r.rate_basis, r.rate INTO v_basis, v_rate
            FROM milling_rates r
            WHERE r.rate_type = 'BASE' AND r.is_active
              AND (r.grain_item_id = NEW.grain_item_id OR r.grain_item_id IS NULL)
              AND r.effective_from <= current_date
              AND (r.effective_to IS NULL OR r.effective_to >= current_date)
            ORDER BY (r.grain_item_id IS NULL), r.effective_from DESC
            LIMIT 1;
            IF FOUND THEN NEW.rate_basis := v_basis; NEW.rate_applied := v_rate; END IF;
        END IF;
        IF NEW.job_type = 'OWN' THEN
            NEW.charge_amount := 0;
        ELSE
            NEW.charge_amount := round(
                CASE NEW.rate_basis WHEN 'PER_KG'  THEN NEW.weight_in_kg * coalesce(NEW.rate_applied,0)
                                    ELSE coalesce(NEW.tins_in,0)          * coalesce(NEW.rate_applied,0) END
                + NEW.extra_charge, 2);
        END IF;
    ELSE
        IF NEW.status <> OLD.status THEN
            rank_old := CASE OLD.status WHEN 'WAITING' THEN 1 WHEN 'MILLING' THEN 2 WHEN 'READY' THEN 3 WHEN 'COLLECTED' THEN 4 ELSE 9 END;
            rank_new := CASE NEW.status WHEN 'WAITING' THEN 1 WHEN 'MILLING' THEN 2 WHEN 'READY' THEN 3 WHEN 'COLLECTED' THEN 4 ELSE 8 END;
            IF OLD.status IN ('COLLECTED','CANCELLED') THEN
                RAISE EXCEPTION 'Job % is % and cannot change status', OLD.ticket_no, OLD.status;
            END IF;
            IF NEW.status = 'CANCELLED' AND OLD.status NOT IN ('WAITING','MILLING') THEN
                RAISE EXCEPTION 'Job % is % and can no longer be cancelled', OLD.ticket_no, OLD.status;
            END IF;
            IF NEW.status <> 'CANCELLED' AND rank_new < rank_old THEN
                RAISE EXCEPTION 'Job status cannot move backwards (% -> %)', OLD.status, NEW.status;
            END IF;
            IF NEW.status = 'READY' AND NEW.weight_out_kg IS NULL THEN
                RAISE EXCEPTION 'Enter the weight of flour out before marking job % READY', OLD.ticket_no;
            END IF;
            IF NEW.status IN ('MILLING','READY','COLLECTED') AND NEW.started_at   IS NULL THEN NEW.started_at   := now(); END IF;
            IF NEW.status IN ('READY','COLLECTED')           AND NEW.ready_at     IS NULL THEN NEW.ready_at     := now(); END IF;
            IF NEW.status = 'COLLECTED'                      AND NEW.collected_at IS NULL THEN NEW.collected_at := now(); END IF;
        END IF;
    END IF;

    -- yield check
    IF NEW.weight_out_kg IS NOT NULL THEN
        NEW.yield_pct := round(NEW.weight_out_kg / NEW.weight_in_kg * 100, 2);
        SELECT * INTO std FROM yield_standards
        WHERE grain_item_id = NEW.grain_item_id AND effective_from <= current_date
        ORDER BY effective_from DESC LIMIT 1;
        IF FOUND THEN
            NEW.expected_flour_kg := round(NEW.weight_in_kg * std.expected_flour_kg_per_100 / 100, 3);
            NEW.yield_status := CASE WHEN NEW.weight_out_kg < NEW.weight_in_kg * std.alert_below_kg_per_100 / 100
                                     THEN 'LOW' ELSE 'OK' END;
        ELSE
            NEW.yield_status := 'NO_STANDARD';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION fn_mill_job_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO mill_job_status_history (job_id, old_status, new_status, changed_by)
        VALUES (NEW.id, NULL, NEW.status, NEW.created_by);
        IF NEW.job_type = 'CUSTOMER' THEN        -- customer grain goes into its OWN pool
            INSERT INTO stock_movements (item_id, pool, movement_type, quantity_kg, unit_cost_per_kg,
                                         customer_id, ref_table, ref_id, note, created_by)
            VALUES (NEW.grain_item_id, 'CUSTOMER_GRAIN', 'CUSTOMER_GRAIN_IN', NEW.weight_in_kg, 0,
                    NEW.customer_id, 'mill_jobs', NEW.id, 'Received for milling ' || NEW.ticket_no, NEW.created_by);
        END IF;
        RETURN NULL;
    END IF;

    IF NEW.status <> OLD.status THEN
        INSERT INTO mill_job_status_history (job_id, old_status, new_status)
        VALUES (NEW.id, OLD.status, NEW.status);

        IF NEW.status = 'READY' THEN
            IF NEW.job_type = 'CUSTOMER' THEN
                INSERT INTO stock_movements (item_id, pool, movement_type, quantity_kg, customer_id,
                                             ref_table, ref_id, note, created_by)
                VALUES (NEW.grain_item_id, 'CUSTOMER_GRAIN', 'CUSTOMER_GRAIN_OUT', -NEW.weight_in_kg,
                        NEW.customer_id, 'mill_jobs', NEW.id, 'Milled ' || NEW.ticket_no, NEW.miller_id);
            ELSE
                INSERT INTO stock_movements (item_id, pool, movement_type, quantity_kg,
                                             ref_table, ref_id, note, created_by)
                VALUES (NEW.grain_item_id, 'MILL_STOCK', 'MILL_INPUT', -NEW.weight_in_kg,
                        'mill_jobs', NEW.id, 'Own milling ' || NEW.ticket_no, NEW.miller_id);
            END IF;
            IF NEW.yield_status = 'LOW' THEN
                INSERT INTO yield_alerts (job_id, expected_kg, actual_kg, shortfall_kg, shortfall_pct)
                VALUES (NEW.id, NEW.expected_flour_kg, NEW.weight_out_kg,
                        NEW.expected_flour_kg - NEW.weight_out_kg,
                        round((NEW.expected_flour_kg - NEW.weight_out_kg) / NEW.expected_flour_kg * 100, 2))
                ON CONFLICT (job_id) DO NOTHING;
            END IF;
        ELSIF NEW.status = 'CANCELLED' AND NEW.job_type = 'CUSTOMER' THEN
            INSERT INTO stock_movements (item_id, pool, movement_type, quantity_kg, customer_id,
                                         ref_table, ref_id, note)
            VALUES (NEW.grain_item_id, 'CUSTOMER_GRAIN', 'CUSTOMER_GRAIN_OUT', -NEW.weight_in_kg,
                    NEW.customer_id, 'mill_jobs', NEW.id, 'Cancelled ' || NEW.ticket_no);
        END IF;
    END IF;
    RETURN NULL;
END $$;

-- Cost of by-products: customer jobs -> free bran (cost 0); own jobs -> grain cost spread over output
CREATE FUNCTION fn_mill_output_before() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j mill_jobs%ROWTYPE; v_avg numeric;
BEGIN
    IF NEW.destination = 'RETURNED_TO_CUSTOMER' THEN RETURN NEW; END IF;
    IF NEW.unit_cost_per_kg IS NULL THEN
        SELECT * INTO j FROM mill_jobs WHERE id = NEW.job_id;
        IF j.job_type = 'CUSTOMER' THEN
            NEW.unit_cost_per_kg := 0;
        ELSE
            SELECT avg_cost_per_kg INTO v_avg FROM stock_balances
             WHERE item_id = j.grain_item_id AND pool = 'MILL_STOCK';
            NEW.unit_cost_per_kg := round(coalesce(v_avg,0) * j.weight_in_kg
                / greatest(coalesce(j.weight_out_kg,0) + coalesce(j.bran_kg,0), 0.001), 4);
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION fn_mill_output_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.destination <> 'RETURNED_TO_CUSTOMER' THEN
        INSERT INTO stock_movements (item_id, pool, movement_type, quantity_kg, unit_cost_per_kg,
                                     ref_table, ref_id, note)
        VALUES (NEW.output_item_id,
                CASE NEW.destination WHEN 'MILL_STOCK' THEN 'MILL_STOCK' ELSE 'CEREAL_STOCK' END::stock_pool,
                'MILL_OUTPUT', NEW.quantity_kg, NEW.unit_cost_per_kg,
                'mill_jobs', NEW.job_id, 'Job output');
    END IF;
    RETURN NULL;
END $$;

-- ---- sales -----------------------------------------------------------
CREATE FUNCTION fn_sale_before() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'DRAFT' THEN
            RAISE EXCEPTION 'Sale % is % and cannot be deleted - void it instead', OLD.sale_no, OLD.status;
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.status = 'DRAFT' THEN
        NEW.total_amount := greatest(NEW.subtotal - NEW.discount_amount, 0);
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION fn_sale_line_before() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    s sales%ROWTYPE; v_min numeric;
BEGIN
    SELECT * INTO s FROM sales WHERE id = coalesce(NEW.sale_id, OLD.sale_id);
    IF s.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Sale % is % - lines can only be changed on a DRAFT', s.sale_no, s.status;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

    IF NEW.line_type = 'ITEM' THEN
        NEW.quantity_kg := round(NEW.quantity * fn_kg_per_unit(NEW.item_id, NEW.unit_id), 3);
        IF NEW.stock_pool IS NULL THEN
            NEW.stock_pool := CASE s.module WHEN 'MILL' THEN 'MILL_STOCK' ELSE 'CEREAL_STOCK' END::stock_pool;
        END IF;
        SELECT min_price_per_kg INTO v_min FROM item_min_prices WHERE item_id = NEW.item_id;
        NEW.min_price_per_kg := v_min;
        -- cashier cannot sell below the minimum price without a manager's override
        IF v_min IS NOT NULL AND (NEW.unit_price * NEW.quantity / NEW.quantity_kg) < v_min THEN
            IF NEW.price_override_by IS NULL OR NOT fn_user_has_permission(NEW.price_override_by, 'price.override') THEN
                RAISE EXCEPTION 'Price % per unit is below the minimum price (% per kg). A manager override is required.',
                    NEW.unit_price, v_min USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    ELSE
        NEW.quantity_kg := NULL;
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION fn_refresh_sale_payment(p_sale bigint) RETURNS void LANGUAGE sql AS $$
    UPDATE sales s
       SET amount_paid = coalesce((
            SELECT sum(pa.amount)
            FROM payment_allocations pa
            JOIN payments p ON p.id = pa.payment_id AND p.state = 'CONFIRMED'
            WHERE pa.sale_id = p_sale), 0)
     WHERE s.id = p_sale
$$;

CREATE FUNCTION fn_sale_line_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id bigint := coalesce(NEW.sale_id, OLD.sale_id);
BEGIN
    UPDATE sales
       SET subtotal = coalesce((SELECT sum(line_total) FROM sale_lines WHERE sale_id = v_id), 0)
     WHERE id = v_id;
    RETURN NULL;
END $$;

-- Post a sale: stock out (at cost), cost snapshot, customer debit. p_on_credit enforces credit rules.
CREATE FUNCTION fn_post_sale(p_sale bigint, p_user bigint DEFAULT NULL, p_on_credit boolean DEFAULT false)
RETURNS sales LANGUAGE plpgsql AS $$
DECLARE
    s sales%ROWTYPE; c customers%ROWTYPE; l record; v_cost numeric; v_bal numeric; v_due date;
BEGIN
    SELECT * INTO s FROM sales WHERE id = p_sale FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale; END IF;
    IF s.status <> 'DRAFT' THEN RAISE EXCEPTION 'Sale % is already %', s.sale_no, s.status; END IF;
    IF NOT EXISTS (SELECT 1 FROM sale_lines WHERE sale_id = p_sale) THEN
        RAISE EXCEPTION 'Sale % has no lines', s.sale_no;
    END IF;

    IF p_on_credit THEN
        IF s.customer_id IS NULL THEN
            RAISE EXCEPTION 'A credit sale needs a registered customer';
        END IF;
        SELECT * INTO c FROM customers WHERE id = s.customer_id;
        IF NOT c.credit_allowed THEN
            RAISE EXCEPTION 'Customer % is not approved for credit', c.full_name;
        END IF;
        v_bal := fn_customer_balance(c.id);
        IF c.credit_limit IS NOT NULL AND v_bal + (s.total_amount - s.amount_paid) > c.credit_limit THEN
            RAISE EXCEPTION 'Credit limit exceeded for %: balance %, this sale %, limit %',
                c.full_name, v_bal, s.total_amount - s.amount_paid, c.credit_limit;
        END IF;
        v_due := coalesce(s.due_date, fn_local_date(s.sale_date) + c.credit_days);
    END IF;

    FOR l IN SELECT * FROM sale_lines WHERE sale_id = p_sale AND line_type = 'ITEM' ORDER BY id LOOP
        INSERT INTO stock_movements (movement_date, item_id, pool, movement_type, quantity_kg,
                                     ref_table, ref_id, note, created_by)
        VALUES (s.sale_date, l.item_id, l.stock_pool, 'SALE', -l.quantity_kg,
                'sales', p_sale, 'Sale ' || s.sale_no, p_user)
        RETURNING unit_cost_per_kg INTO v_cost;
        UPDATE sale_lines SET unit_cost_per_kg = v_cost WHERE id = l.id;
    END LOOP;

    -- link milling charges back to their job tickets
    UPDATE mill_jobs SET sale_id = p_sale
     WHERE id IN (SELECT mill_job_id FROM sale_lines WHERE sale_id = p_sale AND line_type = 'MILLING');

    IF s.customer_id IS NOT NULL AND s.total_amount > 0 THEN
        INSERT INTO customer_ledger (customer_id, entry_date, entry_type, debit, sale_id, description, created_by)
        VALUES (s.customer_id, s.sale_date, 'SALE', s.total_amount, p_sale, 'Sale ' || s.sale_no, p_user);
    END IF;

    UPDATE sales
       SET status = 'POSTED', posted_at = now(), is_credit = p_on_credit,
           due_date = coalesce(v_due, due_date), cashier_id = coalesce(cashier_id, p_user)
     WHERE id = p_sale;
    PERFORM fn_refresh_sale_payment(p_sale);

    SELECT * INTO s FROM sales WHERE id = p_sale;
    RETURN s;
END $$;

-- Void a posted sale: stock goes back at the cost it left at; customer ledger is reversed.
CREATE FUNCTION fn_void_sale(p_sale bigint, p_user bigint, p_approver bigint, p_reason text)
RETURNS sales LANGUAGE plpgsql AS $$
DECLARE s sales%ROWTYPE; l record;
BEGIN
    IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required to void a sale'; END IF;
    IF p_approver IS NULL OR NOT fn_user_has_permission(p_approver, 'sales.void') THEN
        RAISE EXCEPTION 'Voiding a sale needs approval from a user with the sales.void permission';
    END IF;
    SELECT * INTO s FROM sales WHERE id = p_sale FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale; END IF;
    IF s.status <> 'POSTED' THEN RAISE EXCEPTION 'Only POSTED sales can be voided (sale is %)', s.status; END IF;

    FOR l IN SELECT * FROM sale_lines WHERE sale_id = p_sale AND line_type = 'ITEM' LOOP
        INSERT INTO stock_movements (item_id, pool, movement_type, quantity_kg, unit_cost_per_kg,
                                     ref_table, ref_id, note, created_by)
        VALUES (l.item_id, l.stock_pool, 'SALE_VOID', l.quantity_kg, l.unit_cost_per_kg,
                'sales', p_sale, 'Void of ' || s.sale_no, p_user);
    END LOOP;

    IF s.customer_id IS NOT NULL AND s.total_amount > 0 THEN
        INSERT INTO customer_ledger (customer_id, entry_type, credit, sale_id, description, created_by)
        VALUES (s.customer_id, 'VOID', s.total_amount, p_sale, 'Void of ' || s.sale_no, p_user);
    END IF;

    UPDATE sales
       SET status = 'VOIDED', voided_at = now(), voided_by = p_user,
           void_approved_by = p_approver, void_reason = p_reason
     WHERE id = p_sale
    RETURNING * INTO s;
    RETURN s;
END $$;

-- ---- payments --------------------------------------------------------
CREATE FUNCTION fn_payment_before() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.payer_phone IS NOT NULL THEN NEW.payer_phone := fn_normalize_phone(NEW.payer_phone); END IF;
    -- cash and manual M-Pesa codes are confirmed on entry unless the app says otherwise
    IF NEW.state = 'CONFIRMED' AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION fn_payment_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record;
BEGIN
    IF NEW.state = 'CONFIRMED' AND (TG_OP = 'INSERT' OR OLD.state <> 'CONFIRMED') THEN
        IF NEW.customer_id IS NOT NULL THEN
            INSERT INTO customer_ledger (customer_id, entry_date, entry_type, credit, payment_id, description, created_by)
            VALUES (NEW.customer_id, coalesce(NEW.confirmed_at, now()), 'PAYMENT', NEW.amount, NEW.id,
                    'Payment ' || NEW.payment_no, NEW.received_by);
        END IF;
        FOR a IN SELECT sale_id FROM payment_allocations WHERE payment_id = NEW.id LOOP
            PERFORM fn_refresh_sale_payment(a.sale_id);
        END LOOP;
    ELSIF TG_OP = 'UPDATE' AND OLD.state = 'CONFIRMED' AND NEW.state = 'REVERSED' THEN
        IF NEW.customer_id IS NOT NULL THEN
            INSERT INTO customer_ledger (customer_id, entry_type, debit, payment_id, description, created_by)
            VALUES (NEW.customer_id, 'ADJUSTMENT', NEW.amount, NEW.id,
                    'Reversal of payment ' || NEW.payment_no, NEW.received_by);
        END IF;
        FOR a IN SELECT sale_id FROM payment_allocations WHERE payment_id = NEW.id LOOP
            PERFORM fn_refresh_sale_payment(a.sale_id);
        END LOOP;
    END IF;
    RETURN NULL;
END $$;

CREATE FUNCTION fn_allocation_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    p payments%ROWTYPE; s sales%ROWTYPE; v_alloc numeric;
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM fn_refresh_sale_payment(OLD.sale_id);
        RETURN NULL;
    END IF;
    SELECT * INTO p FROM payments WHERE id = NEW.payment_id;
    SELECT * INTO s FROM sales    WHERE id = NEW.sale_id;
    IF p.customer_id IS NOT NULL AND s.customer_id IS NOT NULL AND p.customer_id <> s.customer_id THEN
        RAISE EXCEPTION 'Payment % belongs to a different customer than sale %', p.payment_no, s.sale_no;
    END IF;
    SELECT coalesce(sum(amount),0) INTO v_alloc FROM payment_allocations WHERE payment_id = NEW.payment_id;
    IF v_alloc > p.amount THEN
        RAISE EXCEPTION 'Allocations (%) exceed payment % amount (%)', v_alloc, p.payment_no, p.amount;
    END IF;
    PERFORM fn_refresh_sale_payment(NEW.sale_id);
    RETURN NULL;
END $$;

-- Spread a confirmed customer payment over their oldest unpaid posted sales
CREATE FUNCTION fn_allocate_payment_fifo(p_payment bigint) RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE
    p payments%ROWTYPE; v_left numeric; r record; v_take numeric;
BEGIN
    SELECT * INTO p FROM payments WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment % not found', p_payment; END IF;
    IF p.customer_id IS NULL THEN RAISE EXCEPTION 'Payment % has no customer', p.payment_no; END IF;
    IF p.state <> 'CONFIRMED' THEN RAISE EXCEPTION 'Payment % is not confirmed', p.payment_no; END IF;
    SELECT p.amount - coalesce(sum(amount),0) INTO v_left FROM payment_allocations WHERE payment_id = p_payment;
    FOR r IN SELECT id, balance_due FROM sales
             WHERE customer_id = p.customer_id AND status = 'POSTED' AND balance_due > 0
             ORDER BY sale_date, id LOOP
        EXIT WHEN v_left <= 0;
        v_take := least(v_left, r.balance_due);
        INSERT INTO payment_allocations (payment_id, sale_id, amount) VALUES (p_payment, r.id, v_take)
        ON CONFLICT (payment_id, sale_id) DO UPDATE SET amount = payment_allocations.amount + EXCLUDED.amount;
        v_left := v_left - v_take;
    END LOOP;
    RETURN v_left;     -- amount left unallocated (stays on account)
END $$;

-- Called by the Node.js callback endpoint when Safaricom confirms/denies an STK push
CREATE FUNCTION fn_mpesa_stk_callback(
    p_checkout_request_id text, p_result_code integer, p_result_desc text,
    p_receipt text DEFAULT NULL, p_amount numeric DEFAULT NULL,
    p_phone text DEFAULT NULL, p_trans_date timestamptz DEFAULT NULL, p_raw jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r mpesa_stk_requests%ROWTYPE;
BEGIN
    SELECT * INTO r FROM mpesa_stk_requests WHERE checkout_request_id = p_checkout_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown CheckoutRequestID %', p_checkout_request_id;
    END IF;
    IF r.status = 'SUCCESS' THEN RETURN; END IF;       -- duplicate callback: ignore

    IF p_result_code = 0 THEN
        UPDATE mpesa_stk_requests
           SET status = 'SUCCESS', result_code = 0, result_desc = p_result_desc,
               mpesa_receipt = p_receipt, transaction_date = p_trans_date,
               callback_payload = p_raw, callback_at = now()
         WHERE id = r.id;
        UPDATE payments
           SET state = 'CONFIRMED', mpesa_receipt = p_receipt, confirmed_at = now(),
               payer_phone = coalesce(p_phone, payer_phone)
         WHERE id = r.payment_id AND state IN ('PENDING','FAILED','CANCELLED');
    ELSE
        UPDATE mpesa_stk_requests
           SET status = CASE p_result_code WHEN 1032 THEN 'CANCELLED'::stk_status
                                           WHEN 1037 THEN 'TIMEOUT'::stk_status
                                           ELSE 'FAILED'::stk_status END,
               result_code = p_result_code, result_desc = p_result_desc,
               callback_payload = p_raw, callback_at = now()
         WHERE id = r.id;
        -- only fail the payment if no other STK attempt for it succeeded
        UPDATE payments
           SET state = CASE WHEN p_result_code = 1032 THEN 'CANCELLED'::payment_state ELSE 'FAILED'::payment_state END
         WHERE id = r.payment_id AND state = 'PENDING'
           AND NOT EXISTS (SELECT 1 FROM mpesa_stk_requests o
                           WHERE o.payment_id = r.payment_id AND o.id <> r.id AND o.status IN ('INITIATED','SENT','SUCCESS'));
    END IF;
END $$;

-- ---- receipts --------------------------------------------------------
CREATE FUNCTION fn_issue_receipt(p_sale bigint, p_user bigint DEFAULT NULL) RETURNS receipts
LANGUAGE plpgsql AS $$
DECLARE s sales%ROWTYPE; r receipts%ROWTYPE; v_codes text; v_methods text; v_dup boolean;
BEGIN
    SELECT * INTO s FROM sales WHERE id = p_sale;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale; END IF;
    IF s.status <> 'POSTED' THEN RAISE EXCEPTION 'Receipts are issued for POSTED sales only'; END IF;
    SELECT string_agg(DISTINCT p.mpesa_receipt, ', '), string_agg(DISTINCT p.method::text, ' + ')
      INTO v_codes, v_methods
      FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
     WHERE pa.sale_id = p_sale AND p.state = 'CONFIRMED';
    v_dup := EXISTS (SELECT 1 FROM receipts WHERE sale_id = p_sale);
    INSERT INTO receipts (sale_id, issued_by, total_amount, amount_paid, balance_due,
                          payment_summary, mpesa_codes, is_duplicate)
    VALUES (p_sale, p_user, s.total_amount, s.amount_paid, s.balance_due,
            coalesce(v_methods, CASE WHEN s.is_credit THEN 'CREDIT' ELSE 'UNPAID' END), v_codes, v_dup)
    RETURNING * INTO r;
    RETURN r;
END $$;

-- ---- daily close -----------------------------------------------------
-- p_module NULL (or SHARED) = whole business
CREATE FUNCTION fn_daily_expected(p_date date, p_module module_code DEFAULT NULL)
RETURNS TABLE (expected_cash numeric, expected_mpesa numeric) LANGUAGE sql STABLE AS $$
    SELECT
      coalesce((SELECT sum(amount) FROM payments
                 WHERE state = 'CONFIRMED' AND method = 'CASH' AND fn_local_date(coalesce(confirmed_at, received_at)) = p_date
                   AND (p_module IS NULL OR p_module = 'SHARED' OR module = p_module)), 0)
    - coalesce((SELECT sum(amount) FROM expenses
                 WHERE NOT is_voided AND method = 'CASH' AND expense_date = p_date
                   AND (p_module IS NULL OR p_module = 'SHARED' OR module = p_module)), 0)
    - coalesce((SELECT sum(amount) FROM supplier_payments
                 WHERE method = 'CASH' AND fn_local_date(paid_on) = p_date
                   AND (p_module IS NULL OR p_module = 'SHARED' OR module = p_module)), 0),
      coalesce((SELECT sum(amount) FROM payments
                 WHERE state = 'CONFIRMED' AND method IN ('MPESA_STK','MPESA_MANUAL')
                   AND fn_local_date(coalesce(confirmed_at, received_at)) = p_date
                   AND (p_module IS NULL OR p_module = 'SHARED' OR module = p_module)), 0)
$$;

CREATE FUNCTION fn_perform_daily_close(p_date date, p_module module_code, p_opening_float numeric,
        p_counted_cash numeric, p_counted_mpesa numeric, p_user bigint DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS daily_closes LANGUAGE plpgsql AS $$
DECLARE e record; d daily_closes%ROWTYPE;
BEGIN
    SELECT * INTO e FROM fn_daily_expected(p_date, p_module);
    INSERT INTO daily_closes (close_date, module, opening_float, expected_cash, expected_mpesa,
                              counted_cash, counted_mpesa, status, notes, closed_by, closed_at)
    VALUES (p_date, p_module, p_opening_float, e.expected_cash, e.expected_mpesa,
            p_counted_cash, p_counted_mpesa, 'CLOSED', p_notes, p_user, now())
    ON CONFLICT (close_date, module) DO UPDATE
       SET opening_float = EXCLUDED.opening_float, expected_cash = EXCLUDED.expected_cash,
           expected_mpesa = EXCLUDED.expected_mpesa, counted_cash = EXCLUDED.counted_cash,
           counted_mpesa = EXCLUDED.counted_mpesa, status = 'CLOSED', notes = EXCLUDED.notes,
           closed_by = EXCLUDED.closed_by, closed_at = now()
       WHERE daily_closes.status = 'OPEN'
    RETURNING * INTO d;
    IF NOT FOUND THEN RAISE EXCEPTION 'The % close for % is already CLOSED', p_module, p_date; END IF;
    RETURN d;
END $$;

-- ---- margin report (per grain / item) --------------------------------
CREATE FUNCTION fn_margin_report(p_from date, p_to date, p_module module_code DEFAULT NULL)
RETURNS TABLE (item_id bigint, item_name text, kg_sold numeric, revenue numeric, cost numeric,
               profit numeric, margin_pct numeric, profit_per_kg numeric)
LANGUAGE sql STABLE AS $$
    SELECT i.id, i.name,
           sum(l.quantity_kg),
           round(sum(l.line_total * CASE WHEN s.subtotal > 0 THEN s.total_amount / s.subtotal ELSE 1 END), 2),
           round(sum(coalesce(l.unit_cost_per_kg,0) * l.quantity_kg), 2),
           round(sum(l.line_total * CASE WHEN s.subtotal > 0 THEN s.total_amount / s.subtotal ELSE 1 END)
               - sum(coalesce(l.unit_cost_per_kg,0) * l.quantity_kg), 2),
           round(100 * (sum(l.line_total * CASE WHEN s.subtotal > 0 THEN s.total_amount / s.subtotal ELSE 1 END)
               - sum(coalesce(l.unit_cost_per_kg,0) * l.quantity_kg))
               / nullif(sum(l.line_total * CASE WHEN s.subtotal > 0 THEN s.total_amount / s.subtotal ELSE 1 END), 0), 2),
           round((sum(l.line_total * CASE WHEN s.subtotal > 0 THEN s.total_amount / s.subtotal ELSE 1 END)
               - sum(coalesce(l.unit_cost_per_kg,0) * l.quantity_kg)) / nullif(sum(l.quantity_kg), 0), 2)
    FROM sale_lines l
    JOIN sales s ON s.id = l.sale_id
    JOIN items i ON i.id = l.item_id
    WHERE l.line_type = 'ITEM' AND s.status = 'POSTED'
      AND fn_local_date(s.sale_date) BETWEEN p_from AND p_to
      AND (p_module IS NULL OR s.module = p_module)
    GROUP BY i.id, i.name
    ORDER BY 6 DESC
$$;

/* =====================================================================
   12. TRIGGERS
   ===================================================================== */
-- stock ledger
CREATE TRIGGER trg_stock_movements_before BEFORE INSERT ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION fn_stock_movement_before();
CREATE TRIGGER trg_stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION fn_block_mutation();
CREATE TRIGGER trg_customer_ledger_immutable BEFORE UPDATE OR DELETE ON customer_ledger
    FOR EACH ROW EXECUTE FUNCTION fn_block_mutation();
CREATE TRIGGER trg_supplier_ledger_immutable BEFORE UPDATE OR DELETE ON supplier_ledger
    FOR EACH ROW EXECUTE FUNCTION fn_block_mutation();
CREATE TRIGGER trg_activity_log_immutable BEFORE UPDATE OR DELETE ON activity_log
    FOR EACH ROW EXECUTE FUNCTION fn_block_mutation();

-- customers
CREATE TRIGGER trg_customers_before BEFORE INSERT OR UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION fn_customer_before();

-- items / prices
CREATE TRIGGER trg_items_after_insert AFTER INSERT ON items
    FOR EACH ROW EXECUTE FUNCTION fn_item_after_insert();
CREATE TRIGGER trg_item_prices_before BEFORE INSERT ON item_prices
    FOR EACH ROW EXECUTE FUNCTION fn_item_price_before();

-- adjustments and stock takes
CREATE TRIGGER trg_stock_adj_before BEFORE INSERT ON stock_adjustments
    FOR EACH ROW EXECUTE FUNCTION fn_stock_adjustment_before();
CREATE TRIGGER trg_stock_adj_after AFTER INSERT ON stock_adjustments
    FOR EACH ROW EXECUTE FUNCTION fn_stock_adjustment_after();
CREATE TRIGGER trg_stock_take_line_before BEFORE INSERT ON stock_take_lines
    FOR EACH ROW EXECUTE FUNCTION fn_stock_take_line_before();

-- purchases
CREATE TRIGGER trg_purchase_line_before BEFORE INSERT OR UPDATE OR DELETE ON purchase_lines
    FOR EACH ROW EXECUTE FUNCTION fn_purchase_line_before();
CREATE TRIGGER trg_purchase_line_after AFTER INSERT OR UPDATE OR DELETE ON purchase_lines
    FOR EACH ROW EXECUTE FUNCTION fn_purchase_line_after();
CREATE TRIGGER trg_supplier_payment_after AFTER INSERT ON supplier_payments
    FOR EACH ROW EXECUTE FUNCTION fn_supplier_payment_after();

-- transfers
CREATE TRIGGER trg_transfer_before BEFORE INSERT ON module_transfers
    FOR EACH ROW EXECUTE FUNCTION fn_transfer_before();
CREATE TRIGGER trg_transfer_after AFTER INSERT ON module_transfers
    FOR EACH ROW EXECUTE FUNCTION fn_transfer_after();

-- mill
CREATE TRIGGER trg_mill_job_before BEFORE INSERT OR UPDATE ON mill_jobs
    FOR EACH ROW EXECUTE FUNCTION fn_mill_job_before();
CREATE TRIGGER trg_mill_job_after AFTER INSERT OR UPDATE ON mill_jobs
    FOR EACH ROW EXECUTE FUNCTION fn_mill_job_after();
CREATE TRIGGER trg_mill_output_before BEFORE INSERT ON mill_job_outputs
    FOR EACH ROW EXECUTE FUNCTION fn_mill_output_before();
CREATE TRIGGER trg_mill_output_after AFTER INSERT ON mill_job_outputs
    FOR EACH ROW EXECUTE FUNCTION fn_mill_output_after();

-- sales
CREATE TRIGGER trg_sales_before BEFORE INSERT OR UPDATE OR DELETE ON sales
    FOR EACH ROW EXECUTE FUNCTION fn_sale_before();
CREATE TRIGGER trg_sale_line_before BEFORE INSERT OR UPDATE OR DELETE ON sale_lines
    FOR EACH ROW EXECUTE FUNCTION fn_sale_line_before();
CREATE TRIGGER trg_sale_line_after AFTER INSERT OR UPDATE OR DELETE ON sale_lines
    FOR EACH ROW EXECUTE FUNCTION fn_sale_line_after();

-- payments
CREATE TRIGGER trg_payment_before BEFORE INSERT OR UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_payment_before();
CREATE TRIGGER trg_payment_after AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_payment_after();
CREATE TRIGGER trg_allocation_check AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
    FOR EACH ROW EXECUTE FUNCTION fn_allocation_check();

-- activity log: price changes, adjustments, voided sales, master data, security
CREATE TRIGGER trg_audit_item_prices   AFTER INSERT OR UPDATE OR DELETE ON item_prices
    FOR EACH ROW EXECUTE FUNCTION fn_audit('PRICE');
CREATE TRIGGER trg_audit_item_min      AFTER INSERT OR UPDATE OR DELETE ON item_min_prices
    FOR EACH ROW EXECUTE FUNCTION fn_audit('PRICE');
CREATE TRIGGER trg_audit_milling_rates AFTER INSERT OR UPDATE OR DELETE ON milling_rates
    FOR EACH ROW EXECUTE FUNCTION fn_audit('PRICE');
CREATE TRIGGER trg_audit_yield_std     AFTER INSERT OR UPDATE OR DELETE ON yield_standards
    FOR EACH ROW EXECUTE FUNCTION fn_audit('MASTER_DATA');
CREATE TRIGGER trg_audit_adjustments   AFTER INSERT OR UPDATE OR DELETE ON stock_adjustments
    FOR EACH ROW EXECUTE FUNCTION fn_audit('ADJUSTMENT');
CREATE TRIGGER trg_audit_transfers     AFTER INSERT ON module_transfers
    FOR EACH ROW EXECUTE FUNCTION fn_audit('ADJUSTMENT');
CREATE TRIGGER trg_audit_sale_status   AFTER UPDATE ON sales
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION fn_audit('SALE_STATUS');
CREATE TRIGGER trg_audit_sale_discount AFTER UPDATE ON sales
    FOR EACH ROW WHEN (OLD.discount_amount IS DISTINCT FROM NEW.discount_amount)
    EXECUTE FUNCTION fn_audit('SALE_STATUS');
CREATE TRIGGER trg_audit_payments      AFTER UPDATE ON payments
    FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state OR OLD.amount IS DISTINCT FROM NEW.amount)
    EXECUTE FUNCTION fn_audit('FINANCE');
CREATE TRIGGER trg_audit_expenses      AFTER INSERT OR UPDATE OR DELETE ON expenses
    FOR EACH ROW EXECUTE FUNCTION fn_audit('FINANCE');
CREATE TRIGGER trg_audit_supplier_pay  AFTER INSERT ON supplier_payments
    FOR EACH ROW EXECUTE FUNCTION fn_audit('FINANCE');
CREATE TRIGGER trg_audit_customers     AFTER INSERT OR UPDATE OR DELETE ON customers
    FOR EACH ROW EXECUTE FUNCTION fn_audit('MASTER_DATA');
CREATE TRIGGER trg_audit_suppliers     AFTER INSERT OR UPDATE OR DELETE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION fn_audit('MASTER_DATA');
CREATE TRIGGER trg_audit_items         AFTER INSERT OR UPDATE OR DELETE ON items
    FOR EACH ROW EXECUTE FUNCTION fn_audit('MASTER_DATA');
CREATE TRIGGER trg_audit_users         AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_audit('SECURITY');
CREATE TRIGGER trg_audit_roleperms     AFTER INSERT OR UPDATE OR DELETE ON role_permissions
    FOR EACH ROW EXECUTE FUNCTION fn_audit('SECURITY');
CREATE TRIGGER trg_audit_settings      AFTER INSERT OR UPDATE OR DELETE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION fn_audit('SECURITY');
CREATE TRIGGER trg_audit_daily_close   AFTER INSERT OR UPDATE ON daily_closes
    FOR EACH ROW EXECUTE FUNCTION fn_audit('FINANCE');
CREATE TRIGGER trg_audit_yield_alerts  AFTER UPDATE ON yield_alerts
    FOR EACH ROW EXECUTE FUNCTION fn_audit('ADJUSTMENT');

-- keep updated_at fresh on every table that has the column
DO $do$
DECLARE r record;
BEGIN
    FOR r IN SELECT table_name FROM information_schema.columns
             WHERE table_schema = 'pmc' AND column_name = 'updated_at'
    LOOP
        EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON pmc.%1$I
                        FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at()', r.table_name);
    END LOOP;
END $do$;

/* =====================================================================
   13. REPORTING / DASHBOARD VIEWS
   ===================================================================== */
CREATE VIEW v_stock_current AS
SELECT sb.item_id, i.sku, i.name AS item_name, i.kind, g.name AS grain, gr.name AS grade,
       sb.pool, sb.quantity_kg, sb.avg_cost_per_kg,
       round(sb.quantity_kg * sb.avg_cost_per_kg, 2) AS stock_value,
       i.reorder_level_kg,
       (sb.pool <> 'CUSTOMER_GRAIN' AND i.reorder_level_kg > 0 AND sb.quantity_kg <= i.reorder_level_kg) AS is_low
FROM stock_balances sb
JOIN items i       ON i.id = sb.item_id
LEFT JOIN grains g ON g.id = i.grain_id
LEFT JOIN grades gr ON gr.id = i.grade_id;

CREATE VIEW v_low_stock AS
SELECT * FROM v_stock_current WHERE is_low ORDER BY item_name;

-- Customer grain held for milling (never part of the mill's own stock)
CREATE VIEW v_customer_grain_held AS
SELECT sm.customer_id, c.full_name, sm.item_id, i.name AS grain, sum(sm.quantity_kg) AS kg_held
FROM stock_movements sm
JOIN customers c ON c.id = sm.customer_id
JOIN items i     ON i.id = sm.item_id
WHERE sm.pool = 'CUSTOMER_GRAIN'
GROUP BY sm.customer_id, c.full_name, sm.item_id, i.name
HAVING sum(sm.quantity_kg) <> 0;

CREATE VIEW v_customer_balances AS
SELECT c.id AS customer_id, c.customer_code, c.full_name, c.phone, c.customer_type,
       c.credit_allowed, c.credit_limit,
       coalesce(l.balance, 0) AS balance,
       coalesce(o.overdue_amount, 0) AS overdue_amount,
       l.last_activity
FROM customers c
LEFT JOIN (SELECT customer_id, sum(debit - credit) AS balance, max(entry_date) AS last_activity
           FROM customer_ledger GROUP BY customer_id) l ON l.customer_id = c.id
LEFT JOIN (SELECT customer_id, sum(balance_due) AS overdue_amount
           FROM sales
           WHERE status = 'POSTED' AND balance_due > 0 AND due_date < fn_local_date(now())
           GROUP BY customer_id) o ON o.customer_id = c.id;

CREATE VIEW v_credit_overdue AS
SELECT s.id AS sale_id, s.sale_no, s.module, s.customer_id, c.full_name, c.phone,
       s.sale_date, s.due_date, s.total_amount, s.amount_paid, s.balance_due,
       fn_local_date(now()) - s.due_date AS days_overdue
FROM sales s
JOIN customers c ON c.id = s.customer_id
WHERE s.status = 'POSTED' AND s.balance_due > 0 AND s.due_date IS NOT NULL AND s.due_date < fn_local_date(now())
ORDER BY s.due_date;

CREATE VIEW v_receivables_aging AS
SELECT s.customer_id, c.full_name,
       sum(s.balance_due) FILTER (WHERE age <= 7)             AS d0_7,
       sum(s.balance_due) FILTER (WHERE age BETWEEN 8 AND 30)  AS d8_30,
       sum(s.balance_due) FILTER (WHERE age BETWEEN 31 AND 60) AS d31_60,
       sum(s.balance_due) FILTER (WHERE age > 60)              AS d60_plus,
       sum(s.balance_due)                                      AS total_outstanding
FROM (SELECT *, fn_local_date(now()) - coalesce(due_date, fn_local_date(sale_date)) AS age
      FROM sales WHERE status = 'POSTED' AND balance_due > 0 AND customer_id IS NOT NULL) s
JOIN customers c ON c.id = s.customer_id
GROUP BY s.customer_id, c.full_name;

CREATE VIEW v_supplier_balances AS
SELECT sp.id AS supplier_id, sp.supplier_code, sp.name, sp.phone,
       coalesce(sum(l.credit - l.debit), 0) AS amount_owed
FROM suppliers sp
LEFT JOIN supplier_ledger l ON l.supplier_id = sp.id
GROUP BY sp.id, sp.supplier_code, sp.name, sp.phone;

CREATE VIEW v_sales_daily AS
SELECT fn_local_date(sale_date) AS day, module,
       count(*) AS sales_count,
       sum(total_amount) AS sales_total,
       sum(amount_paid)  AS collected,
       sum(balance_due)  AS outstanding
FROM sales WHERE status = 'POSTED'
GROUP BY 1, 2;

-- Cash against M-Pesa, per day and module
CREATE VIEW v_payments_daily AS
SELECT fn_local_date(coalesce(confirmed_at, received_at)) AS day, module,
       sum(amount) FILTER (WHERE method = 'CASH')                              AS cash,
       sum(amount) FILTER (WHERE method IN ('MPESA_STK','MPESA_MANUAL'))       AS mpesa,
       sum(amount) FILTER (WHERE method = 'MPESA_STK')                         AS mpesa_stk,
       sum(amount) FILTER (WHERE method = 'MPESA_MANUAL')                      AS mpesa_manual,
       sum(amount) FILTER (WHERE method IN ('BANK','OTHER'))                   AS other,
       sum(amount)                                                             AS total
FROM payments WHERE state = 'CONFIRMED'
GROUP BY 1, 2;

CREATE VIEW v_sale_line_margin AS
SELECT s.id AS sale_id, s.sale_no, fn_local_date(s.sale_date) AS day, s.module, l.id AS line_id,
       l.item_id, i.name AS item_name, l.quantity_kg,
       round(l.line_total * CASE WHEN s.subtotal > 0 THEN s.total_amount / s.subtotal ELSE 1 END, 2) AS revenue,
       round(coalesce(l.unit_cost_per_kg,0) * l.quantity_kg, 2) AS cost,
       round(l.line_total * CASE WHEN s.subtotal > 0 THEN s.total_amount / s.subtotal ELSE 1 END
             - coalesce(l.unit_cost_per_kg,0) * l.quantity_kg, 2) AS profit
FROM sale_lines l
JOIN sales s ON s.id = l.sale_id AND s.status = 'POSTED'
JOIN items i ON i.id = l.item_id
WHERE l.line_type = 'ITEM';

-- Profit per grain / per kg (all time; use fn_margin_report for a date range)
CREATE VIEW v_margin_per_grain AS
SELECT item_id, item_name, sum(quantity_kg) AS kg_sold, sum(revenue) AS revenue, sum(cost) AS cost,
       sum(profit) AS profit,
       round(100 * sum(profit) / nullif(sum(revenue),0), 2) AS margin_pct,
       round(sum(profit) / nullif(sum(quantity_kg),0), 2)   AS profit_per_kg
FROM v_sale_line_margin GROUP BY item_id, item_name;

CREATE VIEW v_mill_jobs_open AS
SELECT j.id, j.ticket_no, j.status, j.received_at,
       coalesce(c.full_name, j.walkin_name) AS customer, i.name AS grain, j.weight_in_kg,
       j.charge_amount, u.full_name AS miller,
       round(extract(epoch FROM (now() - j.received_at)) / 3600, 1) AS hours_open
FROM mill_jobs j
JOIN items i ON i.id = j.grain_item_id
LEFT JOIN customers c ON c.id = j.customer_id
LEFT JOIN users u ON u.id = j.miller_id
WHERE j.status IN ('WAITING','MILLING','READY');

CREATE VIEW v_mill_yield_report AS
SELECT j.id AS job_id, j.ticket_no, fn_local_date(j.received_at) AS day, i.name AS grain,
       j.weight_in_kg, j.expected_flour_kg, j.weight_out_kg, j.bran_kg,
       j.yield_pct, j.yield_status, u.full_name AS miller,
       a.status AS alert_status, a.shortfall_kg
FROM mill_jobs j
JOIN items i ON i.id = j.grain_item_id
LEFT JOIN users u ON u.id = j.miller_id
LEFT JOIN yield_alerts a ON a.job_id = j.id
WHERE j.weight_out_kg IS NOT NULL;

CREATE VIEW v_mill_yield_by_grain AS
SELECT grain, count(*) AS jobs, sum(weight_in_kg) AS kg_in, sum(weight_out_kg) AS kg_out,
       round(100 * sum(weight_out_kg) / nullif(sum(weight_in_kg),0), 2) AS avg_yield_pct,
       count(*) FILTER (WHERE yield_status = 'LOW') AS low_yield_jobs
FROM v_mill_yield_report GROUP BY grain;

CREATE VIEW v_expenses_daily AS
SELECT e.expense_date AS day, e.module, c.name AS category, sum(e.amount) AS total
FROM expenses e JOIN expense_categories c ON c.id = e.category_id
WHERE NOT e.is_voided GROUP BY 1, 2, 3;

CREATE VIEW v_profit_daily AS
WITH rev AS (
    SELECT fn_local_date(sale_date) AS day, module, sum(total_amount) AS revenue
    FROM sales WHERE status = 'POSTED' GROUP BY 1, 2),
cogs AS (
    SELECT fn_local_date(s.sale_date) AS day, s.module, sum(coalesce(l.unit_cost_per_kg,0) * l.quantity_kg) AS cogs
    FROM sale_lines l JOIN sales s ON s.id = l.sale_id
    WHERE s.status = 'POSTED' AND l.line_type = 'ITEM' GROUP BY 1, 2),
exp AS (
    SELECT expense_date AS day, module, sum(amount) AS expenses
    FROM expenses WHERE NOT is_voided GROUP BY 1, 2),
keys AS (
    SELECT day, module FROM rev UNION SELECT day, module FROM cogs UNION SELECT day, module FROM exp)
SELECT k.day, k.module,
       coalesce(r.revenue, 0)  AS revenue,
       round(coalesce(c.cogs, 0), 2) AS cogs,
       round(coalesce(r.revenue, 0) - coalesce(c.cogs, 0), 2) AS gross_profit,
       coalesce(e.expenses, 0) AS expenses,
       round(coalesce(r.revenue, 0) - coalesce(c.cogs, 0) - coalesce(e.expenses, 0), 2) AS net_profit
FROM keys k
LEFT JOIN rev  r ON r.day = k.day AND r.module = k.module
LEFT JOIN cogs c ON c.day = k.day AND c.module = k.module
LEFT JOIN exp  e ON e.day = k.day AND e.module = k.module;

-- Owner dashboard, today: one row per module plus a combined ALL row
CREATE VIEW v_owner_dashboard_today AS
WITH t AS (SELECT fn_local_date(now()) AS d),
m AS (
    SELECT mod.module,
           coalesce((SELECT sum(sales_count) FROM v_sales_daily v, t WHERE v.day = t.d AND v.module = mod.module), 0) AS sales_count,
           coalesce((SELECT sum(sales_total) FROM v_sales_daily v, t WHERE v.day = t.d AND v.module = mod.module), 0) AS sales_total,
           coalesce((SELECT sum(cash)        FROM v_payments_daily v, t WHERE v.day = t.d AND v.module = mod.module), 0) AS cash_in,
           coalesce((SELECT sum(mpesa)       FROM v_payments_daily v, t WHERE v.day = t.d AND v.module = mod.module), 0) AS mpesa_in,
           coalesce((SELECT sum(net_profit)  FROM v_profit_daily v, t WHERE v.day = t.d AND v.module = mod.module), 0) AS net_profit
    FROM (VALUES ('MILL'::module_code), ('CEREAL'::module_code)) AS mod(module))
SELECT module::text AS scope, sales_count, sales_total, cash_in, mpesa_in, net_profit FROM m
UNION ALL
SELECT 'ALL', sum(sales_count), sum(sales_total), sum(cash_in), sum(mpesa_in),
       coalesce((SELECT sum(net_profit) FROM v_profit_daily v, t WHERE v.day = t.d), 0)   -- includes SHARED expenses
FROM m;

CREATE VIEW v_owner_alerts AS
SELECT
    (SELECT count(*) FROM v_stock_current WHERE is_low)                              AS low_stock_items,
    (SELECT coalesce(sum(balance_due),0) FROM sales WHERE status = 'POSTED' AND balance_due > 0) AS credit_outstanding,
    (SELECT coalesce(sum(balance_due),0) FROM v_credit_overdue)                      AS credit_overdue,
    (SELECT count(*) FROM yield_alerts WHERE status = 'OPEN')                        AS open_yield_alerts,
    (SELECT count(*) FROM mill_jobs WHERE status IN ('WAITING','MILLING'))           AS jobs_in_progress,
    (SELECT count(*) FROM mill_jobs WHERE status = 'READY')                          AS jobs_awaiting_collection,
    (SELECT coalesce(sum(amount_owed),0) FROM v_supplier_balances)                   AS owed_to_suppliers,
    (SELECT count(*) FROM payments WHERE state = 'PENDING' AND received_at < now() - interval '10 minutes') AS stale_pending_payments;

CREATE VIEW v_stock_value_summary AS
SELECT pool, count(*) AS items, sum(quantity_kg) AS total_kg, round(sum(quantity_kg * avg_cost_per_kg), 2) AS stock_value
FROM stock_balances GROUP BY pool;

CREATE VIEW v_current_prices AS
SELECT ip.item_id, i.name AS item_name, t.code AS tier, u.code AS unit, ip.price,
       round(ip.price / fn_kg_per_unit(ip.item_id, ip.unit_id), 2) AS price_per_kg,
       mp.min_price_per_kg, ip.effective_from
FROM item_prices ip
JOIN items i ON i.id = ip.item_id
JOIN price_tiers t ON t.id = ip.tier_id
JOIN units u ON u.id = ip.unit_id
LEFT JOIN item_min_prices mp ON mp.item_id = ip.item_id
WHERE ip.effective_to IS NULL;

/* =====================================================================
   14. SEED DATA
   ===================================================================== */
INSERT INTO business_profile (business_name, owner_name, default_receipt_style, receipt_footer)
VALUES ('Posho Mill & Cereals', 'Fred', 'BOTH', 'Thank you for your business!');

INSERT INTO mpesa_config (environment, is_active) VALUES ('sandbox', false);

INSERT INTO app_settings (key, value, description) VALUES
 ('allow_negative_stock',   'false',   'If false, a sale/transfer that would take stock below zero is rejected'),
 ('default_credit_days',    '7',       'Default days before credit sales fall due'),
 ('yield_check_enabled',    'true',    'Compare flour out with expected yield on every job'),
 ('currency',               '"KES"',   'Currency code'),
 ('receipt_style',          '"BOTH"',  'PRINT, WHATSAPP or BOTH'),
 ('stk_timeout_seconds',    '60',      'Seconds to wait for an STK push result before marking it TIMEOUT');

-- Roles
INSERT INTO roles (code, name, description, is_system) VALUES
 ('OWNER',   'Owner',   'Full access to everything',                                   true),
 ('MANAGER', 'Manager', 'Runs daily operations; can override prices and void sales',   true),
 ('CASHIER', 'Cashier', 'Sales, payments and receipts',                                true),
 ('MILLER',  'Miller',  'Creates and updates milling jobs',                            true);

INSERT INTO permissions (code, description) VALUES
 ('dashboard.view',      'See the owner dashboard'),
 ('reports.view',        'View reports'),
 ('reports.export',      'Download reports as PDF / Excel'),
 ('sales.create',        'Create and post sales'),
 ('sales.void',          'Void a posted sale'),
 ('sales.discount',      'Give discounts'),
 ('price.override',      'Sell below the minimum price'),
 ('price.edit',          'Change price lists, minimum prices and milling rates'),
 ('payments.create',     'Take payments and send STK push'),
 ('payments.mpesa_manual','Enter an M-Pesa code manually'),
 ('payments.reverse',    'Reverse a confirmed payment'),
 ('credit.grant',        'Approve customers for credit and set limits'),
 ('customers.manage',    'Add and edit customers'),
 ('suppliers.manage',    'Add and edit suppliers'),
 ('purchases.create',    'Record purchases'),
 ('stock.view',          'View stock'),
 ('stock.adjust',        'Make stock adjustments and stock takes'),
 ('transfers.create',    'Move stock between mill and cereal'),
 ('mill.job.create',     'Create milling jobs'),
 ('mill.job.update',     'Update job status and weights'),
 ('mill.yield.review',   'Review yield alerts'),
 ('mill.machine.log',    'Record machine and power logs'),
 ('expenses.manage',     'Record expenses'),
 ('deliveries.manage',   'Manage deliveries'),
 ('daily_close.perform', 'Do the daily close'),
 ('activity.view',       'View the activity log'),
 ('users.manage',        'Manage users and roles'),
 ('settings.manage',     'Change business settings and M-Pesa configuration');

-- OWNER gets everything
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = 'OWNER';
-- MANAGER: everything except users/settings
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.code = 'MANAGER' AND p.code NOT IN ('users.manage','settings.manage');
-- CASHIER
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.code = 'CASHIER' AND p.code IN
   ('sales.create','payments.create','payments.mpesa_manual','customers.manage','stock.view','deliveries.manage');
-- MILLER
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.code = 'MILLER' AND p.code IN
   ('mill.job.create','mill.job.update','mill.machine.log','stock.view');

-- First user: the owner.  CHANGE THIS PASSWORD IMMEDIATELY (must_change_password is on).
INSERT INTO users (username, full_name, password_hash, role_id, allowed_modules)
SELECT 'owner', 'Fred (Owner)', crypt('ChangeMe#2026', gen_salt('bf', 10)), r.id,
       ARRAY['MILL','CEREAL','SHARED']::module_code[]
FROM roles r WHERE r.code = 'OWNER';

-- Units (TIN varies by item - see item_units)
INSERT INTO units (code, name, kg_per_unit) VALUES
 ('KG',      'Kilogram',      1),
 ('BAG_25',  '25 kg bag',     25),
 ('BAG_50',  '50 kg bag',     50),
 ('BAG_90',  '90 kg bag',     90),
 ('TIN',     'Tin (gorogoro)', NULL),
 ('PKT_1KG', '1 kg packet',   1),
 ('PKT_2KG', '2 kg packet',   2);

INSERT INTO price_tiers (code, name) VALUES ('RETAIL','Retail'), ('WHOLESALE','Wholesale');

INSERT INTO grains (code, name, category, is_millable) VALUES
 ('MAIZE',   'Maize',       'CEREAL', true),
 ('BEANS',   'Beans',       'PULSE',  false),
 ('GREENGRAM','Green grams (ndengu)', 'PULSE', false),
 ('RICE',    'Rice',        'CEREAL', false),
 ('MILLET',  'Millet',      'CEREAL', true),
 ('SORGHUM', 'Sorghum',     'CEREAL', true);

INSERT INTO grades (code, name, sort_order) VALUES
 ('GRADE_1',  'Grade 1',  1),
 ('GRADE_2',  'Grade 2',  2),
 ('STANDARD', 'Standard', 3),
 ('MIXED',    'Mixed',    4);

INSERT INTO items (sku, name, kind, grain_id, grade_id, owner_module, is_millable)
SELECT v.sku, v.name, v.kind::item_kind, g.id, gr.id, v.owner::module_code, v.millable
FROM (VALUES
    ('MAIZE-G1',   'Maize - Grade 1',        'GRAIN', 'MAIZE',    'GRADE_1',  'CEREAL', true),
    ('MAIZE-G2',   'Maize - Grade 2',        'GRAIN', 'MAIZE',    'GRADE_2',  'CEREAL', true),
    ('BEANS-STD',  'Beans',                  'GRAIN', 'BEANS',    'STANDARD', 'CEREAL', false),
    ('GGRAM-STD',  'Green grams',            'GRAIN', 'GREENGRAM','STANDARD', 'CEREAL', false),
    ('RICE-STD',   'Rice',                   'GRAIN', 'RICE',     'STANDARD', 'CEREAL', false),
    ('MILLET-STD', 'Millet',                 'GRAIN', 'MILLET',   'STANDARD', 'CEREAL', true),
    ('SORGH-STD',  'Sorghum',                'GRAIN', 'SORGHUM',  'STANDARD', 'CEREAL', true),
    ('FLOUR-MAIZE','Maize flour',            'FLOUR', 'MAIZE',    NULL,       'MILL',   false),
    ('FLOUR-MILLET','Millet flour',          'FLOUR', 'MILLET',   NULL,       'MILL',   false),
    ('FLOUR-SORGH','Sorghum flour',          'FLOUR', 'SORGHUM',  NULL,       'MILL',   false),
    ('BRAN-MAIZE', 'Maize bran (pumba)',     'BRAN',  'MAIZE',    NULL,       'MILL',   false)
) AS v(sku, name, kind, grain_code, grade_code, owner, millable)
LEFT JOIN grains g  ON g.code  = v.grain_code
LEFT JOIN grades gr ON gr.code = v.grade_code;

-- !! PLACEHOLDER: 1 tin = 2 kg for every grain/flour. Calibrate each item with your own tin. !!
INSERT INTO item_units (item_id, unit_id, kg_per_unit)
SELECT i.id, u.id, 2 FROM items i, units u
WHERE u.code = 'TIN' AND i.kind IN ('GRAIN','FLOUR');

-- Flour can also be sold in packets
INSERT INTO item_units (item_id, unit_id, kg_per_unit)
SELECT i.id, u.id, u.kg_per_unit FROM items i, units u
WHERE i.kind = 'FLOUR' AND u.code IN ('PKT_1KG','PKT_2KG');

-- !! PLACEHOLDER yields (per 100 kg grain). Calibrate after a week of real jobs. !!
INSERT INTO yield_standards (grain_item_id, flour_item_id, bran_item_id,
                             expected_flour_kg_per_100, expected_bran_kg_per_100, alert_below_kg_per_100, notes)
SELECT gi.id, fl.id, br.id, v.flour, v.bran, v.alert, 'Placeholder - calibrate with real data'
FROM (VALUES
    ('MAIZE-G1',   'FLOUR-MAIZE',  'BRAN-MAIZE', 90, 8, 87),
    ('MAIZE-G2',   'FLOUR-MAIZE',  'BRAN-MAIZE', 90, 8, 87),
    ('MILLET-STD', 'FLOUR-MILLET', NULL,         92, 6, 89),
    ('SORGH-STD',  'FLOUR-SORGH',  NULL,         92, 6, 89)
) AS v(grain_sku, flour_sku, bran_sku, flour, bran, alert)
JOIN items gi ON gi.sku = v.grain_sku
JOIN items fl ON fl.sku = v.flour_sku
LEFT JOIN items br ON br.sku = v.bran_sku;

INSERT INTO expense_categories (code, name) VALUES
 ('POWER',     'Electricity / power'),
 ('FUEL',      'Fuel'),
 ('REPAIRS',   'Repairs & maintenance'),
 ('WAGES',     'Wages & salaries'),
 ('RENT',      'Rent'),
 ('TRANSPORT', 'Transport & delivery'),
 ('PACKAGING', 'Packaging (bags, packets)'),
 ('LICENCES',  'Licences & permits'),
 ('AIRTIME',   'Airtime, data & SMS'),
 ('LOSS',      'Losses & write-offs'),
 ('OTHER',     'Other');

INSERT INTO machines (name, kind, power_source) VALUES ('Main hammer mill', 'HAMMER_MILL', 'ELECTRIC');

-- =====================================================================
-- 15. ROLES AND MODULE (BUSINESS) ACCESS  -- safe to run more than once
-- The permissions themselves live in src/config/access.js (not in the role_permissions table),
-- so this part only makes sure the roles exist and the users' modules match their role.
-- =====================================================================

-- 1) the roles (OWNER and MILLER already exist; CASHIER / MANAGER keep working as old codes)
INSERT INTO roles (code, name)
SELECT v.code, v.name
  FROM (VALUES
          ('MILL_MANAGER',   'Mill manager'),
          ('MILLER',         'Miller'),
          ('CEREAL_MANAGER', 'Cereal manager'),
          ('CEREAL_CASHIER', 'Cereal cashier')
       ) AS v(code, name)
 WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE upper(r.code) = v.code);

-- 2) each user's modules follow their role: mill staff -> MILL only, cereal staff (and old cashiers) -> CEREAL only
UPDATE users u SET allowed_modules = ARRAY['MILL']::module_code[]
  FROM roles r WHERE r.id = u.role_id AND upper(r.code) IN ('MILL_MANAGER', 'MILLER');

UPDATE users u SET allowed_modules = ARRAY['CEREAL']::module_code[]
  FROM roles r WHERE r.id = u.role_id AND upper(r.code) IN ('CEREAL_MANAGER', 'CEREAL_CASHIER', 'CASHIER');

UPDATE users u SET allowed_modules = ARRAY['MILL', 'CEREAL']::module_code[]
  FROM roles r WHERE r.id = u.role_id AND upper(r.code) = 'OWNER';

-- 3) check:  SELECT u.username, r.code AS role, u.allowed_modules FROM users u JOIN roles r ON r.id = u.role_id ORDER BY r.code, u.username;

-- =====================================================================
-- 16. PERMISSION CODES USED BY THE APP  -- safe to run more than once
-- The owner's access is built from the whole `permissions` table, so every code the routes and
-- screens check must exist here, or the owner gets 403 on that feature in a fresh database.
-- =====================================================================
INSERT INTO permissions (code, description) VALUES
  ('backups.view', 'View the backup history'),
  ('catalogue.manage', 'Manage grains, grades, units and items'),
  ('customers.create', 'Add customers'),
  ('customers.opening_balance', 'Set a customer opening balance'),
  ('customers.update', 'Edit customers'),
  ('customers.view', 'View customers'),
  ('daily_close.reopen', 'Reopen a closed day'),
  ('daily_close.view', 'View daily closes'),
  ('deliveries.view', 'View deliveries'),
  ('expenses.create', 'Record expenses'),
  ('expenses.view', 'View expenses'),
  ('expenses.void', 'Void an expense'),
  ('mill.cancel', 'Cancel a milling job'),
  ('mill.collect', 'Hand over finished milling jobs'),
  ('mill.create', 'Create milling jobs'),
  ('mill.machines', 'Manage machines and power logs'),
  ('mill.update', 'Update milling jobs'),
  ('mill.view', 'View the job board and mill screens'),
  ('mill.yield', 'Review yield alerts and standards'),
  ('payments.view', 'View payments'),
  ('prices.min_price', 'Set minimum prices'),
  ('prices.update', 'Change price lists'),
  ('purchases.post', 'Post purchases to stock'),
  ('purchases.view', 'View purchases'),
  ('rates.manage', 'Change milling rates'),
  ('reports.profit', 'See profit, margin and stock value reports'),
  ('roles.manage', 'Edit roles'),
  ('roles.view', 'View roles'),
  ('sales.view', 'View sales'),
  ('settings.view', 'View business settings'),
  ('stock.opening', 'Enter opening stock'),
  ('stock.take', 'Count stock'),
  ('stock.take_post', 'Post a stock take'),
  ('stock.transfer', 'Move stock between mill and cereal'),
  ('suppliers.create', 'Add suppliers'),
  ('suppliers.opening_balance', 'Set a supplier opening balance'),
  ('suppliers.update', 'Edit suppliers'),
  ('suppliers.view', 'View suppliers'),
  ('users.create', 'Add users'),
  ('users.reset_password', 'Reset a user password'),
  ('users.unlock', 'Unlock a user account'),
  ('users.update', 'Edit users'),
  ('users.view', 'View users')
ON CONFLICT (code) DO NOTHING;

-- keep the OWNER role's table rows complete too
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.code = 'OWNER'
   AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

COMMIT;

/* =====================================================================
   OPTIONAL (run separately, as a superuser if needed)
   ---------------------------------------------------------------------
   -- A limited login for the Node.js app instead of using postgres:
   -- CREATE ROLE pmc_app LOGIN PASSWORD 'use-a-long-random-password';
   -- GRANT USAGE ON SCHEMA pmc TO pmc_app;
   -- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pmc TO pmc_app;
   -- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pmc TO pmc_app;
   -- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pmc TO pmc_app;
   -- ALTER ROLE pmc_app SET search_path = pmc, public;
   -- Nairobi time for the whole database:
   -- ALTER DATABASE posho_cereals SET timezone = 'Africa/Nairobi';
   ===================================================================== */