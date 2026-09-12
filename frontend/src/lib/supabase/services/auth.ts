import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/types";

export async function signIn(email: string, password: string) {
  const supabase = createClient();
  if (!supabase) {
    return {
      data: { user: null, session: null },
      error: new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."),
    };
  }
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(
  email: string,
  password: string,
  fullName: string,
  role: "owner" | "staff" = "owner"
) {
  const supabase = createClient();
  if (!supabase) {
    return {
      data: { user: null, session: null },
      error: new Error("Supabase is not configured."),
    };
  }
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
      },
    },
  });
}

export async function signOut() {
  const supabase = createClient();
  if (!supabase) return { error: null };
  return await supabase.auth.signOut();
}

export async function resetPasswordForEmail(email: string) {
  const supabase = createClient();
  if (!supabase) {
    return {
      data: null,
      error: null, // Simulated success in demo mode
    };
  }
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
  return await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
}

export async function updatePassword(newPassword: string) {
  const supabase = createClient();
  if (!supabase) {
    return {
      data: null,
      error: null, // Simulated success in demo mode
    };
  }
  return await supabase.auth.updateUser({
    password: newPassword,
  });
}

export async function getCurrentUser() {
  const supabase = createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, role, store_name, phone, created_at")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return {
      id: user.id,
      userId: user.id,
      fullName: (user.user_metadata?.full_name as string) || user.email?.split("@")[0] || "Staff",
      role: (user.user_metadata?.role as "owner" | "staff") || "owner",
      storeName: "Mallu Mart",
    };
  }

  return {
    id: data.id,
    userId: data.user_id,
    fullName: data.full_name || user.email?.split("@")[0] || "Staff",
    role: data.role as "owner" | "staff",
    storeName: data.store_name,
    phone: data.phone,
    createdAt: data.created_at,
  };
}
