import { createClient } from "@/lib/supabase/client";
import type { DateRange, MovementType, Page, StockHistoryEntry } from "@/lib/types";
import { friendlyError } from "./errors";

export type StockHistoryQuery = {
  range: DateRange;
  productId?: string;
  movementType?: MovementType | "";
  limit?: number;
  offset?: number;
};

// The stock audit log via get_stock_history(), newest first.
export async function fetchStockHistory({
  range,
  productId,
  movementType,
  limit = 50,
  offset = 0,
}: StockHistoryQuery): Promise<Page<StockHistoryEntry>> {
  const supabase = createClient();
  if (!supabase) return { total: 0, rows: [] };

  const { data, error } = await supabase.rpc("get_stock_history", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_product_id: productId || null,
    p_type: movementType || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(friendlyError(error));

  return data as Page<StockHistoryEntry>;
}
