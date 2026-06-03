import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MODULES,
  type AppModule,
  type CurrentUserPermissions,
  type ModulePerm,
  type PermissionMap,
} from "./permissions";

async function loadIsAdmin(uid: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("swap_profiles")
    .select("is_admin")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.is_admin);
}

async function assertAdmin(uid: string) {
  const ok = await loadIsAdmin(uid);
  if (!ok) throw new Error("Only an administrator can manage module permissions.");
}

async function loadPermissionsFor(uid: string): Promise<PermissionMap> {
  const { data, error } = await supabaseAdmin
    .from("user_module_permissions")
    .select("module, can_view, can_create, can_edit, can_delete, can_export, can_share")
    .eq("user_id", uid);
  if (error) throw new Error(error.message);
  const out: PermissionMap = {};
  for (const row of data ?? []) {
    out[row.module as AppModule] = {
      can_view: row.can_view,
      can_create: row.can_create,
      can_edit: row.can_edit,
      can_delete: row.can_delete,
      can_export: row.can_export,
      can_share: row.can_share,
    };
  }
  return out;
}

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CurrentUserPermissions> => {
    const isAdmin = await loadIsAdmin(context.userId);
    if (isAdmin) return { isAdmin: true, permissions: {} };
    const permissions = await loadPermissionsFor(context.userId);
    return { isAdmin: false, permissions };
  });

export const getUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const isAdmin = await loadIsAdmin(data.userId);
    const permissions = await loadPermissionsFor(data.userId);
    return { isAdmin, permissions };
  });

const permRow = z.object({
  module: z.enum(MODULES),
  can_view: z.boolean(),
  can_create: z.boolean(),
  can_edit: z.boolean(),
  can_delete: z.boolean(),
  can_export: z.boolean(),
  can_share: z.boolean(),
});

export const setUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        isAdmin: z.boolean(),
        permissions: z.array(permRow),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error: profErr } = await supabaseAdmin
      .from("swap_profiles")
      .update({ is_admin: data.isAdmin })
      .eq("id", data.userId);
    if (profErr) throw new Error(profErr.message);

    // Replace permissions for this user
    const { error: delErr } = await supabaseAdmin
      .from("user_module_permissions")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);

    if (!data.isAdmin && data.permissions.length > 0) {
      const rows = data.permissions.map((p) => ({ user_id: data.userId, ...p }));
      const { error: insErr } = await supabaseAdmin
        .from("user_module_permissions")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
    return { ok: true };
  });

/**
 * Helper for other server-fn handlers to enforce a permission.
 * Throws if the user is not an admin and lacks the requested action.
 */
export async function assertPermission(
  userId: string,
  module: AppModule,
  action: "view" | "create" | "edit" | "delete" | "export" | "share",
) {
  const isAdmin = await loadIsAdmin(userId);
  if (isAdmin) return;
  const perms = await loadPermissionsFor(userId);
  const row: ModulePerm | undefined = perms[module];
  const ok =
    row != null &&
    ((action === "view" && row.can_view) ||
      (action === "create" && row.can_create) ||
      (action === "edit" && row.can_edit) ||
      (action === "delete" && row.can_delete) ||
      (action === "export" && row.can_export) ||
      (action === "share" && row.can_share));
  if (!ok) {
    throw new Error(`Permission denied: ${action} on ${module}`);
  }
}
