# Mallu Mart - Supabase Backend Setup Guide

This guide walks you through setting up and running the Supabase backend for the **Mallu Mart** Inventory & Revenue Management application.

---

## 1. Quick Setup (Under 3 Minutes)

### Step 1: Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**.
3. Choose your organization, set a project name (e.g., `mallu-mart`), set a database password, and select your preferred region (e.g. `South Asia (Mumbai)`).
4. Click **Create new project** and wait ~1 minute for it to provision.

### Step 2: Run the Database Setup Script
1. In your Supabase project dashboard, navigate to the **SQL Editor** tab (icon looks like `>_` on the left sidebar).
2. Click **+ New query**.
3. Open the file [`frontend/supabase/000_full_setup.sql`](./supabase/000_full_setup.sql) in your editor.
4. Copy the entire content and paste it into the Supabase SQL Editor.
5. Click **Run** (or press `Ctrl+Enter`).
6. You should see `Success. No rows returned` — all tables, RLS policies, indexes, stored procedures, auth triggers, and seed products are now live!

### Step 3: Configure Environment Variables
1. In your Supabase dashboard, go to **Project Settings** (gear icon) -> **API** (or **Data API**).
2. Find:
   - **Project URL** (e.g., `https://xyzcompany.supabase.co`)
   - **Project API Keys** -> `anon` / `public` key
3. In the `frontend` folder, create a file named `.env.local` (copy from `.env.local.example`):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### Step 4: Launch the Application
Run the Next.js development server:
```bash
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## 2. Authentication & First User Setup

1. On the login screen (`/login`), click **Register Store**.
2. Enter:
   - **Full Name**: e.g., `Unnikrishnan Nair`
   - **Role**: `Store Owner / Admin`
   - **Email**: e.g., `owner@mallumart.com`
   - **Password**: your password (minimum 6 characters)
3. Click **Create Store Account**.
4. The database trigger `on_auth_user_created` will automatically populate your profile in `public.profiles` with the `owner` role.

> [!TIP]
> **Disable Email Confirmation for Local Testing**:
> In Supabase Dashboard -> **Authentication** -> **Providers** -> **Email**, toggle off **"Confirm email"** if you want to log in instantly without waiting for an email verification link.

---

## 3. Database Architecture Overview

### Tables

| Table | Description |
| :--- | :--- |
| `public.profiles` | Store owner & staff profiles linked to `auth.users(id)`. Stores full name, role (`owner` or `staff`), store name, and phone. |
| `public.categories` | Product aisle categories (`Grocery`, `Snacks`, `Beverages`, `Household`, `Personal Care`). |
| `public.products` | Product inventory records with SKU, name, cost price, selling price, live stock quantity, and minimum alert thresholds. |
| `public.sales` | Sales transactions header with invoice number (`MM-#####`), total revenue, cost, gross profit, and payment method (`Cash`, `UPI`, `Card`, `Other`). |
| `public.sale_items` | Itemized line items for each sale with quantity, unit prices, and line totals. |
| `public.inventory_movements` | Immutable audit log of all stock changes (`sale`, `purchase`, `adjustment`, `return`, `damage`). |
| `public.notifications` | Real-time system alerts for low stock levels, out-of-stock events, stock additions, and recorded sales. |

---

## 4. Stored Procedures (Atomic Transactions)

### 1. `record_sale(p_items jsonb, p_payment_method text)`
- **Concurrency & Row Locking**: Uses PostgreSQL `FOR UPDATE` row-level locks on product rows to avoid race conditions or overselling.
- **Validation**: Ensures requested quantity is available in stock.
- **Atomic Operations**:
  - Calculates sale totals and gross profit server-side.
  - Inserts the `sales` record with a unique invoice code (e.g. `MM-9A2F1`).
  - Inserts all line items into `sale_items`.
  - Decrements each product's `stock_quantity`.
  - Logs negative quantity movements into `inventory_movements` (type `sale`).
  - Automatically triggers low stock / out-of-stock notifications if threshold is crossed.
- **Rollback**: If any single item lacks stock, the entire transaction rolls back cleanly without partial deduction.

### 2. `adjust_stock(p_product_id uuid, p_quantity integer, p_movement_type text, p_notes text)`
- Locks product row and increments or decrements quantity safely.
- Appends an audit entry in `inventory_movements`.
- Creates a `STOCK_ADDED` notification.

### 3. `handle_new_user()`
- An `AFTER INSERT` trigger on `auth.users` that creates a corresponding profile row in `public.profiles` automatically whenever a user signs up.

---

## 5. Realtime Synchronization

Realtime publication is enabled on:
- `products`
- `categories`
- `sales`
- `inventory_movements`
- `notifications`

The Next.js frontend subscribes to these channels so any sale or stock adjustment made on one device (e.g., POS terminal) automatically updates the dashboard and stock counters on all other staff screens in real time.

---

## 6. Offline / Demo Mode Fallback

If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set, the webapp automatically falls back to an offline **Demo Mode** using browser `localStorage`. This allows designers and clients to preview and interact with the UI without configuring a database.
