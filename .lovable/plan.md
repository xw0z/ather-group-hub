# Ather Margin & Swap — Restructure Plan

Rename internal app to **Ather Margin & Swap**. Keep `/swap` as primary URL; add `/margin` as alias. Preserve every existing calculation (daily swap fees, Wed multiplier, weekend skip, margin level, status). This is a **reorganization**, not a rewrite of business logic.

## 1. Routing layout (hybrid sidebar shell)

```text
src/routes/_authenticated/swap/
  route.tsx                ← sidebar shell + <Outlet/> (auth-gated)
  index.tsx                ← redirects to ./dashboard
  dashboard.tsx            ← Swap overview + Margin overview cards
  clients.tsx              ← Clients list (Swap + Margin per client)
  clients.$clientId.tsx    ← (existing detail, kept)
  swap-fees.tsx            ← Daily fees, history, totals, export
  margin.tsx               ← Live XAU, balances, equity, status
  reports.tsx              ← Swap / Margin / Combined; PNG, PDF, WhatsApp
  audit.tsx                ← Unified swap_activity_log + swap_margin_history
  users.tsx                ← Full user mgmt (admin-only)
  settings.tsx             ← Placeholder "Coming soon"

src/routes/_authenticated/margin/
  index.tsx                ← redirects to /swap (alias entry)
```

The existing `src/routes/swap/dashboard.tsx` becomes the **source of components** — its tab sections are extracted into the new route files. Old route stays as a redirect to `/swap/dashboard` for any bookmarks.

## 2. Logic preserved verbatim

- `runDailyFeeJob`, per-client daily fee computation, Wednesday 3-day multiplier, Saturday/Sunday skip → unchanged in `src/lib/swap-clients.functions.ts`.
- Margin level / required margin / status derivation → moved as-is into `margin.tsx`.
- Cron endpoint `/api/public/hooks/swap-daily-fees` → unchanged.

## 3. New: Users page (admin only)

Table-based list of `swap_profiles` showing:
- Username, email, role (Admin/Staff), last login, activity count
- Actions: Create, Edit, Disable, Delete (admin), Send password reset

Role gate: only `is_admin = true` can open the Users route or perform any of these actions. Staff visiting `/swap/users` see "Access denied".

**Required DB change (one migration):**
- Add `last_sign_in_at` mirror column to `swap_profiles` (synced from `auth.users`) OR query `auth.users` via a security-definer function. I'll use a SECURITY DEFINER function `get_swap_users_overview()` returning username/email/is_admin/last_sign_in/activity_count to avoid touching auth schema.
- No new role table needed — `is_admin` already exists. Staff = `is_admin = false`.

## 4. Audit Log page

Single unified feed:
- Source A: `swap_activity_log` (login, logout, share, generic actions)
- Source B: `swap_margin_history` (balance/gold/margin changes — already filtered to real changes per prior work)
- Merge in memory, sort by `created_at` desc.
- Filters: All / Client / Balances / Margin / Reports / Auth
- Search: client code, client name, username
- Admin-only route.

## 5. Reports page

Three tabs: **Swap Fee Report**, **Margin Report**, **Combined Statement**.
Each tab: client picker → preview card → PNG / PDF / WhatsApp buttons.
PNG uses existing html-to-image flow already in `ClientsTab`. PDF added via `jspdf` (lightweight; no native deps). WhatsApp uses existing Twilio path.

## 6. Sidebar shell

`src/routes/_authenticated/swap/route.tsx` renders:
- Left rail: brand "Ather Margin & Swap", 8 nav links with active state, role-gated (Users hidden for staff).
- Right: `<Outlet />`.
- Mobile: collapsible drawer.

## 7. /margin alias

`src/routes/_authenticated/margin/index.tsx` issues `redirect({ to: '/swap/margin' })` in `beforeLoad`. URL stays clean, single source of truth.

## 8. Out of scope this turn

- Settings UI (placeholder only)
- New role table / RBAC overhaul (current `is_admin` boolean is sufficient per user)
- Changing any fee or margin formula

## Technical notes

- One migration: `get_swap_users_overview()` SECURITY DEFINER function + grant to authenticated.
- New deps: `jspdf` (PDF export).
- Existing `swap_activity_log` insert points already cover login/share; I'll add inserts on user create/edit/disable in the new Users page.
- File size: I'll split the current 1800-line `dashboard.tsx` into the new route files rather than copying it whole. Shared helpers (formatters, `Stat`, `Card` wrappers) move to `src/components/swap/`.

Approve and I'll execute in this order: migration → shell + nav → extract pages → Users → Reports/PDF → audit unification → /margin alias.

