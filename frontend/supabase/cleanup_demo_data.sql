-- ==========================================================
-- ONE-OFF CLEANUP: remove the demo product, its test sale(s) and the
-- test customer, and rename the owner to "Store Manager".
--
-- Run in the Supabase SQL Editor. Not part of 000_full_setup.sql.
--   1. Run STEP 1 on its own and find the demo product's exact name.
--   2. Put that name in v_product_name in STEP 2, then run STEP 2.
-- STEP 2 is one transaction: if any check fails, nothing is changed.
-- ==========================================================


-- ----------------------------------------------------------
-- STEP 1: preview (read-only)
-- ----------------------------------------------------------

select name, sku, stock_quantity, unit, created_at
from public.products
order by created_at;

select s.invoice_number, s.total_amount, s.payment_method, s.cashier_name, s.created_at,
       (select string_agg(p.name, ', ')
          from public.sale_items si join public.products p on p.id = si.product_id
         where si.sale_id = s.id) as items
from public.sales s
order by s.created_at;

select full_name, role, approved from public.profiles order by created_at;

select c.name, c.phone, c.balance,
       (select count(*) from public.sales s where s.customer_id = c.id) as sales,
       (select count(*) from public.customer_payments cp where cp.customer_id = c.id) as payments
from public.customers c
order by c.created_at;


-- ----------------------------------------------------------
-- STEP 2: delete the demo data and rename the owner
-- ----------------------------------------------------------

do $$
declare
  v_product_name constant text := 'PUT THE DEMO PRODUCT NAME HERE';
  v_customer_name constant text := 'iconic';
  v_new_owner_name constant text := 'Store Manager';

  v_product_id uuid;
  v_customer_id uuid;
  v_matches integer;
  v_sale_ids uuid[];
  v_refund_ids uuid[];
  v_owner_ids uuid[];
begin
  select count(*), min(id::text)::uuid into v_matches, v_product_id
  from public.products
  where lower(name) = lower(trim(v_product_name));

  if v_matches = 0 then
    raise exception 'No product is named "%". Copy the exact name from STEP 1.', v_product_name;
  elsif v_matches > 1 then
    raise exception '% products are named "%". Delete by id instead.', v_matches, v_product_name;
  end if;

  select coalesce(array_agg(distinct sale_id), '{}') into v_sale_ids
  from public.sale_items where product_id = v_product_id;

  -- Never delete a real sale that happens to include the demo product.
  if exists (select 1 from public.sale_items
             where sale_id = any(v_sale_ids) and product_id <> v_product_id) then
    raise exception 'A sale with "%" also contains other products. Nothing was deleted.', v_product_name;
  end if;

  select coalesce(array_agg(id), '{}') into v_refund_ids
  from public.refunds where sale_id = any(v_sale_ids);

  -- Undo what the demo credit (khata) sales added to customer balances.
  update public.customers c
  set balance = c.balance - x.owed
  from (
    select customer_id, sum(total_amount - refunded_amount) as owed
    from public.sales
    where id = any(v_sale_ids) and payment_method = 'Credit' and customer_id is not null
    group by customer_id
  ) x
  where c.id = x.customer_id;

  delete from public.notifications
  where related_product_id = v_product_id or related_sale_id = any(v_sale_ids);

  delete from public.audit_log
  where entity_id = v_product_id::text
     or entity_id = any(array(select unnest(v_sale_ids)::text))
     or entity_id = any(array(select unnest(v_refund_ids)::text));

  -- Cascades to sale_items, refunds and refund_items.
  delete from public.sales where id = any(v_sale_ids);
  -- Cascades to the product's stock movements.
  delete from public.products where id = v_product_id;

  -- With no sales or refunds left, the next invoice starts again at MM-000001.
  if not exists (select 1 from public.sales) then
    perform setval('public.sale_invoice_seq', 1, false);
  end if;
  if not exists (select 1 from public.refunds) then
    perform setval('public.refund_number_seq', 1, false);
  end if;

  if exists (select 1 from public.cash_closings) then
    raise notice 'Day-close records exist. Any made after the demo sale still include its amount.';
  end if;

  raise notice 'Deleted "%" and % sale(s).', v_product_name, coalesce(array_length(v_sale_ids, 1), 0);

  -- Test customer: removed with any khata payments recorded against it.
  select count(*), min(id::text)::uuid into v_matches, v_customer_id
  from public.customers
  where lower(name) = lower(trim(v_customer_name));

  if v_matches = 0 then
    raise exception 'No customer is named "%". Copy the exact name from STEP 1.', v_customer_name;
  elsif v_matches > 1 then
    raise exception '% customers are named "%". Delete by id instead.', v_matches, v_customer_name;
  end if;

  -- Never delete a customer who still has real (non-demo) sales.
  if exists (select 1 from public.sales where customer_id = v_customer_id) then
    raise exception 'Customer "%" has other sales besides the demo one. Nothing was deleted.', v_customer_name;
  end if;

  delete from public.audit_log where entity = 'customer' and entity_id = v_customer_id::text;
  delete from public.customer_payments where customer_id = v_customer_id;
  delete from public.customers where id = v_customer_id;

  raise notice 'Deleted customer "%".', v_customer_name;

  -- Rename the owner everywhere the name is shown or stored.
  select coalesce(array_agg(user_id), '{}') into v_owner_ids
  from public.profiles where role = 'owner';

  update public.profiles set full_name = v_new_owner_name where user_id = any(v_owner_ids);
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_new_owner_name)
  where id = any(v_owner_ids);

  update public.sales set cashier_name = v_new_owner_name where created_by = any(v_owner_ids);
  update public.refunds set created_by_name = v_new_owner_name where created_by = any(v_owner_ids);
  update public.customer_payments set created_by_name = v_new_owner_name where created_by = any(v_owner_ids);
  update public.cash_closings set cashier_name = v_new_owner_name where user_id = any(v_owner_ids);
  update public.audit_log set actor_name = v_new_owner_name where actor_id = any(v_owner_ids);

  raise notice 'Renamed % owner account(s) to "%".', coalesce(array_length(v_owner_ids, 1), 0), v_new_owner_name;
end $$;
