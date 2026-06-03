## Goal

Merge the currently separate **Purity** dashboard (`/purity/*`) and **Ather Margin & Swap** dashboard (`/swap/*`) into a single unified admin platform with one login, one user database, one audit log, one reports center, and per-user **module permissions**.

---

## Modules & permission matrix

Each user gets an assigned set of modules. Per module, fine-grained permissions:

| Permission | Meaning |
|---|---|
| `view` | See the module in sidebar + open it |
| `create` | Add new records |
| `edit` | Modify existing records |
| `delete` | Remove records |
| `export` | Download reports / CSVs |
| `share` | Send WhatsApp / shareable links |

Modules: `purity`, `margin`, `swap`, `premium`, `reports`, `audit`, `users`, `settings`.

Administrators implicitly get everything (no row needed; `is_admin = true` short-circuits all checks).

---

## Database changes (one migration)

1. **Unify profiles** — keep `swap_profiles` as the single profile table (already linked to `auth.users`). Backfill any `purity_profiles` users into it; drop `purity_profiles` after.
2. **New table `user_module_permissions`**:
   - `user_id uuid → auth.users`
   - `module text` (enum-checked: purity/margin/swap/premium/reports/audit/users/settings)
   - `can_view bool`, `can_create bool`, `can_edit bool`, `can_delete bool`, `can_export bool`, `can_share bool`
   - PK `(user_id, module)`
   - RLS: user can read their own row; admins can read/write all (via existing `is_swap_user` + new `is_swap_admin` security-definer).
3. **Update existing RLS** on `purity_*` tables to check membership in unified profiles + `has_module_permission(uid, 'purity', 'view')` instead of separate purity_profiles.
4. **Audit log unification** — keep `swap_activity_log`, add a `module text` column; migrate `purity_activity_log` rows in then drop it.

---

## Routing & auth changes

- **Single login page** at `/login` (replace `/swap/index.tsx` + `/purity/index.tsx` logins). Both old routes redirect to `/login`.
- **Single authenticated shell** at new route `/_authenticated/app/*` with a unified sidebar listing only modules the user has `view` permission for.
- Move existing dashboards under one shell:
  - `/app/purity` → current PurityDashboard panels
  - `/app/margin`, `/app/swap`, `/app/premium`, `/app/clients/:id`, `/app/reports`, `/app/audit`, `/app/users`, `/app/settings`
- Old `/purity/dashboard` and `/swap/dashboard` redirect into the new shell (preserve bookmarks).
- **Route guard** (`beforeLoad` on each module route) calls `requireModulePermission('purity', 'view')` server-fn → throws `redirect({ to: '/unauthorized' })` if denied.
- New `/unauthorized` page with same dark theme.

---

## Permission enforcement (defense in depth)

1. **Client sidebar**: filter nav items by `useModulePermissions()` hook (loaded once at app shell mount, cached).
2. **Route guard**: `beforeLoad` redirects to `/unauthorized`.
3. **Server functions**: every mutating server-fn calls a shared `assertPermission(ctx, module, action)` helper that reads `user_module_permissions` (or `is_admin`) and throws on miss. This is the real security boundary — RLS is the backstop.
4. **UI affordances**: Create/Edit/Delete/Export/Share buttons hidden when the corresponding permission is false.

---

## User Management redesign

Add a **Module Permissions** section to each user card in `UsersPanel`:

```
┌─ Module Permissions ───────────────────────────┐
│  Module      View Create Edit Delete Export Share │
│  Purity       [x]  [x]   [x]  [ ]    [x]   [x]   │
│  Margin       [ ]  [ ]   [ ]  [ ]    [ ]   [ ]   │
│  Swap         [ ]  [ ]   [ ]  [ ]    [ ]   [ ]   │
│  …                                               │
│                              [Save Permissions]  │
└──────────────────────────────────────────────────┘
```

Quick-apply presets dropdown: "Purity only", "Swap full", "Reports viewer", "Administrator".

Seed initial permissions per your spec:
- **Wassim, SIF, Moussa** → purity only (view/create/edit/export/share)
- **Salah** → purity + margin + swap + reports (view/create/edit/export/share, no delete)
- **Khalil** → `is_admin = true` (everything)

---

## Branding

Unified shell uses the existing Ather dark theme (already shared across Swap module). Purity panels keep their internal styling but adopt the same sidebar, header, and card primitives. Sidebar shows an Ather logo + user avatar + module switcher.

---

## File plan

**New**
- `supabase/migrations/<ts>_unify_platform.sql` (profiles unify + permissions table + RLS + audit migration)
- `src/lib/permissions.ts` (shared `MODULES`, `ACTIONS`, `PermissionMap` types)
- `src/lib/permissions.functions.ts` (`getMyPermissions`, `setUserPermissions`, `assertPermission`)
- `src/routes/login.tsx` (unified login)
- `src/routes/unauthorized.tsx`
- `src/routes/_authenticated/app/route.tsx` (shell + sidebar)
- `src/routes/_authenticated/app/{purity,margin,swap,premium,reports,audit,users,settings}.tsx`
- `src/routes/_authenticated/app/clients.$clientId.tsx`
- `src/components/app/AppSidebar.tsx`
- `src/components/app/PermissionGate.tsx` + `usePermissions` hook
- `src/components/swap/UserPermissionsEditor.tsx`

**Edited**
- `src/routes/__root.tsx` (single auth listener already there)
- `src/routes/purity/index.tsx`, `src/routes/swap/index.tsx` → redirect to `/login`
- `src/routes/purity/dashboard.tsx`, `src/routes/swap/dashboard.tsx` → redirect to `/app/…`
- `src/components/swap/UsersPanel.tsx` (add permissions editor section)
- All `*.functions.ts` mutating server fns → wrap with `assertPermission`

**Removed**
- `src/routes/swap/clients.$clientId.tsx` (moved into shell)

---

## Estimated scope

~25 file changes + 1 migration. This is a large refactor that touches auth, routing, RLS, and every server function. I'll ship it in one go but it's the biggest change in the project so far.

---

## Confirm before I start

1. **Login URL**: I'm proposing `/login` as the single entry. Old `/purity` and `/swap` URLs will redirect there. OK?
2. **New dashboard URL**: `/app/<module>` (e.g. `/app/swap`). OK, or do you prefer keeping `/swap/dashboard`, `/purity/dashboard` and just adding cross-module nav?
3. **Permission seeding**: I'll seed the five users you named with the permissions listed above. If any of those usernames don't exist yet I'll create them disabled and you can set passwords. OK?
4. **Audit log**: merge purity audit rows into the swap audit table (single log). Confirm OK to drop `purity_activity_log` after migration.