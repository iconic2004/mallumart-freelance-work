-- ==========================================================
-- MALLU MART - ALL-IN-ONE SUPABASE SETUP SCRIPT
-- Paste this entirely into the Supabase SQL Editor and click 'Run'.
-- ==========================================================

create extension if not exists pgcrypto;

-- 1. PROFILES TABLE (Store Owner & Staff)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'owner' check (role in ('owner', 'staff')),
  store_name text not null default 'Mallu Mart',
  phone text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. CATEGORIES TABLE
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 3. PRODUCTS TABLE
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  category_id uuid references public.categories(id) on delete restrict,
  description text default '',
  cost_price numeric(12,2) not null check (cost_price >= 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. SALES TABLE
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  gross_profit numeric(12,2) not null,
  payment_method text not null check (payment_method in ('Cash', 'UPI', 'Card', 'Other')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 5. SALE ITEMS TABLE
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  cost_price numeric(12,2) not null check (cost_price >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  created_at timestamptz not null default now()
);

-- 6. INVENTORY MOVEMENTS AUDIT LOG
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('purchase', 'sale', 'return', 'damage', 'adjustment')),
  quantity integer not null,
  reference_id text,
  notes text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 7. NOTIFICATIONS TABLE
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

-- 8. INDEXES FOR HIGH-SPEED LOOKUPS
create index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_products_sku on public.products(sku);
create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_products_is_active on public.products(is_active);
create index if not exists idx_sales_created_at on public.sales(created_at desc);
create index if not exists idx_sales_invoice_number on public.sales(invoice_number);
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);
create index if not exists idx_movements_product_id on public.inventory_movements(product_id);
create index if not exists idx_movements_created_at on public.inventory_movements(created_at desc);
create index if not exists idx_notifications_is_read on public.notifications(is_read);

-- ==========================================================
-- 9. USER SIGNUP TRIGGER (Links auth.users -> public.profiles)
-- ==========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'owner')
  )
  on conflict (user_id) do update
  set full_name = excluded.full_name,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.notifications enable row level security;

-- Profiles: Authenticated users can view profiles, update their own
create policy "Authenticated users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Categories: Authenticated users can view & manage
create policy "Authenticated users can view categories"
  on public.categories for select
  to authenticated
  using (true);

create policy "Authenticated users can insert categories"
  on public.categories for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update categories"
  on public.categories for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete categories"
  on public.categories for delete
  to authenticated
  using (true);

-- Products: Authenticated users can view & manage
create policy "Authenticated users can view products"
  on public.products for select
  to authenticated
  using (true);

create policy "Authenticated users can insert products"
  on public.products for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update products"
  on public.products for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete products"
  on public.products for delete
  to authenticated
  using (true);

-- Sales & Items: Authenticated users can view and record
create policy "Authenticated users can view sales"
  on public.sales for select
  to authenticated
  using (true);

create policy "Authenticated users can insert sales"
  on public.sales for insert
  to authenticated
  with check (true);

create policy "Authenticated users can view sale items"
  on public.sale_items for select
  to authenticated
  using (true);

create policy "Authenticated users can insert sale items"
  on public.sale_items for insert
  to authenticated
  with check (true);

-- Movements: Authenticated users can view & insert
create policy "Authenticated users can view movements"
  on public.inventory_movements for select
  to authenticated
  using (true);

create policy "Authenticated users can insert movements"
  on public.inventory_movements for insert
  to authenticated
  with check (true);

-- Notifications: Authenticated users can view & update
create policy "Authenticated users can view notifications"
  on public.notifications for select
  to authenticated
  using (true);

create policy "Authenticated users can manage notifications"
  on public.notifications for all
  to authenticated
  using (true)
  with check (true);

-- ==========================================================
-- 11. ATOMIC STORED PROCEDURE: RECORD SALE
-- ==========================================================

create or replace function public.record_sale(
  p_items jsonb,
  p_payment_method text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_sale_id uuid;
  v_invoice text;
  v_total_amount numeric(12,2) := 0;
  v_total_cost numeric(12,2) := 0;
  v_quantity integer;
  v_product_id uuid;
  v_new_stock integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to record a sale';
  end if;

  if p_payment_method not in ('Cash', 'UPI', 'Card', 'Other') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'A sale requires at least one item';
  end if;

  -- Phase 1: Validate stock & compute totals
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'productId')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be positive';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and is_active = true
    for update;

    if not found then
      raise exception 'Product not found or inactive';
    end if;

    if v_product.stock_quantity < v_quantity then
      raise exception 'Insufficient stock for % (Available: %, Requested: %)',
        v_product.name, v_product.stock_quantity, v_quantity;
    end if;

    v_total_amount := v_total_amount + (v_product.selling_price * v_quantity);
    v_total_cost := v_total_cost + (v_product.cost_price * v_quantity);
  end loop;

  -- Phase 2: Generate invoice number
  v_invoice := 'MM-' || upper(substr(md5(clock_timestamp()::text || random()::text), 1, 5));

  -- Phase 3: Insert sales record
  insert into public.sales (
    invoice_number,
    total_amount,
    total_cost,
    gross_profit,
    payment_method,
    created_by
  ) values (
    v_invoice,
    v_total_amount,
    v_total_cost,
    v_total_amount - v_total_cost,
    p_payment_method,
    auth.uid()
  ) returning id into v_sale_id;

  -- Phase 4: Insert items, update inventory, record movements & alerts
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'productId')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    select * into v_product
    from public.products
    where id = v_product_id
    for update;

    v_new_stock := v_product.stock_quantity - v_quantity;

    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      selling_price,
      cost_price,
      total_amount,
      total_cost
    ) values (
      v_sale_id,
      v_product_id,
      v_quantity,
      v_product.selling_price,
      v_product.cost_price,
      v_product.selling_price * v_quantity,
      v_product.cost_price * v_quantity
    );

    update public.products
    set stock_quantity = v_new_stock,
        updated_at = now()
    where id = v_product_id;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      reference_id,
      created_by
    ) values (
      v_product_id,
      'sale',
      -v_quantity,
      v_invoice,
      auth.uid()
    );

    if v_new_stock = 0 then
      insert into public.notifications (user_id, type, title, message, related_product_id, related_sale_id)
      values (
        auth.uid(),
        'OUT_OF_STOCK',
        'Out of stock',
        v_product.name || ' is completely out of stock.',
        v_product_id,
        v_sale_id
      );
    elsif v_new_stock <= v_product.minimum_stock then
      insert into public.notifications (user_id, type, title, message, related_product_id, related_sale_id)
      values (
        auth.uid(),
        'LOW_STOCK',
        'Low stock alert',
        v_product.name || ' is running low (' || v_new_stock || ' units remaining).',
        v_product_id,
        v_sale_id
      );
    end if;
  end loop;

  insert into public.notifications (user_id, type, title, message, related_sale_id)
  values (
    auth.uid(),
    'SALE_RECORDED',
    'Sale recorded',
    '₹' || round(v_total_amount)::text || ' recorded via ' || p_payment_method || ' (' || v_invoice || ').',
    v_sale_id
  );

  return jsonb_build_object(
    'saleId', v_sale_id,
    'invoiceNumber', v_invoice,
    'totalAmount', v_total_amount,
    'totalCost', v_total_cost,
    'grossProfit', v_total_amount - v_total_cost
  );
end;
$$;

-- ==========================================================
-- 12. ATOMIC STORED PROCEDURE: ADJUST STOCK
-- ==========================================================

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity integer,
  p_movement_type text default 'purchase',
  p_notes text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_new_stock integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to adjust stock';
  end if;

  if p_movement_type not in ('purchase', 'sale', 'return', 'damage', 'adjustment') then
    raise exception 'Invalid movement type: %', p_movement_type;
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  v_new_stock := v_product.stock_quantity + p_quantity;
  if v_new_stock < 0 then
    raise exception 'Stock cannot be reduced below 0 (current: %, adjustment: %)',
      v_product.stock_quantity, p_quantity;
  end if;

  update public.products
  set stock_quantity = v_new_stock,
      updated_at = now()
  where id = p_product_id;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    notes,
    created_by
  ) values (
    p_product_id,
    p_movement_type,
    p_quantity,
    p_notes,
    auth.uid()
  );

  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    related_product_id
  ) values (
    auth.uid(),
    'STOCK_ADDED',
    'Stock updated',
    p_quantity || ' units adjusted for ' || v_product.name || ' (New stock: ' || v_new_stock || ').',
    p_product_id
  );

  return jsonb_build_object(
    'productId', p_product_id,
    'previousStock', v_product.stock_quantity,
    'newStock', v_new_stock,
    'adjustment', p_quantity
  );
end;
$$;

-- ==========================================================
-- 13. SEED DEFAULT DATA
-- ==========================================================

insert into public.categories (id, name)
values 
  ('11111111-1111-1111-1111-111111111101', 'Grocery'),
  ('11111111-1111-1111-1111-111111111102', 'Snacks'),
  ('11111111-1111-1111-1111-111111111103', 'Beverages'),
  ('11111111-1111-1111-1111-111111111104', 'Household'),
  ('11111111-1111-1111-1111-111111111105', 'Personal Care')
on conflict (name) do nothing;

insert into public.products (
  id, name, sku, category_id, description, cost_price, selling_price, stock_quantity, minimum_stock, is_active
)
values
  ('22222222-2222-2222-2222-222222222201', 'Palakkadan Matta Rice 5kg', 'MM-001', (select id from public.categories where name = 'Grocery'), 'Premium quality Kerala double boiled red rice', 310.00, 360.00, 28, 10, true),
  ('22222222-2222-2222-2222-222222222202', 'Kera Pure Coconut Oil 1L', 'MM-002', (select id from public.categories where name = 'Grocery'), '100% pure roasted coconut oil', 185.00, 230.00, 14, 8, true),
  ('22222222-2222-2222-2222-222222222203', 'Kerala Nendran Banana Chips 250g', 'MM-003', (select id from public.categories where name = 'Snacks'), 'Crispy golden banana chips fried in pure coconut oil', 65.00, 90.00, 35, 12, true),
  ('22222222-2222-2222-2222-222222222204', 'AVT Premium Dust Tea 500g', 'MM-004', (select id from public.categories where name = 'Beverages'), 'Strong South Indian blend tea', 155.00, 190.00, 18, 6, true),
  ('22222222-2222-2222-2222-222222222205', 'Milma Homogenised Milk 500ml', 'MM-005', (select id from public.categories where name = 'Beverages'), 'Fresh pasteurised toned milk', 24.00, 28.00, 40, 15, true),
  ('22222222-2222-2222-2222-222222222206', 'Maggi 2-Minute Noodles 280g', 'MM-006', (select id from public.categories where name = 'Snacks'), 'Family 4-pack instant noodles', 52.00, 60.00, 7, 10, true),
  ('22222222-2222-2222-2222-222222222207', 'Nirapara Roasted Rice Powder 1kg', 'MM-007', (select id from public.categories where name = 'Grocery'), 'Traditional Puttu and Idiyappam powder', 60.00, 78.00, 22, 8, true),
  ('22222222-2222-2222-2222-222222222208', 'Eastern Sambar Powder 100g', 'MM-008', (select id from public.categories where name = 'Grocery'), 'Authentic aromatic spices blend', 32.00, 42.00, 19, 10, true),
  ('22222222-2222-2222-2222-222222222209', 'Parle-G Gold Biscuits 250g', 'MM-009', (select id from public.categories where name = 'Snacks'), 'Classic tea-time glucose biscuits', 22.00, 30.00, 4, 10, true),
  ('22222222-2222-2222-2222-222222222210', 'Medimix Ayurvedic Soap 125g', 'MM-010', (select id from public.categories where name = 'Personal Care'), '18 herbs classic handmade soap', 35.00, 45.00, 16, 5, true),
  ('22222222-2222-2222-2222-222222222211', 'Vim Dishwash Gel 500ml', 'MM-011', (select id from public.categories where name = 'Household'), 'Lemon concentrated dishwashing gel', 88.00, 115.00, 11, 5, true)
on conflict (sku) do nothing;
