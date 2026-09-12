-- ==========================================================
-- MALLU MART - CLEAR ALL DUMMY / SEED DATA FROM SUPABASE
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/abagsbcrttioenullxyw/sql)
-- to wipe sample records while preserving your schema, triggers, and RLS policies.
-- ==========================================================

-- 1. Clear sales, transactions, movements, and notifications
truncate table public.sale_items cascade;
truncate table public.sales cascade;
truncate table public.inventory_movements cascade;
truncate table public.notifications cascade;

-- 2. Clear dummy products
truncate table public.products cascade;

-- 3. (Optional) Clear sample categories if you want to create your own from scratch:
-- truncate table public.categories cascade;
