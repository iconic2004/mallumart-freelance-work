import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";
import { friendlyError } from "./errors";

export async function fetchCategories(): Promise<Category[]> {
  const supabase = createClient();
  if (!supabase) return [];

  try {
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
  } catch (err) {
    console.error("Failed to connect to Supabase categories table:", err);
    return [];
  }
}

export async function createCategory(name: string): Promise<{ ok: boolean; data?: Category; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable. Please check .env.local configuration." };

  try {
    const { data, error } = await supabase
      .from("categories")
      .insert({ name: name.trim() })
      .select("id, name, created_at")
      .single();

    if (error) {
      return { ok: false, error: friendlyError(error) };
    }

    return {
      ok: true,
      data: {
        id: data.id,
        name: data.name,
        createdAt: data.created_at,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: `Database connection failed (${msg}). Please verify NEXT_PUBLIC_SUPABASE_URL in .env.local` };
  }
}

export async function renameCategory(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  try {
    const { data, error } = await supabase
      .from("categories")
      .update({ name: name.trim() })
      .eq("id", id)
      .select("id");

    if (error) {
      return { ok: false, error: friendlyError(error) };
    }
    if (!data?.length) {
      return { ok: false, error: "Only the store owner can rename categories." };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: `Database update failed (${msg}).` };
  }
}

export async function deleteCategory(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  try {
    // Server-side: owner check, blocks if active products remain, detaches archived ones.
    const { error } = await supabase.rpc("delete_category", { p_category_id: id });
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: `Database deletion failed (${msg}).` };
  }
}
