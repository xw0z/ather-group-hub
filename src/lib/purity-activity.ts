import { supabase } from "@/integrations/supabase/client";

let cachedUser: { id: string; username: string } | null = null;

async function resolveUser() {
  if (cachedUser) return cachedUser;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data: prof } = await supabase
    .from("purity_profiles")
    .select("username")
    .eq("id", u.user.id)
    .maybeSingle();
  cachedUser = {
    id: u.user.id,
    username: prof?.username ?? u.user.email ?? "unknown",
  };
  return cachedUser;
}

export type ActivityRow = {
  id: string;
  user_id: string;
  username: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export async function logActivity(
  action: string,
  entity_type: string,
  details?: Record<string, unknown> | null,
  entity_id?: string | null,
) {
  try {
    const u = await resolveUser();
    if (!u) return;
    await supabase.from("purity_activity_log").insert({
      user_id: u.id,
      username: u.username,
      action,
      entity_type,
      entity_id: entity_id ?? null,
      details: (details ?? null) as never,
    });
  } catch {
    /* swallow logging errors */
  }
}

export async function loadActivity(limit = 300): Promise<ActivityRow[]> {
  const { data } = await supabase
    .from("purity_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ActivityRow[];
}
