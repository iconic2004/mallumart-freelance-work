import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "./errors";

// Calls a database function and returns its result, or throws an Error with a
// message a shop owner can act on.
export async function callRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendlyError(error));
  return data as T;
}

// For mutations whose callers expect { ok, error } instead of exceptions.
export async function tryRpc<T>(
  fn: string,
  args: Record<string, unknown> = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    return { ok: true, data: await callRpc<T>(fn, args) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export const toNumber = (value: unknown) => Number(value ?? 0);
export const toNumberOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));
