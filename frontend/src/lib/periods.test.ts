import { describe, expect, it } from "vitest";
import { customRange, fromDateInput, periodRange, rangeFileStamp, rangeLabel, toDateInput } from "./periods";

// 15 March 2026, 14:30 local time
const now = new Date(2026, 2, 15, 14, 30);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("periodRange", () => {
  it("today covers midnight to midnight", () => {
    expect(periodRange("today", now)).toEqual({ from: day(2026, 3, 15), to: day(2026, 3, 16) });
  });

  it("yesterday ends where today starts", () => {
    expect(periodRange("yesterday", now)).toEqual({ from: day(2026, 3, 14), to: day(2026, 3, 15) });
  });

  it("last 7 days includes today and the 6 days before", () => {
    expect(periodRange("7-days", now)).toEqual({ from: day(2026, 3, 9), to: day(2026, 3, 16) });
  });

  it("last 30 days includes today", () => {
    expect(periodRange("30-days", now)).toEqual({ from: day(2026, 2, 14), to: day(2026, 3, 16) });
  });

  it("this month runs from the 1st to the end of today", () => {
    expect(periodRange("this-month", now)).toEqual({ from: day(2026, 3, 1), to: day(2026, 3, 16) });
  });

  it("last month is the whole previous calendar month", () => {
    expect(periodRange("last-month", now)).toEqual({ from: day(2026, 2, 1), to: day(2026, 3, 1) });
  });

  it("last month in January is December of the previous year", () => {
    expect(periodRange("last-month", new Date(2026, 0, 10))).toEqual({ from: day(2025, 12, 1), to: day(2026, 1, 1) });
  });

  it("this year starts on 1 January", () => {
    expect(periodRange("this-year", now)).toEqual({ from: day(2026, 1, 1), to: day(2026, 3, 16) });
  });

  it("7 days back across a month boundary", () => {
    expect(periodRange("7-days", new Date(2026, 2, 3))).toEqual({ from: day(2026, 2, 25), to: day(2026, 3, 4) });
  });
});

describe("date inputs", () => {
  it("round-trips YYYY-MM-DD", () => {
    expect(toDateInput(day(2026, 3, 5))).toBe("2026-03-05");
    expect(fromDateInput("2026-03-05")).toEqual(day(2026, 3, 5));
  });

  it("rejects malformed or impossible dates", () => {
    expect(fromDateInput("")).toBeNull();
    expect(fromDateInput("05/03/2026")).toBeNull();
    expect(fromDateInput("2026-02-30")).toBeNull();
  });
});

describe("customRange", () => {
  it("includes the whole last day", () => {
    expect(customRange("2026-01-01", "2026-01-31")).toEqual({ from: day(2026, 1, 1), to: day(2026, 2, 1) });
  });

  it("allows a single day", () => {
    expect(customRange("2026-01-05", "2026-01-05")).toEqual({ from: day(2026, 1, 5), to: day(2026, 1, 6) });
  });

  it("rejects an end date before the start date", () => {
    expect(customRange("2026-02-01", "2026-01-01")).toBeNull();
  });

  it("rejects invalid input", () => {
    expect(customRange("", "2026-01-01")).toBeNull();
  });
});

describe("labels", () => {
  it("shows a single date for a one-day range", () => {
    expect(rangeLabel(periodRange("today", now))).not.toContain("–");
  });

  it("shows start and end dates for longer ranges", () => {
    expect(rangeLabel(periodRange("this-month", now))).toContain("–");
  });

  it("builds file-name stamps from the inclusive dates", () => {
    expect(rangeFileStamp(periodRange("today", now))).toBe("2026-03-15");
    expect(rangeFileStamp(periodRange("last-month", now))).toBe("2026-02-01_to_2026-02-28");
  });
});
