## Backup Module for Refinery

Add a new admin-only "Backup" tab to the Refinery system that lets admins export, download, restore, and schedule backups of all refinery data.

---

### A. Database (1 migration)

**New table: `refinery_backups`** — stores backup metadata + payload.
- `id`, `refinery_id`, `file_name`, `file_size_bytes`, `created_by`, `created_by_email`, `created_at`
- `kind` enum: `manual` | `scheduled` | `safety` (auto pre-restore)
- `payload` jsonb — full snapshot (clients, transactions, stock, movements, gold bars, price log, notes, position snapshots, profile/settings)
- `schema_version` int (for forward compatibility)
- RLS: only platform admins can `SELECT/INSERT/DELETE` (uses existing `is_platform_admin`)

**New table: `refinery_backup_settings`** — one row per refinery.
- `refinery_id` (PK), `daily_enabled` bool, `daily_time` time, `keep_last` int default 30, `updated_by`, `updated_at`
- RLS: platform admin only

**New table: `refinery_audit_log`** — append-only audit trail for backup/restore ops.
- `id`, `refinery_id`, `user_id`, `user_email`, `action` (`backup_created` | `backup_downloaded` | `backup_deleted` | `restore_started` | `restore_completed` | `restore_failed` | `settings_updated`), `file_name`, `details` jsonb, `created_at`
- Immutable trigger blocks UPDATE/DELETE
- RLS: platform admin SELECT, server-only INSERT

**Restore RPC (`refinery_restore_backup`)** — SECURITY DEFINER plpgsql function that, in a single transaction:
1. Verifies caller is platform admin and the backup belongs to the target refinery
2. Deletes existing rows for the refinery from: stock_movements, transaction_gold_bars, transactions, client_notes, position_snapshots, price_log, clients, stock
3. Re-inserts from the backup payload preserving IDs
4. Raises on any error → full rollback

---

### B. Server functions (`src/lib/refineries.functions.ts`)

All gated with `requireSupabaseAuth` + admin check via `is_platform_admin`:
- `createBackup({ refineryId, kind })` — snapshots all refinery data into the payload, inserts row, prunes to `keep_last`, audits
- `listBackups({ refineryId })` — metadata only (omit payload for list)
- `getBackupPayload({ backupId })` — returns full payload for download; audits `backup_downloaded`
- `deleteBackup({ backupId })` — audits + deletes
- `restoreBackup({ backupId, confirmText })` — requires `confirmText === "RESTORE"`, creates safety backup first, calls RPC, audits start/complete/fail
- `restoreFromFile({ refineryId, payload, confirmText })` — same as above but for uploaded file; validates schema + refinery match
- `getBackupSettings({ refineryId })` / `updateBackupSettings({ refineryId, ... })`
- `listAuditLog({ refineryId, limit })`

### C. Scheduled daily backup

- New public route `src/routes/api/public/hooks/refinery-daily-backup.ts` — iterates refineries with `daily_enabled = true` whose `daily_time` matches the current hour, runs `createBackup({ kind: 'scheduled' })` for each
- Auth via `apikey` header (Supabase anon key)
- `pg_cron` schedule hourly via `supabase--insert`

### D. UI (`src/routes/desk.refineries.tsx`)

- Add `"backup"` to the tab list, gated by `assignment.role === 'admin'` (or `is_platform_admin`)
- New `BackupTab` component with 4 sections:
  - **A. Create Backup** — big "Create Backup" button, shows last-created summary
  - **B. Restore Backup** — file upload + "Restore from History" actions, modal with red warning + `RESTORE` confirmation input
  - **C. Backup History** — table (Date / Created By / File Name / Size / Actions: Download · Restore · Delete)
  - **D. Scheduled Backup Settings** — toggle, time picker, keep-last number, save button
  - **Audit Log** panel beneath history showing recent backup-related actions
- Download: serializes the payload client-side to a Blob → triggers download with filename `ather-refinery-{refinery_id_short}-backup-YYYY-MM-DD-HH-mm.json`
- Dark ATHER Desk theme; destructive actions use `destructive`/red tokens

---

### Technical details

- Backup format: JSON (single file) with shape `{ schema_version: 1, refinery: {...}, created_at, clients: [...], transactions: [...], gold_bars: [...], stock: {...}, stock_movements: [...], notes: [...], price_log: [...], position_snapshots: [...], settings: {...} }`
- Safety backup created automatically before any restore (kind = `safety`)
- Pruning: after each create, delete oldest backups beyond `keep_last` (excluding `safety` kind which is always kept)
- File-size: computed from `Buffer.byteLength(JSON.stringify(payload))` server-side, stored in `file_size_bytes`
- All admin checks use existing `public.is_platform_admin(auth.uid())`
- Audit log includes IP via `getRequestHeader('x-forwarded-for')` and user-agent

### Out of scope

- Storing payloads in object storage (kept in JSONB for atomicity; can migrate later if size grows)
- Restoring across refineries (blocked by RPC check)
- Partial/selective restore