"use client";

import { useState, type FormEvent } from "react";
import type { Sale, StoreSettings } from "@/lib/types";
import { formatQuantity, quantityError, quantityStep } from "@/lib/validation";
import { ErrorBox, Modal, dateLabel, inputClass, money2, primaryButton, secondaryButton, smallButton } from "@/components/ui";

type PaperWidth = "58" | "80";

function readPaperWidth(): PaperWidth {
  try {
    return localStorage.getItem("mallu-mart-paper") === "58" ? "58" : "80";
  } catch {
    return "80";
  }
}

// GST is included in prices; split each rate's tax equally into CGST and SGST
// (an intra-state sale).
function gstSummary(sale: Sale) {
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const item of sale.saleItems) {
    if (!item.gstRate) continue;
    const entry = byRate.get(item.gstRate) ?? { taxable: 0, tax: 0 };
    entry.taxable += item.totalAmount - item.taxAmount;
    entry.tax += item.taxAmount;
    byRate.set(item.gstRate, entry);
  }
  return [...byRate.entries()].sort((a, b) => a[0] - b[0]);
}

export function receiptText(sale: Sale, store: StoreSettings | null) {
  const lines = [
    `*${store?.storeName || "Mallu Mart"}*`,
    store?.address,
    store?.gstin ? `GSTIN: ${store.gstin}` : "",
    "",
    `Invoice: ${sale.invoiceNumber}`,
    `Date: ${dateLabel(sale.createdAt)}`,
    "",
    ...sale.saleItems.map(
      (item) => `${item.productName}\n  ${formatQuantity(item.quantity, item.unit)} x ${money2(item.sellingPrice)} = ${money2(item.totalAmount)}`
    ),
    "",
    `*Total: ${money2(sale.totalAmount)}* (${sale.paymentMethod === "Credit" ? "on credit" : `paid by ${sale.paymentMethod}`})`,
    sale.taxAmount > 0 ? `Includes GST ${money2(sale.taxAmount)}` : "",
    ...sale.refunds.map((refund) => `Refunded ${money2(refund.amount)} (${refund.refundNumber})`),
    "",
    store?.receiptFooter ?? "",
  ];
  return lines.filter((line, index, all) => line !== undefined && !(line === "" && all[index - 1] === "")).join("\n");
}

export function whatsappLink(sale: Sale, store: StoreSettings | null) {
  const digits = (sale.customer?.phone ?? "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${phone}?text=${encodeURIComponent(receiptText(sale, store))}`;
}

export function Receipt({ sale, store, paper = "80" }: { sale: Sale; store: StoreSettings | null; paper?: PaperWidth }) {
  const gst = store?.gstin ? gstSummary(sale) : [];
  const net = sale.totalAmount - sale.refundedAmount;
  return (
    <div className={`print-receipt receipt-${paper} mx-auto bg-white font-mono text-[12px] leading-snug text-black`}>
      <div className="text-center">
        <div className="text-[15px] font-bold">{store?.storeName || "Mallu Mart"}</div>
        {store?.address && <div className="whitespace-pre-line">{store.address}</div>}
        {store?.phone && <div>Ph: {store.phone}</div>}
        {store?.gstin && <div>GSTIN: {store.gstin}</div>}
        <div className="mt-1 font-bold">{store?.gstin ? "TAX INVOICE" : "RECEIPT"}</div>
      </div>

      <div className="mt-2 border-t border-dashed border-black pt-1">
        <div className="flex justify-between">
          <span>{sale.invoiceNumber}</span>
          <span>{new Date(sale.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
        </div>
        {sale.cashierName && <div>Cashier: {sale.cashierName}</div>}
        {sale.customer && (
          <div>
            Customer: {sale.customer.name}
            {sale.customer.phone && ` (${sale.customer.phone})`}
          </div>
        )}
      </div>

      <div className="mt-1 border-t border-dashed border-black pt-1">
        {sale.saleItems.map((item) => (
          <div key={item.id} className="py-0.5">
            <div>
              {item.productName}
              {store?.gstin && item.hsnCode && <span> · HSN {item.hsnCode}</span>}
            </div>
            <div className="flex justify-between">
              <span>
                {formatQuantity(item.quantity, item.unit)} × {money2(item.sellingPrice)}
                {store?.gstin && item.gstRate > 0 && <span> · {item.gstRate}%</span>}
              </span>
              <span>{money2(item.totalAmount)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1 border-t border-dashed border-black pt-1">
        <div className="flex justify-between text-[14px] font-bold">
          <span>TOTAL</span>
          <span>{money2(sale.totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span>{sale.paymentMethod === "Credit" ? "On credit (khata)" : `Paid by ${sale.paymentMethod}`}</span>
        </div>
        {gst.length > 0 && (
          <div className="mt-1">
            {gst.map(([rate, value]) => (
              <div key={rate} className="flex justify-between">
                <span>
                  GST {rate}% on {money2(value.taxable)}
                </span>
                <span>
                  C {money2(value.tax / 2)} + S {money2(value.tax / 2)}
                </span>
              </div>
            ))}
          </div>
        )}
        {sale.refunds.map((refund) => (
          <div key={refund.refundNumber} className="flex justify-between">
            <span>Refund {refund.refundNumber}</span>
            <span>-{money2(refund.amount)}</span>
          </div>
        ))}
        {sale.refunds.length > 0 && (
          <div className="flex justify-between font-bold">
            <span>NET</span>
            <span>{money2(net)}</span>
          </div>
        )}
      </div>

      {store?.receiptFooter && <div className="mt-2 border-t border-dashed border-black pt-1 text-center">{store.receiptFooter}</div>}
    </div>
  );
}

const statusLabels: Record<Sale["status"], string> = {
  completed: "",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
};

export function StatusBadge({ status }: { status: Sale["status"] }) {
  if (status === "completed") return null;
  return (
    <span className="ml-2 rounded-md bg-[#fff0ed] px-2 py-0.5 text-[11px] font-semibold text-[#c25e4a]">{statusLabels[status]}</span>
  );
}

// Receipt with print / WhatsApp, plus refund for owners.
export function ReceiptModal({
  sale,
  store,
  isOwner,
  onClose,
  onRefund,
}: {
  sale: Sale;
  store: StoreSettings | null;
  isOwner: boolean;
  onClose: () => void;
  onRefund?: (lines: { saleItemId: string; quantity: number }[], reason: string) => Promise<string | undefined>;
}) {
  const [paper, setPaper] = useState<PaperWidth>(readPaperWidth);
  const [refunding, setRefunding] = useState(false);
  const canRefund = isOwner && onRefund && sale.status !== "refunded";

  const choosePaper = (value: PaperWidth) => {
    setPaper(value);
    try {
      localStorage.setItem("mallu-mart-paper", value);
    } catch {
      // Storage unavailable (private mode); the choice just isn't remembered.
    }
  };

  return (
    <Modal
      title={sale.invoiceNumber}
      subtitle={
        <>
          {dateLabel(sale.createdAt)}
          <StatusBadge status={sale.status} />
        </>
      }
      onClose={onClose}
    >
      <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-xl border border-[#e4e9e4] bg-white p-3">
        <Receipt sale={sale} store={store} paper={paper} />
      </div>

      {isOwner && sale.grossProfit !== null && (
        <div className="mt-2 flex justify-between text-xs text-[#4f9568]">
          <span>Gross profit (before refunds)</span>
          <span>{money2(sale.grossProfit)}</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-1 text-xs text-[#718078]">
          Paper
          {(["58", "80"] as PaperWidth[]).map((width) => (
            <button
              key={width}
              type="button"
              onClick={() => choosePaper(width)}
              className={`rounded-md px-2 py-1 font-semibold ${paper === width ? "bg-[#e4f2e9] text-[#226b4c]" : "hover:bg-[#f0f4ef]"}`}
            >
              {width} mm
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {canRefund && (
            <button type="button" onClick={() => setRefunding(true)} className={`${smallButton} border-[#f2d9d3] py-2 text-[#c25e4a] hover:bg-[#fff0ed]`}>
              Refund / void
            </button>
          )}
          <a href={whatsappLink(sale, store)} target="_blank" rel="noreferrer" className={`${smallButton} py-2`}>
            WhatsApp
          </a>
          <button type="button" onClick={() => window.print()} className={primaryButton}>
            Print
          </button>
        </div>
      </div>

      {refunding && onRefund && (
        <RefundModal
          sale={sale}
          onClose={() => setRefunding(false)}
          submit={async (lines, reason) => {
            const error = await onRefund(lines, reason);
            if (!error) setRefunding(false);
            return error;
          }}
        />
      )}
    </Modal>
  );
}

// Owner refunds: some quantity of some lines, or everything that's left.
function RefundModal({
  sale,
  onClose,
  submit,
}: {
  sale: Sale;
  onClose: () => void;
  submit: (lines: { saleItemId: string; quantity: number }[], reason: string) => Promise<string | undefined>;
}) {
  const refundable = sale.saleItems.filter((item) => item.quantity - item.refundedQuantity > 0);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [everything, setEverything] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const lines = everything
    ? refundable.map((item) => ({ item, quantity: item.quantity - item.refundedQuantity }))
    : refundable
        .map((item) => ({ item, quantity: Number(quantities[item.id] || 0) }))
        .filter((line) => line.quantity > 0);
  const estimate = lines.reduce((sum, { item, quantity }) => sum + item.sellingPrice * quantity, 0);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!lines.length) return setError("Choose what to refund.");
    for (const { item, quantity } of lines) {
      const left = item.quantity - item.refundedQuantity;
      const problem = quantityError(quantity, item.unit);
      if (problem) return setError(`${item.productName}: ${problem}`);
      if (quantity > left + 1e-9) return setError(`${item.productName}: only ${formatQuantity(left, item.unit)} can be refunded.`);
    }
    if (reason.trim().length < 3) return setError("Give a reason (at least 3 characters).");
    setSaving(true);
    const saveError = await submit(everything ? [] : lines.map(({ item, quantity }) => ({ saleItemId: item.id, quantity })), reason.trim());
    setSaving(false);
    if (saveError) setError(saveError);
  };

  return (
    <Modal title="Refund / void" subtitle={`${sale.invoiceNumber} · stock is returned to inventory`} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        <div className="mt-4 flex gap-2 text-sm">
          <button type="button" onClick={() => setEverything(true)} className={`rounded-lg px-3 py-1.5 font-semibold ${everything ? "bg-[#fff0ed] text-[#c25e4a]" : "text-[#718078] hover:bg-[#f0f4ef]"}`}>
            Everything left (void)
          </button>
          <button type="button" onClick={() => setEverything(false)} className={`rounded-lg px-3 py-1.5 font-semibold ${!everything ? "bg-[#fff0ed] text-[#c25e4a]" : "text-[#718078] hover:bg-[#f0f4ef]"}`}>
            Some items
          </button>
        </div>

        <div className="mt-3 max-h-60 divide-y divide-[#f0f4ef] overflow-y-auto">
          {refundable.map((item) => {
            const left = item.quantity - item.refundedQuantity;
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <b>{item.productName}</b>
                  <div className="text-xs text-[#87948c]">
                    {formatQuantity(left, item.unit)} refundable · {money2(item.sellingPrice)} each
                  </div>
                </div>
                {everything ? (
                  <span className="text-xs font-semibold text-[#c25e4a]">{formatQuantity(left, item.unit)}</span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={left}
                    step={quantityStep(item.unit)}
                    value={quantities[item.id] ?? ""}
                    placeholder="0"
                    onChange={(e) => setQuantities((current) => ({ ...current, [item.id]: e.target.value }))}
                    className="w-24 rounded-xl border border-[#dfe7df] px-3 py-1.5 text-center text-sm"
                  />
                )}
              </div>
            );
          })}
        </div>

        <label className="mt-4 block text-sm font-medium">
          Reason
          <input type="text" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong item billed, customer returned..." className={inputClass} />
        </label>

        <div className="mt-4 flex justify-between rounded-xl bg-[#fff0ed] p-3 text-sm text-[#c25e4a]">
          <span>To refund{sale.paymentMethod === "Credit" ? " (taken off the customer's khata)" : ` (pay back by ${sale.paymentMethod})`}</span>
          <b>{money2(estimate)}</b>
        </div>

        <div className="mt-4">
          <ErrorBox message={error} />
        </div>

        <div className="mt-2 flex justify-end gap-3 border-t pt-4">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button disabled={saving} className="rounded-xl bg-[#c25e4a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#a84d3b] disabled:opacity-60">
            {saving ? "Refunding..." : "Confirm refund"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
