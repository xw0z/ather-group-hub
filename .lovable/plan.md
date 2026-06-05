# Clean ATHER DESK module separation

## Goal
Stop showing every editable field on every page. Each page edits only what it owns.

| Page | Shows | Edits |
|---|---|---|
| Clients | Code, Name, Position, USD bal, Gold bal, Additional Exposure %, status, quick links | Code, Name, Position, USD bal, Gold bal, Additional Exposure % |
| Margin | XAU, gold value, USD bal, equity, margin req %, required margin, level, status | Gold bal, USD bal, Margin requirement % |
| Swap Fees | USD bal, Additional Exposure %, Effective Balance, long/short rate %, daily fee, Wed 3×, fee history | Long rate %, Short rate % (per client) |

## Changes

### 1. Database
Add column `swap_clients.additional_exposure_pct numeric NOT NULL DEFAULT 5.00`.
No backfill needed — default 5.00 applies to existing rows.

### 2. Swap fee formula
In the daily-fee server logic, compute:
```
effective_balance = usd_balance * (1 + additional_exposure_pct / 100)
daily_fee = |effective_balance| * (rate / 100) / 365 * multiplier
```
(Replace current `usd_balance * rate / 365 * multiplier`.) Wednesday 3× multiplier preserved.

### 3. `src/routes/swap/dashboard.tsx`
- **ClientsTab**: remove margin %, long rate %, short rate %, XAU price overrides from the add/edit form and from the card display. Keep code, name (notes), position, USD bal, Gold bal, Additional Exposure %. Cards show status summary + quick links (View Margin / View Swap / Share Report). Drop in-card margin & swap fee blocks.
- **MarginTab**: inline edit retains only USD bal, Gold bal, Margin requirement %. (Rates removed.)
- **HomeTab (Swap Fees)**: inline edit retains only Long rate %, Short rate %, Additional Exposure %. Show Effective Balance line. (Margin %, gold, USD bal removed from this edit.)
- Remove the duplicate BackupButton/RestoreButton row at the top of Margin & Premium tabs (sidebar already exposes one set; the per-page row is the duplicate the user is seeing).

### 4. Server functions (`src/lib/swap-clients.functions.ts`)
- Add `additional_exposure_pct` to create/update validators (default 5, range 0–100).
- Return it in list/history payloads.
- Update the daily-fee writer to use effective balance.

### 5. Out of scope
- No changes to Reports / Audit / formulas other than swap fee.
- Client Code stays locked after creation (already enforced).
- No new permissions.

## Technical notes
- Migration is one `ALTER TABLE ... ADD COLUMN` — fast, no downtime.
- Types regenerate after migration; UI changes go in the follow-up turn.
- `cached(CK.clients ...)` cache key bumped via `invalidate` after any edit so the new field appears immediately.
