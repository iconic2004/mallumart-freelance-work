import { createClient } from "@/lib/supabase/client";
import type { ActionResult, TeamMember, UserRole } from "@/lib/types";
import { friendlyError } from "./errors";

// Owners can read every profile (RLS); other users only get their own row.
export async function fetchTeam(): Promise<TeamMember[]> {
  const supabase = createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, role, approved, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching team:", error.message);
    return [];
  }

  return (data || []).map((row) => ({
    userId: row.user_id,
    fullName: row.full_name,
    role: row.role as UserRole,
    approved: Boolean(row.approved),
    createdAt: row.created_at,
  }));
}

export async function setMemberAccess(userId: string, role: UserRole, approved: boolean): Promise<ActionResult> {
  const supabase = createClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  const { error } = await supabase.rpc("set_member_access", {
    p_user_id: userId,
    p_role: role,
    p_approved: approved,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}
