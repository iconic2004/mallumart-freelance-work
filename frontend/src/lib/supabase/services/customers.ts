import type { CollectionMethod, Customer, LedgerEntry } from "@/lib/types";
import { callRpc, toNumber, tryRpc } from "./rpc";

type CustomerRow = Omit<Customer, "balance"> & { balance: number | string };
type LedgerRow = Omit<LedgerEntry, "amount" | "balanceEffect"> & { amount: number | string; balanceEffect: number | string };

const toCustomer = (row: CustomerRow): Customer => ({ ...row, balance: toNumber(row.balance) });

export async function fetchCustomers(
  options: { search?: string; includeInactive?: boolean; limit?: number; offset?: number } = {}
) {
  const data = await callRpc<{ total: number; rows: CustomerRow[]; totalOutstanding: number | string }>("get_customers", {
    p_search: options.search ?? "",
    p_include_inactive: options.includeInactive ?? false,
    p_limit: options.limit ?? 50,
    p_offset: options.offset ?? 0,
  });
  return { total: data.total, rows: data.rows.map(toCustomer), totalOutstanding: toNumber(data.totalOutstanding) };
}

export function saveCustomer(input: { id?: string; name: string; phone: string; notes: string; isActive?: boolean }) {
  return tryRpc<CustomerRow>("save_customer", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_phone: input.phone,
    p_notes: input.notes,
    p_is_active: input.isActive ?? true,
  });
}

export function recordCustomerPayment(customerId: string, amount: number, method: CollectionMethod, notes: string) {
  return tryRpc<{ balance: number }>("record_customer_payment", {
    p_customer_id: customerId,
    p_amount: amount,
    p_method: method,
    p_notes: notes,
  });
}

export async function fetchCustomerLedger(customerId: string, limit = 50, offset = 0) {
  const data = await callRpc<{ customer: CustomerRow; total: number; rows: LedgerRow[] }>("get_customer_ledger", {
    p_customer_id: customerId,
    p_limit: limit,
    p_offset: offset,
  });
  return {
    customer: toCustomer(data.customer),
    total: data.total,
    rows: data.rows.map((row) => ({ ...row, amount: toNumber(row.amount), balanceEffect: toNumber(row.balanceEffect) })),
  };
}
