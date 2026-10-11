"use client";

import { useState, type FormEvent } from "react";
import { GST_RATES, type Product, type StockMovementType, type Supplier, type Unit } from "@/lib/types";
import type { StockAdjustment } from "@/lib/supabase/services/products";
import {
  formatQuantity,
  isPrice,
  isWholeNumber,
  quantityError,
  quantityStep,
  signedStockChange,
  unitLabels,
} from "@/lib/validation";
import { ErrorBox, Modal, inputClass, primaryButton, secondaryButton } from "@/components/ui";

export type ProductInput = Omit<Product, "id" | "isActive">;

const unitNames: Record<Unit, string> = { pcs: "Pieces (whole numbers)", kg: "Kilograms (kg)", l: "Litres (L)" };

// ---------- Add / edit product (owner) ----------

export function ProductForm({
  product,
  categories,
  close,
  save,
}: {
  product?: Product;
  categories: { id: string; name: string }[];
  close: () => void;
  save: (data: ProductInput) => Promise<string | undefined>;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    categoryId: product ? product.categoryId ?? "" : categories[0]?.id ?? "",
    unit: (product?.unit ?? "pcs") as Unit,
    costPrice: String(product?.costPrice ?? ""),
    sellingPrice: String(product?.sellingPrice ?? ""),
    gstRate: String(product?.gstRate ?? 0),
    hsnCode: product?.hsnCode ?? "",
    stockQuantity: String(product?.stockQuantity ?? "0"),
    minimumStock: String(product?.minimumStock ?? "0"),
    description: product?.description ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const change = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const costPrice = Number(form.costPrice);
  const sellingPrice = Number(form.sellingPrice);
  const belowCost = form.costPrice !== "" && form.sellingPrice !== "" && sellingPrice < costPrice;

  const stockOk = (value: number) => (form.unit === "pcs" ? isWholeNumber(value) : value >= 0 && !quantityError(value || 1, form.unit));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const stockQuantity = Number(form.stockQuantity);
    const minimumStock = Number(form.minimumStock);

    if (!form.name.trim() || !form.sku.trim()) return setError("Product name and SKU are required.");
    if (form.costPrice === "" || !isPrice(costPrice)) return setError("Cost price must be 0 or more, with at most 2 decimals.");
    if (form.sellingPrice === "" || !isPrice(sellingPrice)) return setError("Selling price must be 0 or more, with at most 2 decimals.");
    if (!product && (form.stockQuantity === "" || !stockOk(stockQuantity)))
      return setError(form.unit === "pcs" ? "Opening stock must be a whole number." : "Opening stock: 0 or more, at most 3 decimals.");
    if (form.minimumStock === "" || !stockOk(minimumStock))
      return setError(form.unit === "pcs" ? "Minimum level must be a whole number." : "Minimum level: 0 or more, at most 3 decimals.");
    if (product && form.unit === "pcs" && !Number.isInteger(product.stockQuantity))
      return setError(`Current stock is ${product.stockQuantity}; correct it to a whole number before selling by the piece.`);

    setSaving(true);
    const category = categories.find((item) => item.id === form.categoryId);
    const saveError = await save({
      name: form.name.trim(),
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || null,
      categoryId: form.categoryId,
      category: category?.name ?? "Uncategorised",
      unit: form.unit,
      gstRate: Number(form.gstRate),
      hsnCode: form.hsnCode.trim(),
      costPrice,
      sellingPrice,
      stockQuantity: product ? product.stockQuantity : stockQuantity,
      minimumStock,
      description: form.description,
    });
    setSaving(false);
    if (saveError) setError(saveError);
  };

  const unitSuffix = form.unit === "pcs" ? "" : ` (${unitLabels[form.unit]})`;

  return (
    <Modal title={product ? "Edit product" : "Add product"} onClose={close} wide>
      <form onSubmit={submit} noValidate>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium sm:col-span-2 lg:col-span-1">
            Product name
            <input type="text" maxLength={120} value={form.name} onChange={(e) => change("name", e.target.value)} placeholder="e.g. Kerala Matta Rice" className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            SKU code
            <input type="text" maxLength={40} value={form.sku} onChange={(e) => change("sku", e.target.value)} placeholder="MM-042" className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            Barcode <span className="font-normal text-[#87948c]">(optional)</span>
            <input type="text" inputMode="numeric" maxLength={40} value={form.barcode} onChange={(e) => change("barcode", e.target.value)} placeholder="Scan or type" className={inputClass} />
          </label>

          <label className="text-sm font-medium">
            Category
            <select value={form.categoryId} onChange={(e) => change("categoryId", e.target.value)} className={`${inputClass} bg-white`}>
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Sold by
            <select value={form.unit} onChange={(e) => change("unit", e.target.value)} className={`${inputClass} bg-white`}>
              {(Object.keys(unitNames) as Unit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {unitNames[unit]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            GST rate <span className="font-normal text-[#87948c]">(included in price)</span>
            <select value={form.gstRate} onChange={(e) => change("gstRate", e.target.value)} className={`${inputClass} bg-white`}>
              {GST_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Cost price (₹ per {form.unit === "pcs" ? "piece" : unitLabels[form.unit]})
            <input min={0} step="0.01" type="number" value={form.costPrice} onChange={(e) => change("costPrice", e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            Selling price (₹ per {form.unit === "pcs" ? "piece" : unitLabels[form.unit]})
            <input min={0} step="0.01" type="number" value={form.sellingPrice} onChange={(e) => change("sellingPrice", e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            HSN code <span className="font-normal text-[#87948c]">(optional)</span>
            <input type="text" maxLength={20} value={form.hsnCode} onChange={(e) => change("hsnCode", e.target.value)} placeholder="e.g. 1006" className={inputClass} />
          </label>

          <label className="text-sm font-medium">
            {product ? "Current stock" : "Opening stock"}
            {unitSuffix}
            <input
              min={0}
              step={quantityStep(form.unit)}
              type="number"
              disabled={Boolean(product)}
              value={form.stockQuantity}
              onChange={(e) => change("stockQuantity", e.target.value)}
              className={inputClass}
            />
            {product && (
              <span className="mt-1 block text-[11px] font-normal text-[#87948c]">Change stock with the ± Stock button (keeps the stock history).</span>
            )}
          </label>
          <label className="text-sm font-medium">
            Minimum alert level{unitSuffix}
            <input min={0} step={quantityStep(form.unit)} type="number" value={form.minimumStock} onChange={(e) => change("minimumStock", e.target.value)} className={inputClass} />
          </label>
        </div>

        {belowCost && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-700">
            Selling price is below cost price, so every sale of this product will lose money.
          </div>
        )}

        <div className="mt-4">
          <ErrorBox message={error} />
        </div>

        <div className="mt-4 flex justify-end gap-3 border-t pt-4">
          <button type="button" onClick={close} className={secondaryButton}>
            Cancel
          </button>
          <button disabled={saving} className={primaryButton}>
            {saving ? "Saving..." : product ? "Save changes" : "Add product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Stock change (purchase, return, damage, correction) ----------

const movementLabels: Record<StockMovementType, string> = {
  purchase: "Purchase / delivery (adds stock)",
  return: "Customer return without receipt (adds stock)",
  damage: "Damaged / expired (removes stock)",
  adjustment: "Stock count correction (+ or -)",
};

export function StockModal({
  product,
  isOwner,
  suppliers,
  close,
  submit,
}: {
  product: Product;
  isOwner: boolean;
  suppliers: Supplier[];
  close: () => void;
  submit: (adjustment: StockAdjustment) => Promise<string | undefined>;
}) {
  const types: StockMovementType[] = isOwner ? ["purchase", "return", "damage", "adjustment"] : ["purchase"];
  const [type, setType] = useState<StockMovementType>("purchase");
  const [quantity, setQuantity] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const amount = Number(quantity);
  const signed = signedStockChange(type, amount);
  const after = product.stockQuantity + (Number.isFinite(signed) ? signed : 0);
  const isPurchase = type === "purchase";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const problem = quantity === "" ? "Enter a quantity." : quantityError(Math.abs(amount), product.unit);
    if (problem) return setError(problem);
    if (after < 0) return setError(`Stock cannot go below 0 (currently ${formatQuantity(product.stockQuantity, product.unit)}).`);
    if (isOwner && isPurchase && unitCost !== "" && !isPrice(Number(unitCost))) return setError("Unit cost must be 0 or more, with at most 2 decimals.");

    setSaving(true);
    const hasCost = isOwner && isPurchase && unitCost !== "";
    const saveError = await submit({
      quantity: Number(signed.toFixed(3)),
      type,
      notes: notes.trim(),
      supplierId: isPurchase ? supplierId || null : null,
      unitCost: hasCost ? Number(unitCost) : null,
      updateCost: hasCost && updateCost,
    });
    setSaving(false);
    if (saveError) setError(saveError);
  };

  return (
    <Modal
      title="Update stock"
      subtitle={
        <>
          {product.name} · currently <b>{formatQuantity(product.stockQuantity, product.unit)}</b>
          {product.unit === "pcs" ? " units" : ""}
        </>
      }
      onClose={close}
    >
      <form onSubmit={onSubmit} noValidate>
        <label className="mt-6 block text-sm font-medium">
          Reason
          <select value={type} onChange={(e) => setType(e.target.value as StockMovementType)} className={`${inputClass} bg-white`}>
            {types.map((item) => (
              <option key={item} value={item}>
                {movementLabels[item]}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium">
          Quantity{product.unit === "pcs" ? "" : ` (${unitLabels[product.unit]})`}{" "}
          {type === "adjustment" && <span className="font-normal text-[#87948c]">(negative to reduce)</span>}
          <input type="number" step={quantityStep(product.unit)} autoFocus value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </label>

        {isPurchase && (
          <label className="mt-4 block text-sm font-medium">
            Supplier <span className="font-normal text-[#87948c]">(optional)</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${inputClass} bg-white`}>
              <option value="">Not recorded</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {isOwner && isPurchase && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
            <label className="block text-sm font-medium">
              Price paid per {product.unit === "pcs" ? "piece" : unitLabels[product.unit]} (₹) <span className="font-normal text-[#87948c]">(optional)</span>
              <input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder={product.costPrice !== null ? String(product.costPrice) : ""} className={inputClass} />
            </label>
            <label className={`flex items-center gap-2 pb-2.5 text-xs ${unitCost === "" ? "text-[#a0aaa4]" : "text-[#1f2924]"}`}>
              <input type="checkbox" disabled={unitCost === ""} checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} />
              Make this the new cost price
            </label>
          </div>
        )}

        <label className="mt-4 block text-sm font-medium">
          Note <span className="font-normal text-[#87948c]">(optional)</span>
          <input type="text" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Supplier invoice no., reason..." className={inputClass} />
        </label>

        <div className="mt-4 rounded-xl bg-[#f0f6f0] p-3 text-sm">
          Stock after update: <b>{formatQuantity(quantity === "" ? product.stockQuantity : Math.max(after, 0), product.unit)}</b>
        </div>

        <div className="mt-4">
          <ErrorBox message={error} />
        </div>

        <div className="mt-2 flex justify-end gap-3 border-t pt-4">
          <button type="button" onClick={close} className={secondaryButton}>
            Cancel
          </button>
          <button disabled={saving} className={primaryButton}>
            {saving ? "Saving..." : "Update stock"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
