import { createClient } from "@/lib/supabase/client";
import type { InventoryMovement } from "@/lib/types";

interface SupabaseMovementRow {
  id: string;
  product_id: string;
  movement_type: "purchase" | "sale" | "return" | "damage" | "adjustment";
  quantity: number;
  reference_id?: string | null;
  notes?: string | null;
  created_at: string;
  products?: { name: string } | null;
}

export async function fetchMovements(limit = 100): Promise<InventoryMovement[]> {
  const supabase = createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("inventory_movements")
    .select(`
      id,
      product_id,
      movement_type,
      quantity,
      reference_id,
      notes,
      created_at,
      products:product_id ( name )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching inventory movements:", error.message);
    return [];
  }

  return (data as unknown as SupabaseMovementRow[]).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.products?.name,
    movementType: row.movement_type,
    quantity: row.quantity,
    referenceId: row.reference_id || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
  }));
}
