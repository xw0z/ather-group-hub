
## Scope reality check

The refineries module is ~10,000 lines of UI across 7 large files (desk.refineries.tsx is 4,343 lines alone, swap/dashboard.tsx is 3,888 lines). Hand-translating every visible string into professional FR + AR in a single response is not realistic — it would take many hours of editing and the output would risk introducing bugs across critical financial flows (Buy/Sell, Settlement, Stock).

I will deliver this in **two stages within this turn**:

### Stage 1 — Infrastructure + high-traffic screens (this turn)

**i18n foundation**
- Install `react-i18next` + `i18next` + `i18next-browser-languagedetector`
- Create `src/i18n/` with `index.ts`, `locales/en.json`, `locales/fr.json`, `locales/ar.json`
- Root provider in `src/routes/__root.tsx` that:
  - Loads user's preferred language from `swap_user_preferences.locale` after login (fallback to browser → English)
  - Sets `<html lang>` and `<html dir>` (RTL for Arabic)
  - English is the default for new users; missing keys fall back to English

**RTL support**
- `dir="rtl"` toggle on `<html>`
- Tailwind logical properties already in use; add `rtl:` utility helpers where needed in nav/sidebar/tables
- Numbers, weights, DA, and client codes stay LTR via `<bdi>` / `dir="ltr"` wrappers in formatters

**Persistence**
- Add `locale` column to `swap_user_preferences` (default `'en'`, check `('en','fr','ar')`)
- Server fn `updateUserLocale(locale)` writes to user's preferences row
- Loaded on app boot; survives logout/login and works across devices

**Profile UI — Language Preferences section**
- New radio group under Preferences tab: English / Français / العربية
- Note: "Changes take effect immediately throughout the application."
- Saves to backend + updates i18n instance immediately

**Login page** — fully translated EN/FR/AR + language switcher in top-right (pre-auth, persisted to localStorage so the choice survives login).

**Refineries — fully translated EN/FR/AR**:
- Refineries list / picker page (`desk.refineries.tsx` shell + nav tabs)
- Dashboard tab labels, KPI cards
- Common UI: all buttons (Save, Cancel, Delete, Create, Edit, Confirm, Close, Search, Filter, Export, Import, Loading, No data, etc.)
- All toast/success/error messages in `refineries.functions.ts` call sites
- All validation messages
- All dialog titles + confirmation copy
- Statement headers ("Account Statement" → "Relevé de Compte" / "كشف الحساب") + column headers in `AccountStatement.tsx`, `TransactionReceipt.tsx`, `SettlementReceipt.tsx`
- Date formatting via `date-fns` with `fr` / `ar-DZ` locales
- Number formatting via `Intl.NumberFormat` (DA stays as "DA")

**Translation Management page (admin only)**
- New route `desk.refineries.translations.tsx` (admin gate)
- Table: key | English | French | Arabic | actions
- Search box, filter by namespace
- Inline edit any FR/AR string
- Export to JSON, Import from JSON
- Overrides stored in `swap_translation_overrides` table (key, locale, value, updated_by, updated_at)
- i18n loads base bundle + applies overrides on top at boot

### Stage 2 — Deep translations (follow-up turn)

Body of the giant tabs inside `desk.refineries.$refineryId.$tab.tsx` (Clients module, Transactions, Buy/Sell, Stock, Net Position, Backup) — every form label, table column, empty state, audit log description. I will work through these one tab per response so each change is reviewable and won't risk breaking the live system.

You'll get a working translated app at the end of Stage 1 (nav, login, profile, dashboard, statements, all toasts/dialogs, RTL) plus the admin tool to fix any translation you don't like, and the remaining deep tabs are completed in the next turn.

## Technical notes

- All FR/AR strings will be professional refinery/financial terminology (e.g. "Pure Gold" → "Or pur" / "الذهب الخالص"; "Refinery Fee" → "Frais de raffinage" / "رسوم التكرير"; "Settlement" → "Règlement" / "تسوية"; "Net Position" → "Position nette" / "صافي المركز"; "Account Statement" → "Relevé de compte" / "كشف الحساب"). "DA" and client codes are never translated.
- One DB migration: add `locale` to `swap_user_preferences`; create `swap_translation_overrides` table with RLS (admin write, everyone read).
- No business logic touched.

Confirm and I'll build Stage 1.
