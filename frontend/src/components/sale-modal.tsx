"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Customer, PaymentMethod, Product } from "@/lib/types";
import { fetchCustomers, saveCustomer } from "@/lib/supabase/services/customers";
import { formatQuantity, quantityError, quantityStep, unitLabels } from "@/lib/validation";
import { ErrorBox, Modal, inputClass, money, money2, primaryButton, useDebounced } from "@/components/ui";

type CartLine = { productId: string; quantity: string };

const paymentMethods: PaymentMethod[] = ["Cash", "UPI", "Card", "Credit", "Other"];

const matches = (product: Product, query: string) => {
  const q = query.toLowerCase();
  return (
    product.name.toLowerCase().includes(q) ||
    product.sku.toLowerCase().includes(q) ||
    (product.barcode ?? "").toLowerCase().includes(q)
  );
};

export function SaleModal({
  products,
  close,
  complete,
}: {
  products: Product[];
  close: () => void;
  // Resolves with an error message, or undefined on success.
  complete: (lines: { productId: string; quantity: number }[], method: PaymentMethod, customerId: string | null) => Promise<string | undefined>;
}) {
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tendered, setTendered] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const results = query.trim() ? products.filter((product) => matches(product, query.trim())).slice(0, 8) : [];

  const inCart = (productId: string) => Number(lines.find((line) => line.productId === productId)?.quantity || 0);

  const addProduct = (product: Product, amount = 1) => {
    setError("");
    if (product.stockQuantity - inCart(product.id) <= 0) {
      setError(`${product.name} is out of stock.`);
      return;
    }
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      // Weighed goods: add the line, then type the weight.
      if (product.unit !== "pcs") {
        return existing ? current : [...current, { productId: product.id, quantity: "" }];
      }
      return existing
        ? current.map((line) => (line.productId === product.id ? { ...line, quantity: String(Number(line.quantity || 0) + amount) } : line))
        : [...current, { productId: product.id, quantity: String(amount) }];
    });
    setQuery("");
    if (product.unit !== "pcs") {
      window.setTimeout(() => quantityRefs.current[product.id]?.focus(), 0);
    } else {
      searchRef.current?.focus();
    }
  };

  // Barcode scanners type the code and press Enter.
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = query.trim().toLowerCase();
    if (!code) return;
    const exact = products.find((p) => (p.barcode ?? "").toLowerCase() === code || p.sku.toLowerCase() === code);
    if (exact) return addProduct(exact);
    if (results.length === 1) return addProduct(results[0]);
    setError(results.length ? "Several products match; pick one from the list." : `No product matches "${query.trim()}".`);
  };

  const setQuantity = (productId: string, quantity: string) =>
    setLines((current) => current.map((line) => (line.productId === productId ? { ...line, quantity } : line)));

  const total = lines.reduce((sum, line) => {
    const product = byId.get(line.productId);
    return sum + (product ? Math.round(product.sellingPrice * Number(line.quantity || 0) * 100) / 100 : 0);
  }, 0);

  const change = method === "Cash" && tendered !== "" ? Number(tendered) - total : null;

  const handleConfirm = async () => {
    setError("");
    if (!lines.length) return setError("Add at least one product.");
    for (const line of lines) {
      const product = byId.get(line.productId);
      if (!product) return setError("A product in the cart is no longer available.");
      const quantity = Number(line.quantity);
      const problem = line.quantity === "" ? "Enter a quantity." : quantityError(quantity, product.unit);
      if (problem) return setError(`${product.name}: ${problem}`);
      if (quantity > product.stockQuantity) return setError(`${product.name}: only ${formatQuantity(product.stockQuantity, product.unit)} in stock.`);
    }
    if (method === "Credit" && !customer) return setError("Choose the customer for a credit (khata) sale.");

    setSubmitting(true);
    const saleError = await complete(
      lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
      method,
      customer?.id ?? null
    );
    setSubmitting(false);
    if (saleError) setError(saleError);
  };

  return (
    <Modal title="Record sale" subtitle="Search, or scan a barcode, to add items" onClose={close} wide>
      <div className="relative mt-5">
        <input
          ref={searchRef}
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Product name, SKU or barcode..."
          className={`${inputClass} mt-0`}
          aria-label="Search products"
        />
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border border-[#e4e9e4] bg-white shadow-xl">
            {results.map((product) => {
              const available = product.stockQuantity - inCart(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={available <= 0}
                  onClick={() => addProduct(product)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-[#f4f8f3] disabled:opacity-40"
                >
                  <span>
                    <b className="text-[#1f2924]">{product.name}</b>
                    <span className="ml-2 text-xs text-[#87948c]">{product.sku}</span>
                  </span>
                  <span className="text-xs text-[#718078]">
                    {money2(product.sellingPrice)}
                    {product.unit !== "pcs" && `/${unitLabels[product.unit]}`} · {formatQuantity(Math.max(available, 0), product.unit)} left
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {query.trim() && results.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-[#e4e9e4] bg-white px-4 py-3 text-sm text-[#718078] shadow-xl">
            {products.length === 0
              ? "No products are loaded. Add products under Inventory first, or refresh the page."
              : `No product matches "${query.trim()}". Check the spelling, or add it under Inventory.`}
          </div>
        )}
      </div>

      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
        {lines.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#dfe7df] p-6 text-center text-xs text-[#87948c]">No items in the cart yet.</div>
        )}
        {lines.map((line) => {
          const product = byId.get(line.productId);
          if (!product) return null;
          const lineTotal = Math.round(product.sellingPrice * Number(line.quantity || 0) * 100) / 100;
          return (
            <div key={line.productId} className="flex items-center justify-between gap-3 rounded-xl bg-[#f4f8f3] px-3 py-2 text-sm">
              <div className="min-w-0">
                <b className="block truncate">{product.name}</b>
                <span className="text-xs text-[#718078]">
                  {money2(product.sellingPrice)}
                  {product.unit !== "pcs" && ` per ${unitLabels[product.unit]}`}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  ref={(element) => {
                    quantityRefs.current[product.id] = element;
                  }}
                  type="number"
                  min={0}
                  step={quantityStep(product.unit)}
                  value={line.quantity}
                  placeholder={product.unit === "pcs" ? "1" : "0.000"}
                  onChange={(event) => setQuantity(product.id, event.target.value)}
                  className="w-20 rounded-lg border border-[#dfe7df] bg-white px-2 py-1.5 text-center text-sm"
                  aria-label={`Quantity of ${product.name}`}
                />
                <span className="w-6 text-xs text-[#718078]">{product.unit === "pcs" ? "" : unitLabels[product.unit]}</span>
                <b className="w-20 text-right">{money2(lineTotal)}</b>
                <button
                  type="button"
                  onClick={() => setLines((current) => current.filter((item) => item.productId !== product.id))}
                  className="text-xs font-semibold text-[#c25e4a] hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <span className="text-sm font-medium">Payment</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {paymentMethods.map((payment) => (
              <button
                key={payment}
                type="button"
                onClick={() => setMethod(payment)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  method === payment ? "border-[#226b4c] bg-[#e4f2e9] text-[#226b4c]" : "border-[#dfe7df] text-[#718078] hover:bg-[#f0f4ef]"
                }`}
              >
                {payment === "Credit" ? "Credit (khata)" : payment}
              </button>
            ))}
          </div>
          {method === "Cash" && (
            <label className="mt-3 block text-xs font-medium text-[#718078]">
              Cash received (optional)
              <input type="number" min={0} step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} className={`${inputClass} mt-1`} />
              {change !== null && (
                <span className={`mt-1 block text-sm font-semibold ${change < 0 ? "text-[#c25e4a]" : "text-[#226b4c]"}`}>
                  {change < 0 ? `Short by ${money2(-change)}` : `Change to return: ${money2(change)}`}
                </span>
              )}
            </label>
          )}
        </div>
        <CustomerPicker customer={customer} onChange={setCustomer} required={method === "Credit"} />
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl bg-[#f0f6f0] p-4 text-[#1f2924]">
        <span className="text-sm font-medium">Total</span>
        <b className="text-xl">{money2(total)}</b>
      </div>

      <div className="mt-3">
        <ErrorBox message={error} />
      </div>

      <button disabled={!lines.length || submitting} onClick={handleConfirm} className={`${primaryButton} mt-2 w-full py-3`}>
        {submitting ? "Processing sale..." : `Confirm sale (${money(total)})`}
      </button>
    </Modal>
  );
}

// Find an existing customer by name/phone, or add one on the spot.
export function CustomerPicker({
  customer,
  onChange,
  required,
}: {
  customer: Customer | null;
  onChange: (customer: Customer | null) => void;
  required: boolean;
}) {
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 250);
  const [results, setResults] = useState<Customer[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    fetchCustomers({ search: query, limit: 6 })
      .then((page) => {
        if (!cancelled) setResults(page.rows);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const create = async () => {
    setError("");
    const result = await saveCustomer({ name, phone, notes: "" });
    if (!result.ok || !result.data) return setError(result.error ?? "Could not add the customer.");
    onChange({ ...result.data, balance: Number(result.data.balance), createdAt: new Date().toISOString() });
    setAdding(false);
    setName("");
    setPhone("");
  };

  if (customer) {
    return (
      <div>
        <span className="text-sm font-medium">Customer</span>
        <div className="mt-1.5 flex items-center justify-between rounded-xl border border-[#dfe7df] px-3 py-2 text-sm">
          <span>
            <b>{customer.name}</b>
            {customer.phone && <span className="ml-2 text-xs text-[#87948c]">{customer.phone}</span>}
            {customer.balance !== 0 && (
              <span className={`block text-xs ${customer.balance > 0 ? "text-[#c25e4a]" : "text-[#226b4c]"}`}>
                {customer.balance > 0 ? `Owes ${money2(customer.balance)}` : `Advance ${money2(-customer.balance)}`}
              </span>
            )}
          </span>
          <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-[#718078] hover:underline">
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <span className="text-sm font-medium">
        Customer {required ? <span className="text-[#c25e4a]">(required for credit)</span> : <span className="font-normal text-[#87948c]">(optional)</span>}
      </span>
      {adding ? (
        <div className="mt-1.5 space-y-2 rounded-xl border border-[#dfe7df] p-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={`${inputClass} mt-0`} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" inputMode="tel" className={`${inputClass} mt-0`} />
          {error && <div className="text-xs text-[#c25e4a]">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="text-xs font-semibold text-[#718078]">
              Cancel
            </button>
            <button type="button" onClick={create} className="rounded-lg bg-[#226b4c] px-3 py-1.5 text-xs font-semibold text-white">
              Add customer
            </button>
          </div>
        </div>
      ) : (
        <>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone..." className={`${inputClass} mt-1.5`} />
          {search.trim() && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-[#e4e9e4] bg-white shadow-xl">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => {
                    onChange(result);
                    setSearch("");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f4f8f3]"
                >
                  <b>{result.name}</b> <span className="text-xs text-[#87948c]">{result.phone}</span>
                  {result.balance > 0 && <span className="ml-2 text-xs text-[#c25e4a]">owes {money2(result.balance)}</span>}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setName(/^\+?[\d\s]+$/.test(search.trim()) ? "" : search.trim());
                  setPhone(/^\+?[\d\s]+$/.test(search.trim()) ? search.trim() : "");
                  setSearch("");
                }}
                className="block w-full border-t border-[#f0f4ef] px-3 py-2 text-left text-sm font-semibold text-[#226b4c] hover:bg-[#f4f8f3]"
              >
                + Add new customer
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
