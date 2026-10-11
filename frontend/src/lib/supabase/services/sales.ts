import type { DailySales, DateRange, Page, PaymentMethod, Sale, SaleStatus, SalesReport, Unit } from "@/lib/types";
import { callRpc, toNumber, toNumberOrNull, tryRpc } from "./rpc";

type Num = number | string;

interface SaleItemRow {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  unit: Unit;
  hsnCode: string;
  quantity: Num;
  refundedQuantity: Num;
  sellingPrice: Num;
  costPrice: Num | null;
  totalAmount: Num;
  totalCost: Num | null;
  gstRate: Num;
  taxAmount: Num;
}

interface SaleRow {
  id: string;
  invoiceNumber: string;
  cashierName: string;
  totalAmount: Num;
  taxAmount: Num;
  refundedAmount: Num;
  status: SaleStatus;
  totalCost: Num | null;
  grossProfit: Num | null;
  paymentMethod: PaymentMethod;
  createdAt: string;
  customer: { id: string; name: string; phone: string } | null;
  items: SaleItemRow[];
  refunds: { refundNumber: string; amount: Num; reason: string; performedBy: string; createdAt: string }[];
}

export const toSale = (row: SaleRow): Sale => {
  const saleItems = row.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    categoryName: item.categoryName,
    unit: item.unit,
    hsnCode: item.hsnCode ?? "",
    quantity: toNumber(item.quantity),
    refundedQuantity: toNumber(item.refundedQuantity),
    sellingPrice: toNumber(item.sellingPrice),
    costPrice: toNumberOrNull(item.costPrice),
    totalAmount: toNumber(item.totalAmount),
    totalCost: toNumberOrNull(item.totalCost),
    gstRate: toNumber(item.gstRate),
    taxAmount: toNumber(item.taxAmount),
  }));
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    cashierName: row.cashierName || "",
    totalAmount: toNumber(row.totalAmount),
    taxAmount: toNumber(row.taxAmount),
    refundedAmount: toNumber(row.refundedAmount),
    status: row.status,
    totalCost: toNumberOrNull(row.totalCost),
    grossProfit: toNumberOrNull(row.grossProfit),
    paymentMethod: row.paymentMethod,
    createdAt: row.createdAt,
    customer: row.customer,
    // Item count for lists: pieces count individually, weighed goods count as one line.
    items: saleItems.reduce((sum, item) => sum + (item.unit === "pcs" ? item.quantity : 1), 0),
    saleItems,
    refunds: (row.refunds ?? []).map((refund) => ({ ...refund, amount: toNumber(refund.amount) })),
  };
};

export type SalesQuery = { range: DateRange; search?: string; limit?: number; offset?: number };

// One page of sales (newest first) via get_sales(); cost/profit are null for staff.
export async function fetchSalesPage({ range, search = "", limit = 50, offset = 0 }: SalesQuery): Promise<Page<Sale>> {
  const page = await callRpc<{ total: number; rows: SaleRow[] }>("get_sales", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });
  return { total: page.total, rows: page.rows.map(toSale) };
}

// A single sale by invoice number (exact match), e.g. to show the receipt after checkout.
export async function fetchSaleByInvoice(invoiceNumber: string): Promise<Sale | null> {
  const now = Date.now();
  const page = await fetchSalesPage({
    range: { from: new Date(now - 2 * 24 * 3600 * 1000), to: new Date(now + 3600 * 1000) },
    search: invoiceNumber,
    limit: 5,
  });
  return page.rows.find((sale) => sale.invoiceNumber === invoiceNumber) ?? null;
}

// Every sale in a range (used by the Excel export), fetched 1000 at a time.
export async function fetchAllSales(range: DateRange): Promise<Sale[]> {
  const all: Sale[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await fetchSalesPage({ range, limit: 1000, offset });
    all.push(...page.rows);
    if (page.rows.length < 1000 || all.length >= page.total) break;
  }
  return all;
}

interface ReportRow {
  salesCount: number;
  grossRevenue: Num;
  refunds: Num;
  refundCount: number;
  revenue: Num;
  units: Num;
  tax: Num;
  cost: Num | null;
  profit: Num | null;
  payments: { method: PaymentMethod; count: number; revenue: Num }[];
  topProducts: { productId: string; name: string; units: Num; revenue: Num }[];
  categories: { name: string; units: Num; revenue: Num }[];
  gst: { rate: Num; taxableValue: Num; tax: Num }[];
}

// Totals for a range, computed in the database. Refunds count on their own date.
export async function fetchSalesReport(range: DateRange): Promise<SalesReport> {
  const row = await callRpc<ReportRow>("sales_report", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  });
  return {
    salesCount: Number(row.salesCount),
    grossRevenue: toNumber(row.grossRevenue),
    refunds: toNumber(row.refunds),
    refundCount: Number(row.refundCount),
    revenue: toNumber(row.revenue),
    units: toNumber(row.units),
    tax: toNumber(row.tax),
    cost: toNumberOrNull(row.cost),
    profit: toNumberOrNull(row.profit),
    payments: (row.payments ?? []).map((p) => ({ method: p.method, count: Number(p.count), revenue: toNumber(p.revenue) })),
    topProducts: (row.topProducts ?? []).map((p) => ({ ...p, units: toNumber(p.units), revenue: toNumber(p.revenue) })),
    categories: (row.categories ?? []).map((c) => ({ ...c, units: toNumber(c.units), revenue: toNumber(c.revenue) })),
    gst: (row.gst ?? []).map((g) => ({ rate: toNumber(g.rate), taxableValue: toNumber(g.taxableValue), tax: toNumber(g.tax) })),
  };
}

export async function fetchDailySales(range: DateRange): Promise<DailySales[]> {
  const rows = await callRpc<{ date: string; salesCount: number; revenue: Num; profit: Num | null }[]>("daily_sales", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
  });
  return rows.map((row) => ({
    date: row.date,
    salesCount: Number(row.salesCount),
    revenue: toNumber(row.revenue),
    profit: toNumberOrNull(row.profit),
  }));
}

export async function recordSale(
  lines: { productId: string; quantity: number }[],
  paymentMethod: PaymentMethod,
  customerId: string | null = null
): Promise<{ ok: boolean; message: string; invoiceNumber?: string }> {
  if (!lines.length) return { ok: false, message: "No items to sell." };

  const result = await tryRpc<{ invoiceNumber: string }>("record_sale", {
    p_items: lines,
    p_payment_method: paymentMethod,
    p_customer_id: customerId,
  });
  if (!result.ok || !result.data) return { ok: false, message: result.error ?? "Sale failed." };
  return { ok: true, message: `Sale ${result.data.invoiceNumber} recorded.`, invoiceNumber: result.data.invoiceNumber };
}

// Owner only. Empty `lines` refunds everything still refundable (a full void).
export function refundSale(saleId: string, lines: { saleItemId: string; quantity: number }[], reason: string) {
  return tryRpc<{ refundNumber: string; amount: number; status: SaleStatus }>("refund_sale", {
    p_sale_id: saleId,
    p_items: lines.length ? lines : null,
    p_reason: reason,
  });
}
