# Settlement = One Transaction (Plan)

Goal: a settlement looks and behaves like a single transaction (one row, one number, one receipt, editable), while still updating both clients' balances correctly.

## Approach

Settlements are currently stored as **two** rows (one per client) so each client's account statement can show their side of the deal. Throwing that away would force a risky migration of existing data. Instead:

- Keep two backend rows (one per client), but **hide the second one** from the transactions list.
- **One shared reference number** — drop the `-A` / `-B` suffix. Both rows share `REFINE-202606-0005`.
- New **Edit Settlement** flow updates both rows atomically and recalculates both clients' balances.
- Existing settlements keep working — old `-A`/`-B` numbers are normalised for display.

## What changes (user-visible)

1. **Transactions list** shows one row per settlement.
2. **Client cell**: `AB1234 (Acme) → CD5678 (Beta)`.
3. **Pure amount** appears once.
4. **Edit** button is available on settlements, same as gold transactions. The edit dialog lets you change: From client, To client, Pure amount (or DA), Apply-fee toggle + fee prices, Date, Notes.
5. After editing, both clients' balances are recomputed from scratch on the server (reverse old → apply new) in one transaction.
6. **Receipt**: one settlement receipt; the number shown is the shared reference (no `-A`/`-B`).
7. **Reference format**: `REFINE-202606-0005` (no suffix). Old rows display the same — the `-A`/`-B` is stripped at render time.

## Technical details

### Database (single migration)

- `refinery_create_settlement`: write the **same canonical number** to both rows (no `-A`/`-B`).
- New `public.refinery_edit_settlement(_group_id, _from_client, _to_client, _kind, _amount, _apply_fee, _from_fee_price, _to_fee_price, _date, _notes)`:
  1. Load both existing rows for the group `FOR UPDATE`.
  2. Reverse their effect on each client's balance using the stored `previous_*` / `new_*` snapshots.
  3. Delete the two rows (or update them in place if the from/to client did not change).
  4. Re-run the same logic as `refinery_create_settlement`, reusing the existing `settlement_group_id` and shared transaction number.
  5. Append a row to `refinery_audit_log` (`action='settlement.edit'`, old/new payload).
- `refinery_delete_settlement` stays as-is; it already cleans both rows.

### Backend (server functions)

- `src/lib/refineries.functions.ts`:
  - Add `editSettlement` (mirrors `createSettlement` + takes `group_id`). Calls the new RPC.
  - `listTransactions`: append `WHERE settlement_role IS DISTINCT FROM 'to'` so the list returns only the "from" row for each settlement. Per-client statements (`getAccountStatement`) are untouched — they already filter by `client_id` and need both rows.
  - Add a small display helper `displayTxNumber(tx)` that returns `tx.transaction_number.replace(/-[AB]$/, "")`. Used by the UI and the receipt.

### Frontend

- `src/routes/desk.refineries.tsx`
  - `TransactionsTab` + `RecentTxTable`:
    - Use `displayTxNumber` in the reference column.
    - Client cell for settlements: `<ClientLabel code from_code name from_name /> → <ClientLabel code to_code name to_name />` (already partly there via `counterparty_client_name`; we'll wire `counterparty_client_code`).
    - Remove the `tx.transaction_type !== "settlement"` guard on the Edit button.
  - `TransactionFormPage`:
    - Remove the "Settlements cannot be edited" block.
    - On edit submit for `type === "settlement"`, call `editSettlement({ group_id, ... })` instead of `createSettlement`.
    - Pre-fill the form from the loaded settlement (use existing `getSettlement` by `settlement_group_id`).
  - `TransactionReceiptDialog`: use `displayTxNumber` for the displayed reference and the upload filename.

- `src/components/refineries/SettlementReceipt.tsx`
  - Replace the local `receiptNo = transaction_number.replace(/-A$/, "")` with `displayTxNumber` (handles both `-A` and `-B`).
  - Show the shared number once at the top; remove the per-party "Ref" line (or relabel to `Side: From / To`).

### What is intentionally NOT changed

- DB schema of `refinery_transactions` — no column drops, no data migration of historical `-A`/`-B` rows. They continue to work and now also display as one row.
- `getAccountStatement` — still consumes both rows so each client sees their own side. This is correct.
- Delete flow — already handles both rows via `refinery_delete_settlement`.

## Acceptance check (after build)

- Create a new settlement → one row in the list, number `REFINE-YYYYMM-NNNN`, client cell shows `FROM → TO`.
- Open an old settlement (`-A`/`-B`) → renders as one row with normalised number.
- Edit a settlement: change amount + swap From/To → both clients' balances reflect only the new values.
- Delete a settlement → both rows gone, both balances restored.
- Receipt: one PDF, one number, balances of both parties shown.
