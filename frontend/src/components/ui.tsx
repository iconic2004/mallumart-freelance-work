"use client";

// Shared building blocks for every screen: layout pieces, form styles,
// date-range picking, paging and number formatting.

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "@/lib/types";
import { customRange, periodLabels, periodRange, rangeLabel, toDateInput, type PeriodKey } from "@/lib/periods";

export const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
export const money2 = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dateLabel = (value: string) =>
  new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export function BackendBadge({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#e4f2e9] text-[#226b4c]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#226b4c]" />
      Supabase Live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#fff0ed] text-[#c25e4a]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#c25e4a]" />
      Not connected
    </span>
  );
}

export type ToastFn = (message: string) => void;

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#226b4c] text-xl font-bold text-white shadow-sm">
        M
      </div>
      <div>
        <div className="display-font text-lg font-bold leading-none">Mallu Mart</div>
        <div className="mt-1 text-[10px] uppercase tracking-[.18em] text-[#87948c]">Inventory & Revenue</div>
      </div>
    </div>
  );
}

export function Intro({
  title,
  subtitle,
  action,
  onAction,
  children,
}: {
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
  // Extra buttons shown next to the main action.
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">
          Mallu Mart workspace
        </div>
        <h1 className="display-font text-3xl sm:text-4xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-[#718078]">{subtitle}</p>
      </div>
      {(children || (action && onAction)) && (
        <div className="flex flex-wrap gap-2">
          {children}
          {action && onAction && (
            <button
              onClick={onAction}
              className="w-fit rounded-xl bg-[#226b4c] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a553c]"
            >
              + {action}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
      <span className="text-xs font-medium text-[#718078]">{label}</span>
      <div className="display-font mt-3 text-2xl font-bold text-[#1f2924]">{value}</div>
      <div className="mt-2 text-xs text-[#4f9568]">{detail}</div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return message ? (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-50 rounded-xl bg-[#1f2924] px-4 py-3 text-sm font-medium text-white shadow-xl animate-in fade-in"
    >
      {message}
    </div>
  ) : null;
}

export const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#dfe7df] px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2] disabled:bg-[#f4f8f3] disabled:text-[#87948c]";

// ---------- Shared: date ranges, paging, export ----------

export const PAGE_SIZE = 50;
export const presetPeriods: Exclude<PeriodKey, "custom">[] = ["today", "yesterday", "7-days", "30-days", "this-month", "last-month", "this-year"];

export function useRange(initial: Exclude<PeriodKey, "custom">) {
  const [period, setPeriod] = useState<PeriodKey>(initial);
  const [fromInput, setFromInput] = useState(() => toDateInput(periodRange("30-days").from));
  const [toInput, setToInput] = useState(() => toDateInput(new Date()));
  const range = useMemo<DateRange | null>(
    () => (period === "custom" ? customRange(fromInput, toInput) : periodRange(period)),
    [period, fromInput, toInput]
  );
  return { period, setPeriod, fromInput, setFromInput, toInput, setToInput, range };
}

export function RangePicker({ state }: { state: ReturnType<typeof useRange> }) {
  const today = toDateInput(new Date());
  const field = "rounded-xl border border-[#dfe7df] bg-white px-3 py-2.5 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={state.period} onChange={(e) => state.setPeriod(e.target.value as PeriodKey)} className={field}>
        {presetPeriods.map((key) => (
          <option key={key} value={key}>
            {periodLabels[key]}
          </option>
        ))}
        <option value="custom">{periodLabels.custom}</option>
      </select>
      {state.period === "custom" && (
        <>
          <input type="date" max={today} value={state.fromInput} onChange={(e) => state.setFromInput(e.target.value)} className={field} aria-label="From date" />
          <span className="text-xs text-[#87948c]">to</span>
          <input type="date" max={today} value={state.toInput} onChange={(e) => state.setToInput(e.target.value)} className={field} aria-label="To date" />
        </>
      )}
      {state.range ? (
        <span className="text-xs text-[#87948c]">{rangeLabel(state.range)}</span>
      ) : (
        <span className="text-xs font-medium text-[#c25e4a]">Choose a valid date range</span>
      )}
    </div>
  );
}

// Page index that resets to 0 whenever the filters change.
export function usePaging(filterKey: string) {
  const [state, setState] = useState({ key: filterKey, page: 0 });
  const page = state.key === filterKey ? state.page : 0;
  return { page, setPage: (next: number) => setState({ key: filterKey, page: next }) };
}

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  const button = "rounded-lg border border-[#dfe7df] px-3 py-1.5 text-xs font-semibold text-[#226b4c] hover:bg-[#e4f2e9] disabled:opacity-40";
  return (
    <div className="flex items-center justify-between border-t border-[#f0f4ef] px-5 py-3 text-xs text-[#718078]">
      <span>
        {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}
      </span>
      <div className="flex gap-2">
        <button className={button} disabled={page === 0} onClick={() => onPage(page - 1)}>
          ← Newer
        </button>
        <button className={button} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Older →
        </button>
      </div>
    </div>
  );
}

export function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="mb-4 rounded-xl border border-[#f5c6cb] bg-[#fff0ed] px-3.5 py-2.5 text-xs font-medium text-[#c25e4a]">{message}</div>
  ) : null;
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#1f2924]/40 px-5 py-8 backdrop-blur-xs">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-3xl border border-[#e4e9e4] bg-white p-6 shadow-2xl sm:p-8`}>
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="display-font text-2xl font-bold text-[#1f2924]">{title}</h2>
            {subtitle && <div className="mt-1 text-xs text-[#718078]">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 shrink-0 rounded-full border border-[#e4e9e4] text-lg text-[#718078] hover:bg-[#f0f4ef]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const primaryButton =
  "rounded-xl bg-[#226b4c] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1a553c] disabled:opacity-60";
export const secondaryButton =
  "rounded-xl border border-[#dfe7df] px-4 py-2.5 text-sm font-semibold text-[#718078] hover:bg-[#f0f4ef] disabled:opacity-60";
export const smallButton =
  "rounded-lg border border-[#dfe7df] px-2.5 py-1 text-xs font-semibold text-[#226b4c] hover:bg-[#e4f2e9] disabled:opacity-40";
