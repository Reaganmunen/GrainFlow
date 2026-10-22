--
-- PostgreSQL database dump
--

\restrict zcem6TeRv3P4PpnrOUznoF6BwUleL5k8AaOObxyqECzdd4f58duFpBNQernQjnb

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

-- Started on 2026-10-22 09:09:07

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 7 (class 2615 OID 94404)
-- Name: pmc; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA pmc;


ALTER SCHEMA pmc OWNER TO postgres;

--
-- TOC entry 2 (class 3079 OID 94366)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 6160 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 1070 (class 1247 OID 94462)
-- Name: adjustment_reason; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.adjustment_reason AS ENUM (
    'WEIGHT_LOSS',
    'MOISTURE',
    'PESTS',
    'SPOILAGE',
    'DAMAGE',
    'SPILLAGE',
    'THEFT_SUSPECTED',
    'COUNT_CORRECTION',
    'OTHER'
);


ALTER TYPE pmc.adjustment_reason OWNER TO postgres;

--
-- TOC entry 1121 (class 1247 OID 94642)
-- Name: close_status; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.close_status AS ENUM (
    'OPEN',
    'CLOSED'
);


ALTER TYPE pmc.close_status OWNER TO postgres;

--
-- TOC entry 1073 (class 1247 OID 94482)
-- Name: customer_type; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.customer_type AS ENUM (
    'INDIVIDUAL',
    'KIOSK',
    'HOTEL',
    'SCHOOL',
    'INSTITUTION',
    'OTHER'
);


ALTER TYPE pmc.customer_type OWNER TO postgres;

--
-- TOC entry 1112 (class 1247 OID 94616)
-- Name: delivery_channel; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.delivery_channel AS ENUM (
    'PRINT',
    'WHATSAPP',
    'SMS'
);


ALTER TYPE pmc.delivery_channel OWNER TO postgres;

--
-- TOC entry 1106 (class 1247 OID 94598)
-- Name: delivery_status; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.delivery_status AS ENUM (
    'PENDING',
    'DISPATCHED',
    'DELIVERED',
    'CANCELLED'
);


ALTER TYPE pmc.delivery_status OWNER TO postgres;

--
-- TOC entry 1118 (class 1247 OID 94634)
-- Name: doc_status; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.doc_status AS ENUM (
    'DRAFT',
    'POSTED',
    'VOIDED'
);


ALTER TYPE pmc.doc_status OWNER TO postgres;

--
-- TOC entry 1064 (class 1247 OID 94422)
-- Name: item_kind; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.item_kind AS ENUM (
    'GRAIN',
    'FLOUR',
    'BRAN',
    'PACKAGING',
    'OTHER'
);


ALTER TYPE pmc.item_kind OWNER TO postgres;

--
-- TOC entry 1097 (class 1247 OID 94564)
-- Name: job_status; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.job_status AS ENUM (
    'WAITING',
    'MILLING',
    'READY',
    'COLLECTED',
    'CANCELLED'
);


ALTER TYPE pmc.job_status OWNER TO postgres;

--
-- TOC entry 1094 (class 1247 OID 94558)
-- Name: job_type; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.job_type AS ENUM (
    'CUSTOMER',
    'OWN'
);


ALTER TYPE pmc.job_type OWNER TO postgres;

--
-- TOC entry 1103 (class 1247 OID 94582)
-- Name: ledger_entry_type; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.ledger_entry_type AS ENUM (
    'OPENING_BALANCE',
    'SALE',
    'PURCHASE',
    'PAYMENT',
    'VOID',
    'ADJUSTMENT',
    'REFUND'
);


ALTER TYPE pmc.ledger_entry_type OWNER TO postgres;

--
-- TOC entry 1115 (class 1247 OID 94624)
-- Name: message_status; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.message_status AS ENUM (
    'QUEUED',
    'SENT',
    'DELIVERED',
    'FAILED'
);


ALTER TYPE pmc.message_status OWNER TO postgres;

--
-- TOC entry 1058 (class 1247 OID 94406)
-- Name: module_code; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.module_code AS ENUM (
    'MILL',
    'CEREAL',
    'SHARED'
);


ALTER TYPE pmc.module_code OWNER TO postgres;

--
-- TOC entry 1085 (class 1247 OID 94520)
-- Name: payment_method; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.payment_method AS ENUM (
    'CASH',
    'MPESA_STK',
    'MPESA_MANUAL',
    'BANK',
    'OTHER'
);


ALTER TYPE pmc.payment_method OWNER TO postgres;

--
-- TOC entry 1088 (class 1247 OID 94532)
-- Name: payment_state; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.payment_state AS ENUM (
    'PENDING',
    'CONFIRMED',
    'FAILED',
    'CANCELLED',
    'REVERSED'
);


ALTER TYPE pmc.payment_state OWNER TO postgres;

--
-- TOC entry 1082 (class 1247 OID 94512)
-- Name: payment_status; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.payment_status AS ENUM (
    'UNPAID',
    'PARTIAL',
    'PAID'
);


ALTER TYPE pmc.payment_status OWNER TO postgres;

--
-- TOC entry 1100 (class 1247 OID 94576)
-- Name: rate_basis; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.rate_basis AS ENUM (
    'PER_KG',
    'PER_TIN'
);


ALTER TYPE pmc.rate_basis OWNER TO postgres;

--
-- TOC entry 1109 (class 1247 OID 94608)
-- Name: receipt_style; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.receipt_style AS ENUM (
    'PRINT',
    'WHATSAPP',
    'BOTH'
);


ALTER TYPE pmc.receipt_style OWNER TO postgres;

--
-- TOC entry 1076 (class 1247 OID 94496)
-- Name: sale_channel; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.sale_channel AS ENUM (
    'RETAIL',
    'WHOLESALE',
    'MILLING'
);


ALTER TYPE pmc.sale_channel OWNER TO postgres;

--
-- TOC entry 1079 (class 1247 OID 94504)
-- Name: sale_status; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.sale_status AS ENUM (
    'DRAFT',
    'POSTED',
    'VOIDED'
);


ALTER TYPE pmc.sale_status OWNER TO postgres;

--
-- TOC entry 1091 (class 1247 OID 94544)
-- Name: stk_status; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.stk_status AS ENUM (
    'INITIATED',
    'SENT',
    'SUCCESS',
    'FAILED',
    'CANCELLED',
    'TIMEOUT'
);


ALTER TYPE pmc.stk_status OWNER TO postgres;

--
-- TOC entry 1067 (class 1247 OID 94434)
-- Name: stock_movement_type; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.stock_movement_type AS ENUM (
    'OPENING_BALANCE',
    'PURCHASE',
    'SALE',
    'SALE_VOID',
    'MILL_INPUT',
    'MILL_OUTPUT',
    'CUSTOMER_GRAIN_IN',
    'CUSTOMER_GRAIN_OUT',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'ADJUSTMENT',
    'SUPPLIER_RETURN',
    'CUSTOMER_RETURN'
);


ALTER TYPE pmc.stock_movement_type OWNER TO postgres;

--
-- TOC entry 1061 (class 1247 OID 94414)
-- Name: stock_pool; Type: TYPE; Schema: pmc; Owner: postgres
--

CREATE TYPE pmc.stock_pool AS ENUM (
    'MILL_STOCK',
    'CEREAL_STOCK',
    'CUSTOMER_GRAIN'
);


ALTER TYPE pmc.stock_pool OWNER TO postgres;

--
-- TOC entry 403 (class 1255 OID 96280)
-- Name: fn_allocate_payment_fifo(bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_allocate_payment_fifo(p_payment bigint) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_allocate_payment_fifo(p_payment bigint) OWNER TO postgres;

--
-- TOC entry 405 (class 1255 OID 96279)
-- Name: fn_allocation_check(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_allocation_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_allocation_check() OWNER TO postgres;

--
-- TOC entry 395 (class 1255 OID 94855)
-- Name: fn_audit(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_audit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_audit() OWNER TO postgres;

--
-- TOC entry 410 (class 1255 OID 94648)
-- Name: fn_block_mutation(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % is not allowed. Post a correcting entry instead.',
        TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END $$;


ALTER FUNCTION pmc.fn_block_mutation() OWNER TO postgres;

--
-- TOC entry 351 (class 1255 OID 96248)
-- Name: fn_customer_balance(bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_customer_balance(p_customer bigint) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
    SELECT coalesce(sum(debit - credit), 0) FROM customer_ledger WHERE customer_id = p_customer
$$;


ALTER FUNCTION pmc.fn_customer_balance(p_customer bigint) OWNER TO postgres;

--
-- TOC entry 386 (class 1255 OID 96258)
-- Name: fn_customer_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_customer_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.phone     := fn_normalize_phone(NEW.phone);
    NEW.alt_phone := fn_normalize_phone(NEW.alt_phone);
    RETURN NEW;
END $$;


ALTER FUNCTION pmc.fn_customer_before() OWNER TO postgres;

--
-- TOC entry 374 (class 1255 OID 96283)
-- Name: fn_daily_expected(date, pmc.module_code); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_daily_expected(p_date date, p_module pmc.module_code DEFAULT NULL::pmc.module_code) RETURNS TABLE(expected_cash numeric, expected_mpesa numeric)
    LANGUAGE sql STABLE
    AS $$
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


ALTER FUNCTION pmc.fn_daily_expected(p_date date, p_module pmc.module_code) OWNER TO postgres;

--
-- TOC entry 360 (class 1255 OID 94662)
-- Name: next_doc_no(text); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.next_doc_no(p_type text) RETURNS text
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.next_doc_no(p_type text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 307 (class 1259 OID 96024)
-- Name: receipts; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.receipts (
    id bigint NOT NULL,
    receipt_no text DEFAULT pmc.next_doc_no('RCPT'::text) NOT NULL,
    sale_id bigint NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    issued_by bigint,
    total_amount numeric(14,2) NOT NULL,
    amount_paid numeric(14,2) NOT NULL,
    balance_due numeric(14,2) NOT NULL,
    payment_summary text,
    mpesa_codes text,
    is_duplicate boolean DEFAULT false NOT NULL,
    print_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE pmc.receipts OWNER TO postgres;

--
-- TOC entry 355 (class 1255 OID 96282)
-- Name: fn_issue_receipt(bigint, bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_issue_receipt(p_sale bigint, p_user bigint DEFAULT NULL::bigint) RETURNS pmc.receipts
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_issue_receipt(p_sale bigint, p_user bigint) OWNER TO postgres;

--
-- TOC entry 416 (class 1255 OID 96260)
-- Name: fn_item_after_insert(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_item_after_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO item_units (item_id, unit_id, kg_per_unit)
    SELECT NEW.id, u.id, 1 FROM units u WHERE u.code = 'KG'
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;


ALTER FUNCTION pmc.fn_item_after_insert() OWNER TO postgres;

--
-- TOC entry 397 (class 1255 OID 96259)
-- Name: fn_item_price_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_item_price_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_item_price_before() OWNER TO postgres;

--
-- TOC entry 398 (class 1255 OID 95097)
-- Name: fn_kg_per_unit(bigint, bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_kg_per_unit(p_item bigint, p_unit bigint) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
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


ALTER FUNCTION pmc.fn_kg_per_unit(p_item bigint, p_unit bigint) OWNER TO postgres;

--
-- TOC entry 357 (class 1255 OID 94650)
-- Name: fn_local_date(timestamp with time zone); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_local_date(ts timestamp with time zone) RETURNS date
    LANGUAGE sql STABLE
    AS $$ SELECT (ts AT TIME ZONE 'Africa/Nairobi')::date $$;


ALTER FUNCTION pmc.fn_local_date(ts timestamp with time zone) OWNER TO postgres;

--
-- TOC entry 345 (class 1255 OID 96285)
-- Name: fn_margin_report(date, date, pmc.module_code); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_margin_report(p_from date, p_to date, p_module pmc.module_code DEFAULT NULL::pmc.module_code) RETURNS TABLE(item_id bigint, item_name text, kg_sold numeric, revenue numeric, cost numeric, profit numeric, margin_pct numeric, profit_per_kg numeric)
    LANGUAGE sql STABLE
    AS $$
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


ALTER FUNCTION pmc.fn_margin_report(p_from date, p_to date, p_module pmc.module_code) OWNER TO postgres;

--
-- TOC entry 420 (class 1255 OID 96268)
-- Name: fn_mill_job_after(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_mill_job_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_mill_job_after() OWNER TO postgres;

--
-- TOC entry 388 (class 1255 OID 96267)
-- Name: fn_mill_job_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_mill_job_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_mill_job_before() OWNER TO postgres;

--
-- TOC entry 356 (class 1255 OID 96270)
-- Name: fn_mill_output_after(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_mill_output_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_mill_output_after() OWNER TO postgres;

--
-- TOC entry 375 (class 1255 OID 96269)
-- Name: fn_mill_output_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_mill_output_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_mill_output_before() OWNER TO postgres;

--
-- TOC entry 393 (class 1255 OID 96281)
-- Name: fn_mpesa_stk_callback(text, integer, text, text, numeric, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_mpesa_stk_callback(p_checkout_request_id text, p_result_code integer, p_result_desc text, p_receipt text DEFAULT NULL::text, p_amount numeric DEFAULT NULL::numeric, p_phone text DEFAULT NULL::text, p_trans_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_raw jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_mpesa_stk_callback(p_checkout_request_id text, p_result_code integer, p_result_desc text, p_receipt text, p_amount numeric, p_phone text, p_trans_date timestamp with time zone, p_raw jsonb) OWNER TO postgres;

--
-- TOC entry 352 (class 1255 OID 94649)
-- Name: fn_normalize_phone(text); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_normalize_phone(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
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
$_$;


ALTER FUNCTION pmc.fn_normalize_phone(p text) OWNER TO postgres;

--
-- TOC entry 425 (class 1255 OID 96278)
-- Name: fn_payment_after(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_payment_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_payment_after() OWNER TO postgres;

--
-- TOC entry 361 (class 1255 OID 96277)
-- Name: fn_payment_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_payment_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.payer_phone IS NOT NULL THEN NEW.payer_phone := fn_normalize_phone(NEW.payer_phone); END IF;
    -- cash and manual M-Pesa codes are confirmed on entry unless the app says otherwise
    IF NEW.state = 'CONFIRMED' AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
    RETURN NEW;
END $$;


ALTER FUNCTION pmc.fn_payment_before() OWNER TO postgres;

--
-- TOC entry 319 (class 1259 OID 96217)
-- Name: daily_closes; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.daily_closes (
    id bigint NOT NULL,
    close_date date NOT NULL,
    module pmc.module_code NOT NULL,
    opening_float numeric(14,2) DEFAULT 0 NOT NULL,
    expected_cash numeric(14,2) DEFAULT 0 NOT NULL,
    expected_mpesa numeric(14,2) DEFAULT 0 NOT NULL,
    counted_cash numeric(14,2),
    counted_mpesa numeric(14,2),
    cash_variance numeric(14,2) GENERATED ALWAYS AS ((counted_cash - (opening_float + expected_cash))) STORED,
    mpesa_variance numeric(14,2) GENERATED ALWAYS AS ((counted_mpesa - expected_mpesa)) STORED,
    status pmc.close_status DEFAULT 'OPEN'::pmc.close_status NOT NULL,
    notes text,
    closed_by bigint,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE pmc.daily_closes OWNER TO postgres;

--
-- TOC entry 353 (class 1255 OID 96284)
-- Name: fn_perform_daily_close(date, pmc.module_code, numeric, numeric, numeric, bigint, text); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_perform_daily_close(p_date date, p_module pmc.module_code, p_opening_float numeric, p_counted_cash numeric, p_counted_mpesa numeric, p_user bigint DEFAULT NULL::bigint, p_notes text DEFAULT NULL::text) RETURNS pmc.daily_closes
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_perform_daily_close(p_date date, p_module pmc.module_code, p_opening_float numeric, p_counted_cash numeric, p_counted_mpesa numeric, p_user bigint, p_notes text) OWNER TO postgres;

--
-- TOC entry 275 (class 1259 OID 95399)
-- Name: purchases; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.purchases (
    id bigint NOT NULL,
    purchase_no text DEFAULT pmc.next_doc_no('PUR'::text) NOT NULL,
    supplier_id bigint NOT NULL,
    stock_pool pmc.stock_pool DEFAULT 'CEREAL_STOCK'::pmc.stock_pool NOT NULL,
    purchase_date date DEFAULT CURRENT_DATE NOT NULL,
    supplier_invoice_ref text,
    status pmc.doc_status DEFAULT 'DRAFT'::pmc.doc_status NOT NULL,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    transport_cost numeric(14,2) DEFAULT 0 NOT NULL,
    loading_cost numeric(14,2) DEFAULT 0 NOT NULL,
    other_cost numeric(14,2) DEFAULT 0 NOT NULL,
    total_cost numeric(14,2) GENERATED ALWAYS AS ((((subtotal + transport_cost) + loading_cost) + other_cost)) STORED,
    amount_paid numeric(14,2) DEFAULT 0 NOT NULL,
    balance_due numeric(14,2) GENERATED ALWAYS AS (((((subtotal + transport_cost) + loading_cost) + other_cost) - amount_paid)) STORED,
    payment_status pmc.payment_status GENERATED ALWAYS AS (
CASE
    WHEN (((((subtotal + transport_cost) + loading_cost) + other_cost) > (0)::numeric) AND (amount_paid >= (((subtotal + transport_cost) + loading_cost) + other_cost))) THEN 'PAID'::pmc.payment_status
    WHEN (amount_paid > (0)::numeric) THEN 'PARTIAL'::pmc.payment_status
    ELSE 'UNPAID'::pmc.payment_status
END) STORED,
    notes text,
    created_by bigint,
    posted_at timestamp with time zone,
    voided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchases_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
    CONSTRAINT purchases_loading_cost_check CHECK ((loading_cost >= (0)::numeric)),
    CONSTRAINT purchases_other_cost_check CHECK ((other_cost >= (0)::numeric)),
    CONSTRAINT purchases_stock_pool_check CHECK ((stock_pool <> 'CUSTOMER_GRAIN'::pmc.stock_pool)),
    CONSTRAINT purchases_transport_cost_check CHECK ((transport_cost >= (0)::numeric))
);


ALTER TABLE pmc.purchases OWNER TO postgres;

--
-- TOC entry 419 (class 1255 OID 96263)
-- Name: fn_post_purchase(bigint, bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_post_purchase(p_purchase bigint, p_user bigint DEFAULT NULL::bigint) RETURNS pmc.purchases
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_post_purchase(p_purchase bigint, p_user bigint) OWNER TO postgres;

--
-- TOC entry 281 (class 1259 OID 95535)
-- Name: sales; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.sales (
    id bigint NOT NULL,
    sale_no text DEFAULT pmc.next_doc_no('SALE'::text) NOT NULL,
    module pmc.module_code NOT NULL,
    channel pmc.sale_channel DEFAULT 'RETAIL'::pmc.sale_channel NOT NULL,
    customer_id bigint,
    walkin_name text,
    walkin_phone text,
    sale_date timestamp with time zone DEFAULT now() NOT NULL,
    status pmc.sale_status DEFAULT 'DRAFT'::pmc.sale_status NOT NULL,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    amount_paid numeric(14,2) DEFAULT 0 NOT NULL,
    balance_due numeric(14,2) GENERATED ALWAYS AS ((total_amount - amount_paid)) STORED,
    payment_status pmc.payment_status GENERATED ALWAYS AS (
CASE
    WHEN ((total_amount > (0)::numeric) AND (amount_paid >= total_amount)) THEN 'PAID'::pmc.payment_status
    WHEN (amount_paid > (0)::numeric) THEN 'PARTIAL'::pmc.payment_status
    ELSE 'UNPAID'::pmc.payment_status
END) STORED,
    is_credit boolean DEFAULT false NOT NULL,
    due_date date,
    is_delivery boolean DEFAULT false NOT NULL,
    delivery_address text,
    notes text,
    cashier_id bigint,
    posted_at timestamp with time zone,
    voided_at timestamp with time zone,
    voided_by bigint,
    void_approved_by bigint,
    void_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sales_check CHECK (((status <> 'VOIDED'::pmc.sale_status) OR (void_reason IS NOT NULL))),
    CONSTRAINT sales_discount_amount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT sales_module_check CHECK ((module = ANY (ARRAY['MILL'::pmc.module_code, 'CEREAL'::pmc.module_code])))
);


ALTER TABLE pmc.sales OWNER TO postgres;

--
-- TOC entry 380 (class 1255 OID 96275)
-- Name: fn_post_sale(bigint, bigint, boolean); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_post_sale(p_sale bigint, p_user bigint DEFAULT NULL::bigint, p_on_credit boolean DEFAULT false) RETURNS pmc.sales
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_post_sale(p_sale bigint, p_user bigint, p_on_credit boolean) OWNER TO postgres;

--
-- TOC entry 271 (class 1259 OID 95343)
-- Name: stock_takes; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.stock_takes (
    id bigint NOT NULL,
    take_no text DEFAULT pmc.next_doc_no('STK'::text) NOT NULL,
    take_date date DEFAULT CURRENT_DATE NOT NULL,
    pool pmc.stock_pool NOT NULL,
    status pmc.doc_status DEFAULT 'DRAFT'::pmc.doc_status NOT NULL,
    notes text,
    created_by bigint,
    posted_by bigint,
    posted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE pmc.stock_takes OWNER TO postgres;

--
-- TOC entry 429 (class 1255 OID 96257)
-- Name: fn_post_stock_take(bigint, bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_post_stock_take(p_take bigint, p_user bigint DEFAULT NULL::bigint) RETURNS pmc.stock_takes
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_post_stock_take(p_take bigint, p_user bigint) OWNER TO postgres;

--
-- TOC entry 404 (class 1255 OID 96262)
-- Name: fn_purchase_line_after(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_purchase_line_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_id bigint := coalesce(NEW.purchase_id, OLD.purchase_id);
BEGIN
    UPDATE purchases
       SET subtotal = coalesce((SELECT sum(line_total) FROM purchase_lines WHERE purchase_id = v_id), 0)
     WHERE id = v_id;
    RETURN NULL;
END $$;


ALTER FUNCTION pmc.fn_purchase_line_after() OWNER TO postgres;

--
-- TOC entry 377 (class 1255 OID 96261)
-- Name: fn_purchase_line_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_purchase_line_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_purchase_line_before() OWNER TO postgres;

--
-- TOC entry 372 (class 1255 OID 96273)
-- Name: fn_refresh_sale_payment(bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_refresh_sale_payment(p_sale bigint) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE sales s
       SET amount_paid = coalesce((
            SELECT sum(pa.amount)
            FROM payment_allocations pa
            JOIN payments p ON p.id = pa.payment_id AND p.state = 'CONFIRMED'
            WHERE pa.sale_id = p_sale), 0)
     WHERE s.id = p_sale
$$;


ALTER FUNCTION pmc.fn_refresh_sale_payment(p_sale bigint) OWNER TO postgres;

--
-- TOC entry 383 (class 1255 OID 96271)
-- Name: fn_sale_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_sale_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_sale_before() OWNER TO postgres;

--
-- TOC entry 368 (class 1255 OID 96274)
-- Name: fn_sale_line_after(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_sale_line_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_id bigint := coalesce(NEW.sale_id, OLD.sale_id);
BEGIN
    UPDATE sales
       SET subtotal = coalesce((SELECT sum(line_total) FROM sale_lines WHERE sale_id = v_id), 0)
     WHERE id = v_id;
    RETURN NULL;
END $$;


ALTER FUNCTION pmc.fn_sale_line_after() OWNER TO postgres;

--
-- TOC entry 387 (class 1255 OID 96272)
-- Name: fn_sale_line_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_sale_line_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_sale_line_before() OWNER TO postgres;

--
-- TOC entry 432 (class 1255 OID 94854)
-- Name: fn_set_app_user(bigint, text); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_set_app_user(p_user bigint, p_ip text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM set_config('app.user_id', coalesce(p_user::text,''), true);
    PERFORM set_config('app.ip',      coalesce(p_ip,''), true);
END $$;


ALTER FUNCTION pmc.fn_set_app_user(p_user bigint, p_ip text) OWNER TO postgres;

--
-- TOC entry 409 (class 1255 OID 96250)
-- Name: fn_set_customer_opening_balance(bigint, numeric, date, bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_set_customer_opening_balance(p_customer bigint, p_amount numeric, p_as_of date DEFAULT CURRENT_DATE, p_user bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO customer_ledger (customer_id, entry_date, entry_type, debit, description, created_by)
    VALUES (p_customer, p_as_of::timestamptz, 'OPENING_BALANCE', p_amount, 'Opening balance', p_user)
$$;


ALTER FUNCTION pmc.fn_set_customer_opening_balance(p_customer bigint, p_amount numeric, p_as_of date, p_user bigint) OWNER TO postgres;

--
-- TOC entry 378 (class 1255 OID 96252)
-- Name: fn_set_opening_stock(bigint, pmc.stock_pool, numeric, numeric, bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_set_opening_stock(p_item bigint, p_pool pmc.stock_pool, p_kg numeric, p_cost_per_kg numeric DEFAULT 0, p_user bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO stock_movements (item_id, pool, movement_type, quantity_kg, unit_cost_per_kg, note, created_by)
    VALUES (p_item, p_pool, 'OPENING_BALANCE', p_kg, p_cost_per_kg, 'Opening stock', p_user)
$$;


ALTER FUNCTION pmc.fn_set_opening_stock(p_item bigint, p_pool pmc.stock_pool, p_kg numeric, p_cost_per_kg numeric, p_user bigint) OWNER TO postgres;

--
-- TOC entry 402 (class 1255 OID 96251)
-- Name: fn_set_supplier_opening_balance(bigint, numeric, date, bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_set_supplier_opening_balance(p_supplier bigint, p_amount numeric, p_as_of date DEFAULT CURRENT_DATE, p_user bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE sql
    AS $$
    INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, credit, description, created_by)
    VALUES (p_supplier, p_as_of::timestamptz, 'OPENING_BALANCE', p_amount, 'Opening balance', p_user)
$$;


ALTER FUNCTION pmc.fn_set_supplier_opening_balance(p_supplier bigint, p_amount numeric, p_as_of date, p_user bigint) OWNER TO postgres;

--
-- TOC entry 382 (class 1255 OID 94647)
-- Name: fn_set_updated_at(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;


ALTER FUNCTION pmc.fn_set_updated_at() OWNER TO postgres;

--
-- TOC entry 389 (class 1255 OID 94851)
-- Name: fn_setting_bool(text, boolean); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_setting_bool(p_key text, p_default boolean) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT coalesce((SELECT (value #>> '{}')::boolean FROM app_settings WHERE key = p_key), p_default)
$$;


ALTER FUNCTION pmc.fn_setting_bool(p_key text, p_default boolean) OWNER TO postgres;

--
-- TOC entry 343 (class 1255 OID 94852)
-- Name: fn_setting_num(text, numeric); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_setting_num(p_key text, p_default numeric) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
    SELECT coalesce((SELECT (value #>> '{}')::numeric FROM app_settings WHERE key = p_key), p_default)
$$;


ALTER FUNCTION pmc.fn_setting_num(p_key text, p_default numeric) OWNER TO postgres;

--
-- TOC entry 428 (class 1255 OID 96255)
-- Name: fn_stock_adjustment_after(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_stock_adjustment_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO stock_movements (movement_date, item_id, pool, movement_type, quantity_kg,
                                 unit_cost_per_kg, ref_table, ref_id, note, created_by)
    VALUES (NEW.adjustment_date, NEW.item_id, NEW.pool, 'ADJUSTMENT', NEW.quantity_kg_change,
            NEW.unit_cost_per_kg, 'stock_adjustments', NEW.id,
            NEW.reason::text || coalesce(': ' || NEW.note, ''), NEW.created_by);
    RETURN NULL;
END $$;


ALTER FUNCTION pmc.fn_stock_adjustment_after() OWNER TO postgres;

--
-- TOC entry 381 (class 1255 OID 96254)
-- Name: fn_stock_adjustment_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_stock_adjustment_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.unit_cost_per_kg IS NULL THEN
        SELECT avg_cost_per_kg INTO NEW.unit_cost_per_kg
        FROM stock_balances WHERE item_id = NEW.item_id AND pool = NEW.pool;
        NEW.unit_cost_per_kg := coalesce(NEW.unit_cost_per_kg, 0);
    END IF;
    RETURN NEW;
END $$;


ALTER FUNCTION pmc.fn_stock_adjustment_before() OWNER TO postgres;

--
-- TOC entry 362 (class 1255 OID 96253)
-- Name: fn_stock_movement_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_stock_movement_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_stock_movement_before() OWNER TO postgres;

--
-- TOC entry 430 (class 1255 OID 96256)
-- Name: fn_stock_take_line_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_stock_take_line_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_pool stock_pool;
BEGIN
    IF NEW.system_kg IS NULL THEN
        SELECT pool INTO v_pool FROM stock_takes WHERE id = NEW.take_id;
        SELECT quantity_kg INTO NEW.system_kg FROM stock_balances WHERE item_id = NEW.item_id AND pool = v_pool;
        NEW.system_kg := coalesce(NEW.system_kg, 0);
    END IF;
    RETURN NEW;
END $$;


ALTER FUNCTION pmc.fn_stock_take_line_before() OWNER TO postgres;

--
-- TOC entry 365 (class 1255 OID 96249)
-- Name: fn_supplier_balance(bigint); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_supplier_balance(p_supplier bigint) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
    SELECT coalesce(sum(credit - debit), 0) FROM supplier_ledger WHERE supplier_id = p_supplier
$$;


ALTER FUNCTION pmc.fn_supplier_balance(p_supplier bigint) OWNER TO postgres;

--
-- TOC entry 417 (class 1255 OID 96264)
-- Name: fn_supplier_payment_after(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_supplier_payment_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_supplier_payment_after() OWNER TO postgres;

--
-- TOC entry 406 (class 1255 OID 96266)
-- Name: fn_transfer_after(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_transfer_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_transfer_after() OWNER TO postgres;

--
-- TOC entry 399 (class 1255 OID 96265)
-- Name: fn_transfer_before(); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_transfer_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.unit_cost_per_kg IS NULL THEN
        SELECT avg_cost_per_kg INTO NEW.unit_cost_per_kg
        FROM stock_balances WHERE item_id = NEW.item_id AND pool = NEW.from_pool;
        NEW.unit_cost_per_kg := coalesce(NEW.unit_cost_per_kg, 0);
    END IF;
    RETURN NEW;
END $$;


ALTER FUNCTION pmc.fn_transfer_before() OWNER TO postgres;

--
-- TOC entry 348 (class 1255 OID 94853)
-- Name: fn_user_has_permission(bigint, text); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_user_has_permission(p_user bigint, p_perm text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM users u
        JOIN role_permissions rp ON rp.role_id = u.role_id
        JOIN permissions p       ON p.id = rp.permission_id
        WHERE u.id = p_user AND u.is_active AND p.code = p_perm)
$$;


ALTER FUNCTION pmc.fn_user_has_permission(p_user bigint, p_perm text) OWNER TO postgres;

--
-- TOC entry 436 (class 1255 OID 96276)
-- Name: fn_void_sale(bigint, bigint, bigint, text); Type: FUNCTION; Schema: pmc; Owner: postgres
--

CREATE FUNCTION pmc.fn_void_sale(p_sale bigint, p_user bigint, p_approver bigint, p_reason text) RETURNS pmc.sales
    LANGUAGE plpgsql
    AS $$
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


ALTER FUNCTION pmc.fn_void_sale(p_sale bigint, p_user bigint, p_approver bigint, p_reason text) OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 94816)
-- Name: activity_log; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.activity_log (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id bigint,
    category text NOT NULL,
    action text NOT NULL,
    entity_table text,
    entity_id text,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    note text
);


ALTER TABLE pmc.activity_log OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 94815)
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.activity_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.activity_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 225 (class 1259 OID 94686)
-- Name: app_settings; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE pmc.app_settings OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 94838)
-- Name: backup_log; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.backup_log (
    id bigint NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'RUNNING'::text NOT NULL,
    file_name text,
    location text,
    size_bytes bigint,
    error_text text,
    CONSTRAINT backup_log_status_check CHECK ((status = ANY (ARRAY['RUNNING'::text, 'SUCCESS'::text, 'FAILED'::text])))
);


ALTER TABLE pmc.backup_log OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 94837)
-- Name: backup_log_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.backup_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.backup_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 224 (class 1259 OID 94665)
-- Name: business_profile; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.business_profile (
    id smallint DEFAULT 1 NOT NULL,
    business_name text NOT NULL,
    owner_name text,
    phone text,
    email text,
    address text,
    kra_pin text,
    mpesa_till_number text,
    currency_code character(3) DEFAULT 'KES'::bpchar NOT NULL,
    timezone text DEFAULT 'Africa/Nairobi'::text NOT NULL,
    default_receipt_style pmc.receipt_style DEFAULT 'BOTH'::pmc.receipt_style NOT NULL,
    receipt_header text,
    receipt_footer text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_profile_id_check CHECK ((id = 1))
);


ALTER TABLE pmc.business_profile OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 94893)
-- Name: customer_ledger; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.customer_ledger (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    entry_date timestamp with time zone DEFAULT now() NOT NULL,
    entry_type pmc.ledger_entry_type NOT NULL,
    debit numeric(14,2) DEFAULT 0 NOT NULL,
    credit numeric(14,2) DEFAULT 0 NOT NULL,
    sale_id bigint,
    payment_id bigint,
    description text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_ledger_check CHECK ((((debit > (0)::numeric) AND (credit = (0)::numeric)) OR ((credit > (0)::numeric) AND (debit = (0)::numeric)))),
    CONSTRAINT customer_ledger_credit_check CHECK ((credit >= (0)::numeric)),
    CONSTRAINT customer_ledger_debit_check CHECK ((debit >= (0)::numeric))
);


ALTER TABLE pmc.customer_ledger OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 94892)
-- Name: customer_ledger_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.customer_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.customer_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 222 (class 1259 OID 94663)
-- Name: seq_customer_code; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

CREATE SEQUENCE pmc.seq_customer_code
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE pmc.seq_customer_code OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 94857)
-- Name: customers; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.customers (
    id bigint NOT NULL,
    customer_code text DEFAULT ('C'::text || lpad((nextval('pmc.seq_customer_code'::regclass))::text, 5, '0'::text)) NOT NULL,
    full_name text NOT NULL,
    business_name text,
    customer_type pmc.customer_type DEFAULT 'INDIVIDUAL'::pmc.customer_type NOT NULL,
    phone text,
    alt_phone text,
    email text,
    address text,
    credit_allowed boolean DEFAULT false NOT NULL,
    credit_limit numeric(14,2),
    credit_days integer DEFAULT 7 NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customers_credit_days_check CHECK ((credit_days >= 0)),
    CONSTRAINT customers_credit_limit_check CHECK (((credit_limit IS NULL) OR (credit_limit >= (0)::numeric))),
    CONSTRAINT customers_phone_check CHECK (((phone IS NULL) OR (phone ~ '^254[17][0-9]{8}$'::text)))
);


ALTER TABLE pmc.customers OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 94856)
-- Name: customers_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.customers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 318 (class 1259 OID 96216)
-- Name: daily_closes_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.daily_closes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.daily_closes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 311 (class 1259 OID 96079)
-- Name: deliveries; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.deliveries (
    id bigint NOT NULL,
    delivery_no text DEFAULT pmc.next_doc_no('DLV'::text) NOT NULL,
    sale_id bigint NOT NULL,
    customer_id bigint,
    delivery_address text,
    contact_phone text,
    driver_name text,
    vehicle_reg text,
    status pmc.delivery_status DEFAULT 'PENDING'::pmc.delivery_status NOT NULL,
    dispatched_at timestamp with time zone,
    delivered_at timestamp with time zone,
    received_by_name text,
    notes text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE pmc.deliveries OWNER TO postgres;

--
-- TOC entry 310 (class 1259 OID 96078)
-- Name: deliveries_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.deliveries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.deliveries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 221 (class 1259 OID 94651)
-- Name: doc_counters; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.doc_counters (
    doc_type text NOT NULL,
    period text NOT NULL,
    last_value integer DEFAULT 0 NOT NULL
);


ALTER TABLE pmc.doc_counters OWNER TO postgres;

--
-- TOC entry 313 (class 1259 OID 96115)
-- Name: expense_categories; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.expense_categories (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE pmc.expense_categories OWNER TO postgres;

--
-- TOC entry 312 (class 1259 OID 96114)
-- Name: expense_categories_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.expense_categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.expense_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 315 (class 1259 OID 96130)
-- Name: expenses; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.expenses (
    id bigint NOT NULL,
    expense_no text DEFAULT pmc.next_doc_no('EXP'::text) NOT NULL,
    category_id bigint NOT NULL,
    module pmc.module_code DEFAULT 'SHARED'::pmc.module_code NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric(14,2) NOT NULL,
    method pmc.payment_method DEFAULT 'CASH'::pmc.payment_method NOT NULL,
    mpesa_code text,
    supplier_id bigint,
    machine_id bigint,
    description text,
    receipt_ref text,
    is_voided boolean DEFAULT false NOT NULL,
    void_reason text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT expenses_check CHECK (((NOT is_voided) OR (void_reason IS NOT NULL)))
);


ALTER TABLE pmc.expenses OWNER TO postgres;

--
-- TOC entry 314 (class 1259 OID 96129)
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.expenses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 252 (class 1259 OID 95017)
-- Name: grades; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.grades (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE pmc.grades OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 95016)
-- Name: grades_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.grades ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.grades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 250 (class 1259 OID 94997)
-- Name: grains; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.grains (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'CEREAL'::text NOT NULL,
    is_millable boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT grains_category_check CHECK ((category = ANY (ARRAY['CEREAL'::text, 'PULSE'::text, 'OTHER'::text])))
);


ALTER TABLE pmc.grains OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 94996)
-- Name: grains_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.grains ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.grains_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 260 (class 1259 OID 95147)
-- Name: item_min_prices; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.item_min_prices (
    item_id bigint NOT NULL,
    min_price_per_kg numeric(14,4) NOT NULL,
    updated_by bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_min_prices_min_price_per_kg_check CHECK ((min_price_per_kg >= (0)::numeric))
);


ALTER TABLE pmc.item_min_prices OWNER TO postgres;

--
-- TOC entry 259 (class 1259 OID 95112)
-- Name: item_prices; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.item_prices (
    id bigint NOT NULL,
    item_id bigint NOT NULL,
    tier_id bigint NOT NULL,
    unit_id bigint NOT NULL,
    price numeric(14,2) NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_to timestamp with time zone,
    set_by bigint,
    CONSTRAINT item_prices_price_check CHECK ((price >= (0)::numeric))
);


ALTER TABLE pmc.item_prices OWNER TO postgres;

--
-- TOC entry 258 (class 1259 OID 95111)
-- Name: item_prices_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.item_prices ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.item_prices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 255 (class 1259 OID 95074)
-- Name: item_units; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.item_units (
    item_id bigint NOT NULL,
    unit_id bigint NOT NULL,
    kg_per_unit numeric(12,4) NOT NULL,
    is_sellable boolean DEFAULT true NOT NULL,
    is_purchasable boolean DEFAULT true NOT NULL,
    CONSTRAINT item_units_kg_per_unit_check CHECK ((kg_per_unit > (0)::numeric))
);


ALTER TABLE pmc.item_units OWNER TO postgres;

--
-- TOC entry 254 (class 1259 OID 95032)
-- Name: items; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.items (
    id bigint NOT NULL,
    sku text NOT NULL,
    name text NOT NULL,
    kind pmc.item_kind NOT NULL,
    grain_id bigint,
    grade_id bigint,
    owner_module pmc.module_code DEFAULT 'CEREAL'::pmc.module_code NOT NULL,
    is_millable boolean DEFAULT false NOT NULL,
    track_stock boolean DEFAULT true NOT NULL,
    reorder_level_kg numeric(14,3) DEFAULT 0 NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT items_reorder_level_kg_check CHECK ((reorder_level_kg >= (0)::numeric))
);


ALTER TABLE pmc.items OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 95031)
-- Name: items_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 285 (class 1259 OID 95629)
-- Name: machine_logs; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.machine_logs (
    id bigint NOT NULL,
    machine_id bigint NOT NULL,
    log_date date DEFAULT CURRENT_DATE NOT NULL,
    hours_run numeric(5,2) DEFAULT 0 NOT NULL,
    fuel_litres numeric(10,2) DEFAULT 0 NOT NULL,
    fuel_cost numeric(12,2) DEFAULT 0 NOT NULL,
    electricity_kwh numeric(10,2) DEFAULT 0 NOT NULL,
    electricity_cost numeric(12,2) DEFAULT 0 NOT NULL,
    operator_id bigint,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT machine_logs_electricity_cost_check CHECK ((electricity_cost >= (0)::numeric)),
    CONSTRAINT machine_logs_electricity_kwh_check CHECK ((electricity_kwh >= (0)::numeric)),
    CONSTRAINT machine_logs_fuel_cost_check CHECK ((fuel_cost >= (0)::numeric)),
    CONSTRAINT machine_logs_fuel_litres_check CHECK ((fuel_litres >= (0)::numeric)),
    CONSTRAINT machine_logs_hours_run_check CHECK (((hours_run >= (0)::numeric) AND (hours_run <= (24)::numeric)))
);


ALTER TABLE pmc.machine_logs OWNER TO postgres;

--
-- TOC entry 284 (class 1259 OID 95628)
-- Name: machine_logs_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.machine_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.machine_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 283 (class 1259 OID 95605)
-- Name: machines; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.machines (
    id bigint NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'HAMMER_MILL'::text NOT NULL,
    power_source text DEFAULT 'ELECTRIC'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT machines_kind_check CHECK ((kind = ANY (ARRAY['HAMMER_MILL'::text, 'SIEVE'::text, 'CLEANER'::text, 'OTHER'::text]))),
    CONSTRAINT machines_power_source_check CHECK ((power_source = ANY (ARRAY['ELECTRIC'::text, 'DIESEL'::text, 'OTHER'::text])))
);


ALTER TABLE pmc.machines OWNER TO postgres;

--
-- TOC entry 282 (class 1259 OID 95604)
-- Name: machines_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.machines ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.machines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 289 (class 1259 OID 95748)
-- Name: mill_job_blends; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.mill_job_blends (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    grain_item_id bigint NOT NULL,
    weight_kg numeric(12,3) NOT NULL,
    CONSTRAINT mill_job_blends_weight_kg_check CHECK ((weight_kg > (0)::numeric))
);


ALTER TABLE pmc.mill_job_blends OWNER TO postgres;

--
-- TOC entry 288 (class 1259 OID 95747)
-- Name: mill_job_blends_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.mill_job_blends ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.mill_job_blends_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 291 (class 1259 OID 95769)
-- Name: mill_job_outputs; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.mill_job_outputs (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    output_item_id bigint NOT NULL,
    quantity_kg numeric(12,3) NOT NULL,
    destination text NOT NULL,
    unit_cost_per_kg numeric(14,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mill_job_outputs_destination_check CHECK ((destination = ANY (ARRAY['RETURNED_TO_CUSTOMER'::text, 'MILL_STOCK'::text, 'CEREAL_STOCK'::text]))),
    CONSTRAINT mill_job_outputs_quantity_kg_check CHECK ((quantity_kg > (0)::numeric))
);


ALTER TABLE pmc.mill_job_outputs OWNER TO postgres;

--
-- TOC entry 290 (class 1259 OID 95768)
-- Name: mill_job_outputs_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.mill_job_outputs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.mill_job_outputs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 293 (class 1259 OID 95797)
-- Name: mill_job_status_history; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.mill_job_status_history (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    old_status pmc.job_status,
    new_status pmc.job_status NOT NULL,
    changed_by bigint,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE pmc.mill_job_status_history OWNER TO postgres;

--
-- TOC entry 292 (class 1259 OID 95796)
-- Name: mill_job_status_history_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.mill_job_status_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.mill_job_status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 287 (class 1259 OID 95672)
-- Name: mill_jobs; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.mill_jobs (
    id bigint NOT NULL,
    ticket_no text DEFAULT pmc.next_doc_no('JOB'::text) NOT NULL,
    job_type pmc.job_type DEFAULT 'CUSTOMER'::pmc.job_type NOT NULL,
    customer_id bigint,
    walkin_name text,
    walkin_phone text,
    grain_item_id bigint NOT NULL,
    miller_id bigint,
    machine_id bigint,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    weight_in_kg numeric(12,3) NOT NULL,
    tins_in numeric(10,2),
    rate_basis pmc.rate_basis DEFAULT 'PER_KG'::pmc.rate_basis NOT NULL,
    rate_applied numeric(12,2),
    extra_charge numeric(12,2) DEFAULT 0 NOT NULL,
    charge_amount numeric(12,2) DEFAULT 0 NOT NULL,
    blend_description text,
    special_request text,
    weight_out_kg numeric(12,3),
    bran_kg numeric(12,3),
    expected_flour_kg numeric(12,3),
    yield_pct numeric(6,2),
    yield_status text DEFAULT 'NOT_CHECKED'::text NOT NULL,
    status pmc.job_status DEFAULT 'WAITING'::pmc.job_status NOT NULL,
    started_at timestamp with time zone,
    ready_at timestamp with time zone,
    collected_at timestamp with time zone,
    cancel_reason text,
    sale_id bigint,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mill_jobs_bran_kg_check CHECK (((bran_kg IS NULL) OR (bran_kg >= (0)::numeric))),
    CONSTRAINT mill_jobs_charge_amount_check CHECK ((charge_amount >= (0)::numeric)),
    CONSTRAINT mill_jobs_check CHECK (((job_type = 'OWN'::pmc.job_type) OR (customer_id IS NOT NULL) OR (walkin_name IS NOT NULL))),
    CONSTRAINT mill_jobs_check1 CHECK (((status <> 'CANCELLED'::pmc.job_status) OR (cancel_reason IS NOT NULL))),
    CONSTRAINT mill_jobs_extra_charge_check CHECK ((extra_charge >= (0)::numeric)),
    CONSTRAINT mill_jobs_rate_applied_check CHECK (((rate_applied IS NULL) OR (rate_applied >= (0)::numeric))),
    CONSTRAINT mill_jobs_tins_in_check CHECK (((tins_in IS NULL) OR (tins_in >= (0)::numeric))),
    CONSTRAINT mill_jobs_weight_in_kg_check CHECK ((weight_in_kg > (0)::numeric)),
    CONSTRAINT mill_jobs_weight_out_kg_check CHECK (((weight_out_kg IS NULL) OR (weight_out_kg >= (0)::numeric))),
    CONSTRAINT mill_jobs_yield_status_check CHECK ((yield_status = ANY (ARRAY['NOT_CHECKED'::text, 'OK'::text, 'LOW'::text, 'NO_STANDARD'::text])))
);


ALTER TABLE pmc.mill_jobs OWNER TO postgres;

--
-- TOC entry 286 (class 1259 OID 95671)
-- Name: mill_jobs_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.mill_jobs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.mill_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 262 (class 1259 OID 95168)
-- Name: milling_rates; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.milling_rates (
    id bigint NOT NULL,
    grain_item_id bigint,
    rate_type text DEFAULT 'BASE'::text NOT NULL,
    name text NOT NULL,
    rate_basis pmc.rate_basis DEFAULT 'PER_KG'::pmc.rate_basis NOT NULL,
    rate numeric(12,2) NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    is_active boolean DEFAULT true NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT milling_rates_rate_check CHECK ((rate >= (0)::numeric)),
    CONSTRAINT milling_rates_rate_type_check CHECK ((rate_type = ANY (ARRAY['BASE'::text, 'BLEND'::text, 'SPECIAL'::text])))
);


ALTER TABLE pmc.milling_rates OWNER TO postgres;

--
-- TOC entry 261 (class 1259 OID 95167)
-- Name: milling_rates_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.milling_rates ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.milling_rates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 317 (class 1259 OID 96180)
-- Name: module_transfers; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.module_transfers (
    id bigint NOT NULL,
    transfer_no text DEFAULT pmc.next_doc_no('TRF'::text) NOT NULL,
    transfer_date timestamp with time zone DEFAULT now() NOT NULL,
    item_id bigint NOT NULL,
    from_pool pmc.stock_pool NOT NULL,
    to_pool pmc.stock_pool NOT NULL,
    quantity_kg numeric(16,3) NOT NULL,
    unit_cost_per_kg numeric(14,4),
    total_cost numeric(16,2) GENERATED ALWAYS AS (round((quantity_kg * COALESCE(unit_cost_per_kg, (0)::numeric)), 2)) STORED,
    reason text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT module_transfers_check CHECK ((from_pool <> to_pool)),
    CONSTRAINT module_transfers_from_pool_check CHECK ((from_pool <> 'CUSTOMER_GRAIN'::pmc.stock_pool)),
    CONSTRAINT module_transfers_quantity_kg_check CHECK ((quantity_kg > (0)::numeric)),
    CONSTRAINT module_transfers_to_pool_check CHECK ((to_pool <> 'CUSTOMER_GRAIN'::pmc.stock_pool))
);


ALTER TABLE pmc.module_transfers OWNER TO postgres;

--
-- TOC entry 316 (class 1259 OID 96179)
-- Name: module_transfers_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.module_transfers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.module_transfers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 305 (class 1259 OID 96008)
-- Name: mpesa_callback_log; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.mpesa_callback_log (
    id bigint NOT NULL,
    source text DEFAULT 'STK'::text NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed boolean DEFAULT false NOT NULL,
    error_text text
);


ALTER TABLE pmc.mpesa_callback_log OWNER TO postgres;

--
-- TOC entry 304 (class 1259 OID 96007)
-- Name: mpesa_callback_log_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.mpesa_callback_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.mpesa_callback_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 226 (class 1259 OID 94697)
-- Name: mpesa_config; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.mpesa_config (
    id smallint DEFAULT 1 NOT NULL,
    environment text DEFAULT 'sandbox'::text NOT NULL,
    business_shortcode text,
    till_number text,
    transaction_type text DEFAULT 'CustomerBuyGoodsOnline'::text NOT NULL,
    callback_url text,
    is_active boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mpesa_config_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT mpesa_config_id_check CHECK ((id = 1)),
    CONSTRAINT mpesa_config_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['CustomerBuyGoodsOnline'::text, 'CustomerPayBillOnline'::text])))
);


ALTER TABLE pmc.mpesa_config OWNER TO postgres;

--
-- TOC entry 303 (class 1259 OID 95974)
-- Name: mpesa_stk_requests; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.mpesa_stk_requests (
    id bigint NOT NULL,
    payment_id bigint NOT NULL,
    merchant_request_id text,
    checkout_request_id text,
    phone text NOT NULL,
    amount numeric(14,2) NOT NULL,
    account_reference text,
    transaction_desc text,
    status pmc.stk_status DEFAULT 'INITIATED'::pmc.stk_status NOT NULL,
    result_code integer,
    result_desc text,
    mpesa_receipt text,
    transaction_date timestamp with time zone,
    request_payload jsonb,
    response_payload jsonb,
    callback_payload jsonb,
    initiated_by bigint,
    initiated_at timestamp with time zone DEFAULT now() NOT NULL,
    callback_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mpesa_stk_requests_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT mpesa_stk_requests_phone_check CHECK ((phone ~ '^254[17][0-9]{8}$'::text))
);


ALTER TABLE pmc.mpesa_stk_requests OWNER TO postgres;

--
-- TOC entry 302 (class 1259 OID 95973)
-- Name: mpesa_stk_requests_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.mpesa_stk_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.mpesa_stk_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 301 (class 1259 OID 95948)
-- Name: payment_allocations; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.payment_allocations (
    id bigint NOT NULL,
    payment_id bigint NOT NULL,
    sale_id bigint NOT NULL,
    amount numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_allocations_amount_check CHECK ((amount > (0)::numeric))
);


ALTER TABLE pmc.payment_allocations OWNER TO postgres;

--
-- TOC entry 300 (class 1259 OID 95947)
-- Name: payment_allocations_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.payment_allocations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.payment_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 299 (class 1259 OID 95900)
-- Name: payments; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.payments (
    id bigint NOT NULL,
    payment_no text DEFAULT pmc.next_doc_no('PAY'::text) NOT NULL,
    customer_id bigint,
    module pmc.module_code DEFAULT 'CEREAL'::pmc.module_code NOT NULL,
    method pmc.payment_method NOT NULL,
    state pmc.payment_state DEFAULT 'PENDING'::pmc.payment_state NOT NULL,
    amount numeric(14,2) NOT NULL,
    payer_phone text,
    mpesa_receipt text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    received_by bigint,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payments_check CHECK (((method <> 'MPESA_MANUAL'::pmc.payment_method) OR (mpesa_receipt IS NOT NULL))),
    CONSTRAINT payments_check1 CHECK (((state <> 'CONFIRMED'::pmc.payment_state) OR (method <> ALL (ARRAY['MPESA_STK'::pmc.payment_method, 'MPESA_MANUAL'::pmc.payment_method])) OR (mpesa_receipt IS NOT NULL))),
    CONSTRAINT payments_mpesa_receipt_check CHECK (((mpesa_receipt IS NULL) OR (mpesa_receipt ~ '^[A-Z0-9]{10}$'::text)))
);


ALTER TABLE pmc.payments OWNER TO postgres;

--
-- TOC entry 298 (class 1259 OID 95899)
-- Name: payments_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 230 (class 1259 OID 94735)
-- Name: permissions; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.permissions (
    id bigint NOT NULL,
    code text NOT NULL,
    description text
);


ALTER TABLE pmc.permissions OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 94734)
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.permissions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 257 (class 1259 OID 95099)
-- Name: price_tiers; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.price_tiers (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL
);


ALTER TABLE pmc.price_tiers OWNER TO postgres;

--
-- TOC entry 256 (class 1259 OID 95098)
-- Name: price_tiers_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.price_tiers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.price_tiers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 277 (class 1259 OID 95452)
-- Name: purchase_lines; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.purchase_lines (
    id bigint NOT NULL,
    purchase_id bigint NOT NULL,
    item_id bigint NOT NULL,
    unit_id bigint NOT NULL,
    quantity numeric(14,3) NOT NULL,
    quantity_kg numeric(16,3),
    unit_cost numeric(14,2) NOT NULL,
    line_total numeric(14,2) GENERATED ALWAYS AS (round((quantity * unit_cost), 2)) STORED,
    landed_cost_per_kg numeric(14,4),
    note text,
    CONSTRAINT purchase_lines_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT purchase_lines_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


ALTER TABLE pmc.purchase_lines OWNER TO postgres;

--
-- TOC entry 276 (class 1259 OID 95451)
-- Name: purchase_lines_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.purchase_lines ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.purchase_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 274 (class 1259 OID 95398)
-- Name: purchases_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.purchases ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.purchases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 309 (class 1259 OID 96058)
-- Name: receipt_deliveries; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.receipt_deliveries (
    id bigint NOT NULL,
    receipt_id bigint NOT NULL,
    channel pmc.delivery_channel NOT NULL,
    recipient_phone text,
    status pmc.message_status DEFAULT 'QUEUED'::pmc.message_status NOT NULL,
    provider_message_id text,
    error_text text,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone
);


ALTER TABLE pmc.receipt_deliveries OWNER TO postgres;

--
-- TOC entry 308 (class 1259 OID 96057)
-- Name: receipt_deliveries_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.receipt_deliveries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.receipt_deliveries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 306 (class 1259 OID 96023)
-- Name: receipts_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.receipts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 231 (class 1259 OID 94746)
-- Name: role_permissions; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.role_permissions (
    role_id bigint NOT NULL,
    permission_id bigint NOT NULL
);


ALTER TABLE pmc.role_permissions OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 94718)
-- Name: roles; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.roles (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE pmc.roles OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 94717)
-- Name: roles_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.roles ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 297 (class 1259 OID 95853)
-- Name: sale_lines; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.sale_lines (
    id bigint NOT NULL,
    sale_id bigint NOT NULL,
    line_type text DEFAULT 'ITEM'::text NOT NULL,
    item_id bigint,
    mill_job_id bigint,
    description text,
    unit_id bigint,
    quantity numeric(14,3) DEFAULT 1 NOT NULL,
    quantity_kg numeric(16,3),
    unit_price numeric(14,2) NOT NULL,
    line_total numeric(14,2) GENERATED ALWAYS AS (round((quantity * unit_price), 2)) STORED,
    stock_pool pmc.stock_pool,
    unit_cost_per_kg numeric(14,4),
    min_price_per_kg numeric(14,4),
    price_override_by bigint,
    override_reason text,
    CONSTRAINT sale_lines_check CHECK ((((line_type = 'ITEM'::text) AND (item_id IS NOT NULL) AND (unit_id IS NOT NULL)) OR ((line_type = 'MILLING'::text) AND (mill_job_id IS NOT NULL)))),
    CONSTRAINT sale_lines_line_type_check CHECK ((line_type = ANY (ARRAY['ITEM'::text, 'MILLING'::text]))),
    CONSTRAINT sale_lines_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT sale_lines_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


ALTER TABLE pmc.sale_lines OWNER TO postgres;

--
-- TOC entry 296 (class 1259 OID 95852)
-- Name: sale_lines_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.sale_lines ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.sale_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 280 (class 1259 OID 95534)
-- Name: sales_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.sales ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.sales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 223 (class 1259 OID 94664)
-- Name: seq_supplier_code; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

CREATE SEQUENCE pmc.seq_supplier_code
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE pmc.seq_supplier_code OWNER TO postgres;

--
-- TOC entry 269 (class 1259 OID 95303)
-- Name: stock_adjustments; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.stock_adjustments (
    id bigint NOT NULL,
    adjustment_no text DEFAULT pmc.next_doc_no('ADJ'::text) NOT NULL,
    adjustment_date timestamp with time zone DEFAULT now() NOT NULL,
    item_id bigint NOT NULL,
    pool pmc.stock_pool NOT NULL,
    reason pmc.adjustment_reason NOT NULL,
    quantity_kg_change numeric(16,3) NOT NULL,
    unit_cost_per_kg numeric(14,4),
    value_change numeric(16,2) GENERATED ALWAYS AS (round((quantity_kg_change * COALESCE(unit_cost_per_kg, (0)::numeric)), 2)) STORED,
    note text,
    approved_by bigint,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_adjustments_check CHECK (((reason <> 'OTHER'::pmc.adjustment_reason) OR (note IS NOT NULL))),
    CONSTRAINT stock_adjustments_quantity_kg_change_check CHECK ((quantity_kg_change <> (0)::numeric))
);


ALTER TABLE pmc.stock_adjustments OWNER TO postgres;

--
-- TOC entry 268 (class 1259 OID 95302)
-- Name: stock_adjustments_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.stock_adjustments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.stock_adjustments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 265 (class 1259 OID 95248)
-- Name: stock_balances; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.stock_balances (
    item_id bigint NOT NULL,
    pool pmc.stock_pool NOT NULL,
    quantity_kg numeric(16,3) DEFAULT 0 NOT NULL,
    avg_cost_per_kg numeric(14,4) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE pmc.stock_balances OWNER TO postgres;

--
-- TOC entry 267 (class 1259 OID 95267)
-- Name: stock_movements; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.stock_movements (
    id bigint NOT NULL,
    movement_date timestamp with time zone DEFAULT now() NOT NULL,
    item_id bigint NOT NULL,
    pool pmc.stock_pool NOT NULL,
    movement_type pmc.stock_movement_type NOT NULL,
    quantity_kg numeric(16,3) NOT NULL,
    unit_cost_per_kg numeric(14,4),
    balance_after_kg numeric(16,3),
    customer_id bigint,
    ref_table text,
    ref_id bigint,
    note text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_movements_quantity_kg_check CHECK ((quantity_kg <> (0)::numeric))
);


ALTER TABLE pmc.stock_movements OWNER TO postgres;

--
-- TOC entry 266 (class 1259 OID 95266)
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.stock_movements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 273 (class 1259 OID 95373)
-- Name: stock_take_lines; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.stock_take_lines (
    id bigint NOT NULL,
    take_id bigint NOT NULL,
    item_id bigint NOT NULL,
    system_kg numeric(16,3),
    counted_kg numeric(16,3) NOT NULL,
    variance_kg numeric(16,3) GENERATED ALWAYS AS ((counted_kg - COALESCE(system_kg, (0)::numeric))) STORED,
    note text,
    CONSTRAINT stock_take_lines_counted_kg_check CHECK ((counted_kg >= (0)::numeric))
);


ALTER TABLE pmc.stock_take_lines OWNER TO postgres;

--
-- TOC entry 272 (class 1259 OID 95372)
-- Name: stock_take_lines_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.stock_take_lines ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.stock_take_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 270 (class 1259 OID 95342)
-- Name: stock_takes_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.stock_takes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.stock_takes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 246 (class 1259 OID 94948)
-- Name: supplier_ledger; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.supplier_ledger (
    id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    entry_date timestamp with time zone DEFAULT now() NOT NULL,
    entry_type pmc.ledger_entry_type NOT NULL,
    debit numeric(14,2) DEFAULT 0 NOT NULL,
    credit numeric(14,2) DEFAULT 0 NOT NULL,
    purchase_id bigint,
    supplier_payment_id bigint,
    description text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_ledger_check CHECK ((((debit > (0)::numeric) AND (credit = (0)::numeric)) OR ((credit > (0)::numeric) AND (debit = (0)::numeric)))),
    CONSTRAINT supplier_ledger_credit_check CHECK ((credit >= (0)::numeric)),
    CONSTRAINT supplier_ledger_debit_check CHECK ((debit >= (0)::numeric))
);


ALTER TABLE pmc.supplier_ledger OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 94947)
-- Name: supplier_ledger_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.supplier_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.supplier_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 279 (class 1259 OID 95485)
-- Name: supplier_payments; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.supplier_payments (
    id bigint NOT NULL,
    payment_no text DEFAULT pmc.next_doc_no('SPAY'::text) NOT NULL,
    supplier_id bigint NOT NULL,
    purchase_id bigint,
    module pmc.module_code DEFAULT 'CEREAL'::pmc.module_code NOT NULL,
    paid_on timestamp with time zone DEFAULT now() NOT NULL,
    amount numeric(14,2) NOT NULL,
    method pmc.payment_method DEFAULT 'CASH'::pmc.payment_method NOT NULL,
    mpesa_code text,
    note text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_payments_amount_check CHECK ((amount > (0)::numeric))
);


ALTER TABLE pmc.supplier_payments OWNER TO postgres;

--
-- TOC entry 278 (class 1259 OID 95484)
-- Name: supplier_payments_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.supplier_payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.supplier_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 244 (class 1259 OID 94926)
-- Name: suppliers; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.suppliers (
    id bigint NOT NULL,
    supplier_code text DEFAULT ('S'::text || lpad((nextval('pmc.seq_supplier_code'::regclass))::text, 4, '0'::text)) NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text,
    email text,
    address text,
    payment_terms_days integer DEFAULT 0 NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE pmc.suppliers OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 94925)
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.suppliers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 248 (class 1259 OID 94981)
-- Name: units; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.units (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    kg_per_unit numeric(12,4),
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT units_kg_per_unit_check CHECK ((kg_per_unit > (0)::numeric))
);


ALTER TABLE pmc.units OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 94980)
-- Name: units_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.units ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.units_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 234 (class 1259 OID 94794)
-- Name: user_sessions; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id bigint NOT NULL,
    token_hash text NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);


ALTER TABLE pmc.user_sessions OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 94764)
-- Name: users; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.users (
    id bigint NOT NULL,
    username text NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    password_hash text NOT NULL,
    role_id bigint NOT NULL,
    allowed_modules pmc.module_code[] DEFAULT ARRAY['MILL'::pmc.module_code, 'CEREAL'::pmc.module_code] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    must_change_password boolean DEFAULT true NOT NULL,
    failed_login_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    password_changed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE pmc.users OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 94763)
-- Name: users_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 324 (class 1259 OID 96372)
-- Name: v_credit_overdue; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_credit_overdue AS
 SELECT s.id AS sale_id,
    s.sale_no,
    s.module,
    s.customer_id,
    c.full_name,
    c.phone,
    s.sale_date,
    s.due_date,
    s.total_amount,
    s.amount_paid,
    s.balance_due,
    (pmc.fn_local_date(now()) - s.due_date) AS days_overdue
   FROM (pmc.sales s
     JOIN pmc.customers c ON ((c.id = s.customer_id)))
  WHERE ((s.status = 'POSTED'::pmc.sale_status) AND (s.balance_due > (0)::numeric) AND (s.due_date IS NOT NULL) AND (s.due_date < pmc.fn_local_date(now())))
  ORDER BY s.due_date;


ALTER VIEW pmc.v_credit_overdue OWNER TO postgres;

--
-- TOC entry 339 (class 1259 OID 96446)
-- Name: v_current_prices; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_current_prices AS
 SELECT ip.item_id,
    i.name AS item_name,
    t.code AS tier,
    u.code AS unit,
    ip.price,
    round((ip.price / pmc.fn_kg_per_unit(ip.item_id, ip.unit_id)), 2) AS price_per_kg,
    mp.min_price_per_kg,
    ip.effective_from
   FROM ((((pmc.item_prices ip
     JOIN pmc.items i ON ((i.id = ip.item_id)))
     JOIN pmc.price_tiers t ON ((t.id = ip.tier_id)))
     JOIN pmc.units u ON ((u.id = ip.unit_id)))
     LEFT JOIN pmc.item_min_prices mp ON ((mp.item_id = ip.item_id)))
  WHERE (ip.effective_to IS NULL);


ALTER VIEW pmc.v_current_prices OWNER TO postgres;

--
-- TOC entry 323 (class 1259 OID 96367)
-- Name: v_customer_balances; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_customer_balances AS
 SELECT c.id AS customer_id,
    c.customer_code,
    c.full_name,
    c.phone,
    c.customer_type,
    c.credit_allowed,
    c.credit_limit,
    COALESCE(l.balance, (0)::numeric) AS balance,
    COALESCE(o.overdue_amount, (0)::numeric) AS overdue_amount,
    l.last_activity
   FROM ((pmc.customers c
     LEFT JOIN ( SELECT customer_ledger.customer_id,
            sum((customer_ledger.debit - customer_ledger.credit)) AS balance,
            max(customer_ledger.entry_date) AS last_activity
           FROM pmc.customer_ledger
          GROUP BY customer_ledger.customer_id) l ON ((l.customer_id = c.id)))
     LEFT JOIN ( SELECT sales.customer_id,
            sum(sales.balance_due) AS overdue_amount
           FROM pmc.sales
          WHERE ((sales.status = 'POSTED'::pmc.sale_status) AND (sales.balance_due > (0)::numeric) AND (sales.due_date < pmc.fn_local_date(now())))
          GROUP BY sales.customer_id) o ON ((o.customer_id = c.id)));


ALTER VIEW pmc.v_customer_balances OWNER TO postgres;

--
-- TOC entry 322 (class 1259 OID 96362)
-- Name: v_customer_grain_held; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_customer_grain_held AS
 SELECT sm.customer_id,
    c.full_name,
    sm.item_id,
    i.name AS grain,
    sum(sm.quantity_kg) AS kg_held
   FROM ((pmc.stock_movements sm
     JOIN pmc.customers c ON ((c.id = sm.customer_id)))
     JOIN pmc.items i ON ((i.id = sm.item_id)))
  WHERE (sm.pool = 'CUSTOMER_GRAIN'::pmc.stock_pool)
  GROUP BY sm.customer_id, c.full_name, sm.item_id, i.name
 HAVING (sum(sm.quantity_kg) <> (0)::numeric);


ALTER VIEW pmc.v_customer_grain_held OWNER TO postgres;

--
-- TOC entry 334 (class 1259 OID 96422)
-- Name: v_expenses_daily; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_expenses_daily AS
 SELECT e.expense_date AS day,
    e.module,
    c.name AS category,
    sum(e.amount) AS total
   FROM (pmc.expenses e
     JOIN pmc.expense_categories c ON ((c.id = e.category_id)))
  WHERE (NOT e.is_voided)
  GROUP BY e.expense_date, e.module, c.name;


ALTER VIEW pmc.v_expenses_daily OWNER TO postgres;

--
-- TOC entry 320 (class 1259 OID 96353)
-- Name: v_stock_current; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_stock_current AS
 SELECT sb.item_id,
    i.sku,
    i.name AS item_name,
    i.kind,
    g.name AS grain,
    gr.name AS grade,
    sb.pool,
    sb.quantity_kg,
    sb.avg_cost_per_kg,
    round((sb.quantity_kg * sb.avg_cost_per_kg), 2) AS stock_value,
    i.reorder_level_kg,
    ((sb.pool <> 'CUSTOMER_GRAIN'::pmc.stock_pool) AND (i.reorder_level_kg > (0)::numeric) AND (sb.quantity_kg <= i.reorder_level_kg)) AS is_low
   FROM (((pmc.stock_balances sb
     JOIN pmc.items i ON ((i.id = sb.item_id)))
     LEFT JOIN pmc.grains g ON ((g.id = i.grain_id)))
     LEFT JOIN pmc.grades gr ON ((gr.id = i.grade_id)));


ALTER VIEW pmc.v_stock_current OWNER TO postgres;

--
-- TOC entry 321 (class 1259 OID 96358)
-- Name: v_low_stock; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_low_stock AS
 SELECT item_id,
    sku,
    item_name,
    kind,
    grain,
    grade,
    pool,
    quantity_kg,
    avg_cost_per_kg,
    stock_value,
    reorder_level_kg,
    is_low
   FROM pmc.v_stock_current
  WHERE is_low
  ORDER BY item_name;


ALTER VIEW pmc.v_low_stock OWNER TO postgres;

--
-- TOC entry 329 (class 1259 OID 96397)
-- Name: v_sale_line_margin; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_sale_line_margin AS
 SELECT s.id AS sale_id,
    s.sale_no,
    pmc.fn_local_date(s.sale_date) AS day,
    s.module,
    l.id AS line_id,
    l.item_id,
    i.name AS item_name,
    l.quantity_kg,
    round((l.line_total *
        CASE
            WHEN (s.subtotal > (0)::numeric) THEN (s.total_amount / s.subtotal)
            ELSE (1)::numeric
        END), 2) AS revenue,
    round((COALESCE(l.unit_cost_per_kg, (0)::numeric) * l.quantity_kg), 2) AS cost,
    round(((l.line_total *
        CASE
            WHEN (s.subtotal > (0)::numeric) THEN (s.total_amount / s.subtotal)
            ELSE (1)::numeric
        END) - (COALESCE(l.unit_cost_per_kg, (0)::numeric) * l.quantity_kg)), 2) AS profit
   FROM ((pmc.sale_lines l
     JOIN pmc.sales s ON (((s.id = l.sale_id) AND (s.status = 'POSTED'::pmc.sale_status))))
     JOIN pmc.items i ON ((i.id = l.item_id)))
  WHERE (l.line_type = 'ITEM'::text);


ALTER VIEW pmc.v_sale_line_margin OWNER TO postgres;

--
-- TOC entry 330 (class 1259 OID 96402)
-- Name: v_margin_per_grain; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_margin_per_grain AS
 SELECT item_id,
    item_name,
    sum(quantity_kg) AS kg_sold,
    sum(revenue) AS revenue,
    sum(cost) AS cost,
    sum(profit) AS profit,
    round((((100)::numeric * sum(profit)) / NULLIF(sum(revenue), (0)::numeric)), 2) AS margin_pct,
    round((sum(profit) / NULLIF(sum(quantity_kg), (0)::numeric)), 2) AS profit_per_kg
   FROM pmc.v_sale_line_margin
  GROUP BY item_id, item_name;


ALTER VIEW pmc.v_margin_per_grain OWNER TO postgres;

--
-- TOC entry 331 (class 1259 OID 96407)
-- Name: v_mill_jobs_open; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_mill_jobs_open AS
 SELECT j.id,
    j.ticket_no,
    j.status,
    j.received_at,
    COALESCE(c.full_name, j.walkin_name) AS customer,
    i.name AS grain,
    j.weight_in_kg,
    j.charge_amount,
    u.full_name AS miller,
    round((EXTRACT(epoch FROM (now() - j.received_at)) / (3600)::numeric), 1) AS hours_open
   FROM (((pmc.mill_jobs j
     JOIN pmc.items i ON ((i.id = j.grain_item_id)))
     LEFT JOIN pmc.customers c ON ((c.id = j.customer_id)))
     LEFT JOIN pmc.users u ON ((u.id = j.miller_id)))
  WHERE (j.status = ANY (ARRAY['WAITING'::pmc.job_status, 'MILLING'::pmc.job_status, 'READY'::pmc.job_status]));


ALTER VIEW pmc.v_mill_jobs_open OWNER TO postgres;

--
-- TOC entry 295 (class 1259 OID 95819)
-- Name: yield_alerts; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.yield_alerts (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    expected_kg numeric(12,3) NOT NULL,
    actual_kg numeric(12,3) NOT NULL,
    shortfall_kg numeric(12,3) NOT NULL,
    shortfall_pct numeric(6,2) NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    reviewed_by bigint,
    reviewed_at timestamp with time zone,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT yield_alerts_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'EXPLAINED'::text, 'CONFIRMED_LOSS'::text, 'DISMISSED'::text])))
);


ALTER TABLE pmc.yield_alerts OWNER TO postgres;

--
-- TOC entry 332 (class 1259 OID 96412)
-- Name: v_mill_yield_report; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_mill_yield_report AS
 SELECT j.id AS job_id,
    j.ticket_no,
    pmc.fn_local_date(j.received_at) AS day,
    i.name AS grain,
    j.weight_in_kg,
    j.expected_flour_kg,
    j.weight_out_kg,
    j.bran_kg,
    j.yield_pct,
    j.yield_status,
    u.full_name AS miller,
    a.status AS alert_status,
    a.shortfall_kg
   FROM (((pmc.mill_jobs j
     JOIN pmc.items i ON ((i.id = j.grain_item_id)))
     LEFT JOIN pmc.users u ON ((u.id = j.miller_id)))
     LEFT JOIN pmc.yield_alerts a ON ((a.job_id = j.id)))
  WHERE (j.weight_out_kg IS NOT NULL);


ALTER VIEW pmc.v_mill_yield_report OWNER TO postgres;

--
-- TOC entry 333 (class 1259 OID 96417)
-- Name: v_mill_yield_by_grain; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_mill_yield_by_grain AS
 SELECT grain,
    count(*) AS jobs,
    sum(weight_in_kg) AS kg_in,
    sum(weight_out_kg) AS kg_out,
    round((((100)::numeric * sum(weight_out_kg)) / NULLIF(sum(weight_in_kg), (0)::numeric)), 2) AS avg_yield_pct,
    count(*) FILTER (WHERE (yield_status = 'LOW'::text)) AS low_yield_jobs
   FROM pmc.v_mill_yield_report
  GROUP BY grain;


ALTER VIEW pmc.v_mill_yield_by_grain OWNER TO postgres;

--
-- TOC entry 326 (class 1259 OID 96382)
-- Name: v_supplier_balances; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_supplier_balances AS
 SELECT sp.id AS supplier_id,
    sp.supplier_code,
    sp.name,
    sp.phone,
    COALESCE(sum((l.credit - l.debit)), (0)::numeric) AS amount_owed
   FROM (pmc.suppliers sp
     LEFT JOIN pmc.supplier_ledger l ON ((l.supplier_id = sp.id)))
  GROUP BY sp.id, sp.supplier_code, sp.name, sp.phone;


ALTER VIEW pmc.v_supplier_balances OWNER TO postgres;

--
-- TOC entry 337 (class 1259 OID 96437)
-- Name: v_owner_alerts; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_owner_alerts AS
 SELECT ( SELECT count(*) AS count
           FROM pmc.v_stock_current
          WHERE v_stock_current.is_low) AS low_stock_items,
    ( SELECT COALESCE(sum(sales.balance_due), (0)::numeric) AS "coalesce"
           FROM pmc.sales
          WHERE ((sales.status = 'POSTED'::pmc.sale_status) AND (sales.balance_due > (0)::numeric))) AS credit_outstanding,
    ( SELECT COALESCE(sum(v_credit_overdue.balance_due), (0)::numeric) AS "coalesce"
           FROM pmc.v_credit_overdue) AS credit_overdue,
    ( SELECT count(*) AS count
           FROM pmc.yield_alerts
          WHERE (yield_alerts.status = 'OPEN'::text)) AS open_yield_alerts,
    ( SELECT count(*) AS count
           FROM pmc.mill_jobs
          WHERE (mill_jobs.status = ANY (ARRAY['WAITING'::pmc.job_status, 'MILLING'::pmc.job_status]))) AS jobs_in_progress,
    ( SELECT count(*) AS count
           FROM pmc.mill_jobs
          WHERE (mill_jobs.status = 'READY'::pmc.job_status)) AS jobs_awaiting_collection,
    ( SELECT COALESCE(sum(v_supplier_balances.amount_owed), (0)::numeric) AS "coalesce"
           FROM pmc.v_supplier_balances) AS owed_to_suppliers,
    ( SELECT count(*) AS count
           FROM pmc.payments
          WHERE ((payments.state = 'PENDING'::pmc.payment_state) AND (payments.received_at < (now() - '00:10:00'::interval)))) AS stale_pending_payments;


ALTER VIEW pmc.v_owner_alerts OWNER TO postgres;

--
-- TOC entry 328 (class 1259 OID 96392)
-- Name: v_payments_daily; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_payments_daily AS
 SELECT pmc.fn_local_date(COALESCE(confirmed_at, received_at)) AS day,
    module,
    sum(amount) FILTER (WHERE (method = 'CASH'::pmc.payment_method)) AS cash,
    sum(amount) FILTER (WHERE (method = ANY (ARRAY['MPESA_STK'::pmc.payment_method, 'MPESA_MANUAL'::pmc.payment_method]))) AS mpesa,
    sum(amount) FILTER (WHERE (method = 'MPESA_STK'::pmc.payment_method)) AS mpesa_stk,
    sum(amount) FILTER (WHERE (method = 'MPESA_MANUAL'::pmc.payment_method)) AS mpesa_manual,
    sum(amount) FILTER (WHERE (method = ANY (ARRAY['BANK'::pmc.payment_method, 'OTHER'::pmc.payment_method]))) AS other,
    sum(amount) AS total
   FROM pmc.payments
  WHERE (state = 'CONFIRMED'::pmc.payment_state)
  GROUP BY (pmc.fn_local_date(COALESCE(confirmed_at, received_at))), module;


ALTER VIEW pmc.v_payments_daily OWNER TO postgres;

--
-- TOC entry 335 (class 1259 OID 96427)
-- Name: v_profit_daily; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_profit_daily AS
 WITH rev AS (
         SELECT pmc.fn_local_date(sales.sale_date) AS day,
            sales.module,
            sum(sales.total_amount) AS revenue
           FROM pmc.sales
          WHERE (sales.status = 'POSTED'::pmc.sale_status)
          GROUP BY (pmc.fn_local_date(sales.sale_date)), sales.module
        ), cogs AS (
         SELECT pmc.fn_local_date(s.sale_date) AS day,
            s.module,
            sum((COALESCE(l.unit_cost_per_kg, (0)::numeric) * l.quantity_kg)) AS cogs
           FROM (pmc.sale_lines l
             JOIN pmc.sales s ON ((s.id = l.sale_id)))
          WHERE ((s.status = 'POSTED'::pmc.sale_status) AND (l.line_type = 'ITEM'::text))
          GROUP BY (pmc.fn_local_date(s.sale_date)), s.module
        ), exp AS (
         SELECT expenses.expense_date AS day,
            expenses.module,
            sum(expenses.amount) AS expenses
           FROM pmc.expenses
          WHERE (NOT expenses.is_voided)
          GROUP BY expenses.expense_date, expenses.module
        ), keys AS (
         SELECT rev.day,
            rev.module
           FROM rev
        UNION
         SELECT cogs.day,
            cogs.module
           FROM cogs
        UNION
         SELECT exp.day,
            exp.module
           FROM exp
        )
 SELECT k.day,
    k.module,
    COALESCE(r.revenue, (0)::numeric) AS revenue,
    round(COALESCE(c.cogs, (0)::numeric), 2) AS cogs,
    round((COALESCE(r.revenue, (0)::numeric) - COALESCE(c.cogs, (0)::numeric)), 2) AS gross_profit,
    COALESCE(e.expenses, (0)::numeric) AS expenses,
    round(((COALESCE(r.revenue, (0)::numeric) - COALESCE(c.cogs, (0)::numeric)) - COALESCE(e.expenses, (0)::numeric)), 2) AS net_profit
   FROM (((keys k
     LEFT JOIN rev r ON (((r.day = k.day) AND (r.module = k.module))))
     LEFT JOIN cogs c ON (((c.day = k.day) AND (c.module = k.module))))
     LEFT JOIN exp e ON (((e.day = k.day) AND (e.module = k.module))));


ALTER VIEW pmc.v_profit_daily OWNER TO postgres;

--
-- TOC entry 327 (class 1259 OID 96387)
-- Name: v_sales_daily; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_sales_daily AS
 SELECT pmc.fn_local_date(sale_date) AS day,
    module,
    count(*) AS sales_count,
    sum(total_amount) AS sales_total,
    sum(amount_paid) AS collected,
    sum(balance_due) AS outstanding
   FROM pmc.sales
  WHERE (status = 'POSTED'::pmc.sale_status)
  GROUP BY (pmc.fn_local_date(sale_date)), module;


ALTER VIEW pmc.v_sales_daily OWNER TO postgres;

--
-- TOC entry 336 (class 1259 OID 96432)
-- Name: v_owner_dashboard_today; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_owner_dashboard_today AS
 WITH t AS (
         SELECT pmc.fn_local_date(now()) AS d
        ), m AS (
         SELECT mod.module,
            COALESCE(( SELECT sum(v.sales_count) AS sum
                   FROM pmc.v_sales_daily v,
                    t
                  WHERE ((v.day = t.d) AND (v.module = mod.module))), (0)::numeric) AS sales_count,
            COALESCE(( SELECT sum(v.sales_total) AS sum
                   FROM pmc.v_sales_daily v,
                    t
                  WHERE ((v.day = t.d) AND (v.module = mod.module))), (0)::numeric) AS sales_total,
            COALESCE(( SELECT sum(v.cash) AS sum
                   FROM pmc.v_payments_daily v,
                    t
                  WHERE ((v.day = t.d) AND (v.module = mod.module))), (0)::numeric) AS cash_in,
            COALESCE(( SELECT sum(v.mpesa) AS sum
                   FROM pmc.v_payments_daily v,
                    t
                  WHERE ((v.day = t.d) AND (v.module = mod.module))), (0)::numeric) AS mpesa_in,
            COALESCE(( SELECT sum(v.net_profit) AS sum
                   FROM pmc.v_profit_daily v,
                    t
                  WHERE ((v.day = t.d) AND (v.module = mod.module))), (0)::numeric) AS net_profit
           FROM ( VALUES ('MILL'::pmc.module_code), ('CEREAL'::pmc.module_code)) mod(module)
        )
 SELECT (m.module)::text AS scope,
    m.sales_count,
    m.sales_total,
    m.cash_in,
    m.mpesa_in,
    m.net_profit
   FROM m
UNION ALL
 SELECT 'ALL'::text AS scope,
    sum(m.sales_count) AS sales_count,
    sum(m.sales_total) AS sales_total,
    sum(m.cash_in) AS cash_in,
    sum(m.mpesa_in) AS mpesa_in,
    COALESCE(( SELECT sum(v.net_profit) AS sum
           FROM pmc.v_profit_daily v,
            t
          WHERE (v.day = t.d)), (0)::numeric) AS net_profit
   FROM m;


ALTER VIEW pmc.v_owner_dashboard_today OWNER TO postgres;

--
-- TOC entry 325 (class 1259 OID 96377)
-- Name: v_receivables_aging; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_receivables_aging AS
 SELECT s.customer_id,
    c.full_name,
    sum(s.balance_due) FILTER (WHERE (s.age <= 7)) AS d0_7,
    sum(s.balance_due) FILTER (WHERE ((s.age >= 8) AND (s.age <= 30))) AS d8_30,
    sum(s.balance_due) FILTER (WHERE ((s.age >= 31) AND (s.age <= 60))) AS d31_60,
    sum(s.balance_due) FILTER (WHERE (s.age > 60)) AS d60_plus,
    sum(s.balance_due) AS total_outstanding
   FROM (( SELECT sales.id,
            sales.sale_no,
            sales.module,
            sales.channel,
            sales.customer_id,
            sales.walkin_name,
            sales.walkin_phone,
            sales.sale_date,
            sales.status,
            sales.subtotal,
            sales.discount_amount,
            sales.total_amount,
            sales.amount_paid,
            sales.balance_due,
            sales.payment_status,
            sales.is_credit,
            sales.due_date,
            sales.is_delivery,
            sales.delivery_address,
            sales.notes,
            sales.cashier_id,
            sales.posted_at,
            sales.voided_at,
            sales.voided_by,
            sales.void_approved_by,
            sales.void_reason,
            sales.created_at,
            sales.updated_at,
            (pmc.fn_local_date(now()) - COALESCE(sales.due_date, pmc.fn_local_date(sales.sale_date))) AS age
           FROM pmc.sales
          WHERE ((sales.status = 'POSTED'::pmc.sale_status) AND (sales.balance_due > (0)::numeric) AND (sales.customer_id IS NOT NULL))) s
     JOIN pmc.customers c ON ((c.id = s.customer_id)))
  GROUP BY s.customer_id, c.full_name;


ALTER VIEW pmc.v_receivables_aging OWNER TO postgres;

--
-- TOC entry 338 (class 1259 OID 96442)
-- Name: v_stock_value_summary; Type: VIEW; Schema: pmc; Owner: postgres
--

CREATE VIEW pmc.v_stock_value_summary AS
 SELECT pool,
    count(*) AS items,
    sum(quantity_kg) AS total_kg,
    round(sum((quantity_kg * avg_cost_per_kg)), 2) AS stock_value
   FROM pmc.stock_balances
  GROUP BY pool;


ALTER VIEW pmc.v_stock_value_summary OWNER TO postgres;

--
-- TOC entry 294 (class 1259 OID 95818)
-- Name: yield_alerts_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.yield_alerts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.yield_alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 264 (class 1259 OID 95204)
-- Name: yield_standards; Type: TABLE; Schema: pmc; Owner: postgres
--

CREATE TABLE pmc.yield_standards (
    id bigint NOT NULL,
    grain_item_id bigint NOT NULL,
    flour_item_id bigint,
    bran_item_id bigint,
    expected_flour_kg_per_100 numeric(6,2) NOT NULL,
    expected_bran_kg_per_100 numeric(6,2) DEFAULT 0 NOT NULL,
    alert_below_kg_per_100 numeric(6,2) NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT yield_standards_check CHECK ((alert_below_kg_per_100 <= expected_flour_kg_per_100)),
    CONSTRAINT yield_standards_expected_bran_kg_per_100_check CHECK ((expected_bran_kg_per_100 >= (0)::numeric)),
    CONSTRAINT yield_standards_expected_flour_kg_per_100_check CHECK (((expected_flour_kg_per_100 >= (1)::numeric) AND (expected_flour_kg_per_100 <= (100)::numeric)))
);


ALTER TABLE pmc.yield_standards OWNER TO postgres;

--
-- TOC entry 263 (class 1259 OID 95203)
-- Name: yield_standards_id_seq; Type: SEQUENCE; Schema: pmc; Owner: postgres
--

ALTER TABLE pmc.yield_standards ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pmc.yield_standards_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 5641 (class 2606 OID 94827)
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5620 (class 2606 OID 94696)
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- TOC entry 5647 (class 2606 OID 94850)
-- Name: backup_log backup_log_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.backup_log
    ADD CONSTRAINT backup_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5618 (class 2606 OID 94685)
-- Name: business_profile business_profile_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.business_profile
    ADD CONSTRAINT business_profile_pkey PRIMARY KEY (id);


--
-- TOC entry 5655 (class 2606 OID 94913)
-- Name: customer_ledger customer_ledger_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.customer_ledger
    ADD CONSTRAINT customer_ledger_pkey PRIMARY KEY (id);


--
-- TOC entry 5649 (class 2606 OID 94884)
-- Name: customers customers_customer_code_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.customers
    ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);


--
-- TOC entry 5651 (class 2606 OID 94882)
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- TOC entry 5825 (class 2606 OID 96242)
-- Name: daily_closes daily_closes_close_date_module_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.daily_closes
    ADD CONSTRAINT daily_closes_close_date_module_key UNIQUE (close_date, module);


--
-- TOC entry 5827 (class 2606 OID 96240)
-- Name: daily_closes daily_closes_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.daily_closes
    ADD CONSTRAINT daily_closes_pkey PRIMARY KEY (id);


--
-- TOC entry 5806 (class 2606 OID 96097)
-- Name: deliveries deliveries_delivery_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.deliveries
    ADD CONSTRAINT deliveries_delivery_no_key UNIQUE (delivery_no);


--
-- TOC entry 5808 (class 2606 OID 96095)
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);


--
-- TOC entry 5616 (class 2606 OID 94661)
-- Name: doc_counters doc_counters_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.doc_counters
    ADD CONSTRAINT doc_counters_pkey PRIMARY KEY (doc_type, period);


--
-- TOC entry 5811 (class 2606 OID 96128)
-- Name: expense_categories expense_categories_code_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.expense_categories
    ADD CONSTRAINT expense_categories_code_key UNIQUE (code);


--
-- TOC entry 5813 (class 2606 OID 96126)
-- Name: expense_categories expense_categories_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);


--
-- TOC entry 5815 (class 2606 OID 96157)
-- Name: expenses expenses_expense_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.expenses
    ADD CONSTRAINT expenses_expense_no_key UNIQUE (expense_no);


--
-- TOC entry 5817 (class 2606 OID 96155)
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- TOC entry 5673 (class 2606 OID 95030)
-- Name: grades grades_code_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.grades
    ADD CONSTRAINT grades_code_key UNIQUE (code);


--
-- TOC entry 5675 (class 2606 OID 95028)
-- Name: grades grades_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.grades
    ADD CONSTRAINT grades_pkey PRIMARY KEY (id);


--
-- TOC entry 5669 (class 2606 OID 95015)
-- Name: grains grains_code_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.grains
    ADD CONSTRAINT grains_code_key UNIQUE (code);


--
-- TOC entry 5671 (class 2606 OID 95013)
-- Name: grains grains_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.grains
    ADD CONSTRAINT grains_pkey PRIMARY KEY (id);


--
-- TOC entry 5695 (class 2606 OID 95156)
-- Name: item_min_prices item_min_prices_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_min_prices
    ADD CONSTRAINT item_min_prices_pkey PRIMARY KEY (item_id);


--
-- TOC entry 5691 (class 2606 OID 95124)
-- Name: item_prices item_prices_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_prices
    ADD CONSTRAINT item_prices_pkey PRIMARY KEY (id);


--
-- TOC entry 5685 (class 2606 OID 95086)
-- Name: item_units item_units_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_units
    ADD CONSTRAINT item_units_pkey PRIMARY KEY (item_id, unit_id);


--
-- TOC entry 5677 (class 2606 OID 95061)
-- Name: items items_name_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.items
    ADD CONSTRAINT items_name_key UNIQUE (name);


--
-- TOC entry 5679 (class 2606 OID 95057)
-- Name: items items_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- TOC entry 5681 (class 2606 OID 95059)
-- Name: items items_sku_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.items
    ADD CONSTRAINT items_sku_key UNIQUE (sku);


--
-- TOC entry 5749 (class 2606 OID 95660)
-- Name: machine_logs machine_logs_machine_id_log_date_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.machine_logs
    ADD CONSTRAINT machine_logs_machine_id_log_date_key UNIQUE (machine_id, log_date);


--
-- TOC entry 5751 (class 2606 OID 95658)
-- Name: machine_logs machine_logs_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.machine_logs
    ADD CONSTRAINT machine_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 5745 (class 2606 OID 95627)
-- Name: machines machines_name_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.machines
    ADD CONSTRAINT machines_name_key UNIQUE (name);


--
-- TOC entry 5747 (class 2606 OID 95625)
-- Name: machines machines_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.machines
    ADD CONSTRAINT machines_pkey PRIMARY KEY (id);


--
-- TOC entry 5760 (class 2606 OID 95757)
-- Name: mill_job_blends mill_job_blends_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_job_blends
    ADD CONSTRAINT mill_job_blends_pkey PRIMARY KEY (id);


--
-- TOC entry 5763 (class 2606 OID 95784)
-- Name: mill_job_outputs mill_job_outputs_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_job_outputs
    ADD CONSTRAINT mill_job_outputs_pkey PRIMARY KEY (id);


--
-- TOC entry 5766 (class 2606 OID 95806)
-- Name: mill_job_status_history mill_job_status_history_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_job_status_history
    ADD CONSTRAINT mill_job_status_history_pkey PRIMARY KEY (id);


--
-- TOC entry 5756 (class 2606 OID 95711)
-- Name: mill_jobs mill_jobs_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_jobs
    ADD CONSTRAINT mill_jobs_pkey PRIMARY KEY (id);


--
-- TOC entry 5758 (class 2606 OID 95713)
-- Name: mill_jobs mill_jobs_ticket_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_jobs
    ADD CONSTRAINT mill_jobs_ticket_no_key UNIQUE (ticket_no);


--
-- TOC entry 5698 (class 2606 OID 95191)
-- Name: milling_rates milling_rates_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.milling_rates
    ADD CONSTRAINT milling_rates_pkey PRIMARY KEY (id);


--
-- TOC entry 5821 (class 2606 OID 96202)
-- Name: module_transfers module_transfers_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.module_transfers
    ADD CONSTRAINT module_transfers_pkey PRIMARY KEY (id);


--
-- TOC entry 5823 (class 2606 OID 96204)
-- Name: module_transfers module_transfers_transfer_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.module_transfers
    ADD CONSTRAINT module_transfers_transfer_no_key UNIQUE (transfer_no);


--
-- TOC entry 5796 (class 2606 OID 96022)
-- Name: mpesa_callback_log mpesa_callback_log_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mpesa_callback_log
    ADD CONSTRAINT mpesa_callback_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5622 (class 2606 OID 94716)
-- Name: mpesa_config mpesa_config_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mpesa_config
    ADD CONSTRAINT mpesa_config_pkey PRIMARY KEY (id);


--
-- TOC entry 5792 (class 2606 OID 95994)
-- Name: mpesa_stk_requests mpesa_stk_requests_checkout_request_id_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mpesa_stk_requests
    ADD CONSTRAINT mpesa_stk_requests_checkout_request_id_key UNIQUE (checkout_request_id);


--
-- TOC entry 5794 (class 2606 OID 95992)
-- Name: mpesa_stk_requests mpesa_stk_requests_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mpesa_stk_requests
    ADD CONSTRAINT mpesa_stk_requests_pkey PRIMARY KEY (id);


--
-- TOC entry 5786 (class 2606 OID 95961)
-- Name: payment_allocations payment_allocations_payment_id_sale_id_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.payment_allocations
    ADD CONSTRAINT payment_allocations_payment_id_sale_id_key UNIQUE (payment_id, sale_id);


--
-- TOC entry 5788 (class 2606 OID 95959)
-- Name: payment_allocations payment_allocations_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.payment_allocations
    ADD CONSTRAINT payment_allocations_pkey PRIMARY KEY (id);


--
-- TOC entry 5780 (class 2606 OID 95927)
-- Name: payments payments_payment_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.payments
    ADD CONSTRAINT payments_payment_no_key UNIQUE (payment_no);


--
-- TOC entry 5782 (class 2606 OID 95925)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 5628 (class 2606 OID 94745)
-- Name: permissions permissions_code_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.permissions
    ADD CONSTRAINT permissions_code_key UNIQUE (code);


--
-- TOC entry 5630 (class 2606 OID 94743)
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- TOC entry 5687 (class 2606 OID 95110)
-- Name: price_tiers price_tiers_code_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.price_tiers
    ADD CONSTRAINT price_tiers_code_key UNIQUE (code);


--
-- TOC entry 5689 (class 2606 OID 95108)
-- Name: price_tiers price_tiers_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.price_tiers
    ADD CONSTRAINT price_tiers_pkey PRIMARY KEY (id);


--
-- TOC entry 5730 (class 2606 OID 95467)
-- Name: purchase_lines purchase_lines_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.purchase_lines
    ADD CONSTRAINT purchase_lines_pkey PRIMARY KEY (id);


--
-- TOC entry 5725 (class 2606 OID 95437)
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- TOC entry 5727 (class 2606 OID 95439)
-- Name: purchases purchases_purchase_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.purchases
    ADD CONSTRAINT purchases_purchase_no_key UNIQUE (purchase_no);


--
-- TOC entry 5804 (class 2606 OID 96071)
-- Name: receipt_deliveries receipt_deliveries_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.receipt_deliveries
    ADD CONSTRAINT receipt_deliveries_pkey PRIMARY KEY (id);


--
-- TOC entry 5799 (class 2606 OID 96043)
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- TOC entry 5801 (class 2606 OID 96045)
-- Name: receipts receipts_receipt_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.receipts
    ADD CONSTRAINT receipts_receipt_no_key UNIQUE (receipt_no);


--
-- TOC entry 5632 (class 2606 OID 94752)
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- TOC entry 5624 (class 2606 OID 94733)
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- TOC entry 5626 (class 2606 OID 94731)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- TOC entry 5775 (class 2606 OID 95871)
-- Name: sale_lines sale_lines_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sale_lines
    ADD CONSTRAINT sale_lines_pkey PRIMARY KEY (id);


--
-- TOC entry 5741 (class 2606 OID 95572)
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- TOC entry 5743 (class 2606 OID 95574)
-- Name: sales sales_sale_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sales
    ADD CONSTRAINT sales_sale_no_key UNIQUE (sale_no);


--
-- TOC entry 5712 (class 2606 OID 95325)
-- Name: stock_adjustments stock_adjustments_adjustment_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_adjustments
    ADD CONSTRAINT stock_adjustments_adjustment_no_key UNIQUE (adjustment_no);


--
-- TOC entry 5714 (class 2606 OID 95323)
-- Name: stock_adjustments stock_adjustments_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_adjustments
    ADD CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id);


--
-- TOC entry 5704 (class 2606 OID 95260)
-- Name: stock_balances stock_balances_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_balances
    ADD CONSTRAINT stock_balances_pkey PRIMARY KEY (item_id, pool);


--
-- TOC entry 5709 (class 2606 OID 95283)
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- TOC entry 5720 (class 2606 OID 95385)
-- Name: stock_take_lines stock_take_lines_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_take_lines
    ADD CONSTRAINT stock_take_lines_pkey PRIMARY KEY (id);


--
-- TOC entry 5722 (class 2606 OID 95387)
-- Name: stock_take_lines stock_take_lines_take_id_item_id_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_take_lines
    ADD CONSTRAINT stock_take_lines_take_id_item_id_key UNIQUE (take_id, item_id);


--
-- TOC entry 5716 (class 2606 OID 95359)
-- Name: stock_takes stock_takes_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_takes
    ADD CONSTRAINT stock_takes_pkey PRIMARY KEY (id);


--
-- TOC entry 5718 (class 2606 OID 95361)
-- Name: stock_takes stock_takes_take_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_takes
    ADD CONSTRAINT stock_takes_take_no_key UNIQUE (take_no);


--
-- TOC entry 5663 (class 2606 OID 94968)
-- Name: supplier_ledger supplier_ledger_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_ledger
    ADD CONSTRAINT supplier_ledger_pkey PRIMARY KEY (id);


--
-- TOC entry 5733 (class 2606 OID 95507)
-- Name: supplier_payments supplier_payments_payment_no_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_payments
    ADD CONSTRAINT supplier_payments_payment_no_key UNIQUE (payment_no);


--
-- TOC entry 5735 (class 2606 OID 95505)
-- Name: supplier_payments supplier_payments_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_payments
    ADD CONSTRAINT supplier_payments_pkey PRIMARY KEY (id);


--
-- TOC entry 5658 (class 2606 OID 94944)
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- TOC entry 5660 (class 2606 OID 94946)
-- Name: suppliers suppliers_supplier_code_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.suppliers
    ADD CONSTRAINT suppliers_supplier_code_key UNIQUE (supplier_code);


--
-- TOC entry 5665 (class 2606 OID 94995)
-- Name: units units_code_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.units
    ADD CONSTRAINT units_code_key UNIQUE (code);


--
-- TOC entry 5667 (class 2606 OID 94993)
-- Name: units units_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- TOC entry 5638 (class 2606 OID 94807)
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5634 (class 2606 OID 94787)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5769 (class 2606 OID 95840)
-- Name: yield_alerts yield_alerts_job_id_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_alerts
    ADD CONSTRAINT yield_alerts_job_id_key UNIQUE (job_id);


--
-- TOC entry 5771 (class 2606 OID 95838)
-- Name: yield_alerts yield_alerts_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_alerts
    ADD CONSTRAINT yield_alerts_pkey PRIMARY KEY (id);


--
-- TOC entry 5700 (class 2606 OID 95227)
-- Name: yield_standards yield_standards_grain_item_id_effective_from_key; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_standards
    ADD CONSTRAINT yield_standards_grain_item_id_effective_from_key UNIQUE (grain_item_id, effective_from);


--
-- TOC entry 5702 (class 2606 OID 95225)
-- Name: yield_standards yield_standards_pkey; Type: CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_standards
    ADD CONSTRAINT yield_standards_pkey PRIMARY KEY (id);


--
-- TOC entry 5642 (class 1259 OID 94835)
-- Name: ix_activity_category; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_activity_category ON pmc.activity_log USING btree (category, occurred_at DESC);


--
-- TOC entry 5643 (class 1259 OID 94836)
-- Name: ix_activity_entity; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_activity_entity ON pmc.activity_log USING btree (entity_table, entity_id);


--
-- TOC entry 5644 (class 1259 OID 94833)
-- Name: ix_activity_time; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_activity_time ON pmc.activity_log USING btree (occurred_at DESC);


--
-- TOC entry 5645 (class 1259 OID 94834)
-- Name: ix_activity_user; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_activity_user ON pmc.activity_log USING btree (user_id, occurred_at DESC);


--
-- TOC entry 5784 (class 1259 OID 95972)
-- Name: ix_alloc_sale; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_alloc_sale ON pmc.payment_allocations USING btree (sale_id);


--
-- TOC entry 5656 (class 1259 OID 94924)
-- Name: ix_cledger_customer; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_cledger_customer ON pmc.customer_ledger USING btree (customer_id, entry_date);


--
-- TOC entry 5652 (class 1259 OID 94891)
-- Name: ix_customers_name; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_customers_name ON pmc.customers USING btree (lower(full_name));


--
-- TOC entry 5809 (class 1259 OID 96113)
-- Name: ix_deliveries_sale; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_deliveries_sale ON pmc.deliveries USING btree (sale_id);


--
-- TOC entry 5818 (class 1259 OID 96178)
-- Name: ix_expenses_date; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_expenses_date ON pmc.expenses USING btree (expense_date, module);


--
-- TOC entry 5692 (class 1259 OID 95146)
-- Name: ix_item_prices_item; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_item_prices_item ON pmc.item_prices USING btree (item_id, tier_id);


--
-- TOC entry 5682 (class 1259 OID 95072)
-- Name: ix_items_grain; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_items_grain ON pmc.items USING btree (grain_id);


--
-- TOC entry 5683 (class 1259 OID 95073)
-- Name: ix_items_kind; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_items_kind ON pmc.items USING btree (kind);


--
-- TOC entry 5764 (class 1259 OID 95817)
-- Name: ix_jobhist_job; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_jobhist_job ON pmc.mill_job_status_history USING btree (job_id, changed_at);


--
-- TOC entry 5761 (class 1259 OID 95795)
-- Name: ix_jobouts_job; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_jobouts_job ON pmc.mill_job_outputs USING btree (job_id);


--
-- TOC entry 5696 (class 1259 OID 95202)
-- Name: ix_milling_rates_grain; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_milling_rates_grain ON pmc.milling_rates USING btree (grain_item_id, rate_type);


--
-- TOC entry 5752 (class 1259 OID 95745)
-- Name: ix_milljobs_customer; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_milljobs_customer ON pmc.mill_jobs USING btree (customer_id, received_at);


--
-- TOC entry 5753 (class 1259 OID 95746)
-- Name: ix_milljobs_grain; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_milljobs_grain ON pmc.mill_jobs USING btree (grain_item_id, received_at);


--
-- TOC entry 5754 (class 1259 OID 95744)
-- Name: ix_milljobs_status; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_milljobs_status ON pmc.mill_jobs USING btree (status, received_at);


--
-- TOC entry 5776 (class 1259 OID 95940)
-- Name: ix_payments_customer; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_payments_customer ON pmc.payments USING btree (customer_id, received_at);


--
-- TOC entry 5777 (class 1259 OID 95939)
-- Name: ix_payments_date; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_payments_date ON pmc.payments USING btree (received_at);


--
-- TOC entry 5778 (class 1259 OID 95941)
-- Name: ix_payments_state; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_payments_state ON pmc.payments USING btree (state, method);


--
-- TOC entry 5728 (class 1259 OID 95483)
-- Name: ix_purchase_lines_purchase; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_purchase_lines_purchase ON pmc.purchase_lines USING btree (purchase_id);


--
-- TOC entry 5723 (class 1259 OID 95450)
-- Name: ix_purchases_supplier; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_purchases_supplier ON pmc.purchases USING btree (supplier_id, purchase_date);


--
-- TOC entry 5802 (class 1259 OID 96077)
-- Name: ix_rcptdeliv_receipt; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_rcptdeliv_receipt ON pmc.receipt_deliveries USING btree (receipt_id);


--
-- TOC entry 5797 (class 1259 OID 96056)
-- Name: ix_receipts_sale; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_receipts_sale ON pmc.receipts USING btree (sale_id);


--
-- TOC entry 5772 (class 1259 OID 95898)
-- Name: ix_salelines_item; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_salelines_item ON pmc.sale_lines USING btree (item_id);


--
-- TOC entry 5773 (class 1259 OID 95897)
-- Name: ix_salelines_sale; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_salelines_sale ON pmc.sale_lines USING btree (sale_id);


--
-- TOC entry 5736 (class 1259 OID 95596)
-- Name: ix_sales_customer; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_sales_customer ON pmc.sales USING btree (customer_id, sale_date);


--
-- TOC entry 5737 (class 1259 OID 95595)
-- Name: ix_sales_date; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_sales_date ON pmc.sales USING btree (sale_date);


--
-- TOC entry 5738 (class 1259 OID 95598)
-- Name: ix_sales_due; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_sales_due ON pmc.sales USING btree (due_date) WHERE (status = 'POSTED'::pmc.sale_status);


--
-- TOC entry 5739 (class 1259 OID 95597)
-- Name: ix_sales_status; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_sales_status ON pmc.sales USING btree (status, module);


--
-- TOC entry 5636 (class 1259 OID 94813)
-- Name: ix_sessions_user; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_sessions_user ON pmc.user_sessions USING btree (user_id);


--
-- TOC entry 5661 (class 1259 OID 94979)
-- Name: ix_sledger_supplier; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_sledger_supplier ON pmc.supplier_ledger USING btree (supplier_id, entry_date);


--
-- TOC entry 5789 (class 1259 OID 96005)
-- Name: ix_stk_payment; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_stk_payment ON pmc.mpesa_stk_requests USING btree (payment_id);


--
-- TOC entry 5790 (class 1259 OID 96006)
-- Name: ix_stk_status; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_stk_status ON pmc.mpesa_stk_requests USING btree (status, initiated_at);


--
-- TOC entry 5710 (class 1259 OID 95341)
-- Name: ix_stockadj_item; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_stockadj_item ON pmc.stock_adjustments USING btree (item_id, adjustment_date);


--
-- TOC entry 5705 (class 1259 OID 95299)
-- Name: ix_stockmov_item; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_stockmov_item ON pmc.stock_movements USING btree (item_id, pool, movement_date);


--
-- TOC entry 5706 (class 1259 OID 95300)
-- Name: ix_stockmov_ref; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_stockmov_ref ON pmc.stock_movements USING btree (ref_table, ref_id);


--
-- TOC entry 5707 (class 1259 OID 95301)
-- Name: ix_stockmov_type; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_stockmov_type ON pmc.stock_movements USING btree (movement_type, movement_date);


--
-- TOC entry 5731 (class 1259 OID 95523)
-- Name: ix_supplier_payments_supplier; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_supplier_payments_supplier ON pmc.supplier_payments USING btree (supplier_id, paid_on);


--
-- TOC entry 5819 (class 1259 OID 96215)
-- Name: ix_transfers_date; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_transfers_date ON pmc.module_transfers USING btree (transfer_date);


--
-- TOC entry 5767 (class 1259 OID 95851)
-- Name: ix_yieldalerts_status; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE INDEX ix_yieldalerts_status ON pmc.yield_alerts USING btree (status);


--
-- TOC entry 5653 (class 1259 OID 94890)
-- Name: ux_customers_phone; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE UNIQUE INDEX ux_customers_phone ON pmc.customers USING btree (phone) WHERE (phone IS NOT NULL);


--
-- TOC entry 5693 (class 1259 OID 95145)
-- Name: ux_item_prices_current; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE UNIQUE INDEX ux_item_prices_current ON pmc.item_prices USING btree (item_id, tier_id, unit_id) WHERE (effective_to IS NULL);


--
-- TOC entry 5783 (class 1259 OID 95938)
-- Name: ux_payments_mpesa_receipt; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE UNIQUE INDEX ux_payments_mpesa_receipt ON pmc.payments USING btree (mpesa_receipt) WHERE (mpesa_receipt IS NOT NULL);


--
-- TOC entry 5639 (class 1259 OID 94814)
-- Name: ux_sessions_token; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE UNIQUE INDEX ux_sessions_token ON pmc.user_sessions USING btree (token_hash);


--
-- TOC entry 5635 (class 1259 OID 94793)
-- Name: ux_users_username; Type: INDEX; Schema: pmc; Owner: postgres
--

CREATE UNIQUE INDEX ux_users_username ON pmc.users USING btree (lower(username));


--
-- TOC entry 5928 (class 2620 OID 96290)
-- Name: activity_log trg_activity_log_immutable; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_activity_log_immutable BEFORE DELETE OR UPDATE ON pmc.activity_log FOR EACH ROW EXECUTE FUNCTION pmc.fn_block_mutation();


--
-- TOC entry 5978 (class 2620 OID 96311)
-- Name: payment_allocations trg_allocation_check; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_allocation_check AFTER INSERT OR DELETE OR UPDATE ON pmc.payment_allocations FOR EACH ROW EXECUTE FUNCTION pmc.fn_allocation_check();


--
-- TOC entry 5922 (class 2620 OID 96332)
-- Name: app_settings trg_app_settings_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_app_settings_updated_at BEFORE UPDATE ON pmc.app_settings FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5950 (class 2620 OID 96316)
-- Name: stock_adjustments trg_audit_adjustments; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_adjustments AFTER INSERT OR DELETE OR UPDATE ON pmc.stock_adjustments FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('ADJUSTMENT');


--
-- TOC entry 5929 (class 2620 OID 96323)
-- Name: customers trg_audit_customers; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_customers AFTER INSERT OR DELETE OR UPDATE ON pmc.customers FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('MASTER_DATA');


--
-- TOC entry 5986 (class 2620 OID 96329)
-- Name: daily_closes trg_audit_daily_close; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_daily_close AFTER INSERT OR UPDATE ON pmc.daily_closes FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('FINANCE');


--
-- TOC entry 5981 (class 2620 OID 96321)
-- Name: expenses trg_audit_expenses; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_expenses AFTER INSERT OR DELETE OR UPDATE ON pmc.expenses FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('FINANCE');


--
-- TOC entry 5941 (class 2620 OID 96313)
-- Name: item_min_prices trg_audit_item_min; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_item_min AFTER INSERT OR DELETE OR UPDATE ON pmc.item_min_prices FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('PRICE');


--
-- TOC entry 5939 (class 2620 OID 96312)
-- Name: item_prices trg_audit_item_prices; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_item_prices AFTER INSERT OR DELETE OR UPDATE ON pmc.item_prices FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('PRICE');


--
-- TOC entry 5936 (class 2620 OID 96325)
-- Name: items trg_audit_items; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_items AFTER INSERT OR DELETE OR UPDATE ON pmc.items FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('MASTER_DATA');


--
-- TOC entry 5943 (class 2620 OID 96314)
-- Name: milling_rates trg_audit_milling_rates; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_milling_rates AFTER INSERT OR DELETE OR UPDATE ON pmc.milling_rates FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('PRICE');


--
-- TOC entry 5974 (class 2620 OID 96320)
-- Name: payments trg_audit_payments; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_payments AFTER UPDATE ON pmc.payments FOR EACH ROW WHEN (((old.state IS DISTINCT FROM new.state) OR (old.amount IS DISTINCT FROM new.amount))) EXECUTE FUNCTION pmc.fn_audit('FINANCE');


--
-- TOC entry 5925 (class 2620 OID 96327)
-- Name: role_permissions trg_audit_roleperms; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_roleperms AFTER INSERT OR DELETE OR UPDATE ON pmc.role_permissions FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('SECURITY');


--
-- TOC entry 5959 (class 2620 OID 96319)
-- Name: sales trg_audit_sale_discount; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_sale_discount AFTER UPDATE ON pmc.sales FOR EACH ROW WHEN ((old.discount_amount IS DISTINCT FROM new.discount_amount)) EXECUTE FUNCTION pmc.fn_audit('SALE_STATUS');


--
-- TOC entry 5960 (class 2620 OID 96318)
-- Name: sales trg_audit_sale_status; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_sale_status AFTER UPDATE ON pmc.sales FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION pmc.fn_audit('SALE_STATUS');


--
-- TOC entry 5923 (class 2620 OID 96328)
-- Name: app_settings trg_audit_settings; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_settings AFTER INSERT OR DELETE OR UPDATE ON pmc.app_settings FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('SECURITY');


--
-- TOC entry 5957 (class 2620 OID 96322)
-- Name: supplier_payments trg_audit_supplier_pay; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_supplier_pay AFTER INSERT ON pmc.supplier_payments FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('FINANCE');


--
-- TOC entry 5933 (class 2620 OID 96324)
-- Name: suppliers trg_audit_suppliers; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_suppliers AFTER INSERT OR DELETE OR UPDATE ON pmc.suppliers FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('MASTER_DATA');


--
-- TOC entry 5983 (class 2620 OID 96317)
-- Name: module_transfers trg_audit_transfers; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_transfers AFTER INSERT ON pmc.module_transfers FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('ADJUSTMENT');


--
-- TOC entry 5926 (class 2620 OID 96326)
-- Name: users trg_audit_users; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_users AFTER INSERT OR DELETE OR UPDATE ON pmc.users FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('SECURITY');


--
-- TOC entry 5970 (class 2620 OID 96330)
-- Name: yield_alerts trg_audit_yield_alerts; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_yield_alerts AFTER UPDATE ON pmc.yield_alerts FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('ADJUSTMENT');


--
-- TOC entry 5945 (class 2620 OID 96315)
-- Name: yield_standards trg_audit_yield_std; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_audit_yield_std AFTER INSERT OR DELETE OR UPDATE ON pmc.yield_standards FOR EACH ROW EXECUTE FUNCTION pmc.fn_audit('MASTER_DATA');


--
-- TOC entry 5921 (class 2620 OID 96331)
-- Name: business_profile trg_business_profile_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_business_profile_updated_at BEFORE UPDATE ON pmc.business_profile FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5932 (class 2620 OID 96288)
-- Name: customer_ledger trg_customer_ledger_immutable; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_customer_ledger_immutable BEFORE DELETE OR UPDATE ON pmc.customer_ledger FOR EACH ROW EXECUTE FUNCTION pmc.fn_block_mutation();


--
-- TOC entry 5930 (class 2620 OID 96291)
-- Name: customers trg_customers_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_customers_before BEFORE INSERT OR UPDATE ON pmc.customers FOR EACH ROW EXECUTE FUNCTION pmc.fn_customer_before();


--
-- TOC entry 5931 (class 2620 OID 96335)
-- Name: customers trg_customers_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON pmc.customers FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5987 (class 2620 OID 96352)
-- Name: daily_closes trg_daily_closes_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_daily_closes_updated_at BEFORE UPDATE ON pmc.daily_closes FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5980 (class 2620 OID 96350)
-- Name: deliveries trg_deliveries_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_deliveries_updated_at BEFORE UPDATE ON pmc.deliveries FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5982 (class 2620 OID 96351)
-- Name: expenses trg_expenses_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON pmc.expenses FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5942 (class 2620 OID 96338)
-- Name: item_min_prices trg_item_min_prices_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_item_min_prices_updated_at BEFORE UPDATE ON pmc.item_min_prices FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5940 (class 2620 OID 96293)
-- Name: item_prices trg_item_prices_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_item_prices_before BEFORE INSERT ON pmc.item_prices FOR EACH ROW EXECUTE FUNCTION pmc.fn_item_price_before();


--
-- TOC entry 5937 (class 2620 OID 96292)
-- Name: items trg_items_after_insert; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_items_after_insert AFTER INSERT ON pmc.items FOR EACH ROW EXECUTE FUNCTION pmc.fn_item_after_insert();


--
-- TOC entry 5938 (class 2620 OID 96337)
-- Name: items trg_items_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_items_updated_at BEFORE UPDATE ON pmc.items FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5964 (class 2620 OID 96345)
-- Name: machine_logs trg_machine_logs_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_machine_logs_updated_at BEFORE UPDATE ON pmc.machine_logs FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5963 (class 2620 OID 96344)
-- Name: machines trg_machines_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_machines_updated_at BEFORE UPDATE ON pmc.machines FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5965 (class 2620 OID 96303)
-- Name: mill_jobs trg_mill_job_after; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_mill_job_after AFTER INSERT OR UPDATE ON pmc.mill_jobs FOR EACH ROW EXECUTE FUNCTION pmc.fn_mill_job_after();


--
-- TOC entry 5966 (class 2620 OID 96302)
-- Name: mill_jobs trg_mill_job_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_mill_job_before BEFORE INSERT OR UPDATE ON pmc.mill_jobs FOR EACH ROW EXECUTE FUNCTION pmc.fn_mill_job_before();


--
-- TOC entry 5967 (class 2620 OID 96346)
-- Name: mill_jobs trg_mill_jobs_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_mill_jobs_updated_at BEFORE UPDATE ON pmc.mill_jobs FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5968 (class 2620 OID 96305)
-- Name: mill_job_outputs trg_mill_output_after; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_mill_output_after AFTER INSERT ON pmc.mill_job_outputs FOR EACH ROW EXECUTE FUNCTION pmc.fn_mill_output_after();


--
-- TOC entry 5969 (class 2620 OID 96304)
-- Name: mill_job_outputs trg_mill_output_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_mill_output_before BEFORE INSERT ON pmc.mill_job_outputs FOR EACH ROW EXECUTE FUNCTION pmc.fn_mill_output_before();


--
-- TOC entry 5944 (class 2620 OID 96339)
-- Name: milling_rates trg_milling_rates_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_milling_rates_updated_at BEFORE UPDATE ON pmc.milling_rates FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5924 (class 2620 OID 96333)
-- Name: mpesa_config trg_mpesa_config_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_mpesa_config_updated_at BEFORE UPDATE ON pmc.mpesa_config FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5979 (class 2620 OID 96349)
-- Name: mpesa_stk_requests trg_mpesa_stk_requests_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_mpesa_stk_requests_updated_at BEFORE UPDATE ON pmc.mpesa_stk_requests FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5975 (class 2620 OID 96310)
-- Name: payments trg_payment_after; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_payment_after AFTER INSERT OR UPDATE ON pmc.payments FOR EACH ROW EXECUTE FUNCTION pmc.fn_payment_after();


--
-- TOC entry 5976 (class 2620 OID 96309)
-- Name: payments trg_payment_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_payment_before BEFORE INSERT OR UPDATE ON pmc.payments FOR EACH ROW EXECUTE FUNCTION pmc.fn_payment_before();


--
-- TOC entry 5977 (class 2620 OID 96348)
-- Name: payments trg_payments_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON pmc.payments FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5955 (class 2620 OID 96298)
-- Name: purchase_lines trg_purchase_line_after; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_purchase_line_after AFTER INSERT OR DELETE OR UPDATE ON pmc.purchase_lines FOR EACH ROW EXECUTE FUNCTION pmc.fn_purchase_line_after();


--
-- TOC entry 5956 (class 2620 OID 96297)
-- Name: purchase_lines trg_purchase_line_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_purchase_line_before BEFORE INSERT OR DELETE OR UPDATE ON pmc.purchase_lines FOR EACH ROW EXECUTE FUNCTION pmc.fn_purchase_line_before();


--
-- TOC entry 5954 (class 2620 OID 96342)
-- Name: purchases trg_purchases_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_purchases_updated_at BEFORE UPDATE ON pmc.purchases FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5972 (class 2620 OID 96308)
-- Name: sale_lines trg_sale_line_after; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_sale_line_after AFTER INSERT OR DELETE OR UPDATE ON pmc.sale_lines FOR EACH ROW EXECUTE FUNCTION pmc.fn_sale_line_after();


--
-- TOC entry 5973 (class 2620 OID 96307)
-- Name: sale_lines trg_sale_line_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_sale_line_before BEFORE INSERT OR DELETE OR UPDATE ON pmc.sale_lines FOR EACH ROW EXECUTE FUNCTION pmc.fn_sale_line_before();


--
-- TOC entry 5961 (class 2620 OID 96306)
-- Name: sales trg_sales_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_sales_before BEFORE INSERT OR DELETE OR UPDATE ON pmc.sales FOR EACH ROW EXECUTE FUNCTION pmc.fn_sale_before();


--
-- TOC entry 5962 (class 2620 OID 96343)
-- Name: sales trg_sales_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON pmc.sales FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5951 (class 2620 OID 96295)
-- Name: stock_adjustments trg_stock_adj_after; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_stock_adj_after AFTER INSERT ON pmc.stock_adjustments FOR EACH ROW EXECUTE FUNCTION pmc.fn_stock_adjustment_after();


--
-- TOC entry 5952 (class 2620 OID 96294)
-- Name: stock_adjustments trg_stock_adj_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_stock_adj_before BEFORE INSERT ON pmc.stock_adjustments FOR EACH ROW EXECUTE FUNCTION pmc.fn_stock_adjustment_before();


--
-- TOC entry 5947 (class 2620 OID 96341)
-- Name: stock_balances trg_stock_balances_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_stock_balances_updated_at BEFORE UPDATE ON pmc.stock_balances FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5948 (class 2620 OID 96286)
-- Name: stock_movements trg_stock_movements_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_stock_movements_before BEFORE INSERT ON pmc.stock_movements FOR EACH ROW EXECUTE FUNCTION pmc.fn_stock_movement_before();


--
-- TOC entry 5949 (class 2620 OID 96287)
-- Name: stock_movements trg_stock_movements_immutable; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_stock_movements_immutable BEFORE DELETE OR UPDATE ON pmc.stock_movements FOR EACH ROW EXECUTE FUNCTION pmc.fn_block_mutation();


--
-- TOC entry 5953 (class 2620 OID 96296)
-- Name: stock_take_lines trg_stock_take_line_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_stock_take_line_before BEFORE INSERT ON pmc.stock_take_lines FOR EACH ROW EXECUTE FUNCTION pmc.fn_stock_take_line_before();


--
-- TOC entry 5935 (class 2620 OID 96289)
-- Name: supplier_ledger trg_supplier_ledger_immutable; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_supplier_ledger_immutable BEFORE DELETE OR UPDATE ON pmc.supplier_ledger FOR EACH ROW EXECUTE FUNCTION pmc.fn_block_mutation();


--
-- TOC entry 5958 (class 2620 OID 96299)
-- Name: supplier_payments trg_supplier_payment_after; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_supplier_payment_after AFTER INSERT ON pmc.supplier_payments FOR EACH ROW EXECUTE FUNCTION pmc.fn_supplier_payment_after();


--
-- TOC entry 5934 (class 2620 OID 96336)
-- Name: suppliers trg_suppliers_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON pmc.suppliers FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5984 (class 2620 OID 96301)
-- Name: module_transfers trg_transfer_after; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_transfer_after AFTER INSERT ON pmc.module_transfers FOR EACH ROW EXECUTE FUNCTION pmc.fn_transfer_after();


--
-- TOC entry 5985 (class 2620 OID 96300)
-- Name: module_transfers trg_transfer_before; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_transfer_before BEFORE INSERT ON pmc.module_transfers FOR EACH ROW EXECUTE FUNCTION pmc.fn_transfer_before();


--
-- TOC entry 5927 (class 2620 OID 96334)
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON pmc.users FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5971 (class 2620 OID 96347)
-- Name: yield_alerts trg_yield_alerts_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_yield_alerts_updated_at BEFORE UPDATE ON pmc.yield_alerts FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5946 (class 2620 OID 96340)
-- Name: yield_standards trg_yield_standards_updated_at; Type: TRIGGER; Schema: pmc; Owner: postgres
--

CREATE TRIGGER trg_yield_standards_updated_at BEFORE UPDATE ON pmc.yield_standards FOR EACH ROW EXECUTE FUNCTION pmc.fn_set_updated_at();


--
-- TOC entry 5832 (class 2606 OID 94828)
-- Name: activity_log activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.activity_log
    ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES pmc.users(id);


--
-- TOC entry 5834 (class 2606 OID 94919)
-- Name: customer_ledger customer_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.customer_ledger
    ADD CONSTRAINT customer_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5835 (class 2606 OID 94914)
-- Name: customer_ledger customer_ledger_customer_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.customer_ledger
    ADD CONSTRAINT customer_ledger_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES pmc.customers(id);


--
-- TOC entry 5833 (class 2606 OID 94885)
-- Name: customers customers_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.customers
    ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5920 (class 2606 OID 96243)
-- Name: daily_closes daily_closes_closed_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.daily_closes
    ADD CONSTRAINT daily_closes_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES pmc.users(id);


--
-- TOC entry 5911 (class 2606 OID 96108)
-- Name: deliveries deliveries_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.deliveries
    ADD CONSTRAINT deliveries_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5912 (class 2606 OID 96103)
-- Name: deliveries deliveries_customer_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.deliveries
    ADD CONSTRAINT deliveries_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES pmc.customers(id);


--
-- TOC entry 5913 (class 2606 OID 96098)
-- Name: deliveries deliveries_sale_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.deliveries
    ADD CONSTRAINT deliveries_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES pmc.sales(id);


--
-- TOC entry 5914 (class 2606 OID 96158)
-- Name: expenses expenses_category_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.expenses
    ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES pmc.expense_categories(id);


--
-- TOC entry 5915 (class 2606 OID 96173)
-- Name: expenses expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5916 (class 2606 OID 96168)
-- Name: expenses expenses_machine_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.expenses
    ADD CONSTRAINT expenses_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES pmc.machines(id);


--
-- TOC entry 5917 (class 2606 OID 96163)
-- Name: expenses expenses_supplier_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.expenses
    ADD CONSTRAINT expenses_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES pmc.suppliers(id);


--
-- TOC entry 5836 (class 2606 OID 95942)
-- Name: customer_ledger fk_cledger_payment; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.customer_ledger
    ADD CONSTRAINT fk_cledger_payment FOREIGN KEY (payment_id) REFERENCES pmc.payments(id);


--
-- TOC entry 5837 (class 2606 OID 95599)
-- Name: customer_ledger fk_cledger_sale; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.customer_ledger
    ADD CONSTRAINT fk_cledger_sale FOREIGN KEY (sale_id) REFERENCES pmc.sales(id);


--
-- TOC entry 5838 (class 2606 OID 95524)
-- Name: supplier_ledger fk_sledger_purchase; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_ledger
    ADD CONSTRAINT fk_sledger_purchase FOREIGN KEY (purchase_id) REFERENCES pmc.purchases(id);


--
-- TOC entry 5839 (class 2606 OID 95529)
-- Name: supplier_ledger fk_sledger_spay; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_ledger
    ADD CONSTRAINT fk_sledger_spay FOREIGN KEY (supplier_payment_id) REFERENCES pmc.supplier_payments(id);


--
-- TOC entry 5850 (class 2606 OID 95157)
-- Name: item_min_prices item_min_prices_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_min_prices
    ADD CONSTRAINT item_min_prices_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id) ON DELETE CASCADE;


--
-- TOC entry 5851 (class 2606 OID 95162)
-- Name: item_min_prices item_min_prices_updated_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_min_prices
    ADD CONSTRAINT item_min_prices_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES pmc.users(id);


--
-- TOC entry 5846 (class 2606 OID 95125)
-- Name: item_prices item_prices_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_prices
    ADD CONSTRAINT item_prices_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5847 (class 2606 OID 95140)
-- Name: item_prices item_prices_set_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_prices
    ADD CONSTRAINT item_prices_set_by_fkey FOREIGN KEY (set_by) REFERENCES pmc.users(id);


--
-- TOC entry 5848 (class 2606 OID 95130)
-- Name: item_prices item_prices_tier_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_prices
    ADD CONSTRAINT item_prices_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES pmc.price_tiers(id);


--
-- TOC entry 5849 (class 2606 OID 95135)
-- Name: item_prices item_prices_unit_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_prices
    ADD CONSTRAINT item_prices_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES pmc.units(id);


--
-- TOC entry 5844 (class 2606 OID 95087)
-- Name: item_units item_units_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_units
    ADD CONSTRAINT item_units_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id) ON DELETE CASCADE;


--
-- TOC entry 5845 (class 2606 OID 95092)
-- Name: item_units item_units_unit_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.item_units
    ADD CONSTRAINT item_units_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES pmc.units(id);


--
-- TOC entry 5842 (class 2606 OID 95067)
-- Name: items items_grade_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.items
    ADD CONSTRAINT items_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES pmc.grades(id);


--
-- TOC entry 5843 (class 2606 OID 95062)
-- Name: items items_grain_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.items
    ADD CONSTRAINT items_grain_id_fkey FOREIGN KEY (grain_id) REFERENCES pmc.grains(id);


--
-- TOC entry 5881 (class 2606 OID 95661)
-- Name: machine_logs machine_logs_machine_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.machine_logs
    ADD CONSTRAINT machine_logs_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES pmc.machines(id);


--
-- TOC entry 5882 (class 2606 OID 95666)
-- Name: machine_logs machine_logs_operator_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.machine_logs
    ADD CONSTRAINT machine_logs_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES pmc.users(id);


--
-- TOC entry 5889 (class 2606 OID 95763)
-- Name: mill_job_blends mill_job_blends_grain_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_job_blends
    ADD CONSTRAINT mill_job_blends_grain_item_id_fkey FOREIGN KEY (grain_item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5890 (class 2606 OID 95758)
-- Name: mill_job_blends mill_job_blends_job_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_job_blends
    ADD CONSTRAINT mill_job_blends_job_id_fkey FOREIGN KEY (job_id) REFERENCES pmc.mill_jobs(id) ON DELETE CASCADE;


--
-- TOC entry 5891 (class 2606 OID 95785)
-- Name: mill_job_outputs mill_job_outputs_job_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_job_outputs
    ADD CONSTRAINT mill_job_outputs_job_id_fkey FOREIGN KEY (job_id) REFERENCES pmc.mill_jobs(id) ON DELETE CASCADE;


--
-- TOC entry 5892 (class 2606 OID 95790)
-- Name: mill_job_outputs mill_job_outputs_output_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_job_outputs
    ADD CONSTRAINT mill_job_outputs_output_item_id_fkey FOREIGN KEY (output_item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5893 (class 2606 OID 95812)
-- Name: mill_job_status_history mill_job_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_job_status_history
    ADD CONSTRAINT mill_job_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES pmc.users(id);


--
-- TOC entry 5894 (class 2606 OID 95807)
-- Name: mill_job_status_history mill_job_status_history_job_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_job_status_history
    ADD CONSTRAINT mill_job_status_history_job_id_fkey FOREIGN KEY (job_id) REFERENCES pmc.mill_jobs(id) ON DELETE CASCADE;


--
-- TOC entry 5883 (class 2606 OID 95739)
-- Name: mill_jobs mill_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_jobs
    ADD CONSTRAINT mill_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5884 (class 2606 OID 95714)
-- Name: mill_jobs mill_jobs_customer_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_jobs
    ADD CONSTRAINT mill_jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES pmc.customers(id);


--
-- TOC entry 5885 (class 2606 OID 95719)
-- Name: mill_jobs mill_jobs_grain_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_jobs
    ADD CONSTRAINT mill_jobs_grain_item_id_fkey FOREIGN KEY (grain_item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5886 (class 2606 OID 95729)
-- Name: mill_jobs mill_jobs_machine_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_jobs
    ADD CONSTRAINT mill_jobs_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES pmc.machines(id);


--
-- TOC entry 5887 (class 2606 OID 95724)
-- Name: mill_jobs mill_jobs_miller_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_jobs
    ADD CONSTRAINT mill_jobs_miller_id_fkey FOREIGN KEY (miller_id) REFERENCES pmc.users(id);


--
-- TOC entry 5888 (class 2606 OID 95734)
-- Name: mill_jobs mill_jobs_sale_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mill_jobs
    ADD CONSTRAINT mill_jobs_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES pmc.sales(id);


--
-- TOC entry 5852 (class 2606 OID 95197)
-- Name: milling_rates milling_rates_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.milling_rates
    ADD CONSTRAINT milling_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5853 (class 2606 OID 95192)
-- Name: milling_rates milling_rates_grain_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.milling_rates
    ADD CONSTRAINT milling_rates_grain_item_id_fkey FOREIGN KEY (grain_item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5918 (class 2606 OID 96210)
-- Name: module_transfers module_transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.module_transfers
    ADD CONSTRAINT module_transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5919 (class 2606 OID 96205)
-- Name: module_transfers module_transfers_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.module_transfers
    ADD CONSTRAINT module_transfers_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5906 (class 2606 OID 96000)
-- Name: mpesa_stk_requests mpesa_stk_requests_initiated_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mpesa_stk_requests
    ADD CONSTRAINT mpesa_stk_requests_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES pmc.users(id);


--
-- TOC entry 5907 (class 2606 OID 95995)
-- Name: mpesa_stk_requests mpesa_stk_requests_payment_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.mpesa_stk_requests
    ADD CONSTRAINT mpesa_stk_requests_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES pmc.payments(id);


--
-- TOC entry 5904 (class 2606 OID 95962)
-- Name: payment_allocations payment_allocations_payment_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.payment_allocations
    ADD CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES pmc.payments(id) ON DELETE CASCADE;


--
-- TOC entry 5905 (class 2606 OID 95967)
-- Name: payment_allocations payment_allocations_sale_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.payment_allocations
    ADD CONSTRAINT payment_allocations_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES pmc.sales(id);


--
-- TOC entry 5902 (class 2606 OID 95928)
-- Name: payments payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.payments
    ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES pmc.customers(id);


--
-- TOC entry 5903 (class 2606 OID 95933)
-- Name: payments payments_received_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.payments
    ADD CONSTRAINT payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES pmc.users(id);


--
-- TOC entry 5871 (class 2606 OID 95473)
-- Name: purchase_lines purchase_lines_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.purchase_lines
    ADD CONSTRAINT purchase_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5872 (class 2606 OID 95468)
-- Name: purchase_lines purchase_lines_purchase_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.purchase_lines
    ADD CONSTRAINT purchase_lines_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES pmc.purchases(id) ON DELETE CASCADE;


--
-- TOC entry 5873 (class 2606 OID 95478)
-- Name: purchase_lines purchase_lines_unit_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.purchase_lines
    ADD CONSTRAINT purchase_lines_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES pmc.units(id);


--
-- TOC entry 5869 (class 2606 OID 95445)
-- Name: purchases purchases_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.purchases
    ADD CONSTRAINT purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5870 (class 2606 OID 95440)
-- Name: purchases purchases_supplier_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.purchases
    ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES pmc.suppliers(id);


--
-- TOC entry 5910 (class 2606 OID 96072)
-- Name: receipt_deliveries receipt_deliveries_receipt_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.receipt_deliveries
    ADD CONSTRAINT receipt_deliveries_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES pmc.receipts(id) ON DELETE CASCADE;


--
-- TOC entry 5908 (class 2606 OID 96051)
-- Name: receipts receipts_issued_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.receipts
    ADD CONSTRAINT receipts_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES pmc.users(id);


--
-- TOC entry 5909 (class 2606 OID 96046)
-- Name: receipts receipts_sale_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.receipts
    ADD CONSTRAINT receipts_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES pmc.sales(id);


--
-- TOC entry 5828 (class 2606 OID 94758)
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES pmc.permissions(id) ON DELETE CASCADE;


--
-- TOC entry 5829 (class 2606 OID 94753)
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES pmc.roles(id) ON DELETE CASCADE;


--
-- TOC entry 5897 (class 2606 OID 95877)
-- Name: sale_lines sale_lines_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sale_lines
    ADD CONSTRAINT sale_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5898 (class 2606 OID 95882)
-- Name: sale_lines sale_lines_mill_job_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sale_lines
    ADD CONSTRAINT sale_lines_mill_job_id_fkey FOREIGN KEY (mill_job_id) REFERENCES pmc.mill_jobs(id);


--
-- TOC entry 5899 (class 2606 OID 95892)
-- Name: sale_lines sale_lines_price_override_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sale_lines
    ADD CONSTRAINT sale_lines_price_override_by_fkey FOREIGN KEY (price_override_by) REFERENCES pmc.users(id);


--
-- TOC entry 5900 (class 2606 OID 95872)
-- Name: sale_lines sale_lines_sale_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sale_lines
    ADD CONSTRAINT sale_lines_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES pmc.sales(id) ON DELETE CASCADE;


--
-- TOC entry 5901 (class 2606 OID 95887)
-- Name: sale_lines sale_lines_unit_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sale_lines
    ADD CONSTRAINT sale_lines_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES pmc.units(id);


--
-- TOC entry 5877 (class 2606 OID 95580)
-- Name: sales sales_cashier_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sales
    ADD CONSTRAINT sales_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES pmc.users(id);


--
-- TOC entry 5878 (class 2606 OID 95575)
-- Name: sales sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sales
    ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES pmc.customers(id);


--
-- TOC entry 5879 (class 2606 OID 95590)
-- Name: sales sales_void_approved_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sales
    ADD CONSTRAINT sales_void_approved_by_fkey FOREIGN KEY (void_approved_by) REFERENCES pmc.users(id);


--
-- TOC entry 5880 (class 2606 OID 95585)
-- Name: sales sales_voided_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.sales
    ADD CONSTRAINT sales_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES pmc.users(id);


--
-- TOC entry 5862 (class 2606 OID 95331)
-- Name: stock_adjustments stock_adjustments_approved_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_adjustments
    ADD CONSTRAINT stock_adjustments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES pmc.users(id);


--
-- TOC entry 5863 (class 2606 OID 95336)
-- Name: stock_adjustments stock_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_adjustments
    ADD CONSTRAINT stock_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5864 (class 2606 OID 95326)
-- Name: stock_adjustments stock_adjustments_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_adjustments
    ADD CONSTRAINT stock_adjustments_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5858 (class 2606 OID 95261)
-- Name: stock_balances stock_balances_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_balances
    ADD CONSTRAINT stock_balances_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5859 (class 2606 OID 95294)
-- Name: stock_movements stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_movements
    ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5860 (class 2606 OID 95289)
-- Name: stock_movements stock_movements_customer_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_movements
    ADD CONSTRAINT stock_movements_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES pmc.customers(id);


--
-- TOC entry 5861 (class 2606 OID 95284)
-- Name: stock_movements stock_movements_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_movements
    ADD CONSTRAINT stock_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5867 (class 2606 OID 95393)
-- Name: stock_take_lines stock_take_lines_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_take_lines
    ADD CONSTRAINT stock_take_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5868 (class 2606 OID 95388)
-- Name: stock_take_lines stock_take_lines_take_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_take_lines
    ADD CONSTRAINT stock_take_lines_take_id_fkey FOREIGN KEY (take_id) REFERENCES pmc.stock_takes(id) ON DELETE CASCADE;


--
-- TOC entry 5865 (class 2606 OID 95362)
-- Name: stock_takes stock_takes_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_takes
    ADD CONSTRAINT stock_takes_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5866 (class 2606 OID 95367)
-- Name: stock_takes stock_takes_posted_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.stock_takes
    ADD CONSTRAINT stock_takes_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES pmc.users(id);


--
-- TOC entry 5840 (class 2606 OID 94974)
-- Name: supplier_ledger supplier_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_ledger
    ADD CONSTRAINT supplier_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5841 (class 2606 OID 94969)
-- Name: supplier_ledger supplier_ledger_supplier_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_ledger
    ADD CONSTRAINT supplier_ledger_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES pmc.suppliers(id);


--
-- TOC entry 5874 (class 2606 OID 95518)
-- Name: supplier_payments supplier_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_payments
    ADD CONSTRAINT supplier_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5875 (class 2606 OID 95513)
-- Name: supplier_payments supplier_payments_purchase_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_payments
    ADD CONSTRAINT supplier_payments_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES pmc.purchases(id);


--
-- TOC entry 5876 (class 2606 OID 95508)
-- Name: supplier_payments supplier_payments_supplier_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.supplier_payments
    ADD CONSTRAINT supplier_payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES pmc.suppliers(id);


--
-- TOC entry 5831 (class 2606 OID 94808)
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES pmc.users(id) ON DELETE CASCADE;


--
-- TOC entry 5830 (class 2606 OID 94788)
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES pmc.roles(id);


--
-- TOC entry 5895 (class 2606 OID 95841)
-- Name: yield_alerts yield_alerts_job_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_alerts
    ADD CONSTRAINT yield_alerts_job_id_fkey FOREIGN KEY (job_id) REFERENCES pmc.mill_jobs(id) ON DELETE CASCADE;


--
-- TOC entry 5896 (class 2606 OID 95846)
-- Name: yield_alerts yield_alerts_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_alerts
    ADD CONSTRAINT yield_alerts_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES pmc.users(id);


--
-- TOC entry 5854 (class 2606 OID 95238)
-- Name: yield_standards yield_standards_bran_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_standards
    ADD CONSTRAINT yield_standards_bran_item_id_fkey FOREIGN KEY (bran_item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5855 (class 2606 OID 95243)
-- Name: yield_standards yield_standards_created_by_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_standards
    ADD CONSTRAINT yield_standards_created_by_fkey FOREIGN KEY (created_by) REFERENCES pmc.users(id);


--
-- TOC entry 5856 (class 2606 OID 95233)
-- Name: yield_standards yield_standards_flour_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_standards
    ADD CONSTRAINT yield_standards_flour_item_id_fkey FOREIGN KEY (flour_item_id) REFERENCES pmc.items(id);


--
-- TOC entry 5857 (class 2606 OID 95228)
-- Name: yield_standards yield_standards_grain_item_id_fkey; Type: FK CONSTRAINT; Schema: pmc; Owner: postgres
--

ALTER TABLE ONLY pmc.yield_standards
    ADD CONSTRAINT yield_standards_grain_item_id_fkey FOREIGN KEY (grain_item_id) REFERENCES pmc.items(id);


-- Completed on 2026-10-22 09:09:07

--
-- PostgreSQL database dump complete
--

\unrestrict zcem6TeRv3P4PpnrOUznoF6BwUleL5k8AaOObxyqECzdd4f58duFpBNQernQjnb

