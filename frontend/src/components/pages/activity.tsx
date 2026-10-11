"use client";

import { useEffect, useState } from "react";
import type { AuditEntry, Page } from "@/lib/types";
import { useStore } from "@/lib/store/store-provider";
import { fetchAuditLog } from "@/lib/supabase/services/audit";
import { ErrorBox, Intro, PAGE_SIZE, Pager, RangePicker, dateLabel, usePaging, useRange } from "@/components/ui";

const groups: Record<string, { label: string; tone: string }> = {
  product: { label: "Product", tone: "bg-[#f4f8f3] text-[#226b4c]" },
  category: { label: "Category", tone: "bg-[#f4f8f3] text-[#226b4c]" },
  sale: { label: "Refund", tone: "bg-[#fff0ed] text-[#c25e4a]" },
  profile: { label: "Team", tone: "bg-[#eef3fb] text-[#3b5f9a]" },
  store_settings: { label: "Settings", tone: "bg-[#eef3fb] text-[#3b5f9a]" },
  supplier: { label: "Supplier", tone: "bg-[#f4f8f3] text-[#226b4c]" },
  customer: { label: "Khata", tone: "bg-[#f4f8f3] text-[#226b4c]" },
  cash_closing: { label: "Cash", tone: "bg-[#fbf3e4] text-[#8a5a12]" },
};

export function ActivityLog() {
  const store = useStore();
  const rangeState = useRange("7-days");
  const { range } = rangeState;
  const fromMs = range?.from.getTime() ?? 0;
  const toMs = range?.to.getTime() ?? 0;
  const { page, setPage } = usePaging(`${fromMs}|${toMs}`);
  const [data, setData] = useState<Page<AuditEntry>>({ total: 0, rows: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fromMs || !toMs) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const result = await fetchAuditLog({ from: new Date(fromMs), to: new Date(toMs) }, PAGE_SIZE, page * PAGE_SIZE);
        if (!cancelled) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the activity log.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fromMs, toMs, page, store.dataVersion]);

  return (
    <>
      <Intro
        title="Activity Log"
        subtitle="Who changed what: prices, products, categories, team access, refunds, khata payments, cash closings and store details."
      />
      <div className="mb-5">
        <RangePicker state={rangeState} />
      </div>
      <ErrorBox message={error} />
      <div className="overflow-x-auto rounded-2xl border border-[#e4e9e4] bg-white shadow-sm">
        <table className={`w-full min-w-[680px] text-left text-sm ${loading ? "opacity-60" : ""}`}>
          <thead className="border-b border-[#e4e9e4] bg-[#fbfcfa] text-xs text-[#87948c]">
            <tr>
              <th className="px-5 py-4">When</th>
              <th>Who</th>
              <th>Area</th>
              <th className="pr-5">What happened</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f4ef]">
            {data.rows.map((entry) => {
              const group = groups[entry.entity] ?? { label: entry.entity, tone: "bg-[#f4f8f3] text-[#718078]" };
              return (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-[#718078]">{dateLabel(entry.createdAt)}</td>
                  <td className="font-medium">{entry.actorName}</td>
                  <td>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${group.tone}`}>{group.label}</span>
                  </td>
                  <td className="pr-5">{entry.summary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && data.rows.length === 0 && <div className="p-12 text-center text-sm text-[#718078]">Nothing recorded in this period.</div>}
        <Pager page={page} total={data.total} onPage={setPage} />
      </div>
    </>
  );
}
