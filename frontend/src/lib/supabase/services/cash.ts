import type { CashClosing, CashSummary, DateRange, Page } from "@/lib/types";
import { toDateInput } from "@/lib/periods";
import { callRpc, toNumber, tryRpc } from "./rpc";

const closingNumbers = [
  "openingFloat",
  "cashSales",
  "cashRefunds",
  "cashCollections",
  "expectedCash",
  "countedCash",
  "difference",
  "upiSales",
  "cardSales",
  "otherSales",
  "creditSales",
] as const;

export async function fetchCashSummary(range: DateRange, userId: string | null = null): Promise<CashSummary> {
  const data = await callRpc<Record<string, number | string>>("get_cash_summary", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_user_id: userId,
  });
  return {
    salesCount: toNumber(data.salesCount),
    cashSales: toNumber(data.cashSales),
    upiSales: toNumber(data.upiSales),
    cardSales: toNumber(data.cardSales),
    otherSales: toNumber(data.otherSales),
    creditSales: toNumber(data.creditSales),
    cashRefunds: toNumber(data.cashRefunds),
    cashCollections: toNumber(data.cashCollections),
  };
}

// The business day is the local calendar day of `range.from`.
export function closeCash(range: DateRange, openingFloat: number, countedCash: number, notes: string) {
  return tryRpc<{ id: string; expectedCash: number; difference: number }>("close_cash", {
    p_business_date: toDateInput(range.from),
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_opening_float: openingFloat,
    p_counted_cash: countedCash,
    p_notes: notes,
  });
}

export async function fetchCashClosings(from: Date, to: Date, limit = 50, offset = 0): Promise<Page<CashClosing>> {
  const data = await callRpc<{ total: number; rows: Record<string, unknown>[] }>("get_cash_closings", {
    p_from: toDateInput(from),
    p_to: toDateInput(to),
    p_limit: limit,
    p_offset: offset,
  });
  return {
    total: data.total,
    rows: data.rows.map((row) => {
      const closing: Record<string, unknown> = { ...row };
      for (const key of closingNumbers) closing[key] = toNumber(row[key]);
      return closing as unknown as CashClosing;
    }),
  };
}
