import { createClient } from "@/lib/supabase/client";
import type { LocalNotification, NotificationType } from "@/lib/types";

interface SupabaseNotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_product_id?: string | null;
  related_sale_id?: string | null;
  is_read: boolean;
  created_at: string;
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function fetchNotifications(limit = 50): Promise<LocalNotification[]> {
  const supabase = createClient();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, related_product_id, related_sale_id, is_read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching notifications:", error.message);
    return [];
  }

  return (data as unknown as SupabaseNotificationRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedProductId: row.related_product_id || undefined,
    relatedSaleId: row.related_sale_id || undefined,
    isRead: row.is_read,
    createdAt: row.created_at,
  }));
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;

  const userId = await getCurrentUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", userId);

  return !error;
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;

  const userId = await getCurrentUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("is_read", false)
    .eq("user_id", userId);

  return !error;
}

export async function clearNotifications(): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;

  const userId = await getCurrentUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", userId);

  return !error;
}
