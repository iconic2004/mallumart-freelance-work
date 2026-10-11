"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailySales, DateRange } from "@/lib/types";
import { fetchDailySales } from "@/lib/supabase/services/sales";
import { money, money2 } from "@/components/ui";

// Single series (revenue per day): one hue, validated against the white card
// surface (dataviz validate_palette: lightness, chroma, contrast all pass).
const BAR = "#1f8a5a";
const INK_MUTED = "#87948c";
const GRID = "#eef2ee";

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const compactMoney = (value: number) =>
  value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : value >= 1000 ? `₹${(value / 1000).toFixed(1)}k` : `₹${value}`;

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: DailySales }[] }) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return (
    <div className="rounded-xl border border-[#e4e9e4] bg-white px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-[#1f2924]">
        {new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[#1f2924]">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: BAR }} />
        Revenue <b className="ml-auto pl-3">{money2(day.revenue)}</b>
      </div>
      <div className="flex text-[#718078]">
        Sales <span className="ml-auto pl-3">{day.salesCount}</span>
      </div>
      {day.profit !== null && (
        <div className="flex text-[#718078]">
          Profit <span className="ml-auto pl-3">{money2(day.profit)}</span>
        </div>
      )}
    </div>
  );
}

export function RevenueChart({ range, version, title = "Daily revenue" }: { range: DateRange | null; version: number; title?: string }) {
  const [days, setDays] = useState<DailySales[]>([]);
  const [error, setError] = useState("");
  const [asTable, setAsTable] = useState(false);
  const fromMs = range?.from.getTime() ?? 0;
  const toMs = range?.to.getTime() ?? 0;
  const tooLong = toMs - fromMs > 400 * 24 * 3600 * 1000;

  useEffect(() => {
    if (!fromMs || !toMs || tooLong) return;
    let cancelled = false;
    fetchDailySales({ from: new Date(fromMs), to: new Date(toMs) })
      .then((rows) => {
        if (!cancelled) {
          setDays(rows);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the chart.");
      });
    return () => {
      cancelled = true;
    };
  }, [fromMs, toMs, tooLong, version]);

  if (tooLong) return null;
  const total = days.reduce((sum, day) => sum + day.revenue, 0);

  return (
    <section className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[#1f2924]">{title}</h2>
          <p className="text-xs text-[#718078]">
            {money(total)} across {days.length} day{days.length === 1 ? "" : "s"} · after refunds
          </p>
        </div>
        <button type="button" onClick={() => setAsTable((value) => !value)} className="text-xs font-semibold text-[#226b4c] hover:underline">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-[#c25e4a]">{error}</p>}

      {asTable ? (
        <div className="mt-3 max-h-64 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[#87948c]">
              <tr>
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">Sales</th>
                <th className="py-1 text-right font-medium">Revenue</th>
                {days.some((day) => day.profit !== null) && <th className="py-1 text-right font-medium">Profit</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f4ef]">
              {days.map((day) => (
                <tr key={day.date}>
                  <td className="py-1.5">{dayLabel(day.date)}</td>
                  <td className="py-1.5 text-right">{day.salesCount}</td>
                  <td className="py-1.5 text-right">{money2(day.revenue)}</td>
                  {day.profit !== null && <td className="py-1.5 text-right">{money2(day.profit)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 h-56" role="img" aria-label={`${title}: bar chart of revenue per day, total ${money(total)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={dayLabel}
                tick={{ fill: INK_MUTED, fontSize: 11 }}
                axisLine={{ stroke: GRID }}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                tickFormatter={compactMoney}
                tick={{ fill: INK_MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(31, 138, 90, 0.08)" }} />
              <Bar dataKey="revenue" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
