"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, FormEvent } from "react";
import { useStore } from "@/lib/store/store-provider";
import type { PaymentMethod, Product, Sale } from "@/lib/types";
import { exportExcelReport, type ReportPeriod } from "@/lib/report-export";
import { signOut, updatePassword } from "@/lib/supabase/services/auth";

const nav = [
  ["Dashboard", "/dashboard"],
  ["Inventory", "/inventory"],
  ["Sales", "/sales"],
  ["Reports", "/reports"],
  ["Categories", "/categories"],
  ["Settings", "/settings"],
];

const payments: PaymentMethod[] = ["Cash", "UPI", "Card", "Other"];
const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
const statusOf = (product: Product) =>
  product.stockQuantity === 0
    ? "Out of stock"
    : product.stockQuantity <= product.minimumStock
    ? "Low stock"
    : "In stock";
const dateLabel = (value: string) =>
  new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

type ToastFn = (message: string) => void;

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#226b4c] text-xl font-bold text-white shadow-sm">
        M
      </div>
      <div>
        <div className="display-font text-lg font-bold leading-none">Mallu Mart</div>
        <div className="mt-1 text-[10px] uppercase tracking-[.18em] text-[#87948c]">Inventory & Revenue</div>
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
        {nav.map(([label, href], index) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
              active === label
                ? "bg-[#e4f2e9] text-[#226b4c] font-semibold"
                : "text-[#718078] hover:bg-[#f0f4ef] hover:text-[#1f2924]"
            }`}
          >
            <span className="w-5 text-center">{["⌂", "▦", "↗", "◔", "≡", "⚙"][index]}</span>
            {label}
          </Link>
        ))}
      </nav>

      {/* Backend Status Card */}
      <div className="mt-10 rounded-2xl border border-[#e4e9e4] bg-[#f4f8f3] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[.15em] text-[#226b4c]">
            {store.isLiveSupabase ? "Supabase Live" : "Demo Workspace"}
          </span>
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              store.isLiveSupabase ? "bg-[#226b4c] animate-pulse" : "bg-amber-500"
            }`}
          />
        </div>
        <div className="mt-2 text-xs font-semibold text-[#1f2924]">
          {store.isLiveSupabase ? "Cloud Realtime Active" : "Local In-Browser Mode"}
        </div>
        <div className="mt-1 text-[11px] text-[#718078]">
          {store.isLiveSupabase
            ? `${store.products.length} products synced`
            : "Connect Supabase in .env.local"}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              store.isLiveSupabase ? "bg-[#226b4c] w-full" : "bg-amber-400 w-[60%]"
            }`}
          />
        </div>
      </div>
    </aside>
  );
}

function Header({
  active,
  onSale,
  onNotify,
}: {
  active: string;
  onSale: () => void;
  onNotify: () => void;
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

          <span
            className={`ml-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              store.isLiveSupabase
                ? "bg-[#e4f2e9] text-[#226b4c]"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                store.isLiveSupabase ? "bg-[#226b4c]" : "bg-amber-500"
              }`}
            />
            {store.isLiveSupabase ? "Supabase Live" : "Demo Mode"}
          </span>
        </div>

        <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Notifications button */}
          <button
            onClick={() => {
              setNotificationsOpen((value) => !value);
              onNotify();
            }}
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
                {unread > 0 && (
                  <button
                    onClick={() => store.markAllNotificationsAsRead()}
                    className="text-xs font-semibold text-[#226b4c] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
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
              {nav.map(([label, href], index) => (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                    active === label ? "bg-[#e4f2e9] text-[#226b4c] font-semibold" : "text-[#718078]"
                  }`}
                >
                  <span className="w-5 text-center">{["⌂", "▦", "↗", "◔", "≡", "⚙"][index]}</span>
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

function Intro({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">
          Mallu Mart workspace
        </div>
        <h1 className="display-font text-3xl sm:text-4xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-[#718078]">{subtitle}</p>
      </div>
      <button
        onClick={onAction}
        className="w-fit rounded-xl bg-[#226b4c] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a553c]"
      >
        + {action}
      </button>
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
      <span className="text-xs font-medium text-[#718078]">{label}</span>
      <div className="display-font mt-3 text-2xl font-bold text-[#1f2924]">{value}</div>
      <div className="mt-2 text-xs text-[#4f9568]">{detail}</div>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return message ? (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-50 rounded-xl bg-[#1f2924] px-4 py-3 text-sm font-medium text-white shadow-xl animate-in fade-in"
    >
      {message}
    </div>
  ) : null;
}

function ProductForm({
  product,
  categories,
  close,
  save,
}: {
  product?: Product;
  categories: string[];
  close: () => void;
  save: (data: Omit<Product, "id" | "isActive">) => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    category: product?.category ?? categories[0] ?? "Grocery",
    costPrice: product?.costPrice ?? 0,
    sellingPrice: product?.sellingPrice ?? 0,
    stockQuantity: product?.stockQuantity ?? 0,
    minimumStock: product?.minimumStock ?? 0,
    description: product?.description ?? "",
  });

  const change = (field: keyof typeof form, value: string) =>
    setForm((current) => ({
      ...current,
      [field]: ["costPrice", "sellingPrice", "stockQuantity", "minimumStock"].includes(field)
        ? Number(value)
        : value,
    }));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#1f2924]/40 px-5 py-8 backdrop-blur-xs">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            form.name &&
            form.sku &&
            [form.costPrice, form.sellingPrice, form.stockQuantity, form.minimumStock].every((v) => v >= 0)
          ) {
            save(form);
          }
        }}
        className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-[#e4e9e4]"
      >
        <div className="flex items-center justify-between border-b pb-4">
          <h2 className="display-font text-2xl font-bold text-[#1f2924]">
            {product ? "Edit product" : "Add product"}
          </h2>
          <button
            type="button"
            onClick={close}
            className="h-8 w-8 rounded-full border border-[#e4e9e4] text-lg text-[#718078] hover:bg-[#f0f4ef]"
          >
            ×
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Product name
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => change("name", e.target.value)}
              placeholder="e.g. Kerala Matta Rice 5kg"
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
            />
          </label>

          <label className="text-sm font-medium">
            SKU Code
            <input
              required
              type="text"
              value={form.sku}
              onChange={(e) => change("sku", e.target.value)}
              placeholder="MM-042"
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
            />
          </label>

          <label className="text-sm font-medium">
            Cost price (₹)
            <input
              required
              min={0}
              type="number"
              value={form.costPrice}
              onChange={(e) => change("costPrice", e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
            />
          </label>

          <label className="text-sm font-medium">
            Selling price (₹)
            <input
              required
              min={0}
              type="number"
              value={form.sellingPrice}
              onChange={(e) => change("sellingPrice", e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
            />
          </label>

          <label className="text-sm font-medium">
            Current stock
            <input
              required
              min={0}
              type="number"
              value={form.stockQuantity}
              onChange={(e) => change("stockQuantity", e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
            />
          </label>

          <label className="text-sm font-medium">
            Minimum alert level
            <input
              required
              min={0}
              type="number"
              value={form.minimumStock}
              onChange={(e) => change("minimumStock", e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
            />
          </label>

          <label className="text-sm font-medium sm:col-span-2">
            Category
            <select
              value={form.category}
              onChange={(e) => change("category", e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-[#dfe7df] px-4 py-2.5 text-sm font-semibold text-[#718078] hover:bg-[#f0f4ef]"
          >
            Cancel
          </button>
          <button className="rounded-xl bg-[#226b4c] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1a553c]">
            {product ? "Save changes" : "Add product"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SaleModal({
  products,
  close,
  complete,
}: {
  products: Product[];
  close: () => void;
  complete: (lines: { productId: string; quantity: number }[], method: PaymentMethod) => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [lines, setLines] = useState<{ productId: string; quantity: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const product = products.find((item) => item.id === productId);

  const add = () => {
    if (!product || quantity < 1) return;
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId);
      return existing
        ? current.map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + quantity } : line))
        : [...current, { productId, quantity }];
    });
    setQuantity(1);
  };

  const total = lines.reduce(
    (sum, line) => sum + (products.find((item) => item.id === line.productId)?.sellingPrice ?? 0) * line.quantity,
    0
  );

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await complete(lines, method);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#1f2924]/40 px-5 py-8 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-[#e4e9e4]">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="display-font text-2xl font-bold text-[#1f2924]">Record sale</h2>
            <p className="text-xs text-[#718078] mt-1">Select items to generate receipt and adjust live stock</p>
          </div>
          <button
            onClick={close}
            className="h-8 w-8 rounded-full border border-[#e4e9e4] text-lg text-[#718078] hover:bg-[#f0f4ef]"
          >
            ×
          </button>
        </div>

        <div className="mt-6 flex gap-2">
          <select
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-[#dfe7df] bg-white px-3 py-2.5 text-sm"
          >
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.stockQuantity} left) - ₹{item.sellingPrice}
              </option>
            ))}
          </select>
          <input
            min={1}
            max={product?.stockQuantity ?? 1}
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
            className="w-20 rounded-xl border border-[#dfe7df] px-3 py-2.5 text-sm text-center"
          />
          <button
            type="button"
            onClick={add}
            className="rounded-xl bg-[#e4f2e9] px-4 text-sm font-semibold text-[#226b4c] hover:bg-[#d2ebd9]"
          >
            Add
          </button>
        </div>

        <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
          {lines.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#dfe7df] p-6 text-center text-xs text-[#87948c]">
              No items added to cart yet.
            </div>
          )}
          {lines.map((line) => {
            const p = products.find((item) => item.id === line.productId);
            return (
              <div key={line.productId} className="flex items-center justify-between rounded-xl bg-[#f4f8f3] px-3 py-2 text-sm">
                <span>
                  <b>{p?.name}</b> × {line.quantity}
                  <small className="ml-2 text-xs text-[#718078]">₹{(p?.sellingPrice ?? 0) * line.quantity}</small>
                </span>
                <button
                  onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))}
                  className="text-xs font-semibold text-[#c25e4a] hover:underline"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <label className="mt-5 block text-sm font-medium">
          Payment method
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-3 py-2.5 text-sm"
          >
            {payments.map((payment) => (
              <option key={payment}>{payment}</option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex items-center justify-between rounded-xl bg-[#f0f6f0] p-4 text-[#1f2924]">
          <span className="font-medium text-sm">Total Sale Value</span>
          <b className="text-xl">{money(total)}</b>
        </div>

        <button
          disabled={!lines.length || submitting}
          onClick={handleConfirm}
          className="mt-6 w-full rounded-xl bg-[#226b4c] px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-[#1a553c] disabled:opacity-50"
        >
          {submitting ? "Processing sale..." : `Confirm sale (${money(total)})`}
        </button>
      </div>
    </div>
  );
}

function Dashboard({ username, exportReport }: { username: string; exportReport: () => void }) {
  const { metrics, sales, paymentBreakdown, isLiveSupabase } = useStore();

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">
            {isLiveSupabase ? "Supabase Live Workspace" : "Local Demo Workspace"}
          </div>
          <h1 className="display-font text-3xl sm:text-4xl font-bold">
            Good morning, {username}
            <span className="text-[#226b4c]">.</span>
          </h1>
          <p className="mt-2 text-sm text-[#718078]">
            Your store performance and stock pulse update in real time.
          </p>
        </div>
        <button
          onClick={exportReport}
          className="w-fit rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm font-semibold text-[#226b4c] shadow-sm hover:bg-[#f0f4ef]"
        >
          Export report ↓
        </button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Today's revenue" value={money(metrics.todayRevenue)} detail="Calculated from recorded sales" />
        <Kpi label="Transactions" value={`${metrics.todayTransactions}`} detail="Live transactions today" />
        <Kpi label="Monthly revenue" value={money(metrics.monthlyRevenue)} detail="Current month to date" />
        <Kpi label="Gross profit" value={money(metrics.grossProfit)} detail="Revenue minus cost price" />
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">Recent sales</h2>
          <div className="mt-3 divide-y divide-[#f0f4ef]">
            {sales.slice(0, 6).map((sale) => (
              <div key={sale.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <b className="text-[#1f2924]">{sale.id}</b>
                  <span className="ml-2 rounded-md bg-[#f4f8f3] px-2 py-0.5 text-xs text-[#226b4c]">
                    {sale.paymentMethod}
                  </span>
                  <div className="text-[11px] text-[#87948c] mt-0.5">{dateLabel(sale.createdAt)}</div>
                </div>
                <b className="text-base text-[#1f2924]">{money(sale.totalAmount)}</b>
              </div>
            ))}
            {sales.length === 0 && (
              <div className="py-8 text-center text-xs text-[#87948c]">No sales recorded yet.</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#e4e9e4] bg-[#f4f8f3] p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">Payment method mix</h2>
          <div className="mt-3 space-y-4">
            {paymentBreakdown.map((payment) => (
              <div key={payment.method}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-[#1f2924]">{payment.method}</span>
                  <b>
                    {money(payment.total)}{" "}
                    <small className="font-normal text-[#718078]">({payment.percent}%)</small>
                  </b>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-white overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#226b4c] transition-all duration-500"
                    style={{ width: `${payment.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Total inventory value" value={money(metrics.inventoryValue)} detail="Cost × current stock" />
        <Kpi label="Low stock items" value={`${metrics.lowStock}`} detail="Below minimum threshold" />
        <Kpi label="Out of stock" value={`${metrics.outOfStock}`} detail="Requires immediate restock" />
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

  const filtered = store.products.filter(
    (product) =>
      (product.name.toLowerCase().includes(query.toLowerCase()) ||
        product.sku.toLowerCase().includes(query.toLowerCase())) &&
      (category === "All categories" || product.category === category) &&
      (status === "All stock status" || statusOf(product) === status)
  );

  const save = async (data: Omit<Product, "id" | "isActive">) => {
    try {
      if (editing) {
        await store.updateProduct(editing.id, data);
        notify("Product updated successfully");
      } else {
        await store.createProduct(data);
        notify("Product added to inventory");
      }
      setEditing(undefined);
      setAdding(false);
    } catch (e) {
      notify("Failed to save product");
    }
  };

  const handleStock = async (product: Product) => {
    const amount = Number(window.prompt(`Add purchase restock for ${product.name}:`, "10"));
    if (amount > 0) {
      await store.addStock(product.id, Math.floor(amount), "Manual restock from dashboard");
      notify(`Added ${amount} units to ${product.name}`);
    }
  };

  const handleArchive = async (product: Product) => {
    if (window.confirm(`Are you sure you want to archive ${product.name}?`)) {
      await store.archiveProduct(product.id);
      notify("Product archived");
    }
  };

  return (
    <>
      <Intro
        title="Inventory"
        subtitle="Manage product catalog, live shelf quantities, and restock levels."
        action="Add product"
        onAction={() => setAdding(true)}
      />

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
            <option key={item.id}>{item.name}</option>
          ))}
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
              <th>Cost Price</th>
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
                <td className="text-[#718078]">{money(product.costPrice)}</td>
                <td className="font-semibold text-[#1f2924]">{money(product.sellingPrice)}</td>
                <td>
                  <div className="font-semibold">{product.stockQuantity} units</div>
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
                    onClick={() => handleStock(product)}
                    className="rounded-lg border border-[#dfe7df] px-2.5 py-1 text-xs font-semibold text-[#226b4c] hover:bg-[#e4f2e9]"
                  >
                    + Stock
                  </button>
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
                  <button
                    onClick={openSale}
                    className="rounded-lg bg-[#e4f2e9] px-2.5 py-1 text-xs font-semibold text-[#226b4c] hover:bg-[#d5ebd9]"
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
          categories={store.categories.map((item) => item.name)}
          close={() => {
            setAdding(false);
            setEditing(undefined);
          }}
          save={save}
        />
      )}
    </>
  );
}

function Sales({ openSale }: { openSale: () => void }) {
  const { sales } = useStore();
  const [selected, setSelected] = useState<Sale>();

  return (
    <>
      <Intro
        title="Sales"
        subtitle="Track completed receipts, invoices, payment breakdowns, and line items."
        action="Record sale"
        onAction={openSale}
      />

      <div className="overflow-x-auto rounded-2xl border border-[#e4e9e4] bg-white shadow-sm">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="border-b border-[#e4e9e4] bg-[#fbfcfa] text-xs text-[#87948c]">
            <tr>
              <th className="px-5 py-4">Sale / Invoice</th>
              <th>Date & Time</th>
              <th>Items Sold</th>
              <th>Payment</th>
              <th className="text-right pr-5">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f4ef]">
            {sales.map((sale) => (
              <tr
                key={sale.id}
                onClick={() => setSelected(sale)}
                className="cursor-pointer hover:bg-[#fbfcfa] transition-colors"
              >
                <td className="px-5 py-3.5 font-semibold text-[#226b4c]">{sale.id}</td>
                <td>{dateLabel(sale.createdAt)}</td>
                <td>{sale.items} items</td>
                <td>
                  <span className="rounded-md bg-[#f4f8f3] px-2 py-0.5 text-xs text-[#226b4c] font-medium">
                    {sale.paymentMethod}
                  </span>
                </td>
                <td className="pr-5 text-right font-bold text-[#1f2924]">{money(sale.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sales.length === 0 && (
          <div className="p-12 text-center text-sm text-[#718078]">No sales records yet.</div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1f2924]/40 px-5 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-[#e4e9e4]">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[.15em] text-[#6a987b]">Sale Receipt</span>
                <h2 className="display-font text-2xl font-bold text-[#1f2924]">{selected.id}</h2>
              </div>
              <button
                onClick={() => setSelected(undefined)}
                className="h-8 w-8 rounded-full border border-[#e4e9e4] text-lg text-[#718078] hover:bg-[#f0f4ef]"
              >
                ×
              </button>
            </div>

            <p className="mt-3 text-xs text-[#718078]">
              {dateLabel(selected.createdAt)} · Paid via{" "}
              <b className="text-[#1f2924]">{selected.paymentMethod}</b>
            </p>

            <div className="mt-4 max-h-56 divide-y divide-[#f0f4ef] overflow-y-auto border-y border-[#f0f4ef]">
              {selected.saleItems.map((item) => (
                <div key={item.id} className="flex justify-between py-2 text-sm">
                  <span>
                    {item.productName} <small className="text-[#87948c]">× {item.quantity}</small>
                  </span>
                  <b>{money(item.totalAmount)}</b>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between text-base font-bold text-[#1f2924]">
              <span>Total Received</span>
              <span>{money(selected.totalAmount)}</span>
            </div>

            <div className="mt-2 flex justify-between text-xs text-[#4f9568]">
              <span>Gross Profit</span>
              <span>{money(selected.grossProfit)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Reports() {
  const { products, sales, paymentBreakdown, metrics } = useStore();
  const [period, setPeriod] = useState<ReportPeriod>("this-month");
  const [exporting, setExporting] = useState(false);

  const total = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const productTotals = sales
    .flatMap((sale) => sale.saleItems)
    .reduce<Record<string, number>>((result, item) => {
      result[item.productName] = (result[item.productName] ?? 0) + item.quantity;
      return result;
    }, {});

  const labels: Record<ReportPeriod, string> = {
    today: "Today",
    "7-days": "Last 7 days",
    "30-days": "Last 30 days",
    "this-month": "This month",
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      await exportExcelReport({
        products,
        sales,
        inventoryValue: metrics.inventoryValue,
        period,
        periodLabel: labels[period],
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Intro
        title="Reports"
        subtitle="Analyze business revenue, margins, top volume products, and settlement channels."
        action={exporting ? "Preparing Excel..." : "Export Excel report"}
        onAction={exportReport}
      />

      <div className="mb-5">
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
          className="rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm"
        >
          <option value="today">Today</option>
          <option value="7-days">Last 7 Days</option>
          <option value="30-days">Last 30 Days</option>
          <option value="this-month">This Month</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Gross Revenue" value={money(total)} detail="Total sales volume" />
        <Kpi
          label="Total Profit"
          value={money(sales.reduce((sum, sale) => sum + sale.grossProfit, 0))}
          detail="Revenue minus product cost"
        />
        <Kpi label="Sales Count" value={`${sales.length}`} detail="Transactions recorded" />
        <Kpi
          label="Average Ticket"
          value={money(sales.length ? total / sales.length : 0)}
          detail="Average sale value"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">Top Selling Products</h2>
          <div className="mt-3 divide-y divide-[#f0f4ef]">
            {Object.entries(productTotals)
              .sort((a, b) => b[1] - a[1])
              .map(([name, units]) => (
                <div key={name} className="flex justify-between py-2.5 text-sm">
                  <span>{name}</span>
                  <b className="text-[#226b4c]">{units} units sold</b>
                </div>
              ))}
            {Object.keys(productTotals).length === 0 && (
              <div className="py-6 text-center text-xs text-[#87948c]">No items sold in this period.</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">Payment Breakdown</h2>
          <div className="mt-3 divide-y divide-[#f0f4ef]">
            {paymentBreakdown.map((payment) => (
              <div key={payment.method} className="flex justify-between py-2.5 text-sm">
                <span>{payment.method}</span>
                <b>
                  {money(payment.total)}{" "}
                  <small className="font-normal text-[#718078]">({payment.percent}%)</small>
                </b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Categories({ notify }: { notify: ToastFn }) {
  const store = useStore();
  const [name, setName] = useState("");

  const add = async () => {
    if (name.trim()) {
      await store.createCategory(name.trim());
      setName("");
      notify("Category added successfully");
    }
  };

  const handleRename = async (category: { id: string; name: string }) => {
    const next = window.prompt("Rename category:", category.name);
    if (next?.trim() && next.trim() !== category.name) {
      await store.renameCategory(category.id, next.trim());
      notify("Category renamed");
    }
  };

  const handleDelete = async (category: { id: string; name: string }) => {
    if (window.confirm(`Delete category "${category.name}"?`)) {
      const ok = await store.deleteCategory(category.id);
      if (ok) {
        notify("Category deleted");
      } else {
        notify("Cannot delete: category has active products.");
      }
    }
  };

  return (
    <>
      <Intro
        title="Categories"
        subtitle="Organize your store aisles, product groups, and department taxes."
        action="Add category"
        onAction={add}
      />

      <div className="mb-6 flex gap-2 sm:max-w-md">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Spices & Condiments"
          className="w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2]"
        />
        <button
          onClick={add}
          className="rounded-xl bg-[#226b4c] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1a553c]"
        >
          Add
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {store.categories.map((category) => (
          <div
            key={category.id}
            className="flex items-center justify-between rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm"
          >
            <div>
              <b className="text-[#1f2924] text-base">{category.name}</b>
              <div className="mt-1 text-xs text-[#87948c]">
                {store.products.filter((product) => product.category === category.name).length} products
              </div>
            </div>
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
          </div>
        ))}
      </div>
    </>
  );
}

function Settings({ notify }: { notify: ToastFn }) {
  const store = useStore();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState("");

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPassError("");

    if (newPassword.length < 6) {
      setPassError("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError("Passwords do not match.");
      return;
    }

    setPassLoading(true);
    try {
      const res = await updatePassword(newPassword);
      if (res.error) {
        setPassError(res.error.message);
      } else {
        notify("Password changed successfully!");
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

  return (
    <>
      <Intro
        title="Settings"
        subtitle="Manage cloud backend connection, workspace settings, security, and credentials."
        action={store.isLiveSupabase ? "Refresh Cloud Sync" : "Reset Demo Data"}
        onAction={async () => {
          if (store.isLiveSupabase) {
            await store.refreshData();
            notify("Data refreshed from Supabase");
          } else {
            store.resetDemo();
            notify("Demo data reset");
          }
        }}
      />

      <div className="space-y-6">
        {/* Change Password / Security Card */}
        <div className="rounded-3xl border border-[#e4e9e4] bg-white p-6 sm:p-8 shadow-sm">
          <div className="border-b border-[#f0f4ef] pb-4">
            <span className="text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">
              Owner Security
            </span>
            <h2 className="display-font text-2xl font-bold text-[#1f2924] mt-1">
              Change Password / Create New Password
            </h2>
            <p className="text-xs text-[#718078] mt-1">
              Update your store owner or staff account login password.
            </p>
          </div>

          <form onSubmit={handlePasswordChange} className="mt-6 max-w-md space-y-4">
            <label className="block text-sm font-medium text-[#1f2924]">
              New Password
              <input
                required
                minLength={6}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="•••••••• (min 6 characters)"
                className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#226b4c] focus:ring-2 focus:ring-[#b9d8c2]"
              />
            </label>

            <label className="block text-sm font-medium text-[#1f2924]">
              Confirm New Password
              <input
                required
                minLength={6}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#226b4c] focus:ring-2 focus:ring-[#b9d8c2]"
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

        {/* Backend Status Card */}
        <div className="rounded-3xl border border-[#e4e9e4] bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f0f4ef] pb-6">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">
                Backend Infrastructure
              </span>
              <h2 className="display-font text-2xl font-bold text-[#1f2924] mt-1">
                Supabase Backend Status
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  store.isLiveSupabase
                    ? "bg-[#e4f2e9] text-[#226b4c]"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    store.isLiveSupabase ? "bg-[#226b4c] animate-pulse" : "bg-amber-500"
                  }`}
                />
                {store.isLiveSupabase ? "Connected (Live Cloud Database)" : "Demo Mode (Local Storage)"}
              </span>
            </div>
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
                  <code>public.sales</code> ({store.sales.length} transactions)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">✓</span>
                  <code>public.inventory_movements</code> (Audit trail)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">✓</span>
                  <code>public.profiles</code> (User roles & store identity)
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#1f2924]">Stored Procedures (Atomic Transactions)</h3>
              <p className="mt-1 text-xs text-[#718078]">
                Transactions executed server-side with product row locking.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-[#1f2924]">
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">⚡</span>
                  <code>record_sale()</code>: atomic checkout, stock deduction & alerts
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">⚡</span>
                  <code>adjust_stock()</code>: safe restocking & movement tracking
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#226b4c]">⚡</span>
                  <code>handle_new_user()</code>: auth user profile provisioning
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 rounded-2xl bg-[#f4f8f3] p-5 border border-[#e4e9e4]">
            <h4 className="text-sm font-semibold text-[#226b4c]">How to connect your Supabase Project</h4>
            <ol className="mt-2 list-decimal list-inside space-y-1 text-xs text-[#1f2924]">
              <li>
                Create a project at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline font-semibold">supabase.com</a>.
              </li>
              <li>
                Open the Supabase <b>SQL Editor</b>, copy the contents of <code>frontend/supabase/000_full_setup.sql</code>, and click <b>Run</b>.
              </li>
              <li>
                Add your project credentials to <code>frontend/.env.local</code>:
                <pre className="mt-1.5 rounded-lg bg-white p-2.5 font-mono text-[11px] border border-[#dfe7df]">
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co&#10;NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
                </pre>
              </li>
              <li>Restart your dev server or reload the page!</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}

export default function DashboardShell({ active = "Dashboard" }: { active?: string }) {
  const store = useStore();
  const [saleOpen, setSaleOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [username, setUsername] = useState("Store Manager");

  useEffect(() => {
    const saved = localStorage.getItem("mallu-mart-username");
    if (saved) setUsername(saved);
  }, []);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const completeSale = async (
    lines: { productId: string; quantity: number }[],
    method: PaymentMethod
  ) => {
    const result = await store.createSale(lines, method);
    if (result.ok) setSaleOpen(false);
    notify(result.message);
  };

  const exportReport = async () => {
    setExporting(true);
    notify("Preparing report...");
    try {
      await exportExcelReport({
        products: store.products,
        sales: store.sales,
        inventoryValue: store.metrics.inventoryValue,
        period: "this-month",
        periodLabel: "Current month",
      });
      notify("Report exported successfully.");
    } catch {
      notify("Unable to export report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const content =
    active === "Dashboard" ? (
      <Dashboard username={store.userProfile?.fullName || username} exportReport={exportReport} />
    ) : active === "Inventory" ? (
      <Inventory notify={notify} openSale={() => setSaleOpen(true)} />
    ) : active === "Sales" ? (
      <Sales openSale={() => setSaleOpen(true)} />
    ) : active === "Reports" ? (
      <Reports />
    ) : active === "Categories" ? (
      <Categories notify={notify} />
    ) : (
      <Settings notify={notify} />
    );

  return (
    <div className="app-grid flex min-h-screen">
      <Sidebar active={active} />
      <div className="min-w-0 flex-1">
        <Header
          active={active}
          onSale={() => setSaleOpen(true)}
          onNotify={() => notify("You are all caught up")}
        />
        <main className="mx-auto max-w-[1400px] px-5 py-8 md:px-9 lg:py-10">{content}</main>
      </div>

      {saleOpen && (
        <SaleModal
          products={store.products}
          close={() => setSaleOpen(false)}
          complete={completeSale}
        />
      )}
      <Toast message={notice} />
    </div>
  );
}
