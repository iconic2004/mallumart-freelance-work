import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";

interface SupabaseProductRow {
  id: string;
  name: string;
  sku: string;
  category_id: string | null;
  description: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  minimum_stock: number;
  image_url: string | null;
  is_active: boolean;
  categories?: { name: string } | null;
}

export async function fetchProducts(): Promise<Product[]> {
  const supabase = createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      sku,
      category_id,
      description,
      cost_price,
      selling_price,
      stock_quantity,
      minimum_stock,
      image_url,
      is_active,
      categories:category_id ( name )
    `)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching products:", error.message);
    return [];
  }

  return (data as unknown as SupabaseProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.categories?.name || "General",
    categoryId: row.category_id || undefined,
    costPrice: Number(row.cost_price),
    sellingPrice: Number(row.selling_price),
    stockQuantity: Number(row.stock_quantity),
    minimumStock: Number(row.minimum_stock),
    isActive: row.is_active,
    imageUrl: row.image_url,
    description: row.description,
  }));
}

export async function createProduct(
  input: Omit<Product, "id" | "isActive">
): Promise<{ ok: boolean; data?: Product; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  // Resolve category ID from category name
  let categoryId = input.categoryId;
  if (!categoryId && input.category) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("name", input.category)
      .single();
    if (cat) categoryId = cat.id;
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name.trim(),
      sku: input.sku.trim().toUpperCase(),
      category_id: categoryId || null,
      cost_price: input.costPrice,
      selling_price: input.sellingPrice,
      stock_quantity: input.stockQuantity,
      minimum_stock: input.minimumStock,
      is_active: true,
      description: input.description || "",
      image_url: input.imageUrl || null,
    })
    .select(`
      id,
      name,
      sku,
      category_id,
      description,
      cost_price,
      selling_price,
      stock_quantity,
      minimum_stock,
      image_url,
      is_active,
      categories:category_id ( name )
    `)
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as unknown as SupabaseProductRow;
  return {
    ok: true,
    data: {
      id: row.id,
      name: row.name,
      sku: row.sku,
      category: row.categories?.name || input.category,
      categoryId: row.category_id || undefined,
      costPrice: Number(row.cost_price),
      sellingPrice: Number(row.selling_price),
      stockQuantity: Number(row.stock_quantity),
      minimumStock: Number(row.minimum_stock),
      isActive: row.is_active,
      imageUrl: row.image_url,
      description: row.description,
    },
  };
}

export async function updateProduct(
  id: string,
  input: Partial<Product>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.sku !== undefined) updates.sku = input.sku.trim().toUpperCase();
  if (input.costPrice !== undefined) updates.cost_price = input.costPrice;
  if (input.sellingPrice !== undefined) updates.selling_price = input.sellingPrice;
  if (input.stockQuantity !== undefined) updates.stock_quantity = input.stockQuantity;
  if (input.minimumStock !== undefined) updates.minimum_stock = input.minimumStock;
  if (input.isActive !== undefined) updates.is_active = input.isActive;
  if (input.description !== undefined) updates.description = input.description;
  if (input.imageUrl !== undefined) updates.image_url = input.imageUrl;

  if (input.category) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("name", input.category)
      .single();
    if (cat) updates.category_id = cat.id;
  }

  const { error } = await supabase.from("products").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function archiveProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  const { error } = await supabase
    .from("products")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function adjustProductStock(
  productId: string,
  quantity: number,
  movementType: "purchase" | "adjustment" | "return" | "damage" = "purchase",
  notes: string = ""
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  const { data, error } = await supabase.rpc("adjust_stock", {
    p_product_id: productId,
    p_quantity: quantity,
    p_movement_type: movementType,
    p_notes: notes,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data };
}
