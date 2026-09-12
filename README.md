# Mallu Mart - Store Inventory & Revenue Management WebApp

Mallu Mart is a modern, responsive web application designed for retail and grocery store owners and staff to manage live product stock, process sales, track profit margins, and review analytics.

---

## 🚀 Key Features

- **Store Dashboard**: Live KPIs for today's revenue, transactions, monthly turnover, gross profit, inventory value, and real-time payment breakdown (Cash, UPI, Card, Other).
- **Inventory Management**: Real-time stock counters, search by name/SKU, category filters, quick stock replenishment (`+ Stock`), editing, and archival.
- **Sales & Billing**: Itemized POS sale recording with product stock validation, automated invoice generation (`MM-#####`), and receipt lookup.
- **Reports & Analytics**: Sales analysis over customizable date ranges (Today, 7 Days, 30 Days, This Month), top-selling products, and 1-click Excel export.
- **Authentication & Security**:
  - Store Owner & Staff role support.
  - Sign in, account registration, and forgot password recovery flow.
  - In-app password updates and dedicated reset password page.
- **Supabase Cloud Backend**:
  - PostgreSQL schema with Row Level Security (RLS).
  - ACID atomic transactions with row locking (`record_sale`, `adjust_stock`).
  - Automated user profile provisioning trigger (`handle_new_user`).
  - Real-time synchronization across devices.
  - Seamless offline / Demo mode fallback when credentials are not configured.

---

## 📁 Repository Structure

```
├── frontend/                     # Next.js 16 (App Router) frontend application
│   ├── src/
│   │   ├── app/                  # Pages: dashboard, inventory, sales, reports, categories, settings, login, reset-password
│   │   ├── components/           # UI Shell and modular components
│   │   └── lib/
│   │       ├── store/            # Unified dual-mode store provider (Supabase live + Demo fallback)
│   │       ├── supabase/         # Supabase client, server, and service modules (auth, products, sales, etc.)
│   │       ├── report-export.ts  # Excel (.xlsx) export utility
│   │       └── types.ts          # TypeScript domain models
│   ├── supabase/
│   │   ├── 000_full_setup.sql    # All-in-one setup SQL script (tables, RLS, RPCs, seed data)
│   │   └── migrations/           # Individual migration and seed files
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

*(Note: If no Supabase credentials are provided, the app will run automatically in Demo Mode using browser local storage).*

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).
