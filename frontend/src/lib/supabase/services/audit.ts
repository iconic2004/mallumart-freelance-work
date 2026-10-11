import type { AuditEntry, DateRange, Page } from "@/lib/types";
import { callRpc } from "./rpc";

export function fetchAuditLog(range: DateRange, limit = 50, offset = 0) {
  return callRpc<Page<AuditEntry>>("get_audit_log", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_limit: limit,
    p_offset: offset,
  });
}
