-- ==========================================================
-- MALLU MART SEED DATA
-- Default Categories and Authentic Kerala Grocery Products
-- ==========================================================

-- 1. Insert Default Categories
insert into public.categories (id, name)
values 
  ('11111111-1111-1111-1111-111111111101', 'Grocery'),
  ('11111111-1111-1111-1111-111111111102', 'Snacks'),
  ('11111111-1111-1111-1111-111111111103', 'Beverages'),
  ('11111111-1111-1111-1111-111111111104', 'Household'),
  ('11111111-1111-1111-1111-111111111105', 'Personal Care')
on conflict (name) do nothing;

-- 2. Insert Products
insert into public.products (
  id, name, sku, category_id, description, cost_price, selling_price, stock_quantity, minimum_stock, is_active
)
values
  (
    '22222222-2222-2222-2222-222222222201',
    'Palakkadan Matta Rice 5kg',
    'MM-001',
    (select id from public.categories where name = 'Grocery'),
    'Premium quality Kerala double boiled red rice',
    310.00,
    360.00,
    28,
    10,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222202',
    'Kera Pure Coconut Oil 1L',
    'MM-002',
    (select id from public.categories where name = 'Grocery'),
    '100% pure roasted coconut oil',
    185.00,
    230.00,
    14,
    8,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222203',
    'Kerala Nendran Banana Chips 250g',
    'MM-003',
    (select id from public.categories where name = 'Snacks'),
    'Crispy golden banana chips fried in pure coconut oil',
    65.00,
    90.00,
    35,
    12,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222204',
    'AVT Premium Dust Tea 500g',
    'MM-004',
    (select id from public.categories where name = 'Beverages'),
    'Strong South Indian blend tea',
    155.00,
    190.00,
    18,
    6,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222205',
    'Milma Homogenised Milk 500ml',
    'MM-005',
    (select id from public.categories where name = 'Beverages'),
    'Fresh pasteurised toned milk',
    24.00,
    28.00,
    40,
    15,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222206',
    'Maggi 2-Minute Noodles 280g',
    'MM-006',
    (select id from public.categories where name = 'Snacks'),
    'Family 4-pack instant noodles',
    52.00,
    60.00,
    7,
    10,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222207',
    'Nirapara Roasted Rice Powder 1kg',
    'MM-007',
    (select id from public.categories where name = 'Grocery'),
    'Traditional Puttu and Idiyappam powder',
    60.00,
    78.00,
    22,
    8,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222208',
    'Eastern Sambar Powder 100g',
    'MM-008',
    (select id from public.categories where name = 'Grocery'),
    'Authentic aromatic spices blend',
    32.00,
    42.00,
    19,
    10,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222209',
    'Parle-G Gold Biscuits 250g',
    'MM-009',
    (select id from public.categories where name = 'Snacks'),
    'Classic tea-time glucose biscuits',
    22.00,
    30.00,
    4,
    10,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222210',
    'Medimix Ayurvedic Soap 125g',
    'MM-010',
    (select id from public.categories where name = 'Personal Care'),
    '18 herbs classic handmade soap',
    35.00,
    45.00,
    16,
    5,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222211',
    'Vim Dishwash Gel 500ml',
    'MM-011',
    (select id from public.categories where name = 'Household'),
    'Lemon concentrated dishwashing gel',
    88.00,
    115.00,
    11,
    5,
    true
  )
on conflict (sku) do nothing;
