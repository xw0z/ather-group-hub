This is a large feature touching DB, storage, server functions, and UI. Confirming the plan before I start so we agree on scope and tradeoffs.

## Scope by section

### 1. Database (1 migration)
- `swap_login_history` — user_id, occurred_at, ip, user_agent, device, browser, status (success/failed). Populated client-side after sign-in (and via a small login server fn that records IP from request headers).
- `swap_notification_prefs` — one row per user; columns: email_enabled, margin_alerts, backup_notifications, security_notifications, system_announcements.
- `swap_user_preferences` — theme ('dark'|'light'|'system'), number_format, date_format.
- `swap_profiles.avatar_url` — new column.
- `swap_profiles.password_changed_at` — new column, updated by password change fn.
- Storage bucket `profile-avatars` (private, RLS: user reads/writes own folder).
- RLS: each user sees only their own rows. Audit writes go into existing `swap_activity_log`.

### 2. Server functions (added to existing `*.functions.ts`)
- `updateSwapOwnProfile` — extended to handle display name + phone + email (already exists; verify shape).
- `updateSwapOwnPassword` — extended to verify current password (re-auth via `signInWithPassword` against current email) before update, and stamp `password_changed_at`.
- `uploadAvatar` / `removeAvatar` — server fns that write to storage + update `avatar_url`.
- `getLoginHistory` — last 10 rows.
- `recordLogin` — called from the login page on success/failure; reads IP from request headers.
- `getNotificationPrefs` / `updateNotificationPrefs`.
- `getUserPreferences` / `updateUserPreferences`.
- `getActiveSessions` / `signOutOtherSessions` — uses `supabase.auth.admin.listFactors` is NOT available for users; we will use Supabase's `signOut({ scope: 'others' })` for "logout other sessions" (real session list/per-session revoke isn't exposed by Supabase to end users; we'll show only the current session + a "sign out everywhere" action and be honest in the UI rather than fake a list).
- All mutations append to `swap_activity_log` with action labels (profile_update, password_change, notif_prefs_change, session_signout_others, etc.). IP captured server-side.

### 3. UI — `ProfileTab` rewrite in `src/routes/swap/dashboard.tsx`
Replace current single-page form with internal sub-tabs: **General · Security · Sessions · Preferences**, keeping the existing dark `ATHER Desk` styling (rounded-xl border, bg-card, primary accent).

- **General**: avatar (upload/change/remove, initials fallback), display name, username (read-only), email, phone, role (read-only), assigned refinery (read-only — from `refinery_users` for the current user), Save button.
- **Security**:
  - Change password (current / new / confirm) with show/hide toggles and a strength meter (length + char-class heuristic → Weak/Medium/Strong).
  - Account summary: last login date/device/IP, account created, password last changed.
  - Login history table (last 10).
  - Danger actions: "Change password" jumps to form, "Logout all devices" with confirm dialog.
- **Sessions**: current session card (device, browser, last activity from `lastSignInAt`) + "Sign out other sessions" button. Honest copy explaining that the auth provider doesn't expose a per-session list.
- **Preferences**:
  - Notification toggles (5 checkboxes), saved on change.
  - Theme radio (Dark / Light / System) — wired to a `next-themes`-style provider; if none exists I'll add a minimal one in `src/components/theme-provider.tsx` and toggle the `dark` class on `<html>`.
  - Number format + date format radios — stored in prefs, exposed via a `useUserPreferences()` hook for the rest of the app to consume later.

### Tradeoffs / honest limitations
- **Per-session revoke** and **Login history with full device/browser/IP** require we record events ourselves; this only starts populating from the moment we ship. We won't be able to backfill history that pre-dates this change.
- **Active sessions list** is not exposed by Supabase Auth to non-admin clients — we'll show only the current device with a global "sign out everywhere" rather than fabricate a list.
- Theme/number/date format prefs will be saved + applied to the theme; full number/date formatting wiring across the app is out of scope for this PR (just the preference + a hook ready for adoption).

### Files
- New migration under `supabase/migrations/`.
- Edits: `src/routes/swap/dashboard.tsx` (ProfileTab rewrite), `src/lib/swap.functions.ts` (new server fns), `src/routes/desk.login.tsx` (call `recordLogin`), new `src/components/theme-provider.tsx` if needed.

Confirm and I'll start implementing. If you want me to cut anything (e.g. skip storage/avatars, or skip the theme provider), say the word.
