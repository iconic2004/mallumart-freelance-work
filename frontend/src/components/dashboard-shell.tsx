"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, FormEvent } from "react";
import { useStore } from "@/lib/store/store-provider";
import type {
  DateRange,
  MovementType,
  Page,
  PaymentMethod,
  Product,
  Sale,
  SalesReport,
  StockHistoryEntry,
  StoreSettings,
} from "@/lib/types";
import { exportExcelReport } from "@/lib/report-export";
import { periodRange } from "@/lib/periods";
import { formatQuantity, stockStatus, unitLabels } from "@/lib/validation";
import { signOut, changePassword } from "@/lib/supabase/services/auth";
import {
  BackendBadge,
  ErrorBox,
  Intro,
  Kpi,
  Logo,
  PAGE_SIZE,
  Pager,
  RangePicker,
  Toast,
  dateLabel,
  money,
  money2,
  secondaryButton,
  useDebounced,
  usePaging,
  useRange,
  type ToastFn,
} from "@/components/ui";
import { ProductForm, StockModal, type ProductInput } from "@/components/product-forms";
import { ImportProductsModal } from "@/components/import-products";
import type { StockAdjustment } from "@/lib/supabase/services/products";
import { fetchSaleByInvoice } from "@/lib/supabase/services/sales";
import { SaleModal } from "@/components/sale-modal";
import { ReceiptModal, StatusBadge } from "@/components/receipt";
import { RevenueChart } from "@/components/revenue-chart";
import { SecondFactorPrompt, StoreDetailsForm, TwoFactorSettings } from "@/components/security";
import { Customers } from "@/components/pages/customers";
import { Purchasing } from "@/components/pages/purchasing";
import { CashClosingPage } from "@/components/pages/cash";
import { ActivityLog } from "@/components/pages/activity";
import { fetchAllSales, fetchSalesPage, fetchSalesReport } from "@/lib/supabase/services/sales";
import { fetchStockHistory } from "@/lib/supabase/services/movements";

// [label, path, icon, owner only]
const nav: [string, string, string, boolean][] = [
  ["Dashboard", "/dashboard", "⌂", false],
  ["Inventory", "/inventory", "▦", false],
  ["Sales", "/sales", "↗", false],
  ["Customers", "/customers", "☺", false],
  ["Reports", "/reports", "◔", false],
  ["Stock History", "/stock-history", "⇅", false],
  ["Purchasing", "/purchasing", "⇣", false],
  ["Cash Closing", "/cash", "₹", false],
  ["Categories", "/categories", "≡", false],
  ["Activity Log", "/activity", "◷", true],
  ["Settings", "/settings", "⚙", false],
];
const navFor = (isOwner: boolean) => nav.filter(([, , , ownerOnly]) => isOwner || !ownerOnly);

const payments: PaymentMethod[] = ["Cash", "UPI", "Card", "Other"];
const statusOf = stockStatus;

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6 px-5 py-8 md:px-9 lg:py-10">
      <div className="h-8 w-64 rounded-xl bg-[#e4e9e4]" />
      <div className="h-4 w-48 rounded-lg bg-[#e4e9e4]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-2xl border border-[#e4e9e4] bg-white p-5">
            <div className="h-3 w-24 rounded bg-[#e4e9e4]" />
            <div className="mt-4 h-7 w-32 rounded-lg bg-[#e4e9e4]" />
            <div className="mt-3 h-3 w-20 rounded bg-[#e4e9e4]" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#e4e9e4] bg-white p-5 h-64" />
        <div className="rounded-2xl border border-[#e4e9e4] bg-[#f4f8f3] p-5 h-64" />
      </div>
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  const store = useStore();

  return (
    <aside className="hidden w-[260px] shrink-0 border-r border-[#e4e9e4] bg-[#fbfcfa] px-5 py-7 md:block">
      <Logo />
      <nav className="mt-10 space-y-1">
        {navFor(store.isOwner).map(([label, href, icon]) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
              active === label
                ? "bg-[#e4f2e9] text-[#226b4c] font-semibold"
                : "text-[#718078] hover:bg-[#f0f4ef] hover:text-[#1f2924]"
            }`}
          >
            <span className="w-5 text-center">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      {/* Backend Status Card */}
      <div className="mt-10 rounded-2xl border border-[#e4e9e4] bg-[#f4f8f3] p-4">
        <BackendBadge live={store.isLiveSupabase} />
        <div className="mt-2 text-xs font-semibold text-[#1f2924]">
          {store.isLiveSupabase ? "Cloud Realtime Active" : "Supabase is not configured"}
        </div>
        <div className="mt-1 text-[11px] text-[#718078]">
          {store.isLiveSupabase
            ? `${store.products.length} products synced`
            : "Add your keys to .env.local to load store data"}
        </div>
        {store.userProfile && (
          <div className="mt-3 text-[11px] text-[#718078]">
            Signed in as <b className="text-[#1f2924]">{store.userProfile.role === "owner" ? "Owner" : "Staff"}</b>
          </div>
        )}
      </div>
    </aside>
  );
}

function Header({
  active,
  onSale,
}: {
  active: string;
  onSale: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const router = useRouter();
  const store = useStore();

  const close = () => setOpen(false);

  const logout = async () => {
    await signOut();
    localStorage.removeItem("mallu-mart-username");
    close();
    router.push("/login");
  };

  const unread = store.notifications.filter((notification) => !notification.isRead).length;
  const displayName = store.userProfile?.fullName || "Store Manager";

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#e4e9e4] bg-[#fbfcfa]/95 px-4 py-3 backdrop-blur md:static md:px-9 md:py-4">
        <div className="flex min-w-0 items-center gap-3 md:hidden">
          <button
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e4e9e4] bg-white text-xl text-[#226b4c]"
          >
            {open ? "×" : "☰"}
          </button>
          <div className="min-w-0">
            <Logo />
          </div>
        </div>

        <div className="hidden items-center gap-3 text-sm text-[#87948c] md:flex">
          <span>Workspace</span>
          <span>/</span>
          <span className="font-semibold text-[#1f2924]">{active}</span>

          <span className="ml-3">
            <BackendBadge live={store.isLiveSupabase} />
          </span>
        </div>

        <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Notifications button */}
          <button
            onClick={() => setNotificationsOpen((value) => !value)}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            className="relative rounded-full border border-[#e4e9e4] bg-white p-2.5 text-[#718078] hover:bg-[#f0f4ef]"
          >
            ♧
            {unread > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#d66b55] ring-2 ring-white" />
            )}
          </button>

          {/* New Sale Button */}
          <button
            onClick={onSale}
            className="rounded-xl bg-[#226b4c] px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1a553c] sm:px-4 sm:text-sm"
          >
            + Record sale
          </button>

          {/* User Profile / Logout */}
          <button
            onClick={logout}
            title="Click to logout"
            className="hidden items-center gap-2 rounded-xl border border-[#e4e9e4] bg-white px-3 py-2 text-xs font-medium text-[#718078] hover:bg-[#fff0ed] hover:text-[#c25e4a] sm:flex"
          >
            <span>{displayName}</span>
            <span className="text-[10px] text-[#a0aaa4]">↪</span>
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 top-12 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-[#e4e9e4] bg-white p-4 shadow-2xl">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="font-semibold text-[#1f2924]">Notifications</h2>
                <div className="flex gap-3">
                  {unread > 0 && (
                    <button
                      onClick={() => store.markAllNotificationsAsRead()}
                      className="text-xs font-semibold text-[#226b4c] hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                  {store.notifications.length > 0 && (
                    <button
                      onClick={() => store.clearNotifications()}
                      className="text-xs font-semibold text-[#c25e4a] hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {store.notifications.length === 0 && (
                  <p className="py-8 text-center text-sm text-[#87948c]">You are all caught up.</p>
                )}
                {store.notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => store.markNotificationAsRead(notification.id)}
                    className={`block w-full rounded-xl p-3 text-left transition ${
                      notification.isRead ? "bg-[#fbfcfa]" : "bg-[#f0f6f0] border border-[#d5e7db]"
                    }`}
                  >
                    <div className="flex gap-2.5">
                      <span className="text-base">
                        {notification.type === "SALE_RECORDED"
                          ? "💰"
                          : notification.type === "STOCK_ADDED"
                          ? "📦"
                          : notification.type === "LOW_STOCK"
                          ? "🟠"
                          : "🔴"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-sm text-[#1f2924]">{notification.title}</b>
                        <span className="mt-1 block text-xs text-[#718078]">{notification.message}</span>
                        <small className="mt-1 block text-[10px] text-[#a0aaa4]">
                          {dateLabel(notification.createdAt)}
                        </small>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Drawer */}
      {open && (
        <>
          <button
            aria-label="Close navigation backdrop"
            onClick={close}
            className="fixed inset-0 z-30 bg-[#1f2924]/20 md:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-40 w-[min(82vw,300px)] overflow-y-auto border-r border-[#e4e9e4] bg-[#fbfcfa] px-5 py-6 shadow-2xl md:hidden">
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={close} aria-label="Close navigation" className="text-xl text-[#718078]">
                ×
              </button>
            </div>
            <nav className="mt-8 space-y-1">
              {navFor(store.isOwner).map(([label, href, icon]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                    active === label ? "bg-[#e4f2e9] text-[#226b4c] font-semibold" : "text-[#718078]"
                  }`}
                >
                  <span className="w-5 text-center">{icon}</span>
                  {label}
                </Link>
              ))}
              <button
                onClick={logout}
                className="mt-6 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-[#c25e4a] hover:bg-[#fff0ed]"
              >
                <span className="w-5 text-center">↪</span>
                Logout
              </button>
            </nav>
          </aside>
        </>
      )}
    </>
  );
}

function Dashboard({ username, exportReport, exporting }: { username: string; exportReport: () => void; exporting: boolean }) {
  const { dashboard, inventory, isLiveSupabase, isOwner, dataVersion } = useStore();
  // Recomputed per render would refetch forever; one range per day is enough.
  const [last30Days] = useState(() => periodRange("30-days"));
  const [greeting, setGreetingText] = useState(getTimeGreeting());
  const { today, month, recentSales } = dashboard;
  const monthRevenue = month?.revenue ?? 0;

  useEffect(() => {
    const interval = window.setInterval(() => setGreetingText(getTimeGreeting()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">
            {isLiveSupabase ? "Supabase Live Workspace" : "Offline preview - Supabase not configured"}
          </div>
          <h1 className="display-font text-3xl sm:text-4xl font-bold">
            {greeting}, {username}
            <span className="text-[#226b4c]">.</span>
          </h1>
          <p className="mt-2 text-sm text-[#718078]">
            Your store performance and stock pulse update in real time.
          </p>
        </div>
        <button
          onClick={exportReport}
          disabled={exporting}
          className="w-fit rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm font-semibold text-[#226b4c] shadow-sm hover:bg-[#f0f4ef] disabled:opacity-60"
        >
          {exporting ? "Preparing..." : "Export this month ↓"}
        </button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Today's revenue" value={money(today?.revenue ?? 0)} detail="Calculated from recorded sales" />
        <Kpi label="Transactions today" value={`${today?.salesCount ?? 0}`} detail="Live transactions today" />
        <Kpi label="Monthly revenue" value={money(monthRevenue)} detail="Current month to date" />
        {isOwner ? (
          <Kpi label="Gross profit (month)" value={money(month?.profit ?? 0)} detail="Revenue minus cost price" />
        ) : (
          <Kpi label="Sales this month" value={`${month?.salesCount ?? 0}`} detail="Transactions month to date" />
        )}
      </section>

      <div className="mt-6">
        <RevenueChart range={last30Days} version={dataVersion} title="Revenue, last 30 days" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[#1f2924]">Recent sales</h2>
            <Link href="/sales" className="text-xs font-semibold text-[#226b4c] hover:underline">
              All sales →
            </Link>
          </div>
          <div className="mt-3 divide-y divide-[#f0f4ef]">
            {recentSales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <b className="text-[#1f2924]">{sale.invoiceNumber}</b>
                  <span className="ml-2 rounded-md bg-[#f4f8f3] px-2 py-0.5 text-xs text-[#226b4c]">
                    {sale.paymentMethod}
                  </span>
                  <div className="text-[11px] text-[#87948c] mt-0.5">{dateLabel(sale.createdAt)}</div>
                </div>
                <b className="text-base text-[#1f2924]">{money(sale.totalAmount)}</b>
              </div>
            ))}
            {recentSales.length === 0 && (
              <div className="py-8 text-center text-xs text-[#87948c]">No sales recorded this month yet.</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#e4e9e4] bg-[#f4f8f3] p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">
            Payment method mix <small className="font-normal text-[#718078]">(this month)</small>
          </h2>
          <div className="mt-3 space-y-4">
            {(month?.payments ?? payments.map((method) => ({ method, count: 0, revenue: 0 }))).map((payment) => {
              const percent = monthRevenue ? Math.round((payment.revenue / monthRevenue) * 100) : 0;
              return (
                <div key={payment.method}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-[#1f2924]">{payment.method}</span>
                    <b>
                      {money(payment.revenue)} <small className="font-normal text-[#718078]">({percent}%)</small>
                    </b>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-white overflow-hidden">
                    <div className="h-full rounded-full bg-[#226b4c] transition-all duration-500" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {inventory.inventoryValue !== null ? (
          <Kpi label="Total inventory value" value={money(inventory.inventoryValue)} detail="Cost × current stock" />
        ) : (
          <Kpi label="Products in stock list" value={`${inventory.totalProducts}`} detail="Active products" />
        )}
        <Kpi label="Low stock items" value={`${inventory.lowStock}`} detail="At or below minimum level" />
        <Kpi label="Out of stock" value={`${inventory.outOfStock}`} detail="Requires immediate restock" />
      </div>
    </>
  );
}

function Inventory({ notify, openSale }: { notify: ToastFn; openSale: () => void }) {
  const store = useStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [status, setStatus] = useState("All stock status");
  const [editing, setEditing] = useState<Product>();
  const [adding, setAdding] = useState(false);
  const [stocking, setStocking] = useState<Product>();
  const [importing, setImporting] = useState(false);

  const filtered = store.products.filter(
    (product) =>
      (product.name.toLowerCase().includes(query.toLowerCase()) ||
        product.sku.toLowerCase().includes(query.toLowerCase()) ||
        (product.barcode ?? "").includes(query.trim())) &&
      (category === "All categories" || (product.categoryId ?? "") === category) &&
      (status === "All stock status" || statusOf(product) === status)
  );

  const save = async (data: ProductInput) => {
    const result = editing ? await store.updateProduct(editing.id, data) : await store.createProduct(data);
    if (!result.ok) return result.error || "Failed to save product";
    notify(editing ? "Product updated successfully" : "Product added to inventory");
    setEditing(undefined);
    setAdding(false);
    return undefined;
  };

  const handleStock = async (adjustment: StockAdjustment) => {
    if (!stocking) return undefined;
    const result = await store.adjustStock(stocking.id, adjustment);
    if (!result.ok) return result.error || "Failed to update stock";
    notify(`${stocking.name}: ${adjustment.quantity > 0 ? "+" : ""}${formatQuantity(adjustment.quantity, stocking.unit)}`);
    setStocking(undefined);
    return undefined;
  };

  const handleArchive = async (product: Product) => {
    if (!window.confirm(`Archive ${product.name}? It will disappear from inventory and sales, but past sales stay in reports.`)) return;
    const result = await store.archiveProduct(product.id);
    notify(result.ok ? "Product archived" : result.error || "Failed to archive product");
  };

  return (
    <>
      {store.isOwner ? (
        <Intro
          title="Inventory"
          subtitle="Manage product catalog, live shelf quantities, and restock levels."
          action="Add product"
          onAction={() => setAdding(true)}
        >
          <button onClick={() => setImporting(true)} className={secondaryButton}>
            Import from Excel
          </button>
        </Intro>
      ) : (
        <Intro title="Inventory" subtitle="Live shelf quantities. Record deliveries with the Stock button." />
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products or SKU..."
          className="w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm sm:max-w-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm"
        >
          <option>All categories</option>
          {store.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
          <option value="">Uncategorised</option>
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm"
        >
          <option>All stock status</option>
          <option>In stock</option>
          <option>Low stock</option>
          <option>Out of stock</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#e4e9e4] bg-white shadow-sm">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-[#e4e9e4] bg-[#fbfcfa] text-xs text-[#87948c]">
            <tr>
              <th className="px-5 py-4">Product</th>
              <th>Category</th>
              {store.isOwner && <th>Cost Price</th>}
              <th>Selling Price</th>
              <th>Stock</th>
              <th className="text-right pr-5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f4ef]">
            {filtered.map((product) => (
              <tr key={product.id} className="hover:bg-[#fbfcfa] transition-colors">
                <td className="px-5 py-3.5">
                  <b className="text-[#1f2924]">{product.name}</b>
                  <div className="text-xs text-[#87948c]">{product.sku}</div>
                </td>
                <td>
                  <span className="rounded-md bg-[#f4f8f3] px-2.5 py-1 text-xs font-medium text-[#226b4c]">
                    {product.category}
                  </span>
                </td>
                {store.isOwner && <td className="text-[#718078]">{money2(product.costPrice ?? 0)}</td>}
                <td className="font-semibold text-[#1f2924]">
                  {money2(product.sellingPrice)}
                  {product.unit !== "pcs" && <span className="text-xs font-normal text-[#87948c]"> /{unitLabels[product.unit]}</span>}
                  {product.gstRate > 0 && <div className="text-[11px] font-normal text-[#87948c]">incl. {product.gstRate}% GST</div>}
                </td>
                <td>
                  <div className="font-semibold">
                    {formatQuantity(product.stockQuantity, product.unit)}
                    {product.unit === "pcs" ? " units" : ""}
                  </div>
                  <div
                    className={`text-[11px] font-medium ${
                      product.stockQuantity === 0
                        ? "text-red-500"
                        : product.stockQuantity <= product.minimumStock
                        ? "text-amber-600"
                        : "text-[#4f9568]"
                    }`}
                  >
                    {statusOf(product)}
                  </div>
                </td>
                <td className="space-x-2 pr-5 text-right">
                  <button
                    onClick={() => setStocking(product)}
                    className="rounded-lg border border-[#dfe7df] px-2.5 py-1 text-xs font-semibold text-[#226b4c] hover:bg-[#e4f2e9]"
                  >
                    ± Stock
                  </button>
                  <Link
                    href={`/stock-history?product=${product.id}`}
                    className="rounded-lg border border-[#dfe7df] px-2.5 py-1 text-xs font-semibold text-[#718078] hover:bg-[#f0f4ef]"
                  >
                    History
                  </Link>
                  {store.isOwner && (
                    <>
                      <button
                        onClick={() => setEditing(product)}
                        className="rounded-lg border border-[#dfe7df] px-2.5 py-1 text-xs font-semibold text-[#1f2924] hover:bg-[#f0f4ef]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleArchive(product)}
                        className="rounded-lg border border-[#f2d9d3] px-2.5 py-1 text-xs font-semibold text-[#c25e4a] hover:bg-[#fff0ed]"
                      >
                        Archive
                      </button>
                    </>
                  )}
                  <button
                    onClick={openSale}
                    disabled={product.stockQuantity === 0}
                    className="rounded-lg bg-[#e4f2e9] px-2.5 py-1 text-xs font-semibold text-[#226b4c] hover:bg-[#d5ebd9] disabled:opacity-40"
                  >
                    Sell
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-[#718078]">No products match your criteria.</div>
        )}
      </div>

      {(adding || editing) && (
        <ProductForm
          product={editing}
          categories={store.categories}
          close={() => {
            setAdding(false);
            setEditing(undefined);
          }}
          save={save}
        />
      )}

      {stocking && (
        <StockModal
          product={stocking}
          isOwner={store.isOwner}
          suppliers={store.suppliers}
          close={() => setStocking(undefined)}
          submit={handleStock}
        />
      )}

      {importing && (
        <ImportProductsModal
          close={() => setImporting(false)}
          done={async (message) => {
            await store.refreshData();
            notify(message);
          }}
        />
      )}
    </>
  );
}

async function exportRange(range: DateRange, products: Product[], isOwner: boolean, store: StoreSettings | null) {
  const [report, sales] = await Promise.all([fetchSalesReport(range), fetchAllSales(range)]);
  await exportExcelReport({ range, report, sales, products, isOwner, store });
}

// ---------- Sales ----------

function Sales({ openSale, notify }: { openSale: () => void; notify: ToastFn }) {
  const { dataVersion, isOwner, storeSettings, refundSale } = useStore();
  const rangeState = useRange("7-days");
  const { range } = rangeState;
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim());
  const fromMs = range?.from.getTime() ?? 0;
  const toMs = range?.to.getTime() ?? 0;
  const { page, setPage } = usePaging(`${fromMs}|${toMs}|${query}`);
  const [data, setData] = useState<Page<Sale>>({ total: 0, rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Sale>();

  useEffect(() => {
    if (!fromMs || !toMs) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const result = await fetchSalesPage({
          range: { from: new Date(fromMs), to: new Date(toMs) },
          search: query,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        if (!cancelled) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load sales.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fromMs, toMs, query, page, dataVersion]);

  return (
    <>
      <Intro
        title="Sales"
        subtitle="Every receipt ever recorded. Search by invoice, cashier or customer; open one to print, share or refund."
        action="Record sale"
        onAction={openSale}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <RangePicker state={rangeState} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Invoice, cashier, customer or phone..."
          className="w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm lg:max-w-xs outline-none focus:ring-2 focus:ring-[#b9d8c2]"
        />
      </div>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-2xl border border-[#e4e9e4] bg-white shadow-sm">
        <table className={`w-full min-w-[650px] text-left text-sm ${loading ? "opacity-60" : ""}`}>
          <thead className="border-b border-[#e4e9e4] bg-[#fbfcfa] text-xs text-[#87948c]">
            <tr>
              <th className="px-5 py-4">Invoice</th>
              <th>Date & Time</th>
              <th>Items Sold</th>
              <th>Payment</th>
              <th>Cashier</th>
              <th className="text-right pr-5">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f4ef]">
            {data.rows.map((sale) => (
              <tr key={sale.id} onClick={() => setSelected(sale)} className="cursor-pointer hover:bg-[#fbfcfa] transition-colors">
                <td className="px-5 py-3.5 font-semibold text-[#226b4c]">
                  {sale.invoiceNumber}
                  <StatusBadge status={sale.status} />
                </td>
                <td>{dateLabel(sale.createdAt)}</td>
                <td>{sale.items} items</td>
                <td>
                  <span className="rounded-md bg-[#f4f8f3] px-2 py-0.5 text-xs text-[#226b4c] font-medium">{sale.paymentMethod}</span>
                  {sale.customer && <div className="mt-0.5 text-[11px] text-[#87948c]">{sale.customer.name}</div>}
                </td>
                <td className="text-[#718078]">{sale.cashierName || "-"}</td>
                <td className="pr-5 text-right font-bold text-[#1f2924]">
                  {money2(sale.totalAmount)}
                  {sale.refundedAmount > 0 && (
                    <div className="text-[11px] font-medium text-[#c25e4a]">-{money2(sale.refundedAmount)} refunded</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.rows.length === 0 && (
          <div className="p-12 text-center text-sm text-[#718078]">
            {query ? `No sales match "${query}" in this period.` : "No sales in this period."}
          </div>
        )}
        <Pager page={page} total={data.total} onPage={setPage} />
      </div>

      {selected && (
        <ReceiptModal
          sale={selected}
          store={storeSettings}
          isOwner={isOwner}
          onClose={() => setSelected(undefined)}
          onRefund={async (lines, reason) => {
            const result = await refundSale(selected.id, lines, reason);
            if (!result.ok) return result.error || "Refund failed";
            notify(`Refund recorded for ${selected.invoiceNumber}`);
            const updated = await fetchSaleByInvoice(selected.invoiceNumber).catch(() => null);
            setSelected(updated ?? undefined);
            return undefined;
          }}
        />
      )}
    </>
  );
}

// ---------- Reports ----------

function Reports() {
  const store = useStore();
  const rangeState = useRange("this-month");
  const { range } = rangeState;
  const fromMs = range?.from.getTime() ?? 0;
  const toMs = range?.to.getTime() ?? 0;
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!fromMs || !toMs) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const result = await fetchSalesReport({ from: new Date(fromMs), to: new Date(toMs) });
        if (!cancelled) {
          setReport(result);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fromMs, toMs, store.dataVersion]);

  const exportReport = async () => {
    if (!range) return;
    setExporting(true);
    try {
      await exportRange(range, store.products, store.isOwner, store.storeSettings);
    } catch {
      setError("Unable to export the report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const revenue = report?.revenue ?? 0;
  const count = report?.salesCount ?? 0;
  const showGst = Boolean(store.storeSettings?.gstin) || (report?.tax ?? 0) !== 0;

  return (
    <>
      <Intro
        title="Reports"
        subtitle={
          store.isOwner
            ? "Revenue after refunds, margins, GST, top products and payment channels for any period."
            : "Revenue after refunds, top products and payment channels for any period."
        }
        action={exporting ? "Preparing Excel..." : "Export Excel report"}
        onAction={exportReport}
      />

      <div className="mb-5">
        <RangePicker state={rangeState} />
      </div>

      <ErrorBox message={error} />

      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
        <Kpi
          label="Net Revenue"
          value={money(revenue)}
          detail={
            report?.refunds
              ? `${money(report.grossRevenue)} sales − ${money(report.refunds)} refunds`
              : "Total sales value"
          }
        />
        {store.isOwner ? (
          <Kpi
            label="Total Profit"
            value={money(report?.profit ?? 0)}
            detail={revenue ? `${Math.round(((report?.profit ?? 0) / revenue) * 100)}% margin` : "Revenue minus product cost"}
          />
        ) : (
          <Kpi label="Refunds" value={money(report?.refunds ?? 0)} detail={`${report?.refundCount ?? 0} refunds in this period`} />
        )}
        <Kpi label="Sales Count" value={`${count}`} detail={report?.refundCount ? `${report.refundCount} refunds` : "Transactions"} />
        <Kpi label="Average Ticket" value={money(count ? (report?.grossRevenue ?? 0) / count : 0)} detail="Average sale value" />
      </div>

      <div className="mt-6">
        <RevenueChart range={range} version={store.dataVersion} title="Revenue per day" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">Top Selling Products</h2>
          <div className="mt-3 divide-y divide-[#f0f4ef]">
            {report?.topProducts.map((product) => {
              const unit = store.products.find((item) => item.id === product.productId)?.unit ?? "pcs";
              return (
                <div key={product.productId} className="flex justify-between py-2.5 text-sm">
                  <span>{product.name}</span>
                  <span>
                    <b className="text-[#226b4c]">
                      {formatQuantity(product.units, unit)}
                      {unit === "pcs" ? " units" : ""}
                    </b>
                    <small className="ml-2 text-[#87948c]">{money(product.revenue)}</small>
                  </span>
                </div>
              );
            })}
            {!report?.topProducts.length && <div className="py-6 text-center text-xs text-[#87948c]">No items sold in this period.</div>}
          </div>
        </section>

        <section className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">Payment Breakdown</h2>
          <p className="text-xs text-[#87948c]">After refunds. Credit is billed to customers&apos; khata, not yet collected.</p>
          <div className="mt-2 divide-y divide-[#f0f4ef]">
            {(report?.payments ?? []).map((payment) => (
              <div key={payment.method} className="flex justify-between py-2.5 text-sm">
                <span>
                  {payment.method === "Credit" ? "Credit (khata)" : payment.method}
                  <small className="ml-2 text-[#87948c]">({payment.count} sales)</small>
                </span>
                <b>
                  {money(payment.revenue)}{" "}
                  <small className="font-normal text-[#718078]">({revenue ? Math.round((payment.revenue / revenue) * 100) : 0}%)</small>
                </b>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showGst && (
        <section className="mt-6 overflow-x-auto rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">GST Summary</h2>
          <p className="text-xs text-[#87948c]">Prices include GST. Intra-state split: half CGST, half SGST. Net of refunds in this period.</p>
          <table className="mt-3 w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs text-[#87948c]">
              <tr>
                <th className="py-1.5 font-medium">GST rate</th>
                <th className="py-1.5 text-right font-medium">Taxable value</th>
                <th className="py-1.5 text-right font-medium">CGST</th>
                <th className="py-1.5 text-right font-medium">SGST</th>
                <th className="py-1.5 text-right font-medium">Total GST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f4ef]">
              {(report?.gst ?? []).map((row) => (
                <tr key={row.rate}>
                  <td className="py-2">{row.rate}%</td>
                  <td className="py-2 text-right">{money2(row.taxableValue)}</td>
                  <td className="py-2 text-right">{money2(row.tax / 2)}</td>
                  <td className="py-2 text-right">{money2(row.tax / 2)}</td>
                  <td className="py-2 text-right font-semibold">{money2(row.tax)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{money2((report?.gst ?? []).reduce((sum, row) => sum + row.taxableValue, 0))}</td>
                <td className="py-2 text-right">{money2((report?.tax ?? 0) / 2)}</td>
                <td className="py-2 text-right">{money2((report?.tax ?? 0) / 2)}</td>
                <td className="py-2 text-right">{money2(report?.tax ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {Boolean(report?.categories.length) && (
        <section className="mt-6 rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">Category Performance</h2>
          <div className="mt-3 divide-y divide-[#f0f4ef]">
            {report?.categories.map((category) => (
              <div key={category.name} className="flex justify-between py-2.5 text-sm">
                <b className="text-[#1f2924]">{category.name}</b>
                <b className="text-[#226b4c]">{money(category.revenue)}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ---------- Stock history ----------

const movementTypeLabels: Record<MovementType, string> = {
  purchase: "Purchase",
  sale: "Sale",
  return: "Return",
  damage: "Damage",
  adjustment: "Correction",
};

function StockHistory() {
  const store = useStore();
  const rangeState = useRange("30-days");
  const { range } = rangeState;
  // Inventory rows link here with ?product=<id>.
  const [productId, setProductId] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("product") ?? ""
  );
  const [movementType, setMovementType] = useState<MovementType | "">("");
  const fromMs = range?.from.getTime() ?? 0;
  const toMs = range?.to.getTime() ?? 0;
  const { page, setPage } = usePaging(`${fromMs}|${toMs}|${productId}|${movementType}`);
  const [data, setData] = useState<Page<StockHistoryEntry>>({ total: 0, rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!fromMs || !toMs) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const result = await fetchStockHistory({
          range: { from: new Date(fromMs), to: new Date(toMs) },
          productId,
          movementType,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        if (!cancelled) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load stock history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fromMs, toMs, productId, movementType, page, store.dataVersion]);

  const field = "rounded-xl border border-[#dfe7df] bg-white px-3 py-2.5 text-sm";

  return (
    <>
      <Intro title="Stock History" subtitle="Every change to stock: sales, deliveries, returns, damage and corrections, with who made it." />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className={field} aria-label="Product">
          <option value="">All products</option>
          {store.products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} ({product.sku})
            </option>
          ))}
        </select>
        <select value={movementType} onChange={(e) => setMovementType(e.target.value as MovementType | "")} className={field} aria-label="Change type">
          <option value="">All change types</option>
          {(Object.keys(movementTypeLabels) as MovementType[]).map((type) => (
            <option key={type} value={type}>
              {movementTypeLabels[type]}
            </option>
          ))}
        </select>
        <RangePicker state={rangeState} />
      </div>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-2xl border border-[#e4e9e4] bg-white shadow-sm">
        <table className={`w-full min-w-[760px] text-left text-sm ${loading ? "opacity-60" : ""}`}>
          <thead className="border-b border-[#e4e9e4] bg-[#fbfcfa] text-xs text-[#87948c]">
            <tr>
              <th className="px-5 py-4">Date & Time</th>
              <th>Product</th>
              <th>Type</th>
              <th className="text-right">Change</th>
              <th className="pl-6">Reference / Note</th>
              <th className="pr-5">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f4ef]">
            {data.rows.map((entry) => (
              <tr key={entry.id} className="hover:bg-[#fbfcfa]">
                <td className="px-5 py-3 whitespace-nowrap text-[#718078]">{dateLabel(entry.createdAt)}</td>
                <td>
                  <b className="text-[#1f2924]">{entry.productName}</b>
                  <div className="text-xs text-[#87948c]">
                    {entry.sku}
                    {!entry.productActive && " · archived"}
                  </div>
                </td>
                <td>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      entry.movementType === "damage"
                        ? "bg-[#fff0ed] text-[#c25e4a]"
                        : entry.movementType === "sale"
                        ? "bg-[#eef3fb] text-[#3b5f9a]"
                        : "bg-[#f4f8f3] text-[#226b4c]"
                    }`}
                  >
                    {movementTypeLabels[entry.movementType]}
                  </span>
                </td>
                <td className={`text-right font-bold ${entry.quantity < 0 ? "text-[#c25e4a]" : "text-[#226b4c]"}`}>
                  {entry.quantity > 0 ? "+" : ""}
                  {entry.quantity}
                </td>
                <td className="pl-6 text-[#718078]">{[entry.referenceId, entry.notes].filter(Boolean).join(" · ") || "-"}</td>
                <td className="pr-5 text-[#718078]">{entry.performedBy || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.rows.length === 0 && (
          <div className="p-12 text-center text-sm text-[#718078]">No stock changes match these filters.</div>
        )}
        <Pager page={page} total={data.total} onPage={setPage} />
      </div>
    </>
  );
}

function Categories({ notify }: { notify: ToastFn }) {
  const store = useStore();
  const [name, setName] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAddCategory = async (catName: string) => {
    const trimmed = catName.trim();
    if (!trimmed) {
      notify("Please enter a category name");
      return;
    }

    setSubmitting(true);
    try {
      const res = await store.createCategory(trimmed);
      if (res.ok) {
        setName("");
        setShowModal(false);
        notify("Category added successfully");
      } else {
        notify(res.error || "Failed to add category");
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRename = async (category: { id: string; name: string }) => {
    const next = window.prompt("Rename category:", category.name);
    if (next?.trim() && next.trim() !== category.name) {
      const res = await store.renameCategory(category.id, next.trim());
      if (res.ok) {
        notify("Category renamed successfully");
      } else {
        notify(res.error || "Failed to rename category");
      }
    }
  };

  const handleDelete = async (category: { id: string; name: string }) => {
    if (window.confirm(`Delete category "${category.name}"?`)) {
      const res = await store.deleteCategory(category.id);
      if (res.ok) {
        notify("Category deleted successfully");
      } else {
        notify(res.error || "Failed to delete category");
      }
    }
  };

  return (
    <>
      <Intro
        title="Categories"
        subtitle="Organize your store aisles and product groups."
        action={store.isOwner ? "Add category" : undefined}
        onAction={store.isOwner ? () => setShowModal(true) : undefined}
      />

      {store.isOwner && (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAddCategory(name);
        }}
        className="mb-6 flex gap-2 sm:max-w-md"
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Spices & Condiments"
          disabled={submitting}
          className="w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-[#226b4c] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1a553c] disabled:opacity-50 shrink-0"
        >
          {submitting ? "Adding..." : "Add"}
        </button>
      </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {store.categories.map((category) => (
          <div
            key={category.id}
            className="flex items-center justify-between rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm"
          >
            <div>
              <b className="text-[#1f2924] text-base">{category.name}</b>
              <div className="mt-1 text-xs text-[#87948c]">
                {store.products.filter((product) => product.categoryId === category.id).length} products
              </div>
            </div>
            {store.isOwner && (
            <div className="flex gap-2">
              <button
                onClick={() => handleRename(category)}
                className="rounded-lg border border-[#dfe7df] px-2.5 py-1 text-xs font-semibold text-[#226b4c] hover:bg-[#e4f2e9]"
              >
                Rename
              </button>
              <button
                onClick={() => handleDelete(category)}
                className="rounded-lg border border-[#f2d9d3] px-2.5 py-1 text-xs font-semibold text-[#c25e4a] hover:bg-[#fff0ed]"
              >
                Delete
              </button>
            </div>
            )}
          </div>
        ))}
      </div>

      {store.categories.length === 0 && (
        <div className="rounded-2xl border border-[#e4e9e4] bg-white p-12 text-center text-sm text-[#718078]">
          {store.isOwner
            ? "No categories created yet. Use the form above to add your first aisle or category."
            : "No categories created yet."}
        </div>
      )}

      {showModal && (
        <CategoryModal
          close={() => setShowModal(false)}
          onSubmit={handleAddCategory}
          submitting={submitting}
        />
      )}
    </>
  );
}

function CategoryModal({
  close,
  onSubmit,
  submitting,
}: {
  close: () => void;
  onSubmit: (name: string) => Promise<void>;
  submitting: boolean;
}) {
  const [catName, setCatName] = useState("");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#1f2924]/40 px-5 py-8 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-[#e4e9e4]">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="display-font text-2xl font-bold text-[#1f2924]">Add Category</h2>
            <p className="text-xs text-[#718078] mt-1">Create a new product group or store section</p>
          </div>
          <button
            onClick={close}
            className="h-8 w-8 rounded-full border border-[#e4e9e4] text-lg text-[#718078] hover:bg-[#f0f4ef]"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(catName);
          }}
          className="mt-6 space-y-4"
        >
          <label className="block text-sm font-medium text-[#1f2924]">
            Category Name
            <input
              required
              autoFocus
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Beverages, Bakery, Spices"
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
            />
          </label>

          <div className="mt-8 flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={close}
              className="rounded-xl border border-[#dfe7df] px-4 py-2.5 text-sm font-semibold text-[#718078] hover:bg-[#f0f4ef]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#226b4c] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1a553c] disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Team({ notify }: { notify: ToastFn }) {
  const store = useStore();
  const [busy, setBusy] = useState("");

  const update = async (userId: string, role: "owner" | "staff", approved: boolean, message: string) => {
    setBusy(userId);
    const result = await store.setMemberAccess(userId, role, approved);
    setBusy("");
    notify(result.ok ? message : result.error || "Failed to update access");
  };

  const pending = store.team.filter((member) => !member.approved);

  return (
    <div className="rounded-3xl border border-[#e4e9e4] bg-white p-6 sm:p-8 shadow-sm">
      <div className="border-b border-[#f0f4ef] pb-4">
        <span className="text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">Team & Access</span>
        <h2 className="display-font text-2xl font-bold text-[#1f2924] mt-1">Store team</h2>
        <p className="text-xs text-[#718078] mt-1">
          New sign-ups wait here until you approve them. Staff can sell and receive stock; owners can manage
          everything.
          {pending.length > 0 && <b className="ml-1 text-[#c25e4a]">{pending.length} waiting for approval.</b>}
        </p>
      </div>

      <div className="mt-4 divide-y divide-[#f0f4ef]">
        {store.team.map((member) => {
          const isSelf = member.userId === store.userProfile?.userId;
          return (
            <div key={member.userId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <b className="text-sm text-[#1f2924]">
                  {member.fullName || "Unnamed"} {isSelf && <small className="font-normal text-[#87948c]">(you)</small>}
                </b>
                <div className="text-xs text-[#87948c]">
                  {member.approved ? (member.role === "owner" ? "Owner" : "Staff") : "Pending approval"} · joined{" "}
                  {new Date(member.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </div>
              </div>
              {!isSelf && (
                <div className="flex flex-wrap gap-2">
                  {!member.approved ? (
                    <button
                      disabled={busy === member.userId}
                      onClick={() => update(member.userId, "staff", true, `${member.fullName} approved as staff`)}
                      className="rounded-lg bg-[#226b4c] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1a553c] disabled:opacity-50"
                    >
                      Approve as staff
                    </button>
                  ) : (
                    <button
                      disabled={busy === member.userId}
                      onClick={() => {
                        const role = member.role === "owner" ? "staff" : "owner";
                        if (role === "owner" && !window.confirm(`Give ${member.fullName} full owner access?`)) return;
                        update(member.userId, role, true, `${member.fullName} is now ${role}`);
                      }}
                      className="rounded-lg border border-[#dfe7df] px-3 py-1 text-xs font-semibold text-[#226b4c] hover:bg-[#e4f2e9] disabled:opacity-50"
                    >
                      Make {member.role === "owner" ? "staff" : "owner"}
                    </button>
                  )}
                  {member.approved && (
                    <button
                      disabled={busy === member.userId}
                      onClick={() => {
                        if (window.confirm(`Revoke access for ${member.fullName}? They will no longer see any store data.`)) {
                          update(member.userId, "staff", false, `Access revoked for ${member.fullName}`);
                        }
                      }}
                      className="rounded-lg border border-[#f2d9d3] px-3 py-1 text-xs font-semibold text-[#c25e4a] hover:bg-[#fff0ed] disabled:opacity-50"
                    >
                      Revoke access
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Settings({ notify }: { notify: ToastFn }) {
  const store = useStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState("");

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPassError("");

    if (newPassword.length < 8) {
      setPassError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError("Passwords do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setPassError("New password must be different from the current one.");
      return;
    }

    setPassLoading(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      if (res.error) {
        setPassError(res.error.message);
      } else {
        notify("Password changed successfully!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password.";
      setPassError(msg);
    } finally {
      setPassLoading(false);
    }
  };

  const passwordInput =
    "mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#226b4c] focus:ring-2 focus:ring-[#b9d8c2]";

  return (
    <>
      <Intro
        title="Settings"
        subtitle="Manage your account security, store team, and cloud backend connection."
        action="Refresh Cloud Sync"
        onAction={async () => {
          await store.refreshData();
          notify(store.isLiveSupabase ? "Data refreshed from Supabase" : "Supabase is not configured");
        }}
      />

      <div className="space-y-6">
        <div className="rounded-3xl border border-[#e4e9e4] bg-white p-6 sm:p-8 shadow-sm">
          <div className="border-b border-[#f0f4ef] pb-4">
            <span className="text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">Account Security</span>
            <h2 className="display-font text-2xl font-bold text-[#1f2924] mt-1">Change password</h2>
            <p className="text-xs text-[#718078] mt-1">Confirm your current password to set a new one.</p>
          </div>

          <form onSubmit={handlePasswordChange} className="mt-6 max-w-md space-y-4">
            <label className="block text-sm font-medium text-[#1f2924]">
              Current Password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={passwordInput}
              />
            </label>

            <label className="block text-sm font-medium text-[#1f2924]">
              New Password
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={passwordInput}
              />
            </label>

            <label className="block text-sm font-medium text-[#1f2924]">
              Confirm New Password
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={passwordInput}
              />
            </label>

            {passError && (
              <div className="rounded-xl border border-[#f5c6cb] bg-[#fff0ed] px-3.5 py-2.5 text-xs font-medium text-[#c25e4a]">
                {passError}
              </div>
            )}

            <button
              disabled={passLoading}
              className="rounded-xl bg-[#226b4c] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a553c] disabled:opacity-60"
            >
              {passLoading ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>

        <TwoFactorSettings notify={notify} isOwner={store.isOwner} />

        {store.isOwner && <StoreDetailsForm initial={store.storeSettings} notify={notify} saved={store.refreshData} />}

        {store.isOwner && <Team notify={notify} />}

        <div className="rounded-3xl border border-[#e4e9e4] bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f0f4ef] pb-6">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">
                Backend Infrastructure
              </span>
              <h2 className="display-font text-2xl font-bold text-[#1f2924] mt-1">Supabase Backend Status</h2>
            </div>
            <BackendBadge live={store.isLiveSupabase} />
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-[#1f2924]">Database Architecture</h3>
              <p className="mt-1 text-xs text-[#718078]">
                PostgreSQL schema with Row Level Security (RLS) and stored procedures.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-[#1f2924]">
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">✓</span>
                  <code>public.products</code> ({store.products.length} records)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">✓</span>
                  <code>public.categories</code> ({store.categories.length} records)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">✓</span>
                  <code>public.sales</code> ({store.dashboard.month?.salesCount ?? 0} this month)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">✓</span>
                  <code>public.inventory_movements</code> (Audit trail)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">✓</span>
                  <code>public.profiles</code> (Roles & approvals)
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#1f2924]">Stored Procedures (Atomic Transactions)</h3>
              <p className="mt-1 text-xs text-[#718078]">
                Stock and sales only change server-side, with row locking and role checks.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-[#1f2924]">
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">⚡</span>
                  <code>record_sale()</code> / <code>sales_report()</code>: atomic checkout and server-side reports
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">⚡</span>
                  <code>adjust_stock()</code>: audited restocks, returns, damage & corrections
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">⚡</span>
                  <code>set_member_access()</code>: owner-controlled team approvals
                </li>
              </ul>
            </div>
          </div>

          {!store.isLiveSupabase && (
            <div className="mt-8 rounded-2xl bg-[#f4f8f3] p-5 border border-[#e4e9e4]">
              <h4 className="text-sm font-semibold text-[#226b4c]">How to connect your Supabase Project</h4>
              <ol className="mt-2 list-decimal list-inside space-y-1 text-xs text-[#1f2924]">
                <li>
                  Create a project at{" "}
                  <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline font-semibold">
                    supabase.com
                  </a>
                  .
                </li>
                <li>
                  Open the Supabase <b>SQL Editor</b>, paste <code>frontend/supabase/000_full_setup.sql</code>, and click{" "}
                  <b>Run</b>.
                </li>
                <li>
                  Add your project credentials to <code>frontend/.env.local</code>:
                  <pre className="mt-1.5 rounded-lg bg-white p-2.5 font-mono text-[11px] border border-[#dfe7df]">
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co&#10;NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
                  </pre>
                </li>
                <li>Restart your dev server, then register the owner account first.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SecondFactorScreen() {
  const store = useStore();
  const router = useRouter();

  return (
    <main className="app-grid flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-[460px] rounded-3xl border border-[#e4e9e4] bg-[#fbfcfa] p-8 shadow-[0_20px_60px_rgba(31,41,36,.08)]">
        <Logo />
        <h1 className="display-font mt-8 text-2xl font-bold">Two-factor check</h1>
        <div className="mt-4">
          <SecondFactorPrompt
            onVerified={() => store.refreshData()}
            onSignOut={async () => {
              await signOut();
              router.push("/login");
            }}
          />
        </div>
      </div>
    </main>
  );
}

function PendingApproval() {
  const store = useStore();
  const router = useRouter();

  const logout = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <main className="app-grid flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-[460px] rounded-3xl border border-[#e4e9e4] bg-[#fbfcfa] p-8 text-center shadow-[0_20px_60px_rgba(31,41,36,.08)]">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="display-font mt-8 text-2xl font-bold">Waiting for approval</h1>
        <p className="mt-3 text-sm text-[#718078]">
          Hi {store.userProfile?.fullName || "there"}, your account has been created. The store owner needs to
          approve it in <b>Settings → Team</b> before you can see store data.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={() => store.refreshData()}
            className="rounded-xl bg-[#226b4c] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a553c]"
          >
            Check again
          </button>
          <button
            onClick={logout}
            className="rounded-xl border border-[#dfe7df] px-4 py-2.5 text-sm font-semibold text-[#718078] hover:bg-[#f0f4ef]"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}

export default function DashboardShell({ active = "Dashboard" }: { active?: string }) {
  const store = useStore();
  const [saleOpen, setSaleOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const username = store.userProfile?.fullName || "Store Manager";

  // Show loading skeleton while initial data loads
  if (store.isLoading) {
    return (
      <div className="app-grid flex min-h-screen">
        <Sidebar active={active} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#e4e9e4] bg-[#fbfcfa]/95 px-4 py-3 backdrop-blur md:static md:px-9 md:py-4">
            <div className="flex items-center gap-3 text-sm text-[#87948c]">
              <span>Loading workspace...</span>
            </div>
          </header>
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (store.isLiveSupabase && store.needsMfa) {
    return <SecondFactorScreen />;
  }

  if (store.isLiveSupabase && store.userProfile && !store.userProfile.approved) {
    return <PendingApproval />;
  }

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const completeSale = async (
    lines: { productId: string; quantity: number }[],
    method: PaymentMethod,
    customerId: string | null
  ) => {
    const result = await store.createSale(lines, method, customerId);
    if (!result.ok) return result.message;
    setSaleOpen(false);
    notify(result.message);
    if (result.invoiceNumber) {
      fetchSaleByInvoice(result.invoiceNumber)
        .then((sale) => setReceiptSale(sale))
        .catch(() => undefined);
    }
    return undefined;
  };

  const exportReport = async () => {
    setExporting(true);
    notify("Preparing report...");
    try {
      await exportRange(periodRange("this-month"), store.products, store.isOwner, store.storeSettings);
      notify("Report exported successfully.");
    } catch {
      notify("Unable to export report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const content =
    active === "Dashboard" ? (
      <Dashboard username={store.userProfile?.fullName || username} exportReport={exportReport} exporting={exporting} />
    ) : active === "Inventory" ? (
      <Inventory notify={notify} openSale={() => setSaleOpen(true)} />
    ) : active === "Sales" ? (
      <Sales openSale={() => setSaleOpen(true)} notify={notify} />
    ) : active === "Reports" ? (
      <Reports />
    ) : active === "Stock History" ? (
      <StockHistory />
    ) : active === "Categories" ? (
      <Categories notify={notify} />
    ) : active === "Customers" ? (
      <Customers notify={notify} />
    ) : active === "Purchasing" ? (
      <Purchasing notify={notify} />
    ) : active === "Cash Closing" ? (
      <CashClosingPage notify={notify} />
    ) : active === "Activity Log" ? (
      store.isOwner ? <ActivityLog /> : <p className="text-sm text-[#718078]">Only the store owner can view the activity log.</p>
    ) : (
      <Settings notify={notify} />
    );

  return (
    <div className="app-grid flex min-h-screen">
      <Sidebar active={active} />
      <div className="min-w-0 flex-1">
        <Header active={active} onSale={() => setSaleOpen(true)} />
        <main className="mx-auto max-w-[1400px] px-5 py-8 md:px-9 lg:py-10">{content}</main>
      </div>

      {saleOpen && (
        <SaleModal
          products={store.products}
          close={() => setSaleOpen(false)}
          complete={completeSale}
        />
      )}
      {receiptSale && (
        <ReceiptModal sale={receiptSale} store={store.storeSettings} isOwner={false} onClose={() => setReceiptSale(null)} />
      )}
      <Toast message={notice} />
    </div>
  );
}
