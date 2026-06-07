import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAudit } from "@/lib/swap-audit.server";

async function logActivity(
  userId: string,
  action: string,
  details: unknown,
  module: "auth" | "users" = "users",
  oldValues?: unknown,
  newValues?: unknown,
) {
  await recordAudit({
    userId,
    module,
    action,
    entity_type: "profile",
    entity_id: userId,
    old_values: oldValues ?? null,
    new_values: newValues ?? null,
    details,
  });
}

function clientIpFromHeaders(): string | null {
  try {
    const fwd = getRequestHeader("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    const real = getRequestHeader("x-real-ip");
    if (real) return real;
    const cf = getRequestHeader("cf-connecting-ip");
    if (cf) return cf;
  } catch {
    /* not in request context */
  }
  return null;
}

export const updateSwapOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        current_password: z.string().min(1).max(128).optional(),
        password: z.string().min(6).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Verify current password when provided
    if (data.current_password) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const email = u?.user?.email;
      if (!email) throw new Error("No email on account; cannot verify current password.");
      // Use a fresh client to attempt sign-in (does not touch the user's session)
      const { createClient } = await import("@supabase/supabase-js");
      const verifier = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
      );
      const { error: vErr } = await verifier.auth.signInWithPassword({
        email,
        password: data.current_password,
      });
      if (vErr) throw new Error("Current password is incorrect.");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("swap_profiles")
      .update({ password_changed_at: new Date().toISOString() })
      .eq("id", context.userId);
    await logActivity(context.userId, "password_changed", { ip: clientIpFromHeaders() }, "auth");
    return { ok: true };
  });

export const getSwapOwnProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prof, error } = await supabaseAdmin
      .from("swap_profiles")
      .select("id, username, email, phone, is_admin, created_at, avatar_url, password_changed_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);

    // Refinery assignment + display name (if any)
    const { data: ru } = await supabaseAdmin
      .from("refinery_users")
      .select("display_name, role, refinery_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    let refineryName: string | null = null;
    if (ru?.refinery_id) {
      const { data: r } = await supabaseAdmin
        .from("refineries")
        .select("name")
        .eq("id", ru.refinery_id)
        .maybeSingle();
      refineryName = r?.name ?? null;
    }

    // Signed URL for avatar (private bucket)
    let avatarSignedUrl: string | null = null;
    if (prof?.avatar_url) {
      const { data: signed } = await supabaseAdmin.storage
        .from("profile-avatars")
        .createSignedUrl(prof.avatar_url, 60 * 60);
      avatarSignedUrl = signed?.signedUrl ?? null;
    }

    return {
      id: context.userId,
      username: prof?.username ?? null,
      email: prof?.email ?? null,
      phone: prof?.phone ?? null,
      isAdmin: Boolean(prof?.is_admin),
      createdAt: prof?.created_at ?? null,
      authEmail: userRes?.user?.email ?? null,
      lastSignInAt: userRes?.user?.last_sign_in_at ?? null,
      passwordChangedAt: prof?.password_changed_at ?? null,
      displayName: ru?.display_name ?? null,
      role: ru?.role ?? (prof?.is_admin ? "admin" : "member"),
      refineryId: ru?.refinery_id ?? null,
      refineryName,
      avatarPath: prof?.avatar_url ?? null,
      avatarUrl: avatarSignedUrl,
    };
  });

const usernameRule = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, . _ - only");

export const updateSwapOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        username: usernameRule.optional(),
        display_name: z.string().trim().max(120).optional().or(z.literal("")),
        email: z.string().trim().email().max(255).optional().or(z.literal("")),
        phone: z
          .string()
          .trim()
          .max(32)
          .regex(/^[+0-9 ()-]*$/, "Digits, spaces, + ( ) - only")
          .optional()
          .or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: { username?: string; email?: string | null; phone?: string | null } = {};

    if (data.username !== undefined) {
      const username = data.username.toLowerCase();
      const { data: existing } = await supabaseAdmin
        .from("swap_profiles")
        .select("id")
        .ilike("username", username)
        .neq("id", context.userId)
        .maybeSingle();
      if (existing) throw new Error("Username already taken.");
      patch.username = username;
    }
    if (data.email !== undefined) patch.email = data.email === "" ? null : data.email;
    if (data.phone !== undefined) patch.phone = data.phone === "" ? null : data.phone;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin
        .from("swap_profiles")
        .update(patch)
        .eq("id", context.userId);
      if (error) throw new Error(error.message);
    }

    if (data.email !== undefined && data.email !== "") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        email: data.email,
      });
      if (error) throw new Error(error.message);
    }

    // Display name lives on refinery_users when present
    if (data.display_name !== undefined) {
      const dn = data.display_name === "" ? null : data.display_name;
      await supabaseAdmin
        .from("refinery_users")
        .update({ display_name: dn })
        .eq("user_id", context.userId);
    }

    await logActivity(context.userId, "profile_updated", {
      ...patch,
      display_name: data.display_name,
      ip: clientIpFromHeaders(),
    });
    return { ok: true };
  });

/* ------------------------- Avatar ------------------------- */

export const setAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        // base64 data URL or raw base64
        data_url: z.string().min(1).max(5_000_000),
        content_type: z.string().min(1).max(64).default("image/png"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const m = data.data_url.match(/^data:([^;]+);base64,(.+)$/);
    const b64 = m ? m[2] : data.data_url;
    const contentType = m ? m[1] : data.content_type;
    const ext = contentType.split("/")[1] || "png";
    const path = `${context.userId}/avatar-${Date.now()}.${ext}`;
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length > 3_000_000) throw new Error("Image too large (max 3 MB).");
    const { error: upErr } = await supabaseAdmin.storage
      .from("profile-avatars")
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) throw new Error(upErr.message);

    // Remove previous file
    const { data: prev } = await supabaseAdmin
      .from("swap_profiles")
      .select("avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    if (prev?.avatar_url && prev.avatar_url !== path) {
      await supabaseAdmin.storage.from("profile-avatars").remove([prev.avatar_url]);
    }

    await supabaseAdmin
      .from("swap_profiles")
      .update({ avatar_url: path })
      .eq("id", context.userId);

    const { data: signed } = await supabaseAdmin.storage
      .from("profile-avatars")
      .createSignedUrl(path, 60 * 60);

    await logActivity(context.userId, "avatar_updated", { path, ip: clientIpFromHeaders() });
    return { path, url: signed?.signedUrl ?? null };
  });

export const removeAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prev } = await supabaseAdmin
      .from("swap_profiles")
      .select("avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    if (prev?.avatar_url) {
      await supabaseAdmin.storage.from("profile-avatars").remove([prev.avatar_url]);
    }
    await supabaseAdmin
      .from("swap_profiles")
      .update({ avatar_url: null })
      .eq("id", context.userId);
    await logActivity(context.userId, "avatar_removed", { ip: clientIpFromHeaders() });
    return { ok: true };
  });

/* ----------------------- Login history ----------------------- */

function parseUA(ua: string): { device: string; browser: string } {
  const u = ua.toLowerCase();
  let device = "Desktop";
  if (/iphone|ipod/.test(u)) device = "iPhone";
  else if (/ipad/.test(u)) device = "iPad";
  else if (/android/.test(u)) device = /mobile/.test(u) ? "Android phone" : "Android tablet";
  else if (/macintosh/.test(u)) device = "Mac";
  else if (/windows/.test(u)) device = "Windows";
  else if (/linux/.test(u)) device = "Linux";

  let browser = "Unknown";
  if (/edg\//.test(u)) browser = "Edge";
  else if (/chrome\//.test(u) && !/edg\//.test(u)) browser = "Chrome";
  else if (/firefox\//.test(u)) browser = "Firefox";
  else if (/safari\//.test(u) && !/chrome\//.test(u)) browser = "Safari";
  return { device, browser };
}

export const recordLogin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid().optional(),
        identifier: z.string().max(255).optional(),
        status: z.enum(["success", "failed"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    let ua = "";
    try {
      ua = getRequestHeader("user-agent") ?? "";
    } catch {
      /* ignore */
    }
    const { device, browser } = parseUA(ua);
    const ip = clientIpFromHeaders();
    if (!data.user_id) return { ok: true };
    await supabaseAdmin.from("swap_login_history").insert({
      user_id: data.user_id,
      identifier: data.identifier ?? null,
      status: data.status,
      ip,
      user_agent: ua.slice(0, 500),
      device,
      browser,
    });
    return { ok: true };
  });

export const getLoginHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("swap_login_history")
      .select("id, occurred_at, ip, user_agent, device, browser, status")
      .eq("user_id", context.userId)
      .order("occurred_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* --------------------- Notification prefs --------------------- */

const NotifSchema = z.object({
  email_enabled: z.boolean(),
  margin_alerts: z.boolean(),
  backup_notifications: z.boolean(),
  security_notifications: z.boolean(),
  system_announcements: z.boolean(),
});

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("swap_notification_prefs")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return (
      data ?? {
        user_id: context.userId,
        email_enabled: true,
        margin_alerts: true,
        backup_notifications: true,
        security_notifications: true,
        system_announcements: true,
      }
    );
  });

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => NotifSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("swap_notification_prefs")
      .upsert({ user_id: context.userId, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "notification_prefs_updated", { ...data, ip: clientIpFromHeaders() });
    return { ok: true };
  });

/* ----------------------- User prefs ----------------------- */

const PrefsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  number_format: z.enum(["en", "eu"]),
  date_format: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
});

export const getUserPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("swap_user_preferences")
      .select("theme, number_format, date_format")
      .eq("user_id", context.userId)
      .maybeSingle();
    return (
      data ?? { theme: "system", number_format: "en", date_format: "DD/MM/YYYY" }
    );
  });

export const updateUserPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PrefsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("swap_user_preferences")
      .upsert({ user_id: context.userId, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ----------------------- Sign out everywhere ----------------------- */

export const signOutEverywhere = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await supabaseAdmin.auth.admin.signOut(context.userId, "global");
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "signed_out_all_devices", { ip: clientIpFromHeaders() }, "auth");
    return { ok: true };
  });
