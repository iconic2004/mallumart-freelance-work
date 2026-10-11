-- ==========================================================
-- MALLU MART - DATABASE SMOKE TEST
--
-- Paste into the Supabase SQL Editor and click Run. It returns one row per
-- check with passed = true/false.
--
-- Everything it creates (throwaway accounts, products, sales, refunds,
-- customers, a supplier, a cash closing, log entries...) is rolled back before
-- it finishes, and the invoice/refund counters are restored, so live data is
-- untouched. It also temporarily changes store details inside the rollback.
--
-- Run it when nobody is recording sales (e.g. after closing): a real sale made
-- during the 1-2 seconds it runs could otherwise reuse an invoice number.
--
-- Re-run after every change to 000_full_setup.sql.
-- ==========================================================

create or replace function pg_temp.mallu_mart_smoke_test()
returns table (step integer, check_name text, passed boolean, detail text)
language plpgsql
as $fn$
declare
  t text[] := '{}';
  o boolean[] := '{}';
  d text[] := '{}';
  v_ok boolean;
  v_detail text;
  v_json jsonb;
  v_count integer;
  v_num numeric;
  v_suffix text := substr(md5(random()::text), 1, 8);
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_cat uuid;
  v_prod uuid;
  v_invoice text;
  v_seq_last bigint;
  v_seq_called boolean;
  v_rseq_last bigint;
  v_rseq_called boolean;
  v_prod2 uuid;
  v_supplier uuid;
  v_customer uuid;
  v_sale uuid;
  v_item uuid;
  v_invoice2 text;
  v_invoice3 text;
  v_mfa boolean;
  v_base jsonb;
begin
  select last_value, is_called into v_seq_last, v_seq_called from public.sale_invoice_seq;
  select last_value, is_called into v_rseq_last, v_rseq_called from public.refund_number_seq;

  begin -- everything in this block is rolled back at the end

    -- ---------- Setup (as postgres) ----------
    insert into auth.users (id, email, raw_user_meta_data, aud, role)
    values (v_owner, 'mm-smoke-owner-' || v_suffix || '@example.invalid', '{"full_name":"Smoke Owner"}', 'authenticated', 'authenticated');
    insert into auth.users (id, email, raw_user_meta_data, aud, role)
    values (v_staff, 'mm-smoke-staff-' || v_suffix || '@example.invalid', '{"full_name":"Smoke Staff"}', 'authenticated', 'authenticated');
    insert into auth.users (id, email, raw_user_meta_data, aud, role)
    values (v_stranger, 'mm-smoke-stranger-' || v_suffix || '@example.invalid', '{"full_name":"Smoke Stranger","role":"owner"}', 'authenticated', 'authenticated');

    select count(*) into v_count from public.profiles where user_id in (v_owner, v_staff, v_stranger);
    t := array_append(t, 'Sign-up trigger creates a profile for each new account'); o := array_append(o, (v_count = 3)); d := array_append(d, (v_count || ' of 3 profiles'));

    select count(*) into v_count from public.profiles where user_id = v_stranger and role = 'staff' and not approved;
    t := array_append(t, 'New sign-up is pending staff even when it asks for owner'); o := array_append(o, (v_count = 1)); d := array_append(d, 'stranger requested role=owner in metadata');

    update public.profiles set role = 'owner', approved = true where user_id = v_owner;
    update public.profiles set role = 'staff', approved = true where user_id = v_staff;

    -- ---------- Owner ----------
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    set local role authenticated;

    -- Real sales in the same hour must not skew the report checks: compare to this.
    v_base := public.sales_report(now() - interval '1 hour', now() + interval '1 hour');

    begin
      insert into public.categories (name) values ('Smoke Category ' || v_suffix) returning id into v_cat;
      v_ok := v_cat is not null; v_detail := 'created';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner: create category'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      insert into public.products (name, sku, category_id, cost_price, selling_price, stock_quantity, minimum_stock)
      values ('Smoke Product ' || v_suffix, 'SMOKE-' || v_suffix, v_cat, 5, 8, 10, 3)
      returning id into v_prod;
      v_ok := v_prod is not null; v_detail := 'cost 5, price 8, stock 10, min 3';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner: create product with opening stock'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.get_stock_history(now() - interval '1 hour', now() + interval '1 hour', v_prod);
      v_ok := (v_json->>'total')::int = 1 and v_json->'rows'->0->>'notes' = 'Opening stock';
      v_detail := 'movements: ' || (v_json->>'total');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Opening stock is written to the stock history'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      select (e->>'cost_price')::numeric into v_num from jsonb_array_elements(public.get_products()) e where e->>'id' = v_prod::text;
      v_ok := v_num = 5; v_detail := 'cost_price = ' || coalesce(v_num::text, 'null');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner sees cost price'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      update public.products set stock_quantity = 999 where id = v_prod;
      v_ok := false; v_detail := 'direct stock update succeeded';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner cannot change stock directly (must use adjust_stock)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.adjust_stock(v_prod, 5, 'purchase', 'smoke test');
      v_ok := (v_json->>'newStock')::numeric = 15; v_detail := 'new stock ' || (v_json->>'newStock');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner: purchase +5'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.adjust_stock(v_prod, -2, 'damage', 'smoke test');
      v_ok := (v_json->>'newStock')::numeric = 13; v_detail := 'new stock ' || (v_json->>'newStock');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner: damage -2'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.adjust_stock(v_prod, -100, 'adjustment', 'smoke test');
      v_ok := false; v_detail := 'stock went negative';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Stock cannot go below zero'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.set_member_access(v_owner, 'staff', true);
      v_ok := false; v_detail := 'owner demoted themselves';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner cannot remove their own owner access'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    -- ---------- Staff ----------
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    set local role authenticated;

    begin
      select (e->>'cost_price')::numeric into v_num from jsonb_array_elements(public.get_products()) e where e->>'id' = v_prod::text;
      v_ok := v_num is null; v_detail := 'cost_price = ' || coalesce(v_num::text, 'null');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff do not see cost price'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      select cost_price into v_num from public.products where id = v_prod;
      v_ok := false; v_detail := 'staff read cost_price directly';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot read the products table directly'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      select count(*) into v_count from public.sales;
      v_ok := false; v_detail := 'staff read sales directly';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot read the sales table directly'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      insert into public.products (name, sku, cost_price, selling_price) values ('Staff product', 'STAFF-' || v_suffix, 1, 2);
      v_ok := false; v_detail := 'staff created a product';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot create products'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.adjust_stock(v_prod, -1, 'damage', 'smoke test');
      v_ok := false; v_detail := 'staff recorded damage';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot record damage or corrections'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.adjust_stock(v_prod, 2, 'purchase', 'smoke test');
      v_ok := (v_json->>'newStock')::numeric = 15; v_detail := 'new stock ' || (v_json->>'newStock');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff: purchase +2'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.record_sale(jsonb_build_array(jsonb_build_object('productId', v_prod, 'quantity', 4)), 'UPI');
      v_invoice := v_json->>'invoiceNumber';
      v_ok := v_invoice ~ '^MM-[0-9]{6}$' and (v_json->>'totalAmount')::numeric = 32 and v_json->'totalCost' = 'null'::jsonb;
      v_detail := v_json::text;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff: record sale (sequential invoice, total 32, no cost shown)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.record_sale(jsonb_build_array(jsonb_build_object('productId', v_prod, 'quantity', 500)), 'Cash');
      v_ok := false; v_detail := 'oversold';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Cannot sell more than available stock'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.record_sale(jsonb_build_array(jsonb_build_object('productId', v_prod, 'quantity', 1.5)), 'Cash');
      v_ok := false; v_detail := 'fractional quantity accepted';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Sale quantity must be a whole number'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.get_sales(now() - interval '1 hour', now() + interval '1 hour', v_invoice);
      v_ok := (v_json->>'total')::int = 1 and v_json->'rows'->0->'grossProfit' = 'null'::jsonb
              and (v_json->'rows'->0->'items'->0->>'quantity')::numeric = 4;
      v_detail := 'found ' || (v_json->>'total') || ' sale(s)';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff: sales history search by invoice, profit hidden'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.sales_report(now() - interval '1 hour', now() + interval '1 hour');
      v_ok := v_json->'profit' = 'null'::jsonb and (v_json->>'salesCount')::int >= 1;
      v_detail := 'salesCount ' || (v_json->>'salesCount');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff: report shows revenue but hides profit'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.record_sale(jsonb_build_array(jsonb_build_object('productId', v_prod, 'quantity', 9)), 'Cash');
      select count(*) into v_count from public.notifications where related_product_id = v_prod and type = 'LOW_STOCK';
      v_ok := v_count = 1; v_detail := 'stock 11 -> 2 (min 3); low-stock alerts visible to staff: ' || v_count;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Low-stock alert reaches staff when stock crosses the minimum'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      insert into public.sales (invoice_number, total_amount, total_cost, gross_profit, payment_method)
      values ('FAKE-' || v_suffix, 1000, 0, 1000, 'Cash');
      v_ok := false; v_detail := 'fake sale inserted';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Nobody can insert sales directly'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.set_member_access(v_stranger, 'owner', true);
      v_ok := false; v_detail := 'staff changed team access';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot manage the team'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    -- ---------- Pending stranger ----------
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_stranger::text, true);
    set local role authenticated;

    begin
      perform public.get_products();
      v_ok := false; v_detail := 'pending user listed products';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Pending account cannot see products'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      select count(*) into v_count from public.categories;
      v_ok := v_count = 0; v_detail := v_count || ' categories visible';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Pending account sees no categories'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.record_sale(jsonb_build_array(jsonb_build_object('productId', v_prod, 'quantity', 1)), 'Cash');
      v_ok := false; v_detail := 'pending user recorded a sale';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Pending account cannot record sales'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      select count(*) into v_count from public.profiles where user_id = v_stranger;
      v_ok := v_count = 1; v_detail := 'own profile rows: ' || v_count;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Pending account can read its own profile (approval screen)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    -- ---------- Owner again ----------
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    set local role authenticated;

    begin
      v_json := public.get_sales(now() - interval '1 hour', now() + interval '1 hour', v_invoice);
      v_ok := (v_json->'rows'->0->>'grossProfit')::numeric = 12;
      v_detail := 'gross profit ' || coalesce(v_json->'rows'->0->>'grossProfit', 'null');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner sees profit on the sale (4 x (8-5) = 12)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.delete_category(v_cat);
      v_ok := false; v_detail := 'deleted a category with an active product';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Cannot delete a category that has active products'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      update public.products set is_active = false where id = v_prod;
      perform public.delete_category(v_cat);
      v_ok := true; v_detail := 'archived product, then deleted category';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Category with only archived products can be deleted'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.set_member_access(v_stranger, 'staff', true);
      reset role;
      perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', v_stranger::text, true);
      set local role authenticated;
      select count(*) into v_count from public.categories;
      v_ok := public.is_store_member(); v_detail := 'approved; member = ' || public.is_store_member();
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner approval gives a pending account access'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    -- =========================================================
    -- Weighted goods, GST, refunds, khata, suppliers, cash, import, audit, 2FA
    -- =========================================================

    -- ---------- Owner: store details, a kg product, a supplier ----------
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    set local role authenticated;

    begin
      perform public.save_store_settings('Smoke Store', 'Kochi', '9999999999', 'NOT-A-GSTIN', 'Thanks');
      v_ok := false; v_detail := 'invalid GSTIN accepted';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Store details reject an invalid GSTIN'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.save_store_settings('Smoke Store', 'Kochi', '9999999999', '32abcde1234f1z5', 'Thanks');
      v_json := public.get_store_settings();
      v_ok := v_json->>'gstin' = '32ABCDE1234F1Z5' and v_json->>'storeName' = 'Smoke Store';
      v_detail := v_json::text;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner saves store details (GSTIN upper-cased)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      insert into public.products (name, sku, cost_price, selling_price, stock_quantity, minimum_stock, unit, gst_rate)
      values ('Smoke Rice ' || v_suffix, 'SMOKE-KG-' || v_suffix, 40, 60, 10.5, 2, 'kg', 5)
      returning id into v_prod2;
      v_ok := v_prod2 is not null; v_detail := 'kg product, price 60 incl. 5% GST, stock 10.5';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner: create a product sold by weight'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      insert into public.products (name, sku, cost_price, selling_price, stock_quantity, unit)
      values ('Bad pieces ' || v_suffix, 'SMOKE-BAD-' || v_suffix, 1, 2, 2.5, 'pcs');
      v_ok := false; v_detail := 'fractional pieces accepted';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Items sold by the piece cannot hold fractional stock'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.save_supplier(null, 'Smoke Supplier ' || v_suffix, '9876543210', '', 'test');
      v_supplier := (v_json->>'id')::uuid;
      v_ok := v_supplier is not null; v_detail := 'supplier created';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner: add a supplier'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.adjust_stock(v_prod2, 5, 'purchase', 'smoke delivery', v_supplier, 45, true);
      select (e->>'cost_price')::numeric into v_num from jsonb_array_elements(public.get_products()) e where e->>'id' = v_prod2::text;
      v_ok := (v_json->>'newStock')::numeric = 15.5 and v_num = 45;
      v_detail := 'stock ' || (v_json->>'newStock') || ', cost price now ' || v_num;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner: purchase from a supplier updates the cost price'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      update public.products set selling_price = 62 where id = v_prod2;
      update public.products set selling_price = 60 where id = v_prod2;
      v_json := public.get_audit_log(now() - interval '1 hour', now() + interval '1 hour', 100, 0);
      select count(*) into v_count from jsonb_array_elements(v_json->'rows') e
      where e->>'action' = 'product.price_changed' and e->>'entityId' = v_prod2::text;
      v_ok := v_count >= 3; -- two edits + the cost change from the purchase
      v_detail := v_count || ' price changes logged for this product';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Price changes are recorded in the activity log'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    -- ---------- Staff: weighted sale, khata, supplier rules, cash ----------
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    set local role authenticated;

    begin
      perform public.save_supplier(null, 'Staff Supplier ' || v_suffix);
      v_ok := false; v_detail := 'staff created a supplier';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot manage suppliers'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.adjust_stock(v_prod2, 1, 'purchase', 'smoke', v_supplier, 10, false);
      v_ok := false; v_detail := 'staff entered a purchase cost';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot enter purchase costs'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.adjust_stock(v_prod2, 0.5, 'purchase', 'smoke', v_supplier);
      v_ok := (v_json->>'newStock')::numeric = 16; v_detail := 'stock ' || (v_json->>'newStock');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff: record a 0.5 kg delivery from a supplier'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.record_sale(jsonb_build_array(jsonb_build_object('productId', v_prod2, 'quantity', 1.25)), 'Cash');
      v_invoice2 := v_json->>'invoiceNumber';
      v_ok := (v_json->>'totalAmount')::numeric = 75 and (v_json->>'taxAmount')::numeric = 3.57;
      v_detail := 'total ' || (v_json->>'totalAmount') || ', GST ' || (v_json->>'taxAmount');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff: sell 1.25 kg (₹75 incl. ₹3.57 GST at 5%)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.record_sale(jsonb_build_array(jsonb_build_object('productId', v_prod2, 'quantity', 1.2345)), 'Cash');
      v_ok := false; v_detail := '4 decimals accepted';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Weights allow at most 3 decimals'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.save_customer(null, 'Smoke Customer', '98765 43210', 'regular');
      v_customer := (v_json->>'id')::uuid;
      v_ok := v_customer is not null and v_json->>'phone' = '9876543210';
      v_detail := v_json::text;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff: add a khata customer (phone normalised)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.record_sale(jsonb_build_array(jsonb_build_object('productId', v_prod2, 'quantity', 1)), 'Credit');
      v_ok := false; v_detail := 'credit sale without a customer';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'A credit sale needs a customer'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.record_sale(jsonb_build_array(jsonb_build_object('productId', v_prod2, 'quantity', 2)), 'Credit', v_customer);
      v_invoice3 := v_json->>'invoiceNumber';
      v_ok := (v_json->>'customerBalance')::numeric = 120; v_detail := 'balance ' || (v_json->>'customerBalance');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Credit sale adds to the customer balance (₹120)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.record_customer_payment(v_customer, 50, 'Cash', 'part payment');
      v_ok := (v_json->>'balance')::numeric = 70; v_detail := 'balance ' || (v_json->>'balance');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Customer pays ₹50 in cash, balance ₹70'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.get_customer_ledger(v_customer);
      v_ok := (v_json->>'total')::int = 2 and (v_json->'customer'->>'balance')::numeric = 70;
      v_detail := (v_json->>'total') || ' ledger entries';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Customer ledger shows the sale and the payment'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.get_sales(now() - interval '1 hour', now() + interval '1 hour', v_invoice2);
      v_sale := (v_json->'rows'->0->>'id')::uuid;
      v_item := (v_json->'rows'->0->'items'->0->>'id')::uuid;
      perform public.refund_sale(v_sale, null, 'staff tries a refund');
      v_ok := false; v_detail := 'staff refunded a sale';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot refund sales'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.get_cash_summary(now() - interval '1 hour', now() + interval '1 hour', v_owner);
      -- staff always get their own figures, even when asking for someone else
      -- cash: 9 units x 8 (earlier) + 1.25 kg x 60 = 147
      v_ok := (v_json->>'cashSales')::numeric = 147 and (v_json->>'cashCollections')::numeric = 50
              and (v_json->>'creditSales')::numeric = 120;
      v_detail := v_json::text;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cash summary covers their own cash sales and collections'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.close_cash(current_date, now() - interval '1 hour', now() + interval '1 hour', 500, 1000, 'smoke');
      v_ok := (v_json->>'expectedCash')::numeric = 500 + 147 + 50 and (v_json->>'difference')::numeric = 1000 - 697;
      v_detail := v_json::text;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff close their cash drawer (expected = float + sales + collections)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.close_cash(current_date, now() - interval '1 hour', now() + interval '1 hour', 0, 0, 'again');
      v_ok := false; v_detail := 'closed the same day twice';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'The same day cannot be closed twice'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.get_audit_log(now() - interval '1 hour', now() + interval '1 hour');
      v_ok := false; v_detail := 'staff read the activity log';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot read the activity log'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.import_products('[{"name":"x","sku":"y","sellingPrice":"1"}]'::jsonb);
      v_ok := false; v_detail := 'staff imported products';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Staff cannot import products'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    -- ---------- Owner: refunds, reports, import, reorder ----------
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    set local role authenticated;

    begin
      perform public.refund_sale(v_sale, jsonb_build_array(jsonb_build_object('saleItemId', v_item, 'quantity', 0.25)), 'no');
      v_ok := false; v_detail := 'refund without a proper reason';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'A refund needs a reason'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.refund_sale(v_sale, jsonb_build_array(jsonb_build_object('saleItemId', v_item, 'quantity', 0.25)), 'Customer returned part');
      v_ok := (v_json->>'amount')::numeric = 15 and v_json->>'status' = 'partially_refunded'
              and v_json->>'refundNumber' ~ '^RF-[0-9]{6}$';
      v_detail := v_json::text;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner: partial refund of 0.25 kg (₹15)'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.refund_sale(v_sale, jsonb_build_array(jsonb_build_object('saleItemId', v_item, 'quantity', 5)), 'Too much');
      v_ok := false; v_detail := 'refunded more than was sold';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'Cannot refund more than what is left on the sale'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.refund_sale(v_sale, null, 'Void the rest');
      select (e->>'stock_quantity')::numeric into v_num from jsonb_array_elements(public.get_products()) e where e->>'id' = v_prod2::text;
      v_ok := (v_json->>'amount')::numeric = 60 and v_json->>'status' = 'refunded' and v_num = 14;
      v_detail := v_json::text || ' stock ' || v_num;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner: void the rest (₹60), all 1.25 kg back in stock'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      perform public.refund_sale(v_sale, null, 'Again');
      v_ok := false; v_detail := 'refunded a fully refunded sale';
    exception when others then v_ok := true; v_detail := sqlerrm; end;
    t := array_append(t, 'A fully refunded sale cannot be refunded again'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.get_sales(now() - interval '1 hour', now() + interval '1 hour', v_invoice3);
      perform public.refund_sale((v_json->'rows'->0->>'id')::uuid, null, 'Wrong customer');
      v_json := public.get_customer_ledger(v_customer);
      v_ok := (v_json->'customer'->>'balance')::numeric = -50;
      v_detail := 'balance after refunding the credit sale: ' || (v_json->'customer'->>'balance') || ' (advance)';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Refunding a credit sale reduces the customer balance'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.sales_report(now() - interval '1 hour', now() + interval '1 hour');
      -- Test sales: 32 + 72 (0% GST) + 75 + 120 (5% GST) = 299; refunds 15 + 60 + 120 = 195.
      -- Every 5% sale was refunded, so its net GST is 0.
      v_ok := (v_json->>'refunds')::numeric - (v_base->>'refunds')::numeric = 195
              and (v_json->>'grossRevenue')::numeric - (v_base->>'grossRevenue')::numeric = 299
              and (v_json->>'revenue')::numeric = (v_json->>'grossRevenue')::numeric - (v_json->>'refunds')::numeric
              and (v_json->>'tax')::numeric = (v_base->>'tax')::numeric;
      v_detail := 'gross +' || ((v_json->>'grossRevenue')::numeric - (v_base->>'grossRevenue')::numeric)
                  || ', refunds +' || ((v_json->>'refunds')::numeric - (v_base->>'refunds')::numeric)
                  || ', net ' || (v_json->>'revenue');
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Report subtracts refunds (incl. their GST) from sales'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.daily_sales(date_trunc('day', now()), date_trunc('day', now()) + interval '1 day',
                                   current_setting('TimeZone'));
      v_ok := jsonb_array_length(v_json) = 1 and (v_json->0->>'salesCount')::int >= 3;
      v_detail := v_json::text;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Daily sales series for charts'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.import_products(jsonb_build_array(
        jsonb_build_object('name', 'Imported Tea', 'sku', 'imp-' || v_suffix, 'category', 'Imported ' || v_suffix,
                           'sellingPrice', '120', 'costPrice', '100', 'openingStock', '12', 'minimumStock', '20',
                           'unit', 'pcs', 'gstRate', '5'),
        jsonb_build_object('name', 'No price', 'sku', 'imp-bad-' || v_suffix)));
      v_ok := (v_json->>'created')::int = 1 and jsonb_array_length(v_json->'errors') = 1;
      v_detail := v_json::text;
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Import: good rows are created, bad rows are reported'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.get_reorder_list();
      select count(*) into v_count from jsonb_array_elements(v_json) e where e->>'sku' = upper('imp-' || v_suffix)
        and (e->>'suggestedQuantity')::numeric = 28;
      v_ok := v_count = 1; v_detail := 'stock 12 / minimum 20 -> suggest 28';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Reorder list suggests restocking to twice the minimum'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    begin
      v_json := public.get_cash_closings(current_date - 1, current_date + 1);
      v_ok := (v_json->>'total')::int >= 1; v_detail := (v_json->>'total') || ' closing(s) visible to the owner';
    exception when others then v_ok := false; v_detail := sqlerrm; end;
    t := array_append(t, 'Owner sees staff cash closings'); o := array_append(o, v_ok); d := array_append(d, v_detail);

    -- ---------- Two-factor authentication ----------
    reset role;
    begin
      insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
      values (gen_random_uuid(), v_owner, 'smoke', 'totp', 'verified', now(), now());
      v_mfa := true;
    exception when others then
      v_mfa := false; v_detail := sqlerrm;
    end;

    if not v_mfa then
      t := array_append(t, '2FA checks skipped (this editor cannot add test 2FA factors)'); o := array_append(o, true); d := array_append(d, v_detail);
    else
      perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
      perform set_config('request.jwt.claim.sub', v_owner::text, true);
      set local role authenticated;

      begin
        v_ok := not public.is_store_owner() and not public.is_store_member();
        v_detail := 'owner with 2FA on a password-only session: owner = ' || public.is_store_owner();
      exception when others then v_ok := false; v_detail := sqlerrm; end;
      t := array_append(t, '2FA: a password-only session gets no access'); o := array_append(o, v_ok); d := array_append(d, v_detail);

      reset role;
      perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated', 'aal', 'aal2')::text, true);
      set local role authenticated;

      begin
        v_ok := public.is_store_owner(); v_detail := 'owner = ' || public.is_store_owner();
      exception when others then v_ok := false; v_detail := sqlerrm; end;
      t := array_append(t, '2FA: a session that passed the second factor has full access'); o := array_append(o, v_ok); d := array_append(d, v_detail);
    end if;

    raise exception using errcode = 'MMRB0', message = 'rollback smoke test';
  exception
    when sqlstate 'MMRB0' then
      null; -- expected: undo everything above
    when others then
      t := array_append(t, 'Unexpected error (test aborted)'); o := array_append(o, false); d := array_append(d, sqlerrm);
  end;

  -- Put the invoice and refund counters back where they were.
  perform setval('public.sale_invoice_seq', v_seq_last, v_seq_called);
  perform setval('public.refund_number_seq', v_rseq_last, v_rseq_called);

  return query
    select i, t[i], o[i], d[i]
    from generate_subscripts(t, 1) as i
    order by i;
end;
$fn$;

select * from pg_temp.mallu_mart_smoke_test();
