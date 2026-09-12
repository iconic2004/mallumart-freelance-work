"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/lib/supabase/services/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);

    try {
      const res = await updatePassword(password);
      if (res.error) {
        setError(res.error.message);
      } else {
        setSuccess("New password created successfully! Redirecting to your dashboard...");
        setTimeout(() => {
          router.push("/dashboard");
        }, 1800);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-grid flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-[440px] rounded-3xl border border-[#e4e9e4] bg-[#fbfcfa] p-7 shadow-[0_20px_60px_rgba(31,41,36,.08)] sm:p-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#226b4c] text-xl font-bold text-white shadow-sm">
            M
          </div>
          <div>
            <div className="display-font text-xl font-bold leading-none">Mallu Mart</div>
            <div className="mt-1 text-[10px] uppercase tracking-[.18em] text-[#87948c]">Account Security</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">
            Owner Security
          </div>
          <h1 className="display-font text-3xl font-bold text-[#1f2924]">
            Create new password.
          </h1>
          <p className="mt-2 text-sm text-[#718078]">
            Set a new, secure password for your store login.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-[#1f2924]">
            New Password
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-3 text-sm outline-none focus:border-[#226b4c] focus:ring-2 focus:ring-[#b9d8c2]"
              placeholder="•••••••• (min 6 characters)"
            />
          </label>

          <label className="block text-sm font-medium text-[#1f2924]">
            Confirm New Password
            <input
              required
              minLength={6}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-3 text-sm outline-none focus:border-[#226b4c] focus:ring-2 focus:ring-[#b9d8c2]"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-[#f5c6cb] bg-[#fff0ed] px-3.5 py-2.5 text-xs font-medium text-[#c25e4a]">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-[#b9d8c2] bg-[#f0f9f3] px-3.5 py-2.5 text-xs font-medium text-[#226b4c]">
              {success}
            </div>
          )}

          <button
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-[#226b4c] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1a553c] disabled:opacity-60"
          >
            {loading ? "Updating Password..." : "Set New Password"}
          </button>
        </form>

        <div className="mt-8 border-t border-[#e4e9e4] pt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#226b4c] hover:underline"
          >
            <span>← Return to Login</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
