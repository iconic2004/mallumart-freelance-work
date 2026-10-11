import type { Supplier } from "@/lib/types";
import { callRpc, tryRpc } from "./rpc";

export function fetchSuppliers(includeInactive = false) {
  return callRpc<Supplier[]>("get_suppliers", { p_include_inactive: includeInactive });
}

export function saveSupplier(input: Omit<Supplier, "id"> & { id?: string }) {
  return tryRpc<Supplier>("save_supplier", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_phone: input.phone,
    p_gstin: input.gstin,
    p_notes: input.notes,
    p_is_active: input.isActive,
  });
}
