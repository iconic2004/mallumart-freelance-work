import { createClient } from "@/lib/supabase/client";
import type { PaymentMethod, Sale, SaleItem } from "@/lib/types";

interface SupabaseSaleItemRow {
  id: string;
  product_id: string;
  quantity: number;
  selling_price: number;
  cost_price: number;
  total_amount: number;
  total_cost: number;
  products?: { name: string } | null;
}

interface SupabaseSaleRow {
  id: string;
  invoice_number: string;
  total_amount: number;
  total_cost: number;
  gross_profit: number;
  payment_method: PaymentMethod;
  created_at: string;
  sale_items?: SupabaseSaleItemRow[] | null;
}

export async function fetchSales(limit = 100): Promise<Sale[]> {
  const supabase = createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("sales")
    .select(`
      id,
      invoice_number,
      total_amount,
      total_cost,
      gross_profit,
      payment_method,
      created_at,
      sale_items (
        id,
        product_id,
        quantity,
        selling_price,
        cost_price,
        total_amount,
        total_cost,
        products:product_id ( name )
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching sales:", error.message);
    return [];
  }

  return (data as unknown as SupabaseSaleRow[]).map((sale) => {
    const rawItems = sale.sale_items || [];
    const saleItems: SaleItem[] = rawItems.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.products?.name || "Product",
      quantity: item.quantity,
      sellingPrice: Number(item.selling_price),
      costPrice: Number(item.cost_price),
      totalAmount: Number(item.total_amount),
      totalCost: Number(item.total_cost),
    }));

    return {
      id: sale.invoice_number || sale.id,
      totalAmount: Number(sale.total_amount),
      totalCost: Number(sale.total_cost),
      grossProfit: Number(sale.gross_profit),
      paymentMethod: sale.payment_method,
      createdAt: sale.created_at,
      items: saleItems.reduce((acc, item) => acc + item.quantity, 0),
      saleItems,
    };
  });
}

export async function recordSale(
  lines: { productId: string; quantity: number }[],
  paymentMethod: PaymentMethod
): Promise<{ ok: boolean; message: string; data?: unknown }> {
  const supabase = createClient();
  if (!supabase) return { ok: false, message: "Supabase client unavailable." };

  if (!lines.length) {
    return { ok: false, message: "No items to sell." };
  }

  const { data, error } = await supabase.rpc("record_sale", {
    p_items: lines,
    p_payment_method: paymentMethod,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Sale recorded successfully.", data };
}
