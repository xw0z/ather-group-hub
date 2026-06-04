
# Integrate Purity into ATHER DESK

## Goal
Purity stops being a standalone app. It becomes a module inside the ATHER DESK shell (sidebar, header, profile, theme), and language becomes a global setting that drives all modules.

## 1. Audit what Purity owns today

Before changes, confirm the current Purity surface:
- `src/routes/purity/index.tsx`, `purity/dashboard.tsx`, `purity/trips.$tripId.tsx`
- `src/lib/purity-i18n.tsx` (own language provider, wraps Purity in `__root.tsx`)
- `src/components/PurityReport.tsx` and any Purity-only header/profile UI inside those routes

I will read these to map every Purity-specific chrome element (header, profile menu, language switcher) that needs to be removed.

## 2. Move Purity under the DESK shell

- Mount Purity content at `/desk/app/purity` (already a route). Replace its current passthrough with the real Purity dashboard rendered **inside** the existing DESK layout used by Swap/Margin/Dashboard — same sidebar, top bar, profile menu, logout, dark theme, card style, spacing, fonts.
- Add a Trip detail route under the DESK tree: `/desk/app/purity/trips/$tripId` (new file `src/routes/desk.app.purity.trips.$tripId.tsx`) so deep links keep working without leaving the shell.
- In `src/routes/__root.tsx`, drop the `PurityLanguageProvider` wrapper (Purity routes will read from the global language provider instead). Keep `hideChrome` logic as-is — DESK routes already hide the marketing chrome.
- Strip every Purity-specific header/profile/language-switcher block from the Purity components. They render only content (trips, suppliers, search, Bafleh status, purity tracking, reports) — the shell provides chrome.
- Leave old `/purity` and `/purity/dashboard` URLs as legacy redirects via the existing `LegacyDeskRedirect` pattern (signed in → `/desk/app/purity`, signed out → `/desk/login`). Trip deep links `/purity/trips/$tripId` redirect to `/desk/app/purity/trips/$tripId`.

## 3. One global profile

- Delete the Purity-only profile section. The DESK shell's profile menu (already used by Swap/Margin) is the single source for username, role, and sign-out across all modules.

## 4. Global language (EN / AR / FR)

- Add a `language` column to `swap_settings` (existing per-tenant settings table) — values `'en' | 'ar' | 'fr'`, default `'en'`. (Migration in a dedicated section below.)
- Create `src/lib/i18n.tsx`: a single `LanguageProvider` + `useLanguage()` hook. Loads the saved language from `swap_settings` on mount, persists changes via an existing settings server fn, and sets `<html lang>` + `dir="rtl"` for Arabic.
- Wrap the DESK shell (the layout used at `/desk/app/*`) with this provider so Dashboard, Purity, Margin, Swap, Discount/Premium, Reports, Audit, Users, and Settings all consume it.
- Move the language selector into **Settings → General**. Remove the Purity language switcher entirely.
- Migrate Purity's existing translation dictionary out of `purity-i18n.tsx` into the new global `i18n` module under a `purity.*` namespace. Add matching `swap.*`, `margin.*`, `common.*` keys for strings that currently appear in those modules. EN/AR/FR coverage for nav labels, common buttons (Save, Cancel, Delete, Edit), and module headers. Component-level string migration in Swap/Margin can roll out incrementally — i18n infra ships now, untranslated keys fall back to English.

## 5. Sidebar + permission gating

- The DESK sidebar already lists modules. Add **Purity** to the sidebar nav between Dashboard and Margin.
- Gate every sidebar item by `useMyPermissions()` (already in the project). A user with only `purity` permission sees: Dashboard, Purity, Profile. Swap, Margin, Discount/Premium, Reports, Audit, Users, Settings are hidden unless their respective module flag allows view.
- Confirm `user_module_permissions` has a `purity` enum value (`app_module`). If not, add it in the migration.

## 6. Database migration

```sql
-- 1. Add purity to the app_module enum if missing
ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'purity';

-- 2. Add global language to swap_settings
ALTER TABLE public.swap_settings
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en'
  CHECK (language IN ('en','ar','fr'));
```

No new tables, no new RLS — `swap_settings` already has policies.

## 7. Files touched

**New**
- `src/lib/i18n.tsx` — global language provider + dictionary
- `src/routes/desk.app.purity.trips.$tripId.tsx` — trip detail inside the shell

**Edited**
- `src/routes/__root.tsx` — drop `PurityLanguageProvider`
- `src/routes/desk.app.purity.tsx` — render the real Purity dashboard in-shell
- `src/components/PurityReport.tsx` and Purity dashboard internals — remove Purity header/profile/language UI; use global i18n
- `src/routes/purity/index.tsx`, `purity/dashboard.tsx`, `purity/trips.$tripId.tsx` — convert to `LegacyDeskRedirect`
- DESK shell sidebar component — add Purity entry, gate items by `useMyPermissions()`
- `src/components/swap/SettingsPanel.tsx` — add Language selector (EN / AR / FR), persists via settings server fn
- `src/lib/swap-settings.functions.ts` — extend `updateSwapSettings` to accept `language`

**Removed (effectively)**
- `src/lib/purity-i18n.tsx` — superseded by `src/lib/i18n.tsx`; dictionary migrated, file deleted

## 8. Verification

After implementation:
- Sign in → land on `/desk/app/dashboard` (unchanged).
- Click Purity in the sidebar → URL becomes `/desk/app/purity`, same header/sidebar/profile/theme as Swap.
- Switch language in Settings to Arabic → entire shell flips to AR + RTL, including the Purity page.
- Old links: `/purity`, `/purity/dashboard`, `/purity/trips/<id>` all redirect (signed in → DESK Purity; signed out → `/desk/login`).
- A user with only `purity` permission sees just Dashboard + Purity + Profile in the sidebar.

## Out of scope (call out)

Full string-by-string translation of every Swap/Margin/Reports screen into AR/FR is a long content-translation task. This plan ships the infra + nav/common labels; module-internal strings will land incrementally. Confirm if you want me to also translate every existing screen in this same change — that roughly doubles the scope.
