## Goal

Today `can_access_refinery()` only checks membership. The `refinery_users.role` column (`manager` / `staff` / `viewer`) exists but is **not enforced** for any mutating action. Any member with refinery access can call any `refinery_*` RPC. We will enforce roles in the database AND in the server functions, so a hostile client cannot bypass UI hiding.

## Role Matrix (please confirm or adjust)

| Action | viewer | staff | manager | admin (platform) |
|---|---|---|---|---|
| View transactions / clients / stock / reports | ✅ | ✅ | ✅ | ✅ |
| Create gold/DA receiving & delivery transactions | ❌ | ✅ | ✅ | ✅ |
| Edit / reverse a transaction | ❌ | ❌ | ✅ | ✅ |
| Delete a transaction | ❌ | ❌ | ✅ | ✅ |
| Buy / Sell (financial position change) | ❌ | ❌ | ✅ | ✅ |
| Create / edit / delete settlement | ❌ | ❌ | ✅ | ✅ |
| Stock adjustment (create / edit / delete) | ❌ | ❌ | ✅ | ✅ |
| Client create / edit / delete | ❌ | ❌ | ✅ | ✅ |
| Client notes (add) | ❌ | ✅ | ✅ | ✅ |
| Price log entry | ❌ | ✅ | ✅ | ✅ |
| Save / export reports | ❌ | ✅ | ✅ | ✅ |
| Refinery settings (name, fees, branding) | ❌ | ❌ | ❌ | ✅ |
| Manage refinery users | ❌ | ❌ | ❌ | ✅ |
| Backup / restore | ❌ | ❌ | ❌ | ✅ |

Two items I want your explicit answer on:
1. **Buy/Sell** → I'm proposing **manager+** because it moves real capital. The original spec said "staff: create transactions only" which is ambiguous. Confirm manager-only?
2. **Refinery settings** (the refinery name, default fees, etc.) → I'm proposing **admin-only**. Originally you wrote "no settings" for staff but didn't say if managers can edit settings. Confirm admin-only, or allow managers?

## Implementation

### 1. Database migration

- Add `public.has_refinery_role(_uid uuid, _rid uuid, _min_role refinery_role) RETURNS boolean` (SECURITY DEFINER). Logic: platform admin → true; else look up the user's role for the refinery and compare against an ordering `viewer < staff < manager`.
- Add role gates at the top of each mutating SECURITY DEFINER function:
  - `refinery_create_buysell` → require `manager`
  - `refinery_create_settlement`, `refinery_edit_settlement`, `refinery_delete_settlement` → `manager`
  - `refinery_create_stock_adjustment`, `refinery_edit_stock_adjustment`, `refinery_delete_stock_adjustment` → `manager`
  - `refinery_settle_transaction` → `staff` (settling a pending receive/delivery)
  - `refinery_reverse_transaction` → `manager`
  - `refinery_restore_from_payload` → already `is_platform_admin`, keep as-is
- Tighten `refinery_clients` RLS: split `rc_all` into `SELECT` (any member) + `INSERT/UPDATE/DELETE` (manager+).
- Tighten `refinery_client_notes` RLS: `SELECT` any member; `INSERT/UPDATE/DELETE` staff+.
- Tighten `refinery_price_log` RLS: `SELECT` any member; `INSERT` staff+.
- Tighten `refinery_report_history` RLS: `SELECT` any member; `INSERT` staff+.
- Tighten `refinery_position_snapshots`: `SELECT` any member; `INSERT/UPDATE/DELETE` manager+.
- `refinery_stock`, `refinery_stock_movements`, `refinery_transactions`, `refinery_transaction_gold_bars`: already SELECT-only or written exclusively by SECURITY DEFINER functions — no policy changes needed; the function-level gate is sufficient.
- `refinery_audit_log`, `refinery_backups`, `refinery_backup_settings`, `refinery_users`: already admin-only — no change.

### 2. Server function changes (`src/lib/refineries.functions.ts`)

- Add a tiny helper `requireRefineryRole(refineryId, minRole)` that runs an RPC to `has_refinery_role` and throws `Error("Forbidden: requires X role")` on failure. Call it at the top of every `createServerFn` that mutates: create/edit/delete transaction, buy/sell, settlement, stock adjustment, client CRUD, settings updates, reports save, etc.
- The two SECURITY DEFINER paths (DB functions + server-fn check) are belt-and-suspenders: the DB function is the real guarantee; the server-fn check returns a clean error message before the SQL even runs.

### 3. UI (out of scope for this task, optional follow-up)

The user explicitly said "do not rely only on hiding buttons in the UI", so we focus on the server. I will NOT change the UI in this turn. Once the server enforcement is shipped, we can do a follow-up to grey out buttons for viewer/staff to match.

### 4. Migration safety

All existing users currently have `role='manager'`, so no one gets locked out. New staff/viewer users will be correctly restricted from day one.

## Rollout

1. Migration 1: add `has_refinery_role()` helper.
2. Migration 2: add role gates inside each mutating DB function (one ALTER block per function via `CREATE OR REPLACE FUNCTION`).
3. Migration 3: tighten the RLS policies listed above.
4. Code edit: add `requireRefineryRole()` server-fn helper and call it in the handlers listed above.

After approval I will execute these in order.

## Confirm before I proceed

- ✅ / ❌ Role matrix above
- ✅ / ❌ Buy/Sell = manager-only
- ✅ / ❌ Refinery settings = admin-only
