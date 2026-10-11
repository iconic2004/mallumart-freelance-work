"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CashClosing, CashSummary } from "@/lib/types";
import { useStore } from "@/lib/store/store-provider";
import { closeCash, fetchCashClosings, fetchCashSummary } from "@/lib/supabase/services/cash";
import { customRange, toDateInput } from "@/lib/periods";
import { isPrice } from "@/lib/validation";
import { ErrorBox, Intro, PAGE_SIZE, Pager, inputClass, money2, primaryButton, usePaging, type ToastFn } from "@/components/ui";

function Difference({ value }: { value: number }) {
  if (Math.abs(value) < 0.005) return <span className="font-semibold text-[#226b4c]">✓ Balanced</span>;
  return value > 0 ? (
    <span className="font-semibold text-amber-700">▲ {money2(value)} over</span>
  ) : (
    <span className="font-semibold text-[#c25e4a]">▼ {money2(-value)} short</span>
  );
}

const line = (label: string, value: string, strong = false) => (
  <div className={`flex justify-between py-1.5 text-sm ${strong ? "font-semibold text-[#1f2924]" : "text-[#4c5a52]"}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

export function CashClosingPage({ notify }: { notify: ToastFn }) {
  const store = useStore();
  const today = toDateInput(new Date());
  const [day, setDay] = useState(today);
  // Owners can look at one person's drawer or everyone's; closing is always your own.
  const [personId, setPersonId] = useState(store.userProfile?.userId ?? "");
  const range = useMemo(() => customRange(day, day), [day]);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [error, setError] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const viewingOwn = !store.isOwner || personId === store.userProfile?.userId;

  useEffect(() => {
    const dayRange = customRange(day, day);
    if (!dayRange) return;
    let cancelled = false;
    fetchCashSummary(dayRange, store.isOwner ? personId || null : null)
      .then((result) => {
        if (!cancelled) {
          setSummary(result);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the cash summary.");
      });
    return () => {
      cancelled = true;
    };
  }, [day, personId, store.isOwner, store.dataVersion, reload]);

  const float = Number(openingFloat || 0);
  const expected = summary ? float + summary.cashSales - summary.cashRefunds + summary.cashCollections : 0;
  const countedValue = Number(counted);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!range) return setError("Choose a valid day.");
    if (!isPrice(float)) return setError("Opening float must be 0 or more, with at most 2 decimals.");
    if (counted === "" || !isPrice(countedValue)) return setError("Enter the cash you counted in the drawer.");
    if (!window.confirm(`Close ${day} with ${money2(countedValue)} counted? This can't be changed afterwards.`)) return;
    setSaving(true);
    const result = await closeCash(range, float, countedValue, notes.trim());
    setSaving(false);
    if (!result.ok) return setError(result.error ?? "Could not close the day.");
    notify("Day closed");
    setCounted("");
    setNotes("");
    setReload((value) => value + 1);
  };

  return (
    <>
      <Intro title="Cash Closing" subtitle="End-of-day drawer check: what the system expects in cash against what you count." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} className="rounded-xl border border-[#dfe7df] bg-white px-3 py-2.5 text-sm" aria-label="Business day" />
        {store.isOwner && (
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="rounded-xl border border-[#dfe7df] bg-white px-3 py-2.5 text-sm" aria-label="Whose drawer">
            <option value="">Everyone</option>
            {store.team
              .filter((member) => member.approved)
              .map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName}
                  {member.userId === store.userProfile?.userId ? " (you)" : ""}
                </option>
              ))}
          </select>
        )}
      </div>

      <ErrorBox message={error} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">Takings for the day</h2>
          <p className="text-xs text-[#87948c]">
            {viewingOwn ? "Sales you billed, refunds you paid out and khata payments you collected." : "Everything recorded by the selected people."}
          </p>
          {summary && (
            <div className="mt-3 divide-y divide-[#f0f4ef]">
              {line("Sales", `${summary.salesCount}`)}
              {line("Cash sales", money2(summary.cashSales))}
              {line("Cash refunds paid out", `− ${money2(summary.cashRefunds)}`)}
              {line("Khata payments received in cash", money2(summary.cashCollections))}
              {line("UPI", money2(summary.upiSales))}
              {line("Card", money2(summary.cardSales))}
              {line("Other", money2(summary.otherSales))}
              {line("On credit (khata)", money2(summary.creditSales))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#e4e9e4] bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#1f2924]">Close your drawer</h2>
          {viewingOwn ? (
            <form onSubmit={submit} noValidate className="mt-3 space-y-3">
              <label className="block text-sm font-medium">
                Opening float (₹) <span className="font-normal text-[#87948c]">(cash in the drawer at opening)</span>
                <input type="number" min={0} step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} className={inputClass} />
              </label>
              <div className="rounded-xl bg-[#f0f6f0] p-3">
                {line("Expected cash in drawer", money2(expected), true)}
                <div className="text-[11px] text-[#718078]">float + cash sales − cash refunds + cash collected on khata</div>
              </div>
              <label className="block text-sm font-medium">
                Counted cash (₹)
                <input type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} className={inputClass} />
              </label>
              {counted !== "" && Number.isFinite(countedValue) && (
                <div className="text-sm">
                  Difference: <Difference value={countedValue - expected} />
                </div>
              )}
              <label className="block text-sm font-medium">
                Note <span className="font-normal text-[#87948c]">(optional, e.g. why it&apos;s short)</span>
                <input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
              </label>
              <button disabled={saving || !summary} className={`${primaryButton} w-full`}>
                {saving ? "Closing..." : `Close ${day === today ? "today" : day}`}
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-[#718078]">Choose yourself above to close your own drawer. Each person closes their own.</p>
          )}
        </section>
      </div>

      <ClosingHistory version={store.dataVersion + reload} isOwner={store.isOwner} />
    </>
  );
}

function ClosingHistory({ version, isOwner }: { version: number; isOwner: boolean }) {
  const { page, setPage } = usePaging("closings");
  const [data, setData] = useState<{ total: number; rows: CashClosing[] }>({ total: 0, rows: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 90);
    fetchCashClosings(from, to, PAGE_SIZE, page * PAGE_SIZE)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load past closings.");
      });
    return () => {
      cancelled = true;
    };
  }, [page, version]);

  return (
    <section className="mt-6 overflow-x-auto rounded-2xl border border-[#e4e9e4] bg-white shadow-sm">
      <h2 className="px-5 pt-5 font-semibold text-[#1f2924]">{isOwner ? "All closings, last 90 days" : "Your closings, last 90 days"}</h2>
      <div className="px-5">
        <ErrorBox message={error} />
      </div>
      <table className="mt-3 w-full min-w-[720px] text-left text-sm">
        <thead className="border-y border-[#e4e9e4] bg-[#fbfcfa] text-xs text-[#87948c]">
          <tr>
            <th className="px-5 py-3">Day</th>
            <th>Cashier</th>
            <th className="text-right">Expected</th>
            <th className="text-right">Counted</th>
            <th className="pl-6">Result</th>
            <th className="pr-5">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0f4ef]">
          {data.rows.map((closing) => (
            <tr key={closing.id}>
              <td className="px-5 py-2.5">{new Date(`${closing.businessDate}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td>
              <td>{closing.cashierName}</td>
              <td className="text-right">{money2(closing.expectedCash)}</td>
              <td className="text-right">{money2(closing.countedCash)}</td>
              <td className="pl-6">
                <Difference value={closing.difference} />
              </td>
              <td className="pr-5 text-[#718078]">{closing.notes || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.rows.length === 0 && <div className="p-8 text-center text-sm text-[#718078]">No closings yet.</div>}
      <Pager page={page} total={data.total} onPage={setPage} />
    </section>
  );
}
