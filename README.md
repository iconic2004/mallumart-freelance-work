# Mallu Mart - Store Inventory & Revenue Management WebApp

Mallu Mart is a modern, responsive web application designed for retail and grocery store owners and staff to manage live product stock, process sales, track profit margins, and review analytics.

---

## 🚀 Key Features

- **Dashboard**: today's and this month's revenue, profit (owner), 30-day revenue chart, payment mix, stock alerts.
- **Billing**: product search with barcode-scanner support, weighed goods (kg/L), cash change calculator, Credit (khata) sales, printable 58/80 mm receipts and WhatsApp receipts, sequential invoices (`MM-000123`).
- **Refunds & voids** (owner): partial or full, with reason; stock returned; reports net of refunds.
- **Inventory**: products with unit, barcode, GST rate and HSN; audited stock changes (purchase with supplier and cost, return, damage, count correction); stock history; Excel import.
- **Customers (khata)**: balances, ledger, payments, WhatsApp reminders.
- **Purchasing**: reorder list with suggested quantities and last supplier; supplier directory; WhatsApp/Excel order lists.
- **Cash closing**: per-cashier end-of-day drawer check (expected vs counted).
- **Reports**: any date range, refunds, GST summary (CGST/SGST), top products, categories, payments, Excel export.
- **Security**: owner/staff roles enforced in the database (staff never see costs or profit), owner approval of new accounts, optional two-factor authentication, activity log of every sensitive change, strict browser security headers.
- **Supabase backend**: PostgreSQL with Row Level Security; all money and stock changes through audited, atomic functions; realtime refresh across devices.

---

## 📁 Repository Structure

```
├── frontend/                     # Next.js 16 (App Router) frontend application
│   ├── src/
│   │   ├── app/                  # Pages: dashboard, inventory, sales, reports, categories, settings, login, reset-password
│   │   ├── components/           # UI Shell and modular components
│   │   └── lib/
│   │       ├── store/            # Store provider (Supabase data, realtime, roles)
│   │       ├── supabase/         # Supabase client, server, and service modules (auth, products, sales, etc.)
│   │       ├── report-export.ts  # Excel (.xlsx) export utility
│   │       └── types.ts          # TypeScript domain models
│   ├── supabase/
│   │   ├── 000_full_setup.sql    # All-in-one, re-runnable setup/upgrade script (tables, RLS, functions)
│   │   ├── DEPLOY_PLAN.md        # Step-by-step deployment + hand-test checklist
│   │   ├── tests/                # Database smoke test (+ local PGlite runner)
│   │   └── migrations/           # Optional demo seed data
│   ├── README_SUPABASE.md        # Step-by-step Supabase cloud setup guide
│   └── package.json
└── README.md
```

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure Supabase (Optional for Live Mode)
To connect to your Supabase project, copy `.env.local.example` to `.env.local`:
```bash
cp .env.local.example .env.local
```
Fill in your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
Then run the SQL setup script from `frontend/supabase/000_full_setup.sql` in your Supabase SQL Editor.

Then register the **owner** account first. See `frontend/README_SUPABASE.md` for roles, approvals and upgrading an existing database.

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).
