create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);
create table if not exists public.categories (id uuid primary key default gen_random_uuid(), name text not null unique, created_at timestamptz not null default now());
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), name text not null, sku text not null unique, category_id uuid references public.categories(id) on delete restrict,
  description text, cost_price numeric(12,2) not null check (cost_price >= 0), selling_price numeric(12,2) not null check (selling_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0), minimum_stock integer not null default 0 check (minimum_stock >= 0), image_url text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(), total_amount numeric(12,2) not null check (total_amount >= 0), total_cost numeric(12,2) not null check (total_cost >= 0), gross_profit numeric(12,2) not null,
  payment_method text not null check (payment_method in ('Cash', 'UPI', 'Card', 'Other')), created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now()
);
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete cascade, product_id uuid not null references public.products(id), quantity integer not null check (quantity > 0), selling_price numeric(12,2) not null, cost_price numeric(12,2) not null, total_amount numeric(12,2) not null, total_cost numeric(12,2) not null, created_at timestamptz not null default now()
);
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id), movement_type text not null check (movement_type in ('purchase', 'sale', 'return', 'damage', 'adjustment')), quantity integer not null, reference_id uuid, notes text, created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now()
);
create index if not exists products_sku_idx on public.products(sku); create index if not exists products_category_idx on public.products(category_id); create index if not exists sales_created_at_idx on public.sales(created_at); create index if not exists sale_items_sale_idx on public.sale_items(sale_id); create index if not exists movements_product_idx on public.inventory_movements(product_id);

alter table public.profiles enable row level security; alter table public.categories enable row level security; alter table public.products enable row level security; alter table public.sales enable row level security; alter table public.sale_items enable row level security; alter table public.inventory_movements enable row level security;
create policy "authenticated profiles" on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "authenticated categories" on public.categories for all to authenticated using (true) with check (true);
create policy "authenticated products" on public.products for all to authenticated using (true) with check (true);
create policy "authenticated sales" on public.sales for all to authenticated using (true) with check (created_by = auth.uid());
create policy "authenticated sale items" on public.sale_items for all to authenticated using (exists (select 1 from public.sales s where s.id = sale_id and s.created_by = auth.uid())) with check (exists (select 1 from public.sales s where s.id = sale_id and s.created_by = auth.uid()));
create policy "authenticated movements" on public.inventory_movements for all to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create or replace function public.record_sale(p_items jsonb, p_payment_method text) returns uuid language plpgsql security invoker set search_path = public as $$
declare item jsonb; product_row public.products%rowtype; sale_id uuid; total_amount numeric := 0; total_cost numeric := 0; quantity integer; product_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_payment_method not in ('Cash', 'UPI', 'Card', 'Other') then raise exception 'Invalid payment method'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'A sale needs at least one item'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    product_id := (item->>'product_id')::uuid; quantity := (item->>'quantity')::integer;
    if quantity is null or quantity <= 0 then raise exception 'Quantity must be positive'; end if;
    select * into product_row from public.products where id = product_id and is_active for update;
    if not found then raise exception 'Product unavailable'; end if;
    if product_row.stock_quantity < quantity then raise exception 'Insufficient stock for %', product_row.name; end if;
    total_amount := total_amount + product_row.selling_price * quantity; total_cost := total_cost + product_row.cost_price * quantity;
  end loop;
  insert into public.sales(total_amount, total_cost, gross_profit, payment_method, created_by) values (total_amount, total_cost, total_amount - total_cost, p_payment_method, auth.uid()) returning id into sale_id;
  for item in select * from jsonb_array_elements(p_items) loop
    product_id := (item->>'product_id')::uuid; quantity := (item->>'quantity')::integer;
    select * into product_row from public.products where id = product_id for update;
    insert into public.sale_items(sale_id, product_id, quantity, selling_price, cost_price, total_amount, total_cost) values (sale_id, product_id, quantity, product_row.selling_price, product_row.cost_price, product_row.selling_price * quantity, product_row.cost_price * quantity);
    update public.products set stock_quantity = stock_quantity - quantity, updated_at = now() where id = product_id;
    insert into public.inventory_movements(product_id, movement_type, quantity, reference_id, created_by) values (product_id, 'sale', -quantity, sale_id, auth.uid());
  end loop;
  return sale_id;
end; $$;
