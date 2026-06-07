## Settlement Transaction Type

A new transaction kind that transfers gold or DA between two existing clients of the same refinery, without touching the refinery's own stock. Each settlement creates two linked transaction records (one per client) so it shows up in both clients' account statements and the global transaction list.

### 1. Database (migration)

Extend `refinery_transactions`:
- Add `transaction_type` enum value `settlement` (or store as text — confirm current column type, add CHECK if needed).
- New nullable columns:
  - `settlement_kind text` — `'gold' | 'da'`
  - `settlement_role text` — `'from' | 'to'` (which side of the pair this row represents)
  - `counterparty_client_id uuid` — the other client
  - `settlement_group_id uuid` — shared ID linking the two rows
  - `settlement_apply_fee boolean default false`
  - `settlement_amount numeric` — pure gold grams or DA amount being transferred

Add Postgres function `refinery_create_settlement(_refinery_id, _from_client, _to_client, _kind, _amount, _apply_fee, _fee_price, _date, _notes)`:
- Validates both clients belong to the refinery and are different.
- For gold + fee: computes `weight_730 = amount * 1000 / 730`, `fee = weight_730 * fee_price`. Charges fee to receiving client (DA balance −fee).
- Inserts two `refinery_transactions` rows sharing one `settlement_group_id`:
  - From row: `direction='delivery'`, `transaction_type='settlement'`, deducts gold/DA from sender.
  - To row: `direction='receiving'`, adds gold/DA (and deducts fee in DA) to receiver.
- Both rows go straight to `settled` status via direct balance updates (does not touch `refinery_stock` — this is an inter-client transfer, refinery stock is unchanged).
- Writes balance snapshots into existing `previous_*` / `new_*` columns.
- Returns the pair.

Reverse/delete: extend `refinery_reverse_transaction` to handle the settlement type by also reversing the paired row, or add a dedicated `refinery_reverse_settlement(group_id)`.

### 2. Server functions (`src/lib/refineries.functions.ts`)

- Add `RefineryTxType = "da" | "gold" | "settlement"` and new fields to `RefineryTransaction`.
- New server fn `createSettlement({ refinery_id, from_client_id, to_client_id, kind, amount, apply_fee, fee_price, transaction_date, notes })` → calls RPC, returns both rows.
- New server fn `getSettlement(group_id)` → returns the pair (used by receipt dialog).
- Update `listTransactions` to also surface counterparty name (join twice or fetch via second query) so the table can show "A → B".
- Update `deleteTransaction` / cancel to delete both rows when one side of a settlement is removed.

### 3. UI — transaction form (`src/routes/desk.refineries.tsx`)

In the existing Add Transaction dialog, add `Settlement` as a third type alongside `Gold` / `DA`. When selected:
- Show `From Client` + `To Client` selects (both required, must differ).
- Settlement Kind: `Pure Gold` / `DA` radio.
- Amount input (grams or DA).
- For Gold kind only: `☑ Apply Refinery Fee` checkbox; when checked show fee price input (defaulted from receiver's `refining_fee_price`) and a live preview of `Weight @ 730` and `Total Fee`.
- Live preview panel showing the resulting balance impact for both clients.
- Submit calls `createSettlement`.

Transaction list: render settlement rows with a `SETTLEMENT` badge and `from → to` label. Hide direction column meaning for settlements (it is implicit).

### 4. Receipt (`src/components/refineries/SettlementReceipt.tsx`)

New A4 white receipt component mirroring `TransactionReceipt.tsx` style:
- Header: ATHER GROUP / refinery name / "Settlement Receipt" / settlement number.
- Parties block: `From Client` and `To Client` side-by-side.
- Settlement details table: Pure Gold Amount, Weight @ 730, Fee Price, Total Refinery Fee, Fee Charged To.
- Balance Movement table with rows for both clients (gold + DA), using existing signed color helpers.
- Notes, signatures, footer — identical styling.

Wire into the receipt dialog: when `tx.transaction_type === 'settlement'`, render `SettlementReceiptReport` instead of `TransactionReceiptReport`. Reuse the existing PDF/PNG/WhatsApp share pipeline in `desk.refineries.tsx` unchanged (it takes any React node and rasterizes it).

### 5. Audit log

The existing `created_by` capture on each row already records who and when. No extra audit table needed — both linked rows carry `created_by` and `created_at`.

### Out of scope (not requested)

- No changes to refinery stock movements (this is a client-to-client transfer, refinery inventory unchanged).
- No edits to the existing Gold / DA transaction types.
- No new permissions — uses existing `assertAccess` refinery check.

### Files touched

- New migration under `supabase/migrations/`
- `src/lib/refineries.functions.ts`
- `src/routes/desk.refineries.tsx` (form + list + receipt dialog dispatch)
- New `src/components/refineries/SettlementReceipt.tsx`
