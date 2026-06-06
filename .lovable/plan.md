
## Refineries Module — Implementation Plan

A new isolated module under `/desk/refineries` matching existing /desk visual style (cards, tables, headers, badges, modals, toasts). No new design language.

---

### 1. Database (single migration)

New tables (all under `public`, all with GRANT + RLS + policies):

- `refineries` — id, name, status, timestamps. Seeded with 3 rows: "Refinery 1/2/3".
- `refinery_users` — user_id, refinery_id, role (`manager` | `staff` | `viewer`). Unique (user_id).
- `refinery_clients` — refinery_id, name, phone, purity_balance numeric, da_balance numeric, refining_fee_price numeric, notes, status.
- `refinery_transactions` — refinery_id, client_id, transaction_number (auto), direction (`receiving`|`delivery`), transaction_type (`da`|`gold`), date, totals, da_amount, fee_price, total_refining_fee, prev/new balances + stock snapshots, status (`draft`|`pending`|`settled`|`cancelled`), notes, settled_at, created_by.
- `refinery_transaction_gold_bars` — transaction_id, item_number, item_type (`bar`|`scrap`), gross_weight, purity, pure_weight.
- `refinery_stock` — one row per refinery (pure_gold_stock, da_stock). Seeded.
- `refinery_stock_movements` — refinery_id, client_id, transaction_id, movement_type, gold_change, da_change, before/after snapshots, created_by.

Helpers:
- `is_refinery_admin(uid)` — reuses `is_platform_admin`.
- `user_refinery_id(uid)` — returns assigned refinery id (or null for admin).
- `can_access_refinery(uid, rid)` — admin OR user_refinery_id = rid.

RLS: every table policy uses `can_access_refinery(auth.uid(), refinery_id)`. `refinery_users` readable by admin + the user themselves; writable by admin only.

Settlement is handled server-side (server fn) — it updates balances, stock, inserts a stock_movement, snapshots before/after, all in one transaction via an RPC `refinery_settle_transaction(tx_id)` (SECURITY DEFINER, validates access + stock sufficiency).

### 2. Server functions (`src/lib/refineries.functions.ts`)

All use `requireSupabaseAuth`. Each handler asserts refinery access first.

- `listRefineries()` — admin: all; user: their one.
- `getMyRefineryAssignment()`.
- Clients: `listClients(refineryId)`, `getClient(id)`, `createClient`, `updateClient`.
- Transactions: `listTransactions(refineryId, filters)`, `getTransaction(id)` (with bars), `createTransaction(payload incl bars)`, `settleTransaction(id)` (calls RPC), `cancelTransaction(id)` (admin), `reverseTransaction(id)` (admin).
- Stock: `getStock(refineryId)`, `listStockMovements(refineryId)`.
- Dashboard: `getDashboard(refineryId)` — aggregates cards + today + negative-balance clients + recent tx.
- Profile: `getMyProfile`, `updateMyProfile({name, phone, password?})`, admin `listRefineryStaff`, `assignUserToRefinery`.

### 3. Routes (TanStack file-based, under `_authenticated`)

```
src/routes/_authenticated/desk.refineries.index.tsx           → /desk/refineries (list or auto-redirect)
src/routes/_authenticated/desk.refineries.$refineryId.tsx     → layout w/ sidebar tabs + Outlet
src/routes/_authenticated/desk.refineries.$refineryId.index.tsx  → redirects to /dashboard
src/routes/_authenticated/desk.refineries.$refineryId.dashboard.tsx
src/routes/_authenticated/desk.refineries.$refineryId.clients.tsx
src/routes/_authenticated/desk.refineries.$refineryId.clients.$clientId.tsx
src/routes/_authenticated/desk.refineries.$refineryId.transactions.tsx
src/routes/_authenticated/desk.refineries.$refineryId.transactions.$txId.tsx
src/routes/_authenticated/desk.refineries.$refineryId.stock.tsx
src/routes/_authenticated/desk.refineries.$refineryId.profile.tsx
```

Index route logic:
- Admin → list of 3 refineries (cards).
- Refinery user → `navigate /desk/refineries/{assigned}/dashboard`.
- Layout enforces refinery access (server fn check in loader-equivalent on mount); blocks rendering if not allowed and redirects to their assigned refinery or `/unauthorized`.

Desk login redirect: `LegacyDeskRedirect`/dashboard logic updated so refinery-only users land on their refinery dashboard rather than the platform dashboard. Sidebar/nav (existing `SwapDashboard`) hides other modules for refinery-only users (no `swap_profiles` or `purity_profiles` access).

### 4. Components (`src/components/refineries/`)

Reuse existing UI primitives, cards, tables, badges (match `PremiumPanel`, `swap/*` patterns).

- `RefineryShell.tsx` — page header + tabs (Dashboard/Clients/Transactions/Stock/Profile).
- `RefineryDashboard.tsx` — stat cards, negative-balance table, recent transactions.
- `ClientsTable.tsx`, `ClientFormDialog.tsx`, `ClientDetail.tsx`.
- `TransactionsTable.tsx`, `TransactionFormDialog.tsx` (Direction + Type picker → DA form or Gold form).
- `GoldBarsEditor.tsx` — copy structure from purity Trips bars editor (`src/routes/purity/trips.$tripId.tsx`). Rows: item#, type (bar/scrap; scrap hidden for delivery), gross, purity, computed pure, remove. Footer totals + average purity + refining fee. Allow scrap only on receiving.
- `StockCards.tsx` + `StockMovementsTable.tsx`.
- `ProfilePanel.tsx` (reuses existing profile-style card; password change via supabase.auth.updateUser).
- `TransactionReceipt.tsx` — html-to-image + jspdf (already used in ShareCompanyDialog). WhatsApp share opens `https://wa.me/<phone>?text=…`.

Balance rendering helper: green/red/neutral classes per sign. Formatters: `370.55 g`, `25,000 DA`, purity `861.74`.

### 5. Permissions & visibility

- Refinery users are stored only in `refinery_users`. They are NOT inserted into `swap_profiles` or `purity_profiles`. The existing sidebar/dashboard already 404s/redirects them out — we extend `LegacyDeskRedirect` + `SwapDashboard` entry to redirect refinery-only users to their refinery.
- Backend enforcement via RLS + server-fn `assertRefineryAccess(userId, refineryId)` on every handler. Frontend hides controls (settle/reverse/adjust) based on role from `getMyRefineryAssignment`.

### 6. Validation

Zod schemas server-side: client (name required, fee≥0), DA tx (amount>0), gold tx (≥1 bar, gross>0, 0<purity≤1000). Stock sufficiency checked inside `refinery_settle_transaction` RPC; raises clear error → toast "Not enough stock to settle this transaction."

### 7. Out of scope (explicit)

- No documents module.
- No edits to existing Purity/Swap/Margin/Premium modules beyond hiding nav for refinery-only users.
- No design changes; all styling via existing tokens & components.

---

### Build order

1. Migration (tables + seed + RPC + RLS).
2. Server functions file.
3. Routes scaffold + RefineryShell + index redirect logic.
4. Clients (list/create/edit/detail).
5. Transactions (form with GoldBarsEditor) + settle.
6. Stock cards + movements.
7. Dashboard.
8. Profile.
9. Receipt + WhatsApp share.
10. Sidebar/redirect adjustments for refinery-only users.

This is a large module (~15–20 new files + 1 migration). After approval I'll execute in order, batching parallel writes where safe.
