import type { StoreSettings } from "@/lib/types";
import { callRpc, tryRpc } from "./rpc";

export function fetchStoreSettings() {
  return callRpc<StoreSettings>("get_store_settings");
}

export function saveStoreSettings(input: StoreSettings) {
  return tryRpc<void>("save_store_settings", {
    p_store_name: input.storeName,
    p_address: input.address,
    p_phone: input.phone,
    p_gstin: input.gstin,
    p_receipt_footer: input.receiptFooter,
  });
}
