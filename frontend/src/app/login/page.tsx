"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp, resetPasswordForEmail } from "@/lib/supabase/services/auth";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"owner" | "staff">("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const supabase = createClient();

    if (mode === "forgot") {
      if (!supabase) {
        setSuccess("Password recovery instructions sent (Demo mode simulated). In production with Supabase, an email with a secure reset link will be sent.");
        setLoading(false);
        return;
      }
      const res = await resetPasswordForEmail(email);
      if (res.error) {
        setError(res.error.message);
      } else {
        setSuccess("Password recovery link has been sent to your email! Please check your inbox and click the link to create your new password.");
      }
      setLoading(false);
      return;
    }

    if (!supabase) {
      // Demo fallback mode when credentials not configured
      localStorage.setItem("mallu-mart-username", (fullName || email.split("@")[0] || "Store Manager").trim());
      router.push("/dashboard");
      return;
    }

    if (mode === "signin") {
      const res = await signIn(email, password);
      if (res.error) {
        setError(res.error.message);
        setLoading(false);
      } else {
        const displayName = res.data?.user?.user_metadata?.full_name || email.split("@")[0] || "Store Manager";
        localStorage.setItem("mallu-mart-username", displayName);
        router.push("/dashboard");
      }
    } else {
      const res = await signUp(email, password, fullName, role);
      if (res.error) {
        setError(res.error.message);
        setLoading(false);
      } else {
        if (res.data?.session) {
          localStorage.setItem("mallu-mart-username", fullName.trim());
          router.push("/dashboard");
        } else {
          setSuccess("Account created successfully! If email confirmation is enabled in your Supabase project, check your inbox. Otherwise you can sign in now.");
          setMode("signin");
          setLoading(false);
        }
      }
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
            <div className="mt-1 text-[10px] uppercase tracking-[.18em] text-[#87948c]">Inventory & Revenue</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#6a987b]">
            Store Workspace
          </div>
          <h1 className="display-font text-3xl font-bold">
            {mode === "signin"
              ? "Welcome back."
              : mode === "signup"
              ? "Create account."
              : "Reset password."}
          </h1>
          <p className="mt-2 text-sm text-[#718078]">
            {mode === "signin"
              ? "Sign in to check today's live store pulse."
              : mode === "signup"
              ? "Register your store owner or staff account."
              : "Enter your store account email to receive a recovery link."}
          </p>
        </div>

        {/* Tab Switcher (Visible in signin and signup modes) */}
        {mode !== "forgot" ? (
          <div className="mt-6 flex rounded-xl border border-[#e4e9e4] bg-[#f0f4ef] p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
                setSuccess("");
              }}
              className={`flex-1 rounded-lg py-2 transition-all ${
                mode === "signin" ? "bg-white text-[#1f2924] shadow-sm font-semibold" : "text-[#718078] hover:text-[#1f2924]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
                setSuccess("");
              }}
              className={`flex-1 rounded-lg py-2 transition-all ${
                mode === "signup" ? "bg-white text-[#1f2924] shadow-sm font-semibold" : "text-[#718078] hover:text-[#1f2924]"
              }`}
            >
              Register Store
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
                setSuccess("");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#226b4c] hover:underline"
            >
              <span>← Back to Sign In</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <>
              <label className="block text-sm font-medium text-[#1f2924]">
                Full Name
                <input
                  required
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-3 text-sm outline-none focus:border-[#226b4c] focus:ring-2 focus:ring-[#b9d8c2]"
                  placeholder="Unnikrishnan Nair"
                />
              </label>

              <label className="block text-sm font-medium text-[#1f2924]">
                Store Role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as "owner" | "staff")}
                  className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-3 text-sm outline-none focus:border-[#226b4c] focus:ring-2 focus:ring-[#b9d8c2]"
                >
                  <option value="owner">Store Owner / Admin</option>
                  <option value="staff">Store Staff / Billing Cashier</option>
                </select>
              </label>
            </>
          )}

          <label className="block text-sm font-medium text-[#1f2924]">
            Email Address
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-3 text-sm outline-none focus:border-[#226b4c] focus:ring-2 focus:ring-[#b9d8c2]"
              placeholder="owner@mallumart.com"
            />
          </label>

          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-[#1f2924]">
                  Password
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError("");
                      setSuccess("");
                    }}
                    className="text-xs font-semibold text-[#226b4c] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                required
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-4 py-3 text-sm outline-none focus:border-[#226b4c] focus:ring-2 focus:ring-[#b9d8c2]"
                placeholder="•••••••• (at least 6 characters)"
              />
            </div>
          )}

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
            {loading
              ? "Processing..."
              : mode === "signin"
              ? "Sign in to Store"
              : mode === "signup"
              ? "Create Store Account"
              : "Send Recovery Link"}
          </button>
        </form>

        <div className="mt-8 border-t border-[#e4e9e4] pt-6 text-center">
          <Link
            href="/dashboard"
            onClick={() => localStorage.setItem("mallu-mart-username", "Demo Manager")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#226b4c] hover:underline"
          >
            <span>Continue to Demo Workspace (Offline Preview)</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
