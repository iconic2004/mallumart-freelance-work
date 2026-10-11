import type { DateRange } from "@/lib/types";

// Date ranges are half-open [from, to) in the browser's local time zone, and
// are sent to the database as exact instants.

export type PeriodKey =
  | "today"
  | "yesterday"
  | "7-days"
  | "30-days"
  | "this-month"
  | "last-month"
  | "this-year"
  | "custom";

export const periodLabels: Record<PeriodKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7-days": "Last 7 days",
  "30-days": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
  custom: "Custom range",
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export function periodRange(key: Exclude<PeriodKey, "custom">, now: Date = new Date()): DateRange {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (key) {
    case "today":
      return { from: today, to: tomorrow };
    case "yesterday":
      return { from: addDays(today, -1), to: today };
    case "7-days":
      return { from: addDays(today, -6), to: tomorrow };
    case "30-days":
      return { from: addDays(today, -29), to: tomorrow };
    case "this-month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow };
    case "last-month":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 1),
      };
    case "this-year":
      return { from: new Date(now.getFullYear(), 0, 1), to: tomorrow };
  }
}

// "YYYY-MM-DD" in local time, for <input type="date">.
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || toDateInput(date) !== value ? null : date;
}

// Custom range from two inclusive calendar dates.
export function customRange(fromValue: string, toValue: string): DateRange | null {
  const from = fromDateInput(fromValue);
  const to = fromDateInput(toValue);
  if (!from || !to || to < from) return null;
  return { from, to: addDays(to, 1) };
}

export function rangeLabel(range: DateRange): string {
  const format = (date: Date) => date.toLocaleDateString("en-IN", { dateStyle: "medium" });
  const lastDay = addDays(range.to, -1);
  return lastDay.getTime() === range.from.getTime() ? format(range.from) : `${format(range.from)} – ${format(lastDay)}`;
}

export function rangeFileStamp(range: DateRange): string {
  const lastDay = addDays(range.to, -1);
  const from = toDateInput(range.from);
  const to = toDateInput(lastDay);
  return from === to ? from : `${from}_to_${to}`;
}
