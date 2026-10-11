# Mallu Mart - Fresh Supabase Deployment Plan

Written for: the person setting up the new Supabase project and deploying the app.

This plan assumes a **brand-new, empty Supabase project**. Nothing needs upgrading, and no existing accounts exist to review.

---

## 0. What you need to hand over (once the project exists)

Only these two values are needed. Do **not** share the `service_role` key or the database password in chat.

| Value | Where to find it | Used for |
| :--- | :--- | :--- |
| Project URL (`https://<ref>.supabase.co`) | Project Settings → API | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable / anon key | Project Settings → API → `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Production site URL (optional, once deployed) | Your hosting provider | Auth redirect URLs |

Safe to share: the URL and the anon/publishable key. The app is designed for that key to be public, because Row Level Security protects the data.

---

## 1. Create the project

- [ ] Create the project (name e.g. `mallu-mart`), choose a strong database password and the **South Asia (Mumbai)** region.
- [ ] Wait for provisioning to finish.
- [ ] Store the database password in a password manager. It is not needed by the app.

---

## 2. Configure Authentication (Dashboard → Authentication)

- [ ] **Providers → Email**: enable Email. Keep **Confirm email** ON.
- [ ] **Providers → Email → Minimum password length**: set to **8** to match the app.
- [ ] **URL Configuration**:
  - Site URL: your production URL (or `http://localhost:3000` while testing).
  - Redirect URLs: add `http://localhost:3000/reset-password`, and `https://<your-domain>/reset-password` once deployed.
  - Without these the password-reset link will not return to the app.
- [ ] **Email templates → Reset password**: check the link points to the site URL and reads well. Optional: customise the wording to "Mallu Mart".
- [ ] **SMTP**: the built-in mailer is limited (a few emails per hour) and is for testing only. Before real use, configure custom SMTP (e.g. Resend, SendGrid, or Gmail app password) under **Project Settings → Auth → SMTP**.
- [ ] **Sign-ups**: leave "Allow new users to sign up" ON for the **first** owner registration. Turn it OFF after the team is set up (see §6).

---

## 3. Run the database script (SQL Editor)

- [ ] Open **SQL Editor → New query**.
- [ ] Paste the entire contents of `frontend/supabase/000_full_setup.sql` and click **Run**.
- [ ] Expect `Success. No rows returned`. If an error appears, copy the full message (including the line number) and send it back; do not re-run partial pieces.
- [ ] Optional demo products: run `frontend/supabase/migrations/002_seed_data.sql` **only** if you want sample data. Skip it for a real store.
- [ ] **Whenever `000_full_setup.sql` changes in the repo, re-run it.** It is safe to re-run and keeps existing data. The app and the database must be on the same version; for example, new app code that calls `get_products()` shows no products until the script has been re-run.
- [ ] Run `frontend/supabase/tests/smoke_test.sql` in the SQL Editor (when nobody is billing). Every row should show `passed = true` (about 70 rows).

What the script creates (for reference):

| Object | Purpose |
| :--- | :--- |
| Tables `profiles`, `categories`, `products`, `sales`, `sale_items`, `inventory_movements`, `notifications` | Core data |
| `sale_invoice_seq` | Sequential invoices `MM-000001`, … |
| `is_store_member()`, `is_store_owner()` | Access checks used by every policy |
| `handle_new_user` trigger | First sign-up becomes approved owner; later sign-ups become pending staff |
| `record_sale`, `adjust_stock` | Atomic sales and stock changes (owners and staff, with limits) |
| `delete_category`, `set_member_access` | Owner-only category delete and team approval |
| RLS policies and column-level grants | Clients can't write sales, stock totals or the audit log directly |
| `supabase_realtime` publication | Live updates for products, categories, sales, movements, notifications, profiles |

---

## 4. Verify the database (SQL Editor, read-only checks)

Run these after §3. Each should return what is described.

- [ ] Tables exist: `select table_name from information_schema.tables where table_schema='public' order by 1;` → 7 app tables plus none unexpected.
- [ ] RLS on: `select tablename, rowsecurity from pg_tables where schemaname='public';` → `rowsecurity = true` for all 7.
- [ ] Realtime: `select tablename from pg_publication_tables where pubname='supabase_realtime';` → products, categories, sales, inventory_movements, notifications, profiles.
- [ ] Functions exist with security definer: `select proname, prosecdef from pg_proc where pronamespace='public'::regnamespace order by 1;` → `record_sale`, `adjust_stock`, `delete_category`, `set_member_access`, `is_store_member`, `is_store_owner`, `handle_new_user` all `true`.
- [ ] Security advisors: in **Advisors → Security**, review anything listed. Expected acceptable items: none related to missing RLS.

---

## 5. Configure and run the app

- [ ] In `frontend/.env.local` (never commit this file):
  ```env
  NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
  ```
- [ ] `cd frontend` → `npm install` → `npm run build` (must succeed) → `npm run dev`.
- [ ] If deploying (e.g. Vercel): add the same two variables under the project's Environment Variables, then redeploy.

---

## 6. Create the owner and the team (order matters)

1. [ ] **Register the owner first, before sharing the URL with anyone.** Use `/login` → "Register". The first account in the database becomes the approved owner automatically.
2. [ ] Confirm the email, sign in, and check **Settings → Team**: you should be listed as Owner.
3. [ ] Register each staff member. They see a "Waiting for approval" screen.
4. [ ] As owner, open **Settings → Team** and click **Approve as staff** for each person. Their screen unlocks automatically.
5. [ ] Once everyone is in, go to **Authentication → Providers → Email** (or Settings) and turn **Allow new users to sign up** OFF. New people can then only be added through approval (they still need an account, so use "Invite user" under Authentication → Users if you want to pre-create them).

Note: if someone registers before the owner, they become the owner. Avoid this by registering the owner first.

---

## 7. End-to-end smoke test (do this before going live)

Use two browsers: one as owner, one as a staff account.

**Owner**
- [ ] Add a product with opening stock 10, minimum 3. The product appears; **Edit** does not show a stock field you can change.
- [ ] Add the same SKU again → you see "That SKU is already used by another product…".
- [ ] Click **± Stock** → choose "Purchase" +5 → stock becomes 15 and a movement is logged.
- [ ] Choose "Damaged" 2 → stock becomes 13.
- [ ] Choose "Stock count correction" −1 → stock becomes 12.
- [ ] Try to take stock below 0 → blocked with a message.
- [ ] Create, rename and delete a category (delete should work when it has no active products).
- [ ] Archive a product → it disappears from inventory and sales lists; its past sales still appear in Reports.

**Staff**
- [ ] Sees Dashboard, Inventory, Sales, Reports, Categories, Settings (no Team section, no Edit/Archive buttons, no category add/rename/delete).
- [ ] Stock form only offers "Purchase / restock".
- [ ] No **Cost Price** column in Inventory, no **Total Profit** in Reports, no **Gross Profit** on receipts, and the Excel export has no cost/profit columns.
- [ ] Record a sale with 2 products → success message shows invoice like `MM-000001`; stock drops; the Sales list shows the cashier name.
- [ ] Try to sell more than available → blocked with a clear message.

**Realtime (both browsers open)**
- [ ] Staff records a sale → owner's dashboard and notifications update without refresh.
- [ ] Owner approves a pending account → that account's screen unlocks without refresh.

**Notifications**
- [ ] Sell a product down to its minimum → low-stock alert appears for owner and staff.
- [ ] Sell it to 0 → out-of-stock alert appears.
- [ ] "Mark all read" and "Clear all" work.

**Auth**
- [ ] Sign out and sign back in.
- [ ] Forgot password → email arrives → link opens `/reset-password` → new password (8+ chars) works.
- [ ] Settings → Change password: wrong current password is rejected; correct one succeeds.
- [ ] A signed-out visit to `/dashboard` redirects to `/login`.

**Sales history & stock history**
- [ ] Sales → change the period (Yesterday, Last month, Custom range) → older receipts appear; search by invoice number finds a single sale.
- [ ] Inventory → **History** on a product → Stock History opens filtered to that product, showing opening stock, purchases, sales and who made each change.

**Reports**
- [ ] Dashboard "Today's revenue" matches the sales made today.
- [ ] Reports → Export Excel opens with Summary, Sales (with Invoice, Cashier), Sale Items (with Category), Inventory, Payments sheets; totals match the screen.

**Workflow features (added later)**
- [ ] **Sale screen:** type part of a name, or scan a barcode, then press Enter. The item is added. A kg product asks for the weight (e.g. 1.25).
- [ ] **Receipt:** after a sale the receipt opens. **Print** prints only the receipt (choose 58 mm or 80 mm), and **WhatsApp** opens a message with the bill.
- [ ] **Refund (owner):** Sales → open a receipt → **Refund / void** → refund part of one item with a reason. Stock goes back up, the receipt shows the refund, and Reports shows net revenue = sales − refunds.
- [ ] **Khata:** sell on **Credit** to a customer. Their balance rises. **Customers → Receive payment** lowers it, and the ledger shows both.
- [ ] **Suppliers and purchase cost (owner):** add a supplier. **± Stock → Purchase** with that supplier and a unit cost, ticking "Make this the new cost price". The cost changes and the Activity Log shows the price change.
- [ ] **Reorder list:** a product at or below its minimum appears in Purchasing with a suggested quantity. **Send order on WhatsApp** lists it.
- [ ] **Cash closing:** at day end, enter the opening float and counted cash. Expected = float + cash sales − cash refunds + khata cash collected. The same day can't be closed twice.
- [ ] **Import:** Inventory → **Import from Excel** → download the template, fill 2 rows (one with a mistake), import. 1 created, 1 reported with its row number.
- [ ] **GST:** Settings → Store details → add your GSTIN. Set a product to 5% GST. Its receipts now show "TAX INVOICE" with CGST/SGST, and Reports shows a GST Summary.
- [ ] **2FA:** Settings → Two-factor authentication → scan the QR code, enter the code. Sign out and in: the app asks for the code, and without it nothing loads.
- [ ] **Staff:** cannot refund, edit suppliers, see purchase costs or the Activity Log.

**Cleanup**
- [ ] Delete test sales only if you truly want a clean start: prefer creating a fresh project over deleting rows, since sales are an audit trail.

---

## 8. Go-live checklist

- [ ] `000_full_setup.sql` run once on the production project; no errors.
- [ ] Owner registered first; team approved; public sign-up turned off.
- [ ] Custom SMTP configured (password reset emails reliable).
- [ ] Redirect URLs include the production `/reset-password`.
- [ ] Environment variables set on the host; app redeployed; `/login` loads.
- [ ] Smoke test §7 passed.
- [ ] Anon key only in the app; no `service_role` key anywhere in the repo or hosting config.
- [ ] Database backups: confirm **Project Settings → Database → Backups** (daily backups are available on paid plans; on the free plan, export regularly).
- [ ] Decide who is owner: the business owner should be the owner account, not a developer's personal account.

---

## 9. Deploy to Vercel

1. [ ] Push the repo to GitHub (the `.env.local` file is git-ignored and must stay that way).
2. [ ] In Vercel: **Add New → Project → Import** the repo.
3. [ ] **Root Directory: `frontend`**. The app is not at the repo root, so this is required. Framework preset: Next.js (auto-detected). Leave build and output settings at their defaults.
4. [ ] **Environment Variables** (Settings → Environment Variables). Add both, ticked for **Production** and **Preview**:

   | Name | Value |
   | :--- | :--- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://zqfaybmshrxebzykcsav.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the same anon/publishable key as in your `.env.local` |

   These are the only two variables the app reads. **Do not add the `service_role` / secret key.** Anything named `NEXT_PUBLIC_*` is built into the browser bundle, which is fine for the anon key and fatal for the secret key.
5. [ ] **Deploy.** `NEXT_PUBLIC_*` values are baked in at build time, so after changing a variable, use **Deployments → Redeploy**.
6. [ ] In **Supabase → Authentication → URL Configuration**:
   - **Site URL**: your production address, e.g. `https://mallu-mart.vercel.app` (or your custom domain).
   - **Redirect URLs**, add:
     - `https://mallu-mart.vercel.app/**` (your production address)
     - `https://*-<your-vercel-team>.vercel.app/**` (so password-reset links work on preview deployments)
     - keep `http://localhost:3000/**` for local development
   - Without this, sign-up confirmation and password-reset emails point at localhost.
7. [ ] Open the production URL → `/login` should show **no** "Supabase is not configured" warning. Sign in as the owner and check that the dashboard loads.
8. [ ] Custom domain (optional): add it in Vercel → Domains, then repeat step 6 with the new domain.

## 10. Known limits to communicate to the client

- Reports, sales history and stock history work for any date range; very large exports (tens of thousands of sales) take a few seconds.
- Category names in reports use each product's **current** category.
- GST assumes prices include GST and sales are within the state (CGST + SGST). There is no IGST, e-invoicing or GSTR filing export.
- Prices are fixed per product: there are no discounts or offers at the till yet.
- The app needs an internet connection; there is no offline billing mode.
- Automated tests cover the database rules (`npm run test:db`, `smoke_test.sql`) and app logic (`npm test`); screens are tested by hand with §7.

## 11. What Claude can check

With the URL and anon key in `frontend/.env.local` on the development machine:
1. Confirm the Supabase project is reachable and the schema matches (read-only checks from §4).
2. Run the production build and lint.
3. Walk through §7 as far as an automated session can, and report what passed and what failed.
4. Report any SQL error exactly as Postgres returns it, with a fix.

The SQL script itself still needs to be pasted into the SQL Editor by you, unless you grant the Supabase connector access to run it.
