import { createClient } from "@/lib/supabase/client";

// Two-factor authentication with an authenticator app (TOTP), via Supabase Auth.

function client() {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// True when the account has 2FA and this session has not passed it yet.
export async function needsSecondFactor(): Promise<boolean> {
  const { data, error } = await client().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

export async function listVerifiedFactors() {
  const { data, error } = await client().auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return data.totp.filter((factor) => factor.status === "verified");
}

// Starts enrolment; returns the QR code (an SVG data URL) and the secret for manual entry.
export async function startEnrollment() {
  const supabase = client();
  // Remove abandoned, never-verified attempts first.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Mallu Mart ${new Date().toISOString().slice(0, 10)} ${Math.random().toString(36).slice(2, 6)}`,
  });
  if (error) throw new Error(error.message);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyCode(factorId: string, code: string) {
  const { error } = await client().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
  if (error) {
    throw new Error(/invalid/i.test(error.message) ? "That code is not valid. Use the latest code from your app." : error.message);
  }
}

// At sign-in: verify against the account's verified factor.
export async function verifySignInCode(code: string) {
  const [factor] = await listVerifiedFactors();
  if (!factor) throw new Error("No authenticator is set up for this account.");
  await verifyCode(factor.id, code);
}

export async function removeFactor(factorId: string) {
  const { error } = await client().auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
}
