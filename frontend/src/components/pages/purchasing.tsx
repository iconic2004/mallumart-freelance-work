"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Product, ReorderItem, Supplier } from "@/lib/types";
import { useStore } from "@/lib/store/store-provider";
import { fetchReorderList, type StockAdjustment } from "@/lib/supabase/services/products";
import { fetchSuppliers, saveSupplier } from "@/lib/supabase/services/suppliers";
import { formatQuantity } from "@/lib/validation";
import { StockModal } from "@/components/product-forms";
import {
  ErrorBox,
  Intro,
  Modal,
  dateLabel,
  inputClass,
  money2,
  primaryButton,
  secondaryButton,
  smallButton,
  type ToastFn,
} from "@/components/ui";

type Tab = "reorder" | "suppliers";

export function Purchasing({ notify }: { notify: ToastFn }) {
  const [tab, setTab] = useState<Tab>("reorder");
  const tabClass = (value: Tab) =>
    `rounded-lg px-4 py-2 text-sm font-semibold ${tab === value ? "bg-[#e4f2e9] text-[#226b4c]" : "text-[#718078] hover:bg-[#f0f4ef]"}`;

  return (
    <>
      <Intro title="Purchasing" subtitle="What to reorder, from whom, and your supplier list." />
      <div className="mb-5 flex gap-2">
        <button type="button" className={tabClass("reorder")} onClick={() => setTab("reorder")}>
          Reorder list
        </button>
        <button type="button" className={tabClass("suppliers")} onClick={() => setTab("suppliers")}>
          Suppliers
        </button>
      </div>
      {tab === "reorder" ? <ReorderList notify={notify} /> : <Suppliers notify={notify} />}
    </>
  );
}

function orderText(items: ReorderItem[], storeName: string, supplier?: Supplier) {
  return [
    `*Order from ${storeName}*`,
    supplier ? `To: ${supplier.name}` : "",
    "",
    ...items.map((item) => `• ${item.name} (${item.sku}): ${formatQuantity(item.suggestedQuantity, item.unit)}${item.unit === "pcs" ? " pcs" : ""}`),
  ]
    .filter((line, index) => line !== "" || index === 2)
    .join("\n");
}

function ReorderList({ notify }: { notify: ToastFn }) {
  const store = useStore();
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [error, setError] = useState("");
  const [receiving, setReceiving] = useState<Product | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReorderList()
      .then((rows) => {
        if (!cancelled) {
          setItems(rows);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the reorder list.");
      });
    return () => {
      cancelled = true;
    };
  }, [store.dataVersion]);

  const shown = supplierFilter === "none"
    ? items.filter((item) => !item.lastSupplierId)
    : supplierFilter
    ? items.filter((item) => item.lastSupplierId === supplierFilter)
    : items;
  const supplier = store.suppliers.find((item) => item.id === supplierFilter);
  const storeName = store.storeSettings?.storeName || "Mallu Mart";

  const whatsapp = () => {
    const digits = (supplier?.phone ?? "").replace(/\D/g, "");
    const phone = digits.length === 10 ? `91${digits}` : digits;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(orderText(shown, storeName, supplier))}`, "_blank", "noopener");
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(
      shown.map((item) => ({
        Product: item.name,
        SKU: item.sku,
        Category: item.category,
        Unit: item.unit,
        "In stock": item.stock,
        Minimum: item.minimum,
        "Order quantity": item.suggestedQuantity,
        "Last supplier": item.lastSupplierName ?? "",
        ...(store.isOwner ? { "Last price paid": item.lastUnitCost ?? "" } : {}),
      }))
    );
    sheet["!cols"] = Array.from({ length: 9 }, () => ({ wch: 16 }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Reorder");
    XLSX.writeFile(book, `Mallu-Mart-Reorder-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const receive = async (adjustment: StockAdjustment) => {
    if (!receiving) return undefined;
    const result = await store.adjustStock(receiving.id, adjustment);
    if (!result.ok) return result.error || "Failed to update stock";
    notify(`Received ${formatQuantity(adjustment.quantity, receiving.unit)} of ${receiving.name}`);
    setReceiving(null);
    return undefined;
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="rounded-xl border border-[#dfe7df] bg-white px-3 py-2.5 text-sm" aria-label="Supplier">
          <option value="">All suppliers</option>
          {store.suppliers.map((item) => (
            <option key={item.id} value={item.id}>
              Last bought from {item.name}
            </option>
          ))}
          <option value="none">No supplier recorded</option>
        </select>
        <div className="flex gap-2">
          <button type="button" disabled={!shown.length} onClick={exportExcel} className={secondaryButton}>
            Excel
          </button>
          <button type="button" disabled={!shown.length} onClick={whatsapp} className={primaryButton}>
            Send order on WhatsApp
          </button>
        </div>
      </div>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-2xl border border-[#e4e9e4] bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[#e4e9e4] bg-[#fbfcfa] text-xs text-[#87948c]">
            <tr>
              <th className="px-5 py-4">Product</th>
              <th>In stock / minimum</th>
              <th>Suggested order</th>
              <th>Last supplier</th>
              {store.isOwner && <th>Last price paid</th>}
              <th className="pr-5 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f4ef]">
            {shown.map((item) => {
              const product = store.products.find((p) => p.id === item.productId);
              return (
                <tr key={item.productId}>
                  <td className="px-5 py-3">
                    <b>{item.name}</b>
                    <div className="text-xs text-[#87948c]">
                      {item.sku} · {item.category}
                    </div>
                  </td>
                  <td>
                    <span className={item.stock === 0 ? "font-semibold text-[#c25e4a]" : "font-semibold text-amber-700"}>
                      {item.stock === 0 ? "Out · " : ""}
                      {formatQuantity(item.stock, item.unit)}
                    </span>{" "}
                    / {formatQuantity(item.minimum, item.unit)}
                  </td>
                  <td className="font-semibold text-[#226b4c]">
                    {formatQuantity(item.suggestedQuantity, item.unit)}
                    {item.unit === "pcs" ? " pcs" : ""}
                  </td>
                  <td className="text-[#718078]">
                    {item.lastSupplierName ?? "-"}
                    {item.lastPurchaseAt && <div className="text-[11px]">{dateLabel(item.lastPurchaseAt)}</div>}
                  </td>
                  {store.isOwner && <td>{item.lastUnitCost !== null ? money2(item.lastUnitCost) : "-"}</td>}
                  <td className="pr-5 text-right">
                    {product && (
                      <button type="button" onClick={() => setReceiving(product)} className={smallButton}>
                        Receive
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="p-12 text-center text-sm text-[#718078]">Nothing to reorder: every product is above its minimum level.</div>
        )}
      </div>
      <p className="mt-3 text-xs text-[#87948c]">
        Suggested order brings stock up to twice the minimum level. Set minimum levels on each product.
      </p>

      {receiving && (
        <StockModal product={receiving} isOwner={store.isOwner} suppliers={store.suppliers} close={() => setReceiving(null)} submit={receive} />
      )}
    </>
  );
}

function Suppliers({ notify }: { notify: ToastFn }) {
  const store = useStore();
  const [list, setList] = useState<Supplier[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSuppliers(showInactive)
      .then((rows) => {
        if (!cancelled) setList(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load suppliers.");
      });
    return () => {
      cancelled = true;
    };
  }, [showInactive, store.dataVersion, reload]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        {store.isOwner ? (
          <label className="flex items-center gap-2 text-sm text-[#718078]">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        ) : (
          <span className="text-sm text-[#718078]">Only the owner can add or edit suppliers.</span>
        )}
        {store.isOwner && (
          <button type="button" onClick={() => setEditing("new")} className={primaryButton}>
            + Add supplier
          </button>
        )}
      </div>

      <ErrorBox message={error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((supplier) => (
          <div key={supplier.id} className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <b className="text-[#1f2924]">{supplier.name}</b>
              {store.isOwner && (
                <button type="button" onClick={() => setEditing(supplier)} className={smallButton}>
                  Edit
                </button>
              )}
            </div>
            <div className="mt-1 space-y-0.5 text-xs text-[#718078]">
              {supplier.phone && <div>{supplier.phone}</div>}
              {supplier.gstin && <div>GSTIN {supplier.gstin}</div>}
              {supplier.notes && <div>{supplier.notes}</div>}
              {!supplier.isActive && <div className="font-semibold text-[#c25e4a]">Inactive</div>}
            </div>
          </div>
        ))}
      </div>
      {list.length === 0 && (
        <div className="rounded-2xl border border-[#e4e9e4] bg-white p-12 text-center text-sm text-[#718078]">No suppliers yet.</div>
      )}

      {editing && (
        <SupplierForm
          supplier={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
          saved={async (message) => {
            setEditing(null);
            notify(message);
            setReload((value) => value + 1);
            await store.refreshData();
          }}
        />
      )}
    </>
  );
}

function SupplierForm({ supplier, close, saved }: { supplier?: Supplier; close: () => void; saved: (message: string) => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    phone: supplier?.phone ?? "",
    gstin: supplier?.gstin ?? "",
    notes: supplier?.notes ?? "",
    isActive: supplier?.isActive ?? true,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Supplier name is required.");
    setSaving(true);
    const result = await saveSupplier({ id: supplier?.id, ...form });
    setSaving(false);
    if (!result.ok) return setError(result.error ?? "Could not save the supplier.");
    saved(supplier ? "Supplier updated" : "Supplier added");
  };

  return (
    <Modal title={supplier ? "Edit supplier" : "Add supplier"} onClose={close}>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          Name
          <input value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} autoFocus />
        </label>
        <label className="block text-sm font-medium">
          Phone <span className="font-normal text-[#87948c]">(for WhatsApp orders)</span>
          <input value={form.phone} inputMode="tel" maxLength={20} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          GSTIN <span className="font-normal text-[#87948c]">(optional)</span>
          <input value={form.gstin} maxLength={15} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="32ABCDE1234F1Z5" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Notes <span className="font-normal text-[#87948c]">(optional)</span>
          <input value={form.notes} maxLength={300} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery days, contact person..." className={inputClass} />
        </label>
        {supplier && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active
          </label>
        )}
        <ErrorBox message={error} />
        <div className="flex justify-end gap-3 border-t pt-4">
          <button type="button" onClick={close} className={secondaryButton}>
            Cancel
          </button>
          <button disabled={saving} className={primaryButton}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
