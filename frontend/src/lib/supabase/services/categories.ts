import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

export async function fetchCategories(): Promise<Category[]> {
  const supabase = createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, created_at")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching categories:", error.message);
    return [];
  }

  return (data || []).map((cat) => ({
    id: cat.id,
    name: cat.name,
    createdAt: cat.created_at,
  }));
}

export async function createCategory(name: string): Promise<{ ok: boolean; data?: Category; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  const { data, error } = await supabase
    .from("categories")
    .insert({ name: name.trim() })
    .select("id, name, created_at")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
    },
  };
}

export async function renameCategory(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  const { error } = await supabase
    .from("categories")
    .update({ name: name.trim() })
    .eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteCategory(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  // Check if any product is assigned to this category
  const { count, error: countErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id)
    .eq("is_active", true);

  if (countErr) return { ok: false, error: countErr.message };
  if (count && count > 0) {
    return { ok: false, error: "Cannot delete category with active products." };
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
