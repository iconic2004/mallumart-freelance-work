"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { StoreSettings } from "@/lib/types";
import { listVerifiedFactors, removeFactor, startEnrollment, verifyCode, verifySignInCode } from "@/lib/supabase/services/mfa";
import { saveStoreSettings } from "@/lib/supabase/services/settings";
import { ErrorBox, inputClass, primaryButton, secondaryButton, type ToastFn } from "@/components/ui";

const card = "rounded-3xl border border-[#e4e9e4] bg-white p-6 shadow-sm sm:p-8";

function CardHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="border-b border-[#f0f4ef] pb-4">
      <span className="text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">{eyebrow}</span>
      <h2 className="display-font mt-1 text-2xl font-bold text-[#1f2924]">{title}</h2>
      <p className="mt-1 text-xs text-[#718078]">{text}</p>
    </div>
  );
}

const codeInput = (value: string, setValue: (value: string) => void, autoFocus = false) => (
  <input
    value={value}
    onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
    inputMode="numeric"
    autoComplete="one-time-code"
    autoFocus={autoFocus}
    placeholder="123456"
    className={`${inputClass} max-w-[10rem] text-center text-lg tracking-[.3em]`}
    aria-label="6-digit code"
  />
);

// ---------- Settings: turn two-factor authentication on / off ----------

export function TwoFactorSettings({ notify, isOwner }: { notify: ToastFn; isOwner: boolean }) {
  const [factors, setFactors] = useState<{ id: string; created_at: string }[]>([]);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listVerifiedFactors()
      .then((list) => {
        if (!cancelled) setFactors(list);
      })
      .catch(() => {
        if (!cancelled) setFactors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const begin = async () => {
    setError("");
    setBusy(true);
    try {
      setEnrolling(await startEnrollment());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start set-up.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!enrolling) return;
    setError("");
    setBusy(true);
    try {
      await verifyCode(enrolling.factorId, code);
      setEnrolling(null);
      setCode("");
      notify("Two-factor authentication is on");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!window.confirm("Turn off two-factor authentication? Your account will be protected by the password alone.")) return;
    setBusy(true);
    try {
      for (const factor of factors) await removeFactor(factor.id);
      notify("Two-factor authentication is off");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn it off.");
    } finally {
      setBusy(false);
    }
  };

  const enabled = factors.length > 0;

  return (
    <div className={card}>
      <CardHeader
        eyebrow="Account Security"
        title="Two-factor authentication"
        text={
          isOwner
            ? "Recommended for owners: after your password, sign-in asks for a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy)."
            : "Optional: after your password, sign-in asks for a 6-digit code from an authenticator app on your phone."
        }
      />

      <div className="mt-5 space-y-4">
        <p className="text-sm">
          Status:{" "}
          {enabled ? (
            <b className="text-[#226b4c]">✓ On</b>
          ) : (
            <b className={isOwner ? "text-[#c25e4a]" : "text-[#718078]"}>Off</b>
          )}
        </p>

        {!enabled && !enrolling && (
          <button type="button" disabled={busy} onClick={begin} className={primaryButton}>
            Set up authenticator app
          </button>
        )}

        {enrolling && (
          <form onSubmit={confirm} className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Open your authenticator app and add an account by scanning this code.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element -- the QR code is an inline SVG data URL from Supabase */}
            <img src={enrolling.qrCode} alt="QR code for your authenticator app" className="h-44 w-44 rounded-xl border border-[#e4e9e4] bg-white p-2" />
            <p className="text-xs text-[#718078]">
              Can&apos;t scan? Enter this key: <code className="select-all break-all font-mono">{enrolling.secret}</code>
            </p>
            {codeInput(code, setCode, true)}
            <div className="flex gap-3">
              <button type="button" onClick={() => setEnrolling(null)} className={secondaryButton}>
                Cancel
              </button>
              <button disabled={busy || code.length !== 6} className={primaryButton}>
                Turn on
              </button>
            </div>
          </form>
        )}

        {enabled && (
          <button type="button" disabled={busy} onClick={turnOff} className={secondaryButton}>
            Turn off
          </button>
        )}

        <ErrorBox message={error} />
      </div>
    </div>
  );
}

// ---------- After password sign-in: enter the 6-digit code ----------

export function SecondFactorPrompt({ onVerified, onSignOut }: { onVerified: () => void; onSignOut: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifySignInCode(code);
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-[#718078]">Open your authenticator app and enter the 6-digit code for Mallu Mart.</p>
      {codeInput(code, setCode, true)}
      <ErrorBox message={error} />
      <div className="flex gap-3">
        <button type="button" onClick={onSignOut} className={secondaryButton}>
          Sign out
        </button>
        <button disabled={busy || code.length !== 6} className={primaryButton}>
          {busy ? "Checking..." : "Verify"}
        </button>
      </div>
    </form>
  );
}

// ---------- Settings: store details printed on receipts (owner) ----------

export function StoreDetailsForm({ initial, notify, saved }: { initial: StoreSettings | null; notify: ToastFn; saved: () => Promise<void> }) {
  const [form, setForm] = useState<StoreSettings>(
    initial ?? { storeName: "Mallu Mart", address: "", phone: "", gstin: "", receiptFooter: "Thank you for shopping with us!" }
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const change = (field: keyof StoreSettings, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!form.storeName.trim()) return setError("Store name is required.");
    setSaving(true);
    const result = await saveStoreSettings(form);
    setSaving(false);
    if (!result.ok) return setError(result.error ?? "Could not save the store details.");
    notify("Store details saved");
    await saved();
  };

  return (
    <div className={card}>
      <CardHeader eyebrow="Receipts & GST" title="Store details" text="Printed on receipts and shared on WhatsApp. Add your GSTIN to print tax invoices with CGST/SGST." />
      <form onSubmit={submit} noValidate className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Store name
          <input value={form.storeName} maxLength={100} onChange={(e) => change("storeName", e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Phone
          <input value={form.phone} maxLength={40} onChange={(e) => change("phone", e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Address
          <textarea value={form.address} maxLength={300} rows={2} onChange={(e) => change("address", e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          GSTIN <span className="font-normal text-[#87948c]">(leave empty if not registered)</span>
          <input value={form.gstin} maxLength={15} onChange={(e) => change("gstin", e.target.value.toUpperCase())} placeholder="32ABCDE1234F1Z5" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Receipt footer
          <input value={form.receiptFooter} maxLength={200} onChange={(e) => change("receiptFooter", e.target.value)} className={inputClass} />
        </label>
        <div className="sm:col-span-2">
          <ErrorBox message={error} />
          <button disabled={saving} className={primaryButton}>
            {saving ? "Saving..." : "Save store details"}
          </button>
        </div>
      </form>
    </div>
  );
}
