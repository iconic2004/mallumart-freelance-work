import { createClient } from "@/lib/supabase/client";
import type { ActionResult, ImportResult, ImportRow, Product, ReorderItem, StockMovementType, Unit } from "@/lib/types";
import { friendlyError } from "./errors";
import { callRpc, toNumber, toNumberOrNull, tryRpc } from "./rpc";

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category_id: string | null;
  category_name: string | null;
  description: string | null;
  cost_price: number | string | null;
  selling_price: number | string;
  stock_quantity: number | string;
  minimum_stock: number | string;
  unit: Unit;
  gst_rate: number | string;
  hsn_code: string;
  image_url: string | null;
  is_active: boolean;
}

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  sku: row.sku,
  barcode: row.barcode,
  category: row.category_name || "Uncategorised",
  categoryId: row.category_id || undefined,
  unit: row.unit ?? "pcs",
  gstRate: toNumber(row.gst_rate),
  hsnCode: row.hsn_code ?? "",
  costPrice: toNumberOrNull(row.cost_price),
  sellingPrice: toNumber(row.selling_price),
  stockQuantity: toNumber(row.stock_quantity),
  minimumStock: toNumber(row.minimum_stock),
  isActive: row.is_active,
  imageUrl: row.image_url,
  description: row.description,
});

// Products are read through get_products(), which hides cost prices from staff.
export async function fetchProducts(): Promise<Product[]> {
  try {
    return ((await callRpc<ProductRow[]>("get_products")) ?? []).map(toProduct);
  } catch (err) {
    console.error("Failed to fetch products:", err);
    return [];
  }
}

const editableColumns = (input: Partial<Product>) => {
  const columns: Record<string, unknown> = {};
  if (input.name !== undefined) columns.name = input.name.trim();
  if (input.sku !== undefined) columns.sku = input.sku.trim().toUpperCase();
  if (input.barcode !== undefined) columns.barcode = input.barcode?.trim() || null;
  if (input.costPrice !== undefined && input.costPrice !== null) columns.cost_price = input.costPrice;
  if (input.sellingPrice !== undefined) columns.selling_price = input.sellingPrice;
  if (input.minimumStock !== undefined) columns.minimum_stock = input.minimumStock;
  if (input.unit !== undefined) columns.unit = input.unit;
  if (input.gstRate !== undefined) columns.gst_rate = input.gstRate;
  if (input.hsnCode !== undefined) columns.hsn_code = input.hsnCode.trim();
  if (input.isActive !== undefined) columns.is_active = input.isActive;
  if (input.description !== undefined) columns.description = input.description;
  if (input.imageUrl !== undefined) columns.image_url = input.imageUrl;
  if (input.categoryId !== undefined) columns.category_id = input.categoryId || null;
  return columns;
};

export async function createProduct(input: Omit<Product, "id" | "isActive">): Promise<ActionResult> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  try {
    // Opening stock is written to the stock log by a database trigger.
    const { error } = await supabase.from("products").insert({
      ...editableColumns(input),
      cost_price: input.costPrice ?? 0,
      stock_quantity: input.stockQuantity,
      is_active: true,
      description: input.description || "",
      image_url: input.imageUrl || null,
    });

    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: `Product creation failed (${msg}).` };
  }
}

// Stock is deliberately not editable here; it only changes through adjust_stock,
// record_sale and refund_sale so every change is in the stock log.
export async function updateProduct(id: string, input: Partial<Omit<Product, "stockQuantity">>): Promise<ActionResult> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  try {
    const { data, error } = await supabase.from("products").update(editableColumns(input)).eq("id", id).select("id");
    if (error) return { ok: false, error: friendlyError(error) };
    if (!data?.length) return { ok: false, error: "You do not have permission to edit this product." };
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: `Product update failed (${msg}).` };
  }
}

export async function archiveProduct(id: string): Promise<ActionResult> {
  return updateProduct(id, { isActive: false });
}

export type StockAdjustment = {
  quantity: number;
  type: StockMovementType;
  notes?: string;
  supplierId?: string | null;
  // Owner only: the price paid per unit, and whether it becomes the new cost price.
  unitCost?: number | null;
  updateCost?: boolean;
};

export async function adjustProductStock(productId: string, adjustment: StockAdjustment): Promise<ActionResult> {
  const result = await tryRpc("adjust_stock", {
    p_product_id: productId,
    p_quantity: adjustment.quantity,
    p_movement_type: adjustment.type,
    p_notes: adjustment.notes ?? "",
    p_supplier_id: adjustment.supplierId || null,
    p_unit_cost: adjustment.unitCost ?? null,
    p_update_cost: adjustment.updateCost ?? false,
  });
  return { ok: result.ok, error: result.error };
}

export function importProducts(rows: ImportRow[]) {
  return callRpc<ImportResult>("import_products", { p_rows: rows });
}

export async function fetchReorderList(): Promise<ReorderItem[]> {
  const rows = await callRpc<Record<string, unknown>[]>("get_reorder_list");
  return rows.map((row) => ({
    ...(row as unknown as ReorderItem),
    stock: toNumber(row.stock),
    minimum: toNumber(row.minimum),
    suggestedQuantity: toNumber(row.suggestedQuantity),
    lastUnitCost: toNumberOrNull(row.lastUnitCost),
  }));
}
