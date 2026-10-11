"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CollectionMethod, Customer, LedgerEntry } from "@/lib/types";
import { useStore } from "@/lib/store/store-provider";
import { fetchCustomerLedger, fetchCustomers, recordCustomerPayment, saveCustomer } from "@/lib/supabase/services/customers";
import { isPrice } from "@/lib/validation";
import {
  ErrorBox,
  Intro,
  Kpi,
  Modal,
  PAGE_SIZE,
  Pager,
  dateLabel,
  inputClass,
  money2,
  primaryButton,
  secondaryButton,
  smallButton,
  useDebounced,
  usePaging,
  type ToastFn,
} from "@/components/ui";

const collectionMethods: CollectionMethod[] = ["Cash", "UPI", "Card", "Other"];

function BalanceText({ balance }: { balance: number }) {
  if (balance > 0) return <span className="font-semibold text-[#c25e4a]">Owes {money2(balance)}</span>;
  if (balance < 0) return <span className="font-semibold text-[#226b4c]">Advance {money2(-balance)}</span>;
  return <span className="text-[#87948c]">Settled</span>;
}

function reminderLink(customer: Customer, storeName: string) {
  const digits = customer.phone.replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const text = `Hello ${customer.name}, this is a friendly reminder from ${storeName}: your pending balance is ${money2(customer.balance)}. Thank you!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function Customers({ notify }: { notify: ToastFn }) {
  const store = useStore();
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim());
  const [showInactive, setShowInactive] = useState(false);
  const { page, setPage } = usePaging(`${query}|${showInactive}`);
  const [data, setData] = useState<{ total: number; rows: Customer[]; totalOutstanding: number }>({ total: 0, rows: [], totalOutstanding: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [paying, setPaying] = useState<Customer | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const result = await fetchCustomers({ search: query, includeInactive: showInactive, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
        if (!cancelled) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load customers.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [query, showInactive, page, store.dataVersion, reload]);

  const refresh = () => setReload((value) => value + 1);
  const storeName = store.storeSettings?.storeName || "Mallu Mart";

  return (
    <>
      <Intro
        title="Customers"
        subtitle="Regular customers and their khata (credit) balances. Credit sales add to the balance; payments reduce it."
        action="Add customer"
        onAction={() => setEditing("new")}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="Total outstanding" value={money2(data.totalOutstanding)} detail="Owed by all customers" />
        <Kpi label="Customers" value={`${data.total}`} detail={showInactive ? "Including inactive" : "Active"} />
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or phone..."
          className="w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#b9d8c2] sm:max-w-sm"
        />
        {store.isOwner && (
          <label className="flex items-center gap-2 text-sm text-[#718078]">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        )}
      </div>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-2xl border border-[#e4e9e4] bg-white shadow-sm">
        <table className={`w-full min-w-[640px] text-left text-sm ${loading ? "opacity-60" : ""}`}>
          <thead className="border-b border-[#e4e9e4] bg-[#fbfcfa] text-xs text-[#87948c]">
            <tr>
              <th className="px-5 py-4">Customer</th>
              <th>Phone</th>
              <th>Balance</th>
              <th className="pr-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f4ef]">
            {data.rows.map((customer) => (
              <tr key={customer.id} className="hover:bg-[#fbfcfa]">
                <td className="px-5 py-3">
                  <button type="button" onClick={() => setViewing(customer)} className="font-semibold text-[#1f2924] hover:underline">
                    {customer.name}
                  </button>
                  {!customer.isActive && <span className="ml-2 text-xs text-[#87948c]">inactive</span>}
                  {customer.notes && <div className="text-xs text-[#87948c]">{customer.notes}</div>}
                </td>
                <td className="text-[#718078]">{customer.phone || "-"}</td>
                <td>
                  <BalanceText balance={customer.balance} />
                </td>
                <td className="space-x-2 pr-5 text-right">
                  <button type="button" onClick={() => setViewing(customer)} className={smallButton}>
                    Ledger
                  </button>
                  <button type="button" onClick={() => setPaying(customer)} className={smallButton}>
                    Receive payment
                  </button>
                  <button type="button" onClick={() => setEditing(customer)} className={`${smallButton} text-[#1f2924]`}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.rows.length === 0 && (
          <div className="p-12 text-center text-sm text-[#718078]">
            {query ? `No customers match "${query}".` : "No customers yet. Add one here or while recording a sale."}
          </div>
        )}
        <Pager page={page} total={data.total} onPage={setPage} />
      </div>

      {editing && (
        <CustomerForm
          customer={editing === "new" ? undefined : editing}
          isOwner={store.isOwner}
          close={() => setEditing(null)}
          saved={(message) => {
            setEditing(null);
            notify(message);
            refresh();
          }}
        />
      )}

      {paying && (
        <PaymentForm
          customer={paying}
          close={() => setPaying(null)}
          saved={(message) => {
            setPaying(null);
            notify(message);
            refresh();
          }}
        />
      )}

      {viewing && (
        <LedgerModal
          customerId={viewing.id}
          version={store.dataVersion + reload}
          storeName={storeName}
          close={() => setViewing(null)}
          receivePayment={(customer) => setPaying(customer)}
        />
      )}
    </>
  );
}

function CustomerForm({
  customer,
  isOwner,
  close,
  saved,
}: {
  customer?: Customer;
  isOwner: boolean;
  close: () => void;
  saved: (message: string) => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [isActive, setIsActive] = useState(customer?.isActive ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) return setError("Name is required.");
    setSaving(true);
    const result = await saveCustomer({ id: customer?.id, name, phone, notes, isActive });
    setSaving(false);
    if (!result.ok) return setError(result.error ?? "Could not save the customer.");
    saved(customer ? "Customer updated" : "Customer added");
  };

  return (
    <Modal title={customer ? "Edit customer" : "Add customer"} onClose={close}>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          Name
          <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
        </label>
        <label className="block text-sm font-medium">
          Phone <span className="font-normal text-[#87948c]">(for WhatsApp receipts and reminders)</span>
          <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Notes <span className="font-normal text-[#87948c]">(optional)</span>
          <input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="House name, area..." className={inputClass} />
        </label>
        {customer && isOwner && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active (inactive customers are hidden from search; their balance must be settled first)
          </label>
        )}
        <ErrorBox message={error} />
        <div className="flex justify-end gap-3 border-t pt-4">
          <button type="button" onClick={close} className={secondaryButton}>
            Cancel
          </button>
          <button disabled={saving} className={primaryButton}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentForm({ customer, close, saved }: { customer: Customer; close: () => void; saved: (message: string) => void }) {
  const [amount, setAmount] = useState(customer.balance > 0 ? String(customer.balance) : "");
  const [method, setMethod] = useState<CollectionMethod>("Cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const value = Number(amount);
  const after = customer.balance - (Number.isFinite(value) ? value : 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!amount || value <= 0 || !isPrice(value)) return setError("Enter an amount more than 0, with at most 2 decimals.");
    setSaving(true);
    const result = await recordCustomerPayment(customer.id, value, method, notes.trim());
    setSaving(false);
    if (!result.ok) return setError(result.error ?? "Could not record the payment.");
    saved(`Received ${money2(value)} from ${customer.name}`);
  };

  return (
    <Modal title="Receive payment" subtitle={<>{customer.name} · <BalanceText balance={customer.balance} /></>} onClose={close}>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          Amount (₹)
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} autoFocus />
        </label>
        <div>
          <span className="text-sm font-medium">Paid by</span>
          <div className="mt-1.5 flex gap-1.5">
            {collectionMethods.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMethod(item)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  method === item ? "border-[#226b4c] bg-[#e4f2e9] text-[#226b4c]" : "border-[#dfe7df] text-[#718078]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm font-medium">
          Note <span className="font-normal text-[#87948c]">(optional)</span>
          <input value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </label>
        <div className="rounded-xl bg-[#f0f6f0] p-3 text-sm">
          Balance after payment: <BalanceText balance={Math.round(after * 100) / 100} />
        </div>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-3 border-t pt-4">
          <button type="button" onClick={close} className={secondaryButton}>
            Cancel
          </button>
          <button disabled={saving} className={primaryButton}>
            {saving ? "Saving..." : "Record payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const kindLabels: Record<LedgerEntry["kind"], string> = { sale: "Sale", refund: "Refund", payment: "Payment" };

function LedgerModal({
  customerId,
  version,
  storeName,
  close,
  receivePayment,
}: {
  customerId: string;
  version: number;
  storeName: string;
  close: () => void;
  receivePayment: (customer: Customer) => void;
}) {
  const { page, setPage } = usePaging(customerId);
  const [data, setData] = useState<{ customer: Customer; total: number; rows: LedgerEntry[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchCustomerLedger(customerId, PAGE_SIZE, page * PAGE_SIZE)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the ledger.");
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, page, version]);

  const customer = data?.customer;

  return (
    <Modal
      title={customer?.name ?? "Customer"}
      subtitle={customer && <>{customer.phone || "No phone"} · <BalanceText balance={customer.balance} /></>}
      onClose={close}
      wide
    >
      <div className="mt-4 flex flex-wrap gap-2">
        {customer && (
          <button type="button" onClick={() => receivePayment(customer)} className={primaryButton}>
            Receive payment
          </button>
        )}
        {customer && customer.balance > 0 && customer.phone && (
          <a href={reminderLink(customer, storeName)} target="_blank" rel="noreferrer" className={`${secondaryButton} inline-flex items-center`}>
            WhatsApp reminder
          </a>
        )}
      </div>

      <div className="mt-4">
        <ErrorBox message={error} />
      </div>

      <div className="max-h-[50vh] overflow-y-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-[#87948c]">
            <tr>
              <th className="py-2">Date</th>
              <th>Entry</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Khata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f4ef]">
            {data?.rows.map((entry) => (
              <tr key={`${entry.kind}-${entry.id}`}>
                <td className="py-2 text-[#718078]">{dateLabel(entry.createdAt)}</td>
                <td>
                  <b>{kindLabels[entry.kind]}</b> {entry.reference}
                  <div className="text-xs text-[#87948c]">
                    {entry.kind === "sale" && entry.method !== "Credit" ? `Paid by ${entry.method}` : entry.method === "Credit" ? "On credit" : entry.method}
                    {entry.notes && ` · ${entry.notes}`}
                    {entry.performedBy && ` · ${entry.performedBy}`}
                  </div>
                </td>
                <td className="text-right">{money2(entry.amount)}</td>
                <td className={`text-right font-semibold ${entry.balanceEffect > 0 ? "text-[#c25e4a]" : entry.balanceEffect < 0 ? "text-[#226b4c]" : "text-[#a0aaa4]"}`}>
                  {entry.balanceEffect === 0 ? "-" : `${entry.balanceEffect > 0 ? "+" : "−"}${money2(Math.abs(entry.balanceEffect))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 && <div className="p-8 text-center text-sm text-[#718078]">No purchases or payments yet.</div>}
      </div>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </Modal>
  );
}
