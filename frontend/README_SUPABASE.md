# Mallu Mart - Supabase Backend Guide

How the database is set up, who can do what, and how to test it.

---

## 1. Setup and upgrades

1. **SQL Editor → New query**: paste all of [`supabase/000_full_setup.sql`](./supabase/000_full_setup.sql) and click **Run**.
   - Safe to re-run. It also **upgrades an existing Mallu Mart database in place** without deleting data.
   - Re-run it every time the file changes in the repo. The app and the database must be on the same version.
2. Optional demo products: [`supabase/migrations/002_seed_data.sql`](./supabase/migrations/002_seed_data.sql).
3. `frontend/.env.local` (never committed):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```
4. `npm install`, then `npm run dev`.

Recommended Supabase settings:
- **Authentication → Providers → Email**: Confirm email ON, minimum password length 8.
- **Authentication → Multi-Factor**: TOTP (authenticator app) enabled. It is on by default.
- **Authentication → Attack Protection**: enable *Leaked password protection* (blocks passwords found in data breaches; Pro plan).
- Turn **Allow new users to sign up** off once the team has joined; add people later with *Invite user*.

---

## 2. Roles

| Who | How they get access | What they can do |
| :--- | :--- | :--- |
| **Owner** | The first account ever registered; others can be promoted in Settings → Team. | Everything: products and prices, refunds, suppliers and purchase costs, categories, team, store details, imports, activity log, all cash closings. |
| **Staff** | Registers, then an owner approves them in Settings → Team. | Sell (including credit/khata), receive deliveries, add customers and record their payments, close their own cash drawer, view stock, sales, reports and stock history. **Never sees cost prices, purchase costs or profit.** |
| **Pending** | Any sign-up not yet approved. | Nothing. A "waiting for approval" screen; the database returns no data. |

**Two-factor authentication:** anyone can switch it on in Settings. Once it's on, the database gives that account no access until the 6-digit code has been entered, even with the correct password. The app asks for the code right after sign-in.

---

## 3. What the database enforces

Clients (the browser) can only:
- read their own profile (owners: every profile), categories, their notifications and the change feed;
- create/rename categories and create/edit products (owners; **stock can't be edited directly**);
- mark notifications read and delete them.

Everything else goes through functions that check the caller's role:

| Area | Functions |
| :--- | :--- |
| Selling | `record_sale(items, method, customer)`: atomic; locks stock rows; whole numbers for pieces, up to 3 decimals for kg/L; GST from the product's rate (prices include GST); Credit needs a customer and adds to their khata. |
| Refunds (owner) | `refund_sale(sale, items, reason)`: partial or full void; reason required; returns stock; reduces khata for credit sales; sequential `RF-000001` numbers. |
| Stock | `adjust_stock(...)`: purchase (staff and owner; supplier optional; unit cost and "update cost price" owner only), return, damage, correction (owner). |
| Customers | `save_customer`, `record_customer_payment`, `get_customers`, `get_customer_ledger`. |
| Suppliers | `save_supplier` (owner), `get_suppliers`, `get_reorder_list`. |
| Cash | `get_cash_summary`, `close_cash` (once per person per day), `get_cash_closings`. |
| Reports | `sales_report` (net of refunds, GST by rate), `daily_sales`, `get_sales`, `get_stock_history`. |
| Admin (owner) | `set_member_access`, `delete_category`, `save_store_settings`, `import_products`, `get_audit_log`. |

Cost and profit fields come back as `null` for staff from every read function, so staff can't see margins even by calling the API directly.

**Activity log:** triggers record product creation and edits (price changes show old → new), archiving, imports, category changes, team approvals and role changes, store detail changes, supplier changes, refunds, khata payments and cash closings, with who did it and when.

**Notifications:** low/out-of-stock alerts go to everyone, only when stock crosses the threshold. Sale and stock-change notices go to owners.

**Realtime:** products, sales and stock can't be streamed (clients can't read them), so a trigger writes a tiny row to `store_events` on every change. Open browsers listen to that, plus categories, notifications and profiles, and refetch.

---

## 4. Testing

| Command | What it does |
| :--- | :--- |
| `npm test` | Unit tests for app logic (date ranges, quantities, prices, error messages). |
| `npm run test:db` | Runs `000_full_setup.sql` twice, then [`tests/smoke_test.sql`](./supabase/tests/smoke_test.sql), in an in-memory PostgreSQL (PGlite) with a stand-in for Supabase's auth schema. No network needed. |

On the real project, paste `supabase/tests/smoke_test.sql` into the SQL Editor (when nobody is billing). It creates throwaway owner, staff and pending accounts, runs about 70 permission and workflow checks, returns one row per check, and rolls everything back, including the invoice and refund counters.
