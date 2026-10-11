-- ==========================================================
-- MALLU MART - ALL-IN-ONE SUPABASE SETUP SCRIPT
-- Paste this entirely into the Supabase SQL Editor and click 'Run'.
--
-- Safe to re-run: works for a brand-new project AND upgrades an existing
-- Mallu Mart database in place (no data is deleted).
--
-- Access model:
--   * The first account ever registered becomes the approved store OWNER.
--   * Every later sign-up is a STAFF account that stays "pending" until an
--     owner approves it in Settings -> Team. Pending accounts see no data.
--   * Staff: sell (incl. credit/khata), receive stock, manage customers,
--     close their own cash drawer. They never see cost prices or profit.
--   * Owner: everything, incl. products, prices, refunds, suppliers, team,
--     store settings and the activity log.
--   * Accounts with two-factor authentication enrolled only get access from a
--     session that has completed the second factor (aal2).
--   * Sales, stock, refunds, customer balances and the logs can only change
--     through the functions below, never by writing tables directly.
--
-- Local test: npm run test:db  (runs this script + tests/smoke_test.sql)
-- Optional demo data lives in migrations/002_seed_data.sql.
-- ==========================================================

create extension if not exists pgcrypto;

-- ==========================================================
-- 1. TABLES
-- ==========================================================

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('owner', 'staff')),
  store_name text not null default 'Mallu Mart',
  phone text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Approval flag. When the column is first added to an existing database,
-- current accounts are approved so nobody is locked out.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'approved'
  ) then
    alter table public.profiles add column approved boolean not null default false;
    update public.profiles set approved = true;
  end if;
end $$;

alter table public.profiles alter column role set default 'staff';

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text not null default '',
  gstin text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  category_id uuid references public.categories(id) on delete restrict,
  description text default '',
  cost_price numeric(12,2) not null check (cost_price >= 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  stock_quantity numeric(12,3) not null default 0 check (stock_quantity >= 0),
  minimum_stock numeric(12,3) not null default 0 check (minimum_stock >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Decimal quantities for goods sold by weight/volume (older versions used integers).
alter table public.products alter column stock_quantity type numeric(12,3);
alter table public.products alter column minimum_stock type numeric(12,3);
alter table public.products add column if not exists unit text not null default 'pcs';
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists gst_rate numeric(5,2) not null default 0;
alter table public.products add column if not exists hsn_code text not null default '';

alter table public.products drop constraint if exists products_unit_check;
alter table public.products add constraint products_unit_check check (unit in ('pcs', 'kg', 'l'));
alter table public.products drop constraint if exists products_gst_rate_check;
alter table public.products add constraint products_gst_rate_check check (gst_rate in (0, 0.25, 3, 5, 12, 18, 28, 40));
-- Items sold by the piece always hold whole quantities.
alter table public.products drop constraint if exists products_whole_pieces_check;
alter table public.products add constraint products_whole_pieces_check
  check (unit <> 'pcs' or (stock_quantity = trunc(stock_quantity) and minimum_stock = trunc(minimum_stock)));

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  notes text not null default '',
  -- Positive: the customer owes the store (khata). Negative: advance paid.
  balance numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  gross_profit numeric(12,2) not null,
  payment_method text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.sales add column if not exists cashier_name text not null default '';
alter table public.sales add column if not exists tax_amount numeric(12,2) not null default 0;
alter table public.sales add column if not exists refunded_amount numeric(12,2) not null default 0;
alter table public.sales add column if not exists status text not null default 'completed';
alter table public.sales add column if not exists customer_id uuid references public.customers(id) on delete restrict;

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in ('Cash', 'UPI', 'Card', 'Other', 'Credit'));
alter table public.sales drop constraint if exists sales_status_check;
alter table public.sales add constraint sales_status_check
  check (status in ('completed', 'partially_refunded', 'refunded'));

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  cost_price numeric(12,2) not null check (cost_price >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  created_at timestamptz not null default now()
);

alter table public.sale_items alter column quantity type numeric(12,3);
alter table public.sale_items add column if not exists gst_rate numeric(5,2) not null default 0;
alter table public.sale_items add column if not exists tax_amount numeric(12,2) not null default 0;
alter table public.sale_items add column if not exists refunded_quantity numeric(12,3) not null default 0;
alter table public.sale_items drop constraint if exists sale_items_refunded_quantity_check;
alter table public.sale_items add constraint sale_items_refunded_quantity_check
  check (refunded_quantity >= 0 and refunded_quantity <= quantity);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  refund_number text not null unique,
  sale_id uuid not null references public.sales(id) on delete cascade,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  cost_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refunds(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  amount numeric(12,2) not null default 0,
  cost_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('purchase', 'sale', 'return', 'damage', 'adjustment')),
  quantity numeric(12,3) not null,
  reference_id text,
  notes text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.inventory_movements alter column quantity type numeric(12,3);
alter table public.inventory_movements add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.inventory_movements add column if not exists unit_cost numeric(12,2);

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Cash', 'UPI', 'Card', 'Other')),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('LOW_STOCK', 'OUT_OF_STOCK', 'SALE_RECORDED', 'STOCK_ADDED')),
  title text not null,
  message text not null,
  related_product_id uuid references public.products(id) on delete set null,
  related_sale_id uuid references public.sales(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Exactly one row: the store's own details, printed on receipts.
create table if not exists public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Mallu Mart',
  address text not null default '',
  phone text not null default '',
  gstin text not null default '',
  receipt_footer text not null default 'Thank you for shopping with us!',
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  user_id uuid references auth.users(id) on delete set null,
  cashier_name text not null default '',
  period_from timestamptz not null,
  period_to timestamptz not null,
  opening_float numeric(12,2) not null default 0,
  cash_sales numeric(12,2) not null default 0,
  cash_refunds numeric(12,2) not null default 0,
  cash_collections numeric(12,2) not null default 0,
  expected_cash numeric(12,2) not null default 0,
  counted_cash numeric(12,2) not null default 0,
  difference numeric(12,2) not null default 0,
  upi_sales numeric(12,2) not null default 0,
  card_sales numeric(12,2) not null default 0,
  other_sales numeric(12,2) not null default 0,
  credit_sales numeric(12,2) not null default 0,
  sales_count integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (business_date, user_id)
);

-- Who changed what: prices, products, categories, team access, refunds,
-- settings, suppliers, imports, cash closings. Owner-only.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text not null default 'System',
  action text not null,
  entity text not null,
  entity_id text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Change feed: drives realtime refresh for tables clients can't read directly.
create table if not exists public.store_events (
  id bigint generated always as identity primary key,
  source text not null,
  created_at timestamptz not null default now()
);

-- Sequential invoice and refund numbers (MM-000001, RF-000001, ...).
-- Older random 5-character invoices (MM-1A2B3) can never collide with these.
create sequence if not exists public.sale_invoice_seq;
create sequence if not exists public.refund_number_seq;

-- ==========================================================
-- 2. INDEXES
-- ==========================================================

create index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_products_sku on public.products(sku);
create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_products_is_active on public.products(is_active);
create index if not exists idx_products_active_stock on public.products(is_active, stock_quantity);
create unique index if not exists idx_products_barcode on public.products(barcode) where barcode is not null and barcode <> '';
create index if not exists idx_sales_created_at on public.sales(created_at desc);
create index if not exists idx_sales_invoice_number on public.sales(invoice_number);
create index if not exists idx_sales_payment_method on public.sales(payment_method);
create index if not exists idx_sales_created_at_payment on public.sales(created_at desc, payment_method);
create index if not exists idx_sales_customer_id on public.sales(customer_id);
create index if not exists idx_sales_created_by on public.sales(created_by, created_at);
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);
create index if not exists idx_sale_items_product_id on public.sale_items(product_id);
create index if not exists idx_refunds_sale_id on public.refunds(sale_id);
create index if not exists idx_refunds_created_at on public.refunds(created_at desc);
create index if not exists idx_refund_items_refund_id on public.refund_items(refund_id);
create index if not exists idx_refund_items_sale_item_id on public.refund_items(sale_item_id);
create index if not exists idx_movements_product_id on public.inventory_movements(product_id);
create index if not exists idx_movements_created_at on public.inventory_movements(created_at desc);
create index if not exists idx_customers_name on public.customers(lower(name));
create unique index if not exists idx_customers_phone on public.customers(phone) where phone <> '';
create index if not exists idx_customer_payments_customer on public.customer_payments(customer_id, created_at desc);
create index if not exists idx_customer_payments_created on public.customer_payments(created_by, created_at);
create index if not exists idx_notifications_is_read on public.notifications(is_read);
create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_cash_closings_date on public.cash_closings(business_date desc);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);
create index if not exists idx_store_events_created_at on public.store_events(created_at);

-- ==========================================================
-- 3. ACCESS HELPERS
-- ==========================================================

-- True unless the user has a verified 2FA factor and this session has not
-- completed it. Fails open only if the auth schema can't be read at all.
create or replace function public.mfa_satisfied()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_has_factor boolean;
begin
  begin
    select exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status::text = 'verified'
    ) into v_has_factor;
  exception when undefined_table or insufficient_privilege then
    return true;
  end;
  return not v_has_factor or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
end;
$$;

create or replace function public.is_store_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.mfa_satisfied() and exists (
    select 1 from public.profiles
    where user_id = auth.uid() and approved
  );
$$;

create or replace function public.is_store_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.mfa_satisfied() and exists (
    select 1 from public.profiles
    where user_id = auth.uid() and approved and role = 'owner'
  );
$$;

create or replace function public.current_member_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select nullif(full_name, '') from public.profiles where user_id = auth.uid()), 'System');
$$;

-- Quantities: positive, at most 3 decimals, whole for items sold by the piece.
create or replace function public.check_quantity(p_quantity numeric, p_unit text, p_label text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception '% must be greater than zero', p_label;
  end if;
  if p_quantity <> round(p_quantity, 3) then
    raise exception '% can have at most 3 decimals', p_label;
  end if;
  if p_unit = 'pcs' and p_quantity <> trunc(p_quantity) then
    raise exception '% must be a whole number for items sold by the piece', p_label;
  end if;
end;
$$;

-- "2 units", "1.5 kg"
create or replace function public.format_quantity(p_quantity numeric, p_unit text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim_scale(p_quantity)::text || case when p_unit = 'pcs' then ' units' else ' ' || p_unit end;
$$;

create or replace function public.write_audit(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_summary text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary, details)
  values (auth.uid(), public.current_member_name(), p_action, p_entity, p_entity_id, p_summary,
          coalesce(p_details, '{}'::jsonb));
$$;

-- Sends one notification to every approved member (or only owners).
create or replace function public.notify_members(
  p_owners_only boolean,
  p_type text,
  p_title text,
  p_message text,
  p_product_id uuid default null,
  p_sale_id uuid default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, type, title, message, related_product_id, related_sale_id)
  select user_id, p_type, p_title, p_message, p_product_id, p_sale_id
  from public.profiles
  where approved and (not p_owners_only or role = 'owner');
$$;

-- Low / out-of-stock alerts only when stock crosses the threshold.
drop function if exists public.raise_stock_alerts(uuid, text, integer, integer, integer, uuid);
create or replace function public.raise_stock_alerts(
  p_product_id uuid,
  p_product_name text,
  p_old_stock numeric,
  p_new_stock numeric,
  p_minimum_stock numeric,
  p_sale_id uuid default null,
  p_unit text default 'pcs'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_new_stock = 0 and p_old_stock > 0 then
    perform public.notify_members(false, 'OUT_OF_STOCK', 'Out of stock',
      p_product_name || ' is completely out of stock.', p_product_id, p_sale_id);
  elsif p_new_stock > 0 and p_new_stock <= p_minimum_stock and p_old_stock > p_minimum_stock then
    perform public.notify_members(false, 'LOW_STOCK', 'Low stock alert',
      p_product_name || ' is running low (' || public.format_quantity(p_new_stock, p_unit) || ' remaining).',
      p_product_id, p_sale_id);
  end if;
end;
$$;

-- ==========================================================
-- 4. TRIGGERS
-- ==========================================================

-- New sign-ups. The role requested by the browser is ignored: the very
-- first account becomes the approved owner, everyone else is pending staff.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_has_owner boolean;
begin
  perform pg_advisory_xact_lock(hashtext('mallu_mart_first_owner'));
  select exists (select 1 from public.profiles where role = 'owner' and approved) into v_has_owner;

  insert into public.profiles (user_id, full_name, role, approved)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)), 100),
    case when v_has_owner then 'staff' else 'owner' end,
    not v_has_owner
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['products', 'profiles', 'customers', 'suppliers', 'store_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

-- Opening stock entered when a product is created is written to the stock log.
create or replace function public.log_opening_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.stock_quantity > 0 then
    insert into public.inventory_movements (product_id, movement_type, quantity, notes, created_by)
    values (new.id, 'purchase', new.stock_quantity, 'Opening stock', auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists products_log_opening_stock on public.products;
create trigger products_log_opening_stock
  after insert on public.products
  for each row execute function public.log_opening_stock();

-- 4.1 Activity log triggers

create or replace function public.audit_products()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_action text;
  v_summary text;
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('product.created', 'product', new.id::text,
      'Added ' || new.name || ' (' || new.sku || ') at ₹' || new.selling_price,
      jsonb_build_object('sellingPrice', new.selling_price, 'costPrice', new.cost_price,
                         'openingStock', new.stock_quantity));
    return null;
  end if;

  if new.name is distinct from old.name then v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(old.name, new.name)); end if;
  if new.sku is distinct from old.sku then v_changes := v_changes || jsonb_build_object('sku', jsonb_build_array(old.sku, new.sku)); end if;
  if new.category_id is distinct from old.category_id then v_changes := v_changes || jsonb_build_object('category', jsonb_build_array(old.category_id, new.category_id)); end if;
  if new.cost_price is distinct from old.cost_price then v_changes := v_changes || jsonb_build_object('cost_price', jsonb_build_array(old.cost_price, new.cost_price)); end if;
  if new.selling_price is distinct from old.selling_price then v_changes := v_changes || jsonb_build_object('selling_price', jsonb_build_array(old.selling_price, new.selling_price)); end if;
  if new.minimum_stock is distinct from old.minimum_stock then v_changes := v_changes || jsonb_build_object('minimum_stock', jsonb_build_array(old.minimum_stock, new.minimum_stock)); end if;
  if new.gst_rate is distinct from old.gst_rate then v_changes := v_changes || jsonb_build_object('gst_rate', jsonb_build_array(old.gst_rate, new.gst_rate)); end if;
  if new.hsn_code is distinct from old.hsn_code then v_changes := v_changes || jsonb_build_object('hsn_code', jsonb_build_array(old.hsn_code, new.hsn_code)); end if;
  if new.unit is distinct from old.unit then v_changes := v_changes || jsonb_build_object('unit', jsonb_build_array(old.unit, new.unit)); end if;
  if new.barcode is distinct from old.barcode then v_changes := v_changes || jsonb_build_object('barcode', jsonb_build_array(old.barcode, new.barcode)); end if;
  if new.description is distinct from old.description then v_changes := v_changes || jsonb_build_object('description', jsonb_build_array(old.description, new.description)); end if;
  if new.is_active is distinct from old.is_active then v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_array(old.is_active, new.is_active)); end if;

  -- Stock-only updates (sales, purchases) are already in the stock log.
  if v_changes = '{}'::jsonb then
    return null;
  end if;

  v_action := case
    when old.is_active and not new.is_active then 'product.archived'
    when not old.is_active and new.is_active then 'product.restored'
    when v_changes ? 'cost_price' or v_changes ? 'selling_price' then 'product.price_changed'
    else 'product.updated'
  end;

  v_summary := case v_action
    when 'product.archived' then 'Archived ' || new.name
    when 'product.restored' then 'Restored ' || new.name
    when 'product.price_changed' then new.name || ': ' || concat_ws(', ',
      case when v_changes ? 'selling_price' then 'selling price ₹' || old.selling_price || ' → ₹' || new.selling_price end,
      case when v_changes ? 'cost_price' then 'cost price ₹' || old.cost_price || ' → ₹' || new.cost_price end)
    else 'Edited ' || new.name || ' (' || (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_changes) k) || ')'
  end;

  perform public.write_audit(v_action, 'product', new.id::text, v_summary, v_changes);
  return null;
end;
$$;

drop trigger if exists products_audit on public.products;
create trigger products_audit
  after insert or update on public.products
  for each row execute function public.audit_products();

create or replace function public.audit_categories()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('category.created', 'category', new.id::text, 'Created category ' || new.name);
  elsif tg_op = 'UPDATE' then
    if new.name is distinct from old.name then
      perform public.write_audit('category.renamed', 'category', new.id::text,
        'Renamed category ' || old.name || ' → ' || new.name);
    end if;
  else
    perform public.write_audit('category.deleted', 'category', old.id::text, 'Deleted category ' || old.name);
  end if;
  return null;
end;
$$;

drop trigger if exists categories_audit on public.categories;
create trigger categories_audit
  after insert or update or delete on public.categories
  for each row execute function public.audit_categories();

create or replace function public.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('team.signup', 'profile', new.user_id::text,
      new.full_name || case when new.approved then ' registered as the store owner'
                            else ' signed up (waiting for approval)' end);
  elsif new.role is distinct from old.role or new.approved is distinct from old.approved then
    perform public.write_audit('team.access_changed', 'profile', new.user_id::text,
      case
        when old.approved and not new.approved then 'Revoked access for ' || new.full_name
        when not old.approved and new.approved then 'Approved ' || new.full_name || ' as ' || new.role
        else 'Changed ' || new.full_name || ' from ' || old.role || ' to ' || new.role
      end,
      jsonb_build_object('role', jsonb_build_array(old.role, new.role),
                         'approved', jsonb_build_array(old.approved, new.approved)));
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update on public.profiles
  for each row execute function public.audit_profiles();

create or replace function public.audit_store_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    perform public.write_audit('settings.updated', 'store_settings', null, 'Updated store details',
      jsonb_build_object('before', to_jsonb(old) - 'updated_at' - 'id', 'after', to_jsonb(new) - 'updated_at' - 'id'));
  end if;
  return null;
end;
$$;

drop trigger if exists store_settings_audit on public.store_settings;
create trigger store_settings_audit
  after update on public.store_settings
  for each row execute function public.audit_store_settings();

create or replace function public.audit_suppliers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('supplier.created', 'supplier', new.id::text, 'Added supplier ' || new.name);
  elsif to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    perform public.write_audit('supplier.updated', 'supplier', new.id::text,
      case when old.is_active and not new.is_active then 'Deactivated supplier ' || new.name
           else 'Updated supplier ' || new.name end);
  end if;
  return null;
end;
$$;

drop trigger if exists suppliers_audit on public.suppliers;
create trigger suppliers_audit
  after insert or update on public.suppliers
  for each row execute function public.audit_suppliers();

-- 4.2 Change feed for realtime

create or replace function public.emit_store_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.store_events (source) values (tg_table_name);
  delete from public.store_events where created_at < now() - interval '1 day';
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['products', 'sales', 'inventory_movements', 'refunds', 'customers',
                           'customer_payments', 'suppliers', 'cash_closings', 'store_settings', 'audit_log'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_emit_store_event', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each statement execute function public.emit_store_event()',
      t || '_emit_store_event', t);
  end loop;
end $$;

-- ==========================================================
-- 5. WRITE FUNCTIONS
-- ==========================================================

-- Older versions had different signatures; drop them so calls aren't ambiguous.
drop function if exists public.record_sale(jsonb, text);
drop function if exists public.adjust_stock(uuid, integer, text, text);

-- 5.1 RECORD SALE (atomic checkout). p_customer_id is required for Credit (khata).
create or replace function public.record_sale(
  p_items jsonb,
  p_payment_method text,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_line record;
  v_product public.products%rowtype;
  v_customer public.customers%rowtype;
  v_sale_id uuid;
  v_invoice text;
  v_cashier text;
  v_total numeric(12,2) := 0;
  v_cost numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_line_total numeric(12,2);
  v_line_cost numeric(12,2);
  v_line_tax numeric(12,2);
  v_new_stock numeric(12,3);
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to record sales';
  end if;

  if p_payment_method is null or p_payment_method not in ('Cash', 'UPI', 'Card', 'Other', 'Credit') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale requires at least one item';
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'A sale cannot contain more than 200 lines';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where e->>'productId' is null
       or coalesce(e->>'quantity', '') !~ '^[0-9]{1,7}(\.[0-9]{1,3})?$'
  ) then
    raise exception 'Each item needs a product and a positive quantity (at most 3 decimals)';
  end if;

  if p_customer_id is not null then
    select * into v_customer from public.customers where id = p_customer_id for update;
    if not found or not v_customer.is_active then
      raise exception 'Customer not found or inactive';
    end if;
  end if;

  if p_payment_method = 'Credit' and p_customer_id is null then
    raise exception 'Choose a customer for a credit (khata) sale';
  end if;

  select full_name into v_cashier from public.profiles where user_id = v_uid;
  v_invoice := 'MM-' || lpad(nextval('public.sale_invoice_seq')::text, 6, '0');

  insert into public.sales (invoice_number, total_amount, total_cost, gross_profit, payment_method,
                            created_by, cashier_name, customer_id)
  values (v_invoice, 0, 0, 0, p_payment_method, v_uid, coalesce(v_cashier, ''), p_customer_id)
  returning id into v_sale_id;

  -- Duplicate lines are merged; rows are locked in a fixed order (no deadlocks).
  for v_line in
    select (e->>'productId')::uuid as product_id, sum((e->>'quantity')::numeric) as quantity
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    select * into v_product
    from public.products
    where id = v_line.product_id
    for update;

    if not found or not v_product.is_active then
      raise exception 'Product not found or archived';
    end if;

    perform public.check_quantity(v_line.quantity, v_product.unit, 'Quantity for ' || v_product.name);

    if v_product.stock_quantity < v_line.quantity then
      raise exception 'Insufficient stock for % (Available: %, Requested: %)',
        v_product.name, trim_scale(v_product.stock_quantity), trim_scale(v_line.quantity);
    end if;

    v_new_stock := v_product.stock_quantity - v_line.quantity;
    v_line_total := round(v_product.selling_price * v_line.quantity, 2);
    v_line_cost := round(v_product.cost_price * v_line.quantity, 2);
    -- Prices include GST; the tax portion of an inclusive price.
    v_line_tax := round(v_line_total * v_product.gst_rate / (100 + v_product.gst_rate), 2);

    insert into public.sale_items (sale_id, product_id, quantity, selling_price, cost_price,
                                   total_amount, total_cost, gst_rate, tax_amount)
    values (v_sale_id, v_product.id, v_line.quantity, v_product.selling_price, v_product.cost_price,
            v_line_total, v_line_cost, v_product.gst_rate, v_line_tax);

    update public.products set stock_quantity = v_new_stock where id = v_product.id;

    insert into public.inventory_movements (product_id, movement_type, quantity, reference_id, created_by)
    values (v_product.id, 'sale', -v_line.quantity, v_invoice, v_uid);

    v_total := v_total + v_line_total;
    v_cost := v_cost + v_line_cost;
    v_tax := v_tax + v_line_tax;

    perform public.raise_stock_alerts(v_product.id, v_product.name, v_product.stock_quantity,
      v_new_stock, v_product.minimum_stock, v_sale_id, v_product.unit);
  end loop;

  update public.sales
  set total_amount = v_total,
      total_cost = v_cost,
      gross_profit = v_total - v_cost,
      tax_amount = v_tax
  where id = v_sale_id;

  if p_payment_method = 'Credit' then
    update public.customers set balance = balance + v_total where id = p_customer_id;
  end if;

  perform public.notify_members(true, 'SALE_RECORDED', 'Sale recorded',
    '₹' || to_char(v_total, 'FM999999999990.00') || ' via ' || p_payment_method
      || case when p_payment_method = 'Credit' then ' to ' || v_customer.name else '' end
      || ' (' || v_invoice || ')' || coalesce(' by ' || nullif(v_cashier, ''), '') || '.',
    null, v_sale_id);

  return jsonb_build_object(
    'saleId', v_sale_id,
    'invoiceNumber', v_invoice,
    'totalAmount', v_total,
    'taxAmount', v_tax,
    'totalCost', case when public.is_store_owner() then v_cost end,
    'grossProfit', case when public.is_store_owner() then v_total - v_cost end,
    'customerBalance', case when p_customer_id is not null
      then (select balance from public.customers where id = p_customer_id) end
  );
end;
$$;

-- 5.2 REFUND / VOID A SALE (owner). p_items = [{saleItemId, quantity}];
--     null or [] refunds everything not yet refunded (a full void).
--     Stock is returned, credit sales reduce the customer's balance.
create or replace function public.refund_sale(
  p_sale_id uuid,
  p_items jsonb default null,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_item record;
  v_unit text;
  v_refund_id uuid;
  v_refund_number text;
  v_remaining numeric(12,3);
  v_amount numeric(12,2) := 0;
  v_cost numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_line_amount numeric(12,2);
  v_line_cost numeric(12,2);
  v_line_tax numeric(12,2);
  v_lines integer := 0;
  v_full boolean;
  v_status text;
begin
  if not public.is_store_owner() then
    raise exception 'Only the store owner can refund or void sales';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for the refund (at least 3 characters)';
  end if;

  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid refund items';
  end if;
  v_full := p_items is null or jsonb_array_length(p_items) = 0;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found';
  end if;

  if not v_full then
    if exists (
      select 1 from jsonb_array_elements(p_items) e
      where e->>'saleItemId' is null
         or coalesce(e->>'quantity', '') !~ '^[0-9]{1,7}(\.[0-9]{1,3})?$'
    ) then
      raise exception 'Each refund line needs an item and a positive quantity';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) e
      where not exists (
        select 1 from public.sale_items si
        where si.id = (e->>'saleItemId')::uuid and si.sale_id = p_sale_id
      )
    ) then
      raise exception 'A refund line does not belong to this sale';
    end if;
  end if;

  v_refund_number := 'RF-' || lpad(nextval('public.refund_number_seq')::text, 6, '0');
  insert into public.refunds (refund_number, sale_id, reason, created_by, created_by_name)
  values (v_refund_number, p_sale_id, left(trim(p_reason), 500), auth.uid(), public.current_member_name())
  returning id into v_refund_id;

  for v_item in
    select si.*,
           case when v_full then si.quantity - si.refunded_quantity else req.quantity end as refund_quantity
    from public.sale_items si
    left join (
      select (e->>'saleItemId')::uuid as sale_item_id, sum((e->>'quantity')::numeric) as quantity
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
      group by 1
    ) req on req.sale_item_id = si.id
    where si.sale_id = p_sale_id
    order by si.product_id
  loop
    continue when v_item.refund_quantity is null or v_item.refund_quantity = 0;

    v_remaining := v_item.quantity - v_item.refunded_quantity;
    select unit into v_unit from public.products where id = v_item.product_id for update;

    if v_item.refund_quantity > v_remaining then
      raise exception 'Only % of this item can still be refunded', public.format_quantity(v_remaining, v_unit);
    end if;
    perform public.check_quantity(v_item.refund_quantity, v_unit, 'Refund quantity');

    if v_item.refund_quantity = v_remaining then
      -- Last refund on this line: refund exactly what is left (no rounding drift).
      select v_item.total_amount - coalesce(sum(ri.amount), 0),
             v_item.total_cost - coalesce(sum(ri.cost_amount), 0),
             v_item.tax_amount - coalesce(sum(ri.tax_amount), 0)
      into v_line_amount, v_line_cost, v_line_tax
      from public.refund_items ri
      where ri.sale_item_id = v_item.id;
    else
      v_line_amount := round(v_item.selling_price * v_item.refund_quantity, 2);
      v_line_cost := round(v_item.cost_price * v_item.refund_quantity, 2);
      v_line_tax := round(v_line_amount * v_item.gst_rate / (100 + v_item.gst_rate), 2);
    end if;

    insert into public.refund_items (refund_id, sale_item_id, product_id, quantity, amount, cost_amount, tax_amount)
    values (v_refund_id, v_item.id, v_item.product_id, v_item.refund_quantity, v_line_amount, v_line_cost, v_line_tax);

    update public.sale_items set refunded_quantity = refunded_quantity + v_item.refund_quantity where id = v_item.id;
    update public.products set stock_quantity = stock_quantity + v_item.refund_quantity where id = v_item.product_id;

    insert into public.inventory_movements (product_id, movement_type, quantity, reference_id, notes, created_by)
    values (v_item.product_id, 'return', v_item.refund_quantity, v_refund_number,
            'Refund of ' || v_sale.invoice_number, auth.uid());

    v_amount := v_amount + v_line_amount;
    v_cost := v_cost + v_line_cost;
    v_tax := v_tax + v_line_tax;
    v_lines := v_lines + 1;
  end loop;

  if v_lines = 0 then
    raise exception 'Nothing left to refund on this sale';
  end if;

  update public.refunds set amount = v_amount, cost_amount = v_cost, tax_amount = v_tax where id = v_refund_id;

  v_status := case
    when exists (select 1 from public.sale_items where sale_id = p_sale_id and refunded_quantity < quantity)
      then 'partially_refunded'
    else 'refunded'
  end;
  update public.sales
  set refunded_amount = refunded_amount + v_amount, status = v_status
  where id = p_sale_id;

  if v_sale.payment_method = 'Credit' and v_sale.customer_id is not null then
    update public.customers set balance = balance - v_amount where id = v_sale.customer_id;
  end if;

  perform public.write_audit('sale.refunded', 'sale', p_sale_id::text,
    v_refund_number || ': refunded ₹' || to_char(v_amount, 'FM999999999990.00') || ' on '
      || v_sale.invoice_number || ' (' || trim(p_reason) || ')',
    jsonb_build_object('refundNumber', v_refund_number, 'amount', v_amount, 'invoice', v_sale.invoice_number));

  return jsonb_build_object('refundNumber', v_refund_number, 'amount', v_amount, 'status', v_status);
end;
$$;

-- 5.3 ADJUST STOCK (purchases, returns, damage, corrections)
--   purchase / return : positive quantity  (staff may record purchases)
--   damage            : negative quantity  (owner only)
--   adjustment        : either direction   (owner only, e.g. stock count)
--   Purchases may name a supplier; owners may enter the unit cost and
--   optionally make it the product's new cost price.
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_movement_type text default 'purchase',
  p_notes text default '',
  p_supplier_id uuid default null,
  p_unit_cost numeric default null,
  p_update_cost boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_new_stock numeric(12,3);
  v_owner boolean := public.is_store_owner();
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to change stock';
  end if;

  if p_movement_type is null or p_movement_type not in ('purchase', 'return', 'damage', 'adjustment') then
    raise exception 'Invalid movement type: %', p_movement_type;
  end if;

  if p_movement_type <> 'purchase' and not v_owner then
    raise exception 'Only the store owner can record % movements', p_movement_type;
  end if;

  if p_quantity is null or p_quantity = 0 or abs(p_quantity) > 1000000 then
    raise exception 'Quantity must be a non-zero number';
  end if;

  if p_movement_type in ('purchase', 'return') and p_quantity < 0 then
    raise exception 'Purchases and returns must add stock';
  end if;

  if p_movement_type = 'damage' and p_quantity > 0 then
    raise exception 'Damage must reduce stock';
  end if;

  if p_unit_cost is not null or coalesce(p_update_cost, false) then
    if not v_owner then
      raise exception 'Only the store owner can enter purchase costs';
    end if;
    if p_movement_type <> 'purchase' then
      raise exception 'A unit cost can only be entered for purchases';
    end if;
    if p_unit_cost is null or p_unit_cost < 0 or p_unit_cost <> round(p_unit_cost, 2) then
      raise exception 'Unit cost must be 0 or more, with at most 2 decimals';
    end if;
  end if;

  if p_supplier_id is not null then
    if p_movement_type <> 'purchase' then
      raise exception 'A supplier can only be given for purchases';
    end if;
    if not exists (select 1 from public.suppliers where id = p_supplier_id and is_active) then
      raise exception 'Supplier not found or inactive';
    end if;
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found or not v_product.is_active then
    raise exception 'Product not found or archived';
  end if;

  perform public.check_quantity(abs(p_quantity), v_product.unit, 'Quantity');

  v_new_stock := v_product.stock_quantity + p_quantity;
  if v_new_stock < 0 then
    raise exception 'Stock cannot go below 0 (current: %, change: %)',
      trim_scale(v_product.stock_quantity), trim_scale(p_quantity);
  end if;

  update public.products
  set stock_quantity = v_new_stock,
      cost_price = case when coalesce(p_update_cost, false) then p_unit_cost else cost_price end
  where id = p_product_id;

  insert into public.inventory_movements (product_id, movement_type, quantity, notes, created_by, supplier_id, unit_cost)
  values (p_product_id, p_movement_type, p_quantity, left(coalesce(p_notes, ''), 500), auth.uid(),
          p_supplier_id, p_unit_cost);

  perform public.notify_members(true, 'STOCK_ADDED', 'Stock updated',
    case when p_quantity > 0 then '+' else '' end || trim_scale(p_quantity) || ' ('
      || p_movement_type || ') for ' || v_product.name || '. New stock: '
      || public.format_quantity(v_new_stock, v_product.unit) || '.',
    p_product_id, null);

  perform public.raise_stock_alerts(v_product.id, v_product.name, v_product.stock_quantity,
    v_new_stock, v_product.minimum_stock, null, v_product.unit);

  return jsonb_build_object(
    'productId', p_product_id,
    'previousStock', v_product.stock_quantity,
    'newStock', v_new_stock,
    'adjustment', p_quantity
  );
end;
$$;

-- 5.4 DELETE CATEGORY (owner). Archived products are detached first.
create or replace function public.delete_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active integer;
begin
  if not public.is_store_owner() then
    raise exception 'Only the store owner can delete categories';
  end if;

  select count(*) into v_active
  from public.products
  where category_id = p_category_id and is_active;

  if v_active > 0 then
    raise exception 'Cannot delete: % active product(s) still use this category', v_active;
  end if;

  update public.products set category_id = null where category_id = p_category_id;
  delete from public.categories where id = p_category_id;
end;
$$;

-- 5.5 TEAM ACCESS (owner). Approve / revoke accounts and set roles.
create or replace function public.set_member_access(
  p_user_id uuid,
  p_role text,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_store_owner() then
    raise exception 'Only the store owner can manage team access';
  end if;

  if p_role not in ('owner', 'staff') or p_approved is null then
    raise exception 'Invalid role or approval value';
  end if;

  if p_user_id = auth.uid() and (p_role <> 'owner' or not p_approved) then
    raise exception 'You cannot remove your own owner access';
  end if;

  update public.profiles
  set role = p_role, approved = p_approved
  where user_id = p_user_id;

  if not found then
    raise exception 'Team member not found';
  end if;
end;
$$;

-- 5.6 CUSTOMERS (khata). Any member can add/edit; only owners deactivate.
create or replace function public.save_customer(
  p_id uuid,
  p_name text,
  p_phone text default '',
  p_notes text default '',
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_row public.customers%rowtype;
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to manage customers';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Customer name is required';
  end if;

  if v_phone <> '' and v_phone !~ '^\+?[0-9]{10,15}$' then
    raise exception 'Enter a valid phone number (10-15 digits)';
  end if;

  begin
    if p_id is null then
      insert into public.customers (name, phone, notes, created_by)
      values (left(trim(p_name), 100), v_phone, left(coalesce(p_notes, ''), 500), auth.uid())
      returning * into v_row;
    else
      select * into v_row from public.customers where id = p_id for update;
      if not found then
        raise exception 'Customer not found';
      end if;
      if coalesce(p_is_active, true) is distinct from v_row.is_active then
        if not public.is_store_owner() then
          raise exception 'Only the store owner can deactivate or restore customers';
        end if;
        if not coalesce(p_is_active, true) and v_row.balance <> 0 then
          raise exception 'Settle the balance (₹%) before deactivating this customer', v_row.balance;
        end if;
      end if;
      update public.customers
      set name = left(trim(p_name), 100),
          phone = v_phone,
          notes = left(coalesce(p_notes, ''), 500),
          is_active = coalesce(p_is_active, true)
      where id = p_id
      returning * into v_row;
    end if;
  exception when unique_violation then
    raise exception 'Another customer already has the phone number %', v_phone;
  end;

  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'phone', v_row.phone,
                            'notes', v_row.notes, 'balance', v_row.balance, 'isActive', v_row.is_active);
end;
$$;

-- 5.7 CUSTOMER PAYMENT against their khata balance. Any member.
create or replace function public.record_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers%rowtype;
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to record payments';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 10000000 then
    raise exception 'Payment amount must be more than 0, with at most 2 decimals';
  end if;

  if p_method is null or p_method not in ('Cash', 'UPI', 'Card', 'Other') then
    raise exception 'Invalid payment method: %', p_method;
  end if;

  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;

  insert into public.customer_payments (customer_id, amount, payment_method, notes, created_by, created_by_name)
  values (p_customer_id, p_amount, p_method, left(coalesce(p_notes, ''), 500), auth.uid(), public.current_member_name());

  update public.customers set balance = balance - p_amount where id = p_customer_id
  returning * into v_customer;

  perform public.write_audit('customer.payment', 'customer', p_customer_id::text,
    'Received ₹' || to_char(p_amount, 'FM999999999990.00') || ' (' || p_method || ') from ' || v_customer.name,
    jsonb_build_object('amount', p_amount, 'method', p_method, 'balanceAfter', v_customer.balance));

  return jsonb_build_object('balance', v_customer.balance);
end;
$$;

-- 5.8 SUPPLIERS (owner)
create or replace function public.save_supplier(
  p_id uuid,
  p_name text,
  p_phone text default '',
  p_gstin text default '',
  p_notes text default '',
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gstin text := upper(trim(coalesce(p_gstin, '')));
  v_row public.suppliers%rowtype;
begin
  if not public.is_store_owner() then
    raise exception 'Only the store owner can manage suppliers';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Supplier name is required';
  end if;

  if v_gstin <> '' and v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'GSTIN must be 15 characters, e.g. 32ABCDE1234F1Z5';
  end if;

  begin
    if p_id is null then
      insert into public.suppliers (name, phone, gstin, notes)
      values (left(trim(p_name), 120), left(trim(coalesce(p_phone, '')), 20), v_gstin, left(coalesce(p_notes, ''), 500))
      returning * into v_row;
    else
      update public.suppliers
      set name = left(trim(p_name), 120),
          phone = left(trim(coalesce(p_phone, '')), 20),
          gstin = v_gstin,
          notes = left(coalesce(p_notes, ''), 500),
          is_active = coalesce(p_is_active, true)
      where id = p_id
      returning * into v_row;
      if not found then
        raise exception 'Supplier not found';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'A supplier named % already exists', trim(p_name);
  end;

  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'phone', v_row.phone, 'gstin', v_row.gstin,
                            'notes', v_row.notes, 'isActive', v_row.is_active);
end;
$$;

-- 5.9 STORE SETTINGS (owner)
create or replace function public.save_store_settings(
  p_store_name text,
  p_address text,
  p_phone text,
  p_gstin text,
  p_receipt_footer text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gstin text := upper(trim(coalesce(p_gstin, '')));
begin
  if not public.is_store_owner() then
    raise exception 'Only the store owner can change store details';
  end if;

  if length(trim(coalesce(p_store_name, ''))) = 0 then
    raise exception 'Store name is required';
  end if;

  if v_gstin <> '' and v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'GSTIN must be 15 characters, e.g. 32ABCDE1234F1Z5';
  end if;

  update public.store_settings
  set store_name = left(trim(p_store_name), 100),
      address = left(trim(coalesce(p_address, '')), 300),
      phone = left(trim(coalesce(p_phone, '')), 40),
      gstin = v_gstin,
      receipt_footer = left(trim(coalesce(p_receipt_footer, '')), 200)
  where id;
end;
$$;

-- 5.10 CASH CLOSING. Any member closes their own drawer for a business day.
--      Expected cash = float + cash sales - cash refunds paid + cash collected
--      on khata, counted by the person who handled each transaction.
create or replace function public.close_cash(
  p_business_date date,
  p_from timestamptz,
  p_to timestamptz,
  p_opening_float numeric,
  p_counted_cash numeric,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_expected numeric(12,2);
  v_row public.cash_closings%rowtype;
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to close cash';
  end if;

  if p_business_date is null or p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '2 days' then
    raise exception 'Invalid business day';
  end if;

  if p_opening_float is null or p_opening_float < 0 or p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Opening float and counted cash must be 0 or more';
  end if;

  if exists (select 1 from public.cash_closings where business_date = p_business_date and user_id = auth.uid()) then
    raise exception 'You have already closed % ', to_char(p_business_date, 'DD Mon YYYY');
  end if;

  v_summary := public.get_cash_summary(p_from, p_to, auth.uid());
  v_expected := p_opening_float + (v_summary->>'cashSales')::numeric - (v_summary->>'cashRefunds')::numeric
                + (v_summary->>'cashCollections')::numeric;

  insert into public.cash_closings (
    business_date, user_id, cashier_name, period_from, period_to, opening_float,
    cash_sales, cash_refunds, cash_collections, expected_cash, counted_cash, difference,
    upi_sales, card_sales, other_sales, credit_sales, sales_count, notes)
  values (
    p_business_date, auth.uid(), public.current_member_name(), p_from, p_to, round(p_opening_float, 2),
    (v_summary->>'cashSales')::numeric, (v_summary->>'cashRefunds')::numeric, (v_summary->>'cashCollections')::numeric,
    v_expected, round(p_counted_cash, 2), round(p_counted_cash, 2) - v_expected,
    (v_summary->>'upiSales')::numeric, (v_summary->>'cardSales')::numeric, (v_summary->>'otherSales')::numeric,
    (v_summary->>'creditSales')::numeric, (v_summary->>'salesCount')::integer, left(coalesce(p_notes, ''), 500))
  returning * into v_row;

  perform public.write_audit('cash.closed', 'cash_closing', v_row.id::text,
    v_row.cashier_name || ' closed ' || to_char(p_business_date, 'DD Mon YYYY') || ': expected ₹'
      || to_char(v_expected, 'FM999999999990.00') || ', counted ₹' || to_char(v_row.counted_cash, 'FM999999999990.00')
      || case when v_row.difference = 0 then ' (balanced)'
              when v_row.difference > 0 then ' (₹' || to_char(v_row.difference, 'FM999999999990.00') || ' over)'
              else ' (₹' || to_char(-v_row.difference, 'FM999999999990.00') || ' short)' end,
    jsonb_build_object('difference', v_row.difference));

  return jsonb_build_object('id', v_row.id, 'expectedCash', v_row.expected_cash, 'difference', v_row.difference);
end;
$$;

-- 5.11 BULK PRODUCT IMPORT (owner). Rows are matched by SKU: new SKUs are
--      created with their opening stock, existing ones are updated (stock is
--      never changed by an import). Bad rows are reported, not fatal.
create or replace function public.import_products(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_created integer := 0;
  v_updated integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_sku text;
  v_name text;
  v_category text;
  v_category_id uuid;
  v_unit text;
  v_cost numeric;
  v_price numeric;
  v_opening numeric;
  v_minimum numeric;
  v_gst numeric;
  v_existing public.products%rowtype;
begin
  if not public.is_store_owner() then
    raise exception 'Only the store owner can import products';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to import';
  end if;

  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Import at most 2000 products at a time';
  end if;

  for r in select value as data, ordinality as idx from jsonb_array_elements(p_rows) with ordinality loop
    v_sku := upper(trim(coalesce(r.data->>'sku', '')));
    begin
      v_name := trim(coalesce(r.data->>'name', ''));
      v_category := trim(coalesce(r.data->>'category', ''));
      v_unit := lower(trim(coalesce(nullif(r.data->>'unit', ''), 'pcs')));
      v_cost := coalesce(nullif(trim(r.data->>'costPrice'), '')::numeric, 0);
      v_price := nullif(trim(r.data->>'sellingPrice'), '')::numeric;
      v_opening := coalesce(nullif(trim(r.data->>'openingStock'), '')::numeric, 0);
      v_minimum := coalesce(nullif(trim(r.data->>'minimumStock'), '')::numeric, 0);
      v_gst := coalesce(nullif(trim(r.data->>'gstRate'), '')::numeric, 0);

      if v_name = '' then raise exception 'Name is required'; end if;
      if v_sku = '' then raise exception 'SKU is required'; end if;
      if v_price is null then raise exception 'Selling price is required'; end if;
      if v_price < 0 or v_price <> round(v_price, 2) or v_cost < 0 or v_cost <> round(v_cost, 2) then
        raise exception 'Prices must be 0 or more, with at most 2 decimals';
      end if;
      if v_unit not in ('pcs', 'kg', 'l') then raise exception 'Unit must be pcs, kg or l'; end if;
      if v_opening < 0 or v_minimum < 0 then raise exception 'Stock values cannot be negative'; end if;
      if v_opening > 0 then perform public.check_quantity(v_opening, v_unit, 'Opening stock'); end if;
      if v_minimum > 0 then perform public.check_quantity(v_minimum, v_unit, 'Minimum stock'); end if;

      v_category_id := null;
      if v_category <> '' then
        select id into v_category_id from public.categories where lower(name) = lower(v_category);
        if not found then
          insert into public.categories (name) values (left(v_category, 80)) returning id into v_category_id;
        end if;
      end if;

      select * into v_existing from public.products where sku = v_sku for update;
      if found then
        update public.products
        set name = left(v_name, 120),
            category_id = coalesce(v_category_id, category_id),
            cost_price = v_cost,
            selling_price = v_price,
            minimum_stock = v_minimum,
            unit = v_unit,
            gst_rate = v_gst,
            hsn_code = left(trim(coalesce(r.data->>'hsnCode', hsn_code)), 20),
            barcode = coalesce(nullif(trim(r.data->>'barcode'), ''), barcode),
            is_active = true
        where id = v_existing.id;
        v_updated := v_updated + 1;
      else
        insert into public.products (name, sku, category_id, cost_price, selling_price, stock_quantity,
                                     minimum_stock, unit, gst_rate, hsn_code, barcode)
        values (left(v_name, 120), v_sku, v_category_id, v_cost, v_price, v_opening, v_minimum, v_unit, v_gst,
                left(trim(coalesce(r.data->>'hsnCode', '')), 20), nullif(trim(r.data->>'barcode'), ''));
        v_created := v_created + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row', r.idx, 'sku', v_sku, 'message', sqlerrm));
    end;
  end loop;

  if v_created + v_updated > 0 then
    perform public.write_audit('product.imported', 'product', null,
      'Imported ' || (v_created + v_updated) || ' products (' || v_created || ' new, ' || v_updated || ' updated)',
      jsonb_build_object('created', v_created, 'updated', v_updated, 'failed', jsonb_array_length(v_errors)));
  end if;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'errors', v_errors);
end;
$$;

-- ==========================================================
-- 6. READ FUNCTIONS (cost & profit visible to owners only)
-- ==========================================================

-- 6.1 Active products as one JSON array (the API's 1000-row cap never truncates it).
create or replace function public.get_products()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean := public.is_store_owner();
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view products';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'sku', p.sku,
        'barcode', p.barcode,
        'category_id', p.category_id,
        'category_name', c.name,
        'description', p.description,
        'cost_price', case when v_owner then p.cost_price end,
        'selling_price', p.selling_price,
        'stock_quantity', p.stock_quantity,
        'minimum_stock', p.minimum_stock,
        'unit', p.unit,
        'gst_rate', p.gst_rate,
        'hsn_code', p.hsn_code,
        'image_url', p.image_url,
        'is_active', p.is_active
      ) order by p.name)
    from public.products p
    left join public.categories c on c.id = p.category_id
    where p.is_active
  ), '[]'::jsonb);
end;
$$;

-- 6.2 Sales in a date range, newest first, paginated, with line items and
--     refunds. p_search matches invoice, cashier, customer name or phone.
create or replace function public.get_sales(
  p_from timestamptz,
  p_to timestamptz,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean := public.is_store_owner();
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view sales';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid date range';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Page size must be between 1 and 1000';
  end if;

  select count(*) into v_total
  from public.sales s
  left join public.customers cu on cu.id = s.customer_id
  where s.created_at >= p_from and s.created_at < p_to
    and (v_search is null
         or s.invoice_number ilike '%' || v_search || '%'
         or s.cashier_name ilike '%' || v_search || '%'
         or cu.name ilike '%' || v_search || '%'
         or cu.phone ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(page.row_data order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_rows
  from (
    select s.id, s.created_at,
      jsonb_build_object(
        'id', s.id,
        'invoiceNumber', s.invoice_number,
        'cashierName', s.cashier_name,
        'totalAmount', s.total_amount,
        'taxAmount', s.tax_amount,
        'refundedAmount', s.refunded_amount,
        'status', s.status,
        'totalCost', case when v_owner then s.total_cost end,
        'grossProfit', case when v_owner then s.gross_profit end,
        'paymentMethod', s.payment_method,
        'createdAt', s.created_at,
        'customer', case when cu.id is not null
          then jsonb_build_object('id', cu.id, 'name', cu.name, 'phone', cu.phone) end,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', i.id,
              'productId', i.product_id,
              'productName', p.name,
              'categoryName', coalesce(c.name, 'Uncategorised'),
              'unit', p.unit,
              'hsnCode', p.hsn_code,
              'quantity', i.quantity,
              'refundedQuantity', i.refunded_quantity,
              'sellingPrice', i.selling_price,
              'costPrice', case when v_owner then i.cost_price end,
              'totalAmount', i.total_amount,
              'totalCost', case when v_owner then i.total_cost end,
              'gstRate', i.gst_rate,
              'taxAmount', i.tax_amount
            ) order by p.name)
          from public.sale_items i
          join public.products p on p.id = i.product_id
          left join public.categories c on c.id = p.category_id
          where i.sale_id = s.id
        ), '[]'::jsonb),
        'refunds', coalesce((
          select jsonb_agg(jsonb_build_object(
              'refundNumber', rf.refund_number,
              'amount', rf.amount,
              'reason', rf.reason,
              'performedBy', rf.created_by_name,
              'createdAt', rf.created_at
            ) order by rf.created_at)
          from public.refunds rf
          where rf.sale_id = s.id
        ), '[]'::jsonb)
      ) as row_data
    from public.sales s
    left join public.customers cu on cu.id = s.customer_id
    where s.created_at >= p_from and s.created_at < p_to
      and (v_search is null
           or s.invoice_number ilike '%' || v_search || '%'
           or s.cashier_name ilike '%' || v_search || '%'
           or cu.name ilike '%' || v_search || '%'
           or cu.phone ilike '%' || v_search || '%')
    order by s.created_at desc, s.id desc
    limit p_limit offset greatest(coalesce(p_offset, 0), 0)
  ) page;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- 6.3 Totals for a date range. Sales count on their sale date, refunds on
--     their refund date (like a till). cost / profit are null for staff.
create or replace function public.sales_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean := public.is_store_owner();
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view reports';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid date range';
  end if;

  return (
    with s as (
      select * from public.sales where created_at >= p_from and created_at < p_to
    ),
    r as (
      select rf.*, sa.payment_method
      from public.refunds rf
      join public.sales sa on sa.id = rf.sale_id
      where rf.created_at >= p_from and rf.created_at < p_to
    ),
    items as (
      select i.product_id, i.quantity, i.total_amount, i.tax_amount, i.gst_rate,
             p.name as product_name, coalesce(c.name, 'Uncategorised') as category_name
      from public.sale_items i
      join s on s.id = i.sale_id
      join public.products p on p.id = i.product_id
      left join public.categories c on c.id = p.category_id
      union all
      select ri.product_id, -ri.quantity, -ri.amount, -ri.tax_amount, si.gst_rate,
             p.name, coalesce(c.name, 'Uncategorised')
      from public.refund_items ri
      join r on r.id = ri.refund_id
      join public.sale_items si on si.id = ri.sale_item_id
      join public.products p on p.id = ri.product_id
      left join public.categories c on c.id = p.category_id
    ),
    totals as (
      select
        (select count(*) from s) as sales_count,
        (select coalesce(sum(total_amount), 0) from s) as gross,
        (select coalesce(sum(amount), 0) from r) as refunded,
        (select count(*) from r) as refund_count,
        (select coalesce(sum(tax_amount), 0) from s) - (select coalesce(sum(tax_amount), 0) from r) as tax,
        (select coalesce(sum(total_cost), 0) from s) - (select coalesce(sum(cost_amount), 0) from r) as cost,
        (select coalesce(sum(gross_profit), 0) from s) - (select coalesce(sum(amount - cost_amount), 0) from r) as profit,
        (select coalesce(sum(quantity), 0) from items) as units
    )
    select jsonb_build_object(
      'salesCount', t.sales_count,
      'grossRevenue', t.gross,
      'refunds', t.refunded,
      'refundCount', t.refund_count,
      'revenue', t.gross - t.refunded,
      'units', t.units,
      'tax', t.tax,
      'cost', case when v_owner then t.cost end,
      'profit', case when v_owner then t.profit end,
      'payments', (
        select jsonb_agg(jsonb_build_object(
            'method', m.method,
            'count', coalesce(x.cnt, 0),
            'revenue', coalesce(x.rev, 0) - coalesce(y.amt, 0)
          ) order by m.ord)
        from (values ('Cash', 1), ('UPI', 2), ('Card', 3), ('Credit', 4), ('Other', 5)) as m(method, ord)
        left join (select payment_method, count(*) as cnt, sum(total_amount) as rev from s group by payment_method) x
          on x.payment_method = m.method
        left join (select payment_method, sum(amount) as amt from r group by payment_method) y
          on y.payment_method = m.method
      ),
      'topProducts', (
        select coalesce(jsonb_agg(tp order by tp.units desc, tp.revenue desc), '[]'::jsonb)
        from (
          select product_id as "productId", product_name as name,
                 sum(quantity) as units, sum(total_amount) as revenue
          from items
          group by product_id, product_name
          having sum(quantity) > 0
          order by sum(quantity) desc, sum(total_amount) desc
          limit 10
        ) tp
      ),
      'categories', (
        select coalesce(jsonb_agg(cp order by cp.revenue desc), '[]'::jsonb)
        from (
          select category_name as name, sum(quantity) as units, sum(total_amount) as revenue
          from items
          group by category_name
          having sum(quantity) <> 0 or sum(total_amount) <> 0
        ) cp
      ),
      'gst', (
        select coalesce(jsonb_agg(g order by g.rate), '[]'::jsonb)
        from (
          select gst_rate as rate,
                 sum(total_amount - tax_amount) as "taxableValue",
                 sum(tax_amount) as tax
          from items
          group by gst_rate
          having sum(total_amount) <> 0
        ) g
      )
    )
    from totals t
  );
end;
$$;

-- 6.4 Revenue per day (in the browser's time zone) for charts.
create or replace function public.daily_sales(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Kolkata')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean := public.is_store_owner();
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view reports';
  end if;

  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Invalid date range (at most 400 days)';
  end if;

  if not exists (select 1 from pg_timezone_names where name = p_tz) then
    raise exception 'Unknown time zone: %', p_tz;
  end if;

  return (
    with days as (
      select d::date as day
      from generate_series((p_from at time zone p_tz)::date,
                           ((p_to - interval '1 microsecond') at time zone p_tz)::date,
                           interval '1 day') d
    ),
    s as (
      select (created_at at time zone p_tz)::date as day, count(*) as n,
             sum(total_amount) as revenue, sum(gross_profit) as profit
      from public.sales
      where created_at >= p_from and created_at < p_to
      group by 1
    ),
    r as (
      select (created_at at time zone p_tz)::date as day, sum(amount) as amount,
             sum(amount - cost_amount) as profit
      from public.refunds
      where created_at >= p_from and created_at < p_to
      group by 1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'date', to_char(days.day, 'YYYY-MM-DD'),
        'salesCount', coalesce(s.n, 0),
        'revenue', coalesce(s.revenue, 0) - coalesce(r.amount, 0),
        'profit', case when v_owner then coalesce(s.profit, 0) - coalesce(r.profit, 0) end
      ) order by days.day), '[]'::jsonb)
    from days
    left join s on s.day = days.day
    left join r on r.day = days.day
  );
end;
$$;

-- 6.5 Stock movement history (the stock log), newest first, paginated.
create or replace function public.get_stock_history(
  p_from timestamptz,
  p_to timestamptz,
  p_product_id uuid default null,
  p_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean := public.is_store_owner();
  v_type text := nullif(trim(coalesce(p_type, '')), '');
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view stock history';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid date range';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Page size must be between 1 and 1000';
  end if;

  select count(*) into v_total
  from public.inventory_movements m
  where m.created_at >= p_from and m.created_at < p_to
    and (p_product_id is null or m.product_id = p_product_id)
    and (v_type is null or m.movement_type = v_type);

  select coalesce(jsonb_agg(r order by r."createdAt" desc, r.id desc), '[]'::jsonb)
  into v_rows
  from (
    select m.id,
           m.product_id as "productId",
           p.name as "productName",
           p.sku,
           p.unit,
           p.is_active as "productActive",
           m.movement_type as "movementType",
           m.quantity,
           m.reference_id as "referenceId",
           coalesce(m.notes, '') as notes,
           su.name as "supplierName",
           case when v_owner then m.unit_cost end as "unitCost",
           coalesce(pr.full_name, '') as "performedBy",
           m.created_at as "createdAt"
    from public.inventory_movements m
    join public.products p on p.id = m.product_id
    left join public.suppliers su on su.id = m.supplier_id
    left join public.profiles pr on pr.user_id = m.created_by
    where m.created_at >= p_from and m.created_at < p_to
      and (p_product_id is null or m.product_id = p_product_id)
      and (v_type is null or m.movement_type = v_type)
    order by m.created_at desc, m.id desc
    limit p_limit offset greatest(coalesce(p_offset, 0), 0)
  ) r;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- 6.6 Customers (khata), with the total owed across all customers.
create or replace function public.get_customers(
  p_search text default null,
  p_include_inactive boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view customers';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Page size must be between 1 and 1000';
  end if;

  select count(*) into v_total
  from public.customers c
  where (p_include_inactive or c.is_active)
    and (v_search is null or c.name ilike '%' || v_search || '%' or c.phone ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'name', x.name, 'phone', x.phone, 'notes', x.notes, 'balance', x.balance,
      'isActive', x.is_active, 'createdAt', x.created_at
    ) order by lower(x.name), x.id), '[]'::jsonb)
  into v_rows
  from (
    select c.*
    from public.customers c
    where (p_include_inactive or c.is_active)
      and (v_search is null or c.name ilike '%' || v_search || '%' or c.phone ilike '%' || v_search || '%')
    order by lower(c.name), c.id
    limit p_limit offset greatest(coalesce(p_offset, 0), 0)
  ) x;

  return jsonb_build_object(
    'total', v_total,
    'rows', v_rows,
    'totalOutstanding', (select coalesce(sum(balance), 0) from public.customers where balance > 0)
  );
end;
$$;

-- 6.7 One customer's khata: credit sales, refunds on them, payments, and
--     their other (paid) purchases, newest first.
create or replace function public.get_customer_ledger(
  p_customer_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers%rowtype;
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view customers';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Page size must be between 1 and 1000';
  end if;

  select * into v_customer from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  v_total := (select count(*) from public.sales where customer_id = p_customer_id)
           + (select count(*) from public.refunds rf join public.sales s on s.id = rf.sale_id where s.customer_id = p_customer_id)
           + (select count(*) from public.customer_payments where customer_id = p_customer_id);

  select coalesce(jsonb_agg(e order by e."createdAt" desc), '[]'::jsonb)
  into v_rows
  from (
    select x.id, x.kind, x.reference, x.amount, x.balance_effect as "balanceEffect", x.method, x.notes,
           x.performed_by as "performedBy", x.created_at as "createdAt"
    from (
      select s.id::text as id, 'sale' as kind, s.invoice_number as reference, s.total_amount as amount,
             case when s.payment_method = 'Credit' then s.total_amount else 0 end as balance_effect,
             s.payment_method as method, '' as notes, s.cashier_name as performed_by, s.created_at
      from public.sales s
      where s.customer_id = p_customer_id
      union all
      select rf.id::text, 'refund', rf.refund_number || ' (' || s.invoice_number || ')', rf.amount,
             case when s.payment_method = 'Credit' then -rf.amount else 0 end,
             s.payment_method, rf.reason, rf.created_by_name, rf.created_at
      from public.refunds rf
      join public.sales s on s.id = rf.sale_id
      where s.customer_id = p_customer_id
      union all
      select cp.id::text, 'payment', '', cp.amount, -cp.amount, cp.payment_method, cp.notes, cp.created_by_name, cp.created_at
      from public.customer_payments cp
      where cp.customer_id = p_customer_id
    ) x
    order by x.created_at desc
    limit p_limit offset greatest(coalesce(p_offset, 0), 0)
  ) e;

  return jsonb_build_object(
    'customer', jsonb_build_object('id', v_customer.id, 'name', v_customer.name, 'phone', v_customer.phone,
                                   'notes', v_customer.notes, 'balance', v_customer.balance,
                                   'isActive', v_customer.is_active, 'createdAt', v_customer.created_at),
    'total', coalesce(v_total, 0),
    'rows', v_rows
  );
end;
$$;

-- 6.8 Suppliers (staff need the list to record deliveries).
create or replace function public.get_suppliers(p_include_inactive boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view suppliers';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'gstin', s.gstin,
                                        'notes', s.notes, 'isActive', s.is_active) order by lower(s.name))
    from public.suppliers s
    where p_include_inactive or s.is_active
  ), '[]'::jsonb);
end;
$$;

-- 6.9 Store details for receipts.
create or replace function public.get_store_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view store details';
  end if;

  return (
    select jsonb_build_object('storeName', store_name, 'address', address, 'phone', phone,
                              'gstin', gstin, 'receiptFooter', receipt_footer)
    from public.store_settings
    where id
  );
end;
$$;

-- 6.10 Cash drawer summary for a period. Staff only ever see their own;
--      owners pick a person or (null) everyone.
create or replace function public.get_cash_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := p_user_id;
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view cash summaries';
  end if;

  if not public.is_store_owner() then
    v_user := auth.uid();
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid date range';
  end if;

  return (
    with s as (
      select payment_method, total_amount
      from public.sales
      where created_at >= p_from and created_at < p_to
        and (v_user is null or created_by = v_user)
    )
    select jsonb_build_object(
      'salesCount', (select count(*) from s),
      'cashSales', (select coalesce(sum(total_amount), 0) from s where payment_method = 'Cash'),
      'upiSales', (select coalesce(sum(total_amount), 0) from s where payment_method = 'UPI'),
      'cardSales', (select coalesce(sum(total_amount), 0) from s where payment_method = 'Card'),
      'otherSales', (select coalesce(sum(total_amount), 0) from s where payment_method = 'Other'),
      'creditSales', (select coalesce(sum(total_amount), 0) from s where payment_method = 'Credit'),
      'cashRefunds', (
        select coalesce(sum(rf.amount), 0)
        from public.refunds rf
        join public.sales sa on sa.id = rf.sale_id
        where rf.created_at >= p_from and rf.created_at < p_to
          and sa.payment_method = 'Cash'
          and (v_user is null or rf.created_by = v_user)
      ),
      'cashCollections', (
        select coalesce(sum(amount), 0)
        from public.customer_payments
        where created_at >= p_from and created_at < p_to
          and payment_method = 'Cash'
          and (v_user is null or created_by = v_user)
      )
    )
  );
end;
$$;

-- 6.11 Past cash closings: owners see everyone's, staff their own.
create or replace function public.get_cash_closings(
  p_from date,
  p_to date,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean := public.is_store_owner();
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view cash closings';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Page size must be between 1 and 1000';
  end if;

  select count(*) into v_total
  from public.cash_closings c
  where c.business_date between p_from and p_to
    and (v_owner or c.user_id = auth.uid());

  select coalesce(jsonb_agg(x order by x."businessDate" desc, x."createdAt" desc), '[]'::jsonb)
  into v_rows
  from (
    select c.id, c.business_date as "businessDate", c.cashier_name as "cashierName",
           c.opening_float as "openingFloat", c.cash_sales as "cashSales", c.cash_refunds as "cashRefunds",
           c.cash_collections as "cashCollections", c.expected_cash as "expectedCash",
           c.counted_cash as "countedCash", c.difference, c.upi_sales as "upiSales",
           c.card_sales as "cardSales", c.other_sales as "otherSales", c.credit_sales as "creditSales",
           c.sales_count as "salesCount", c.notes, c.created_at as "createdAt",
           (c.user_id = auth.uid()) as "isMine"
    from public.cash_closings c
    where c.business_date between p_from and p_to
      and (v_owner or c.user_id = auth.uid())
    order by c.business_date desc, c.created_at desc
    limit p_limit offset greatest(coalesce(p_offset, 0), 0)
  ) x;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- 6.12 Reorder list: products at or below their minimum, with a suggested
--      order quantity and the supplier they were last bought from.
create or replace function public.get_reorder_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean := public.is_store_owner();
begin
  if not public.is_store_member() then
    raise exception 'Your account is not authorised to view the reorder list';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'productId', p.id,
        'name', p.name,
        'sku', p.sku,
        'unit', p.unit,
        'stock', p.stock_quantity,
        'minimum', p.minimum_stock,
        'suggestedQuantity', case
          when p.unit = 'pcs' then greatest(ceil(p.minimum_stock * 2 - p.stock_quantity), 1)
          else greatest(round(p.minimum_stock * 2 - p.stock_quantity, 3), 1) end,
        'category', coalesce(c.name, 'Uncategorised'),
        'lastSupplierId', lp.supplier_id,
        'lastSupplierName', lp.supplier_name,
        'lastPurchaseAt', lp.created_at,
        'lastUnitCost', case when v_owner then lp.unit_cost end
      ) order by (p.stock_quantity = 0) desc, lp.supplier_name nulls last, p.name)
    from public.products p
    left join public.categories c on c.id = p.category_id
    left join lateral (
      select m.supplier_id, su.name as supplier_name, m.created_at, m.unit_cost
      from public.inventory_movements m
      left join public.suppliers su on su.id = m.supplier_id
      where m.product_id = p.id and m.movement_type = 'purchase' and m.supplier_id is not null
      order by m.created_at desc
      limit 1
    ) lp on true
    where p.is_active and p.stock_quantity <= p.minimum_stock
  ), '[]'::jsonb);
end;
$$;

-- 6.13 Activity log (owner).
create or replace function public.get_audit_log(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_store_owner() then
    raise exception 'Only the store owner can view the activity log';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid date range';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Page size must be between 1 and 1000';
  end if;

  select count(*) into v_total from public.audit_log a where a.created_at >= p_from and a.created_at < p_to;

  select coalesce(jsonb_agg(x order by x."createdAt" desc, x.id desc), '[]'::jsonb)
  into v_rows
  from (
    select a.id, a.actor_name as "actorName", a.action, a.entity, a.entity_id as "entityId",
           a.summary, a.details, a.created_at as "createdAt"
    from public.audit_log a
    where a.created_at >= p_from and a.created_at < p_to
    order by a.created_at desc, a.id desc
    limit p_limit offset greatest(coalesce(p_offset, 0), 0)
  ) x;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- ==========================================================
-- 7. ROW LEVEL SECURITY
-- ==========================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.refunds enable row level security;
alter table public.refund_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.customer_payments enable row level security;
alter table public.notifications enable row level security;
alter table public.store_settings enable row level security;
alter table public.cash_closings enable row level security;
alter table public.audit_log enable row level security;
alter table public.store_events enable row level security;

-- Remove every policy from earlier versions before recreating.
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'categories', 'suppliers', 'products', 'customers', 'sales', 'sale_items',
                        'refunds', 'refund_items', 'inventory_movements', 'customer_payments', 'notifications',
                        'store_settings', 'cash_closings', 'audit_log', 'store_events')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Profiles: you see your own; owners see the whole team.
create policy "Profiles: own or owner"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or (select public.is_store_owner()));

create policy "Categories: members read"
  on public.categories for select to authenticated
  using ((select public.is_store_member()));

create policy "Categories: owner insert"
  on public.categories for insert to authenticated
  with check ((select public.is_store_owner()));

create policy "Categories: owner update"
  on public.categories for update to authenticated
  using ((select public.is_store_owner()))
  with check ((select public.is_store_owner()));

-- Products: only products.id is selectable (see grants); full reads go
-- through get_products(). stock_quantity is never directly writable.
create policy "Products: members read"
  on public.products for select to authenticated
  using ((select public.is_store_member()));

create policy "Products: owner insert"
  on public.products for insert to authenticated
  with check ((select public.is_store_owner()));

create policy "Products: owner update"
  on public.products for update to authenticated
  using ((select public.is_store_owner()))
  with check ((select public.is_store_owner()));

create policy "Notifications: own read"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

create policy "Notifications: own update"
  on public.notifications for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Notifications: own delete"
  on public.notifications for delete to authenticated
  using (auth.uid() = user_id);

create policy "Store events: members read"
  on public.store_events for select to authenticated
  using ((select public.is_store_member()));

-- All other tables have RLS on and no policies: clients reach them only
-- through the functions above.

-- ==========================================================
-- 8. TABLE & FUNCTION PRIVILEGES
-- ==========================================================

revoke all on public.profiles, public.categories, public.suppliers, public.products, public.customers,
  public.sales, public.sale_items, public.refunds, public.refund_items, public.inventory_movements,
  public.customer_payments, public.notifications, public.store_settings, public.cash_closings,
  public.audit_log, public.store_events
  from anon, authenticated;

grant select on public.profiles, public.categories, public.notifications, public.store_events to authenticated;
grant insert (name), update (name) on public.categories to authenticated;

grant select (id) on public.products to authenticated;
grant insert (name, sku, category_id, description, cost_price, selling_price, stock_quantity,
  minimum_stock, image_url, is_active, unit, barcode, gst_rate, hsn_code)
  on public.products to authenticated;
grant update (name, sku, category_id, description, cost_price, selling_price,
  minimum_stock, image_url, is_active, unit, barcode, gst_rate, hsn_code)
  on public.products to authenticated;

grant update (is_read), delete on public.notifications to authenticated;

revoke all on sequence public.sale_invoice_seq, public.refund_number_seq from anon, authenticated;

-- Every function: no access for anonymous callers.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    -- Internal helpers and trigger functions are not callable by clients either.
    if f.proname in ('notify_members', 'raise_stock_alerts', 'write_audit', 'handle_new_user', 'log_opening_stock',
                     'emit_store_event', 'set_updated_at', 'audit_products', 'audit_categories', 'audit_profiles',
                     'audit_store_settings', 'audit_suppliers', 'check_quantity', 'format_quantity',
                     'current_member_name', 'mfa_satisfied') then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ==========================================================
-- 9. REALTIME
-- ==========================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['categories', 'notifications', 'profiles', 'store_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;

  foreach t in array array['products', 'sales', 'inventory_movements'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- Make the API (PostgREST) pick up new and changed functions immediately.
notify pgrst, 'reload schema';
