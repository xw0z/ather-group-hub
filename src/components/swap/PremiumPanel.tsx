import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Building2,
  ArrowLeft,
  FileText,
  ListOrdered,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  listPremiumCompanies,
  listCompanyTransactions,
  listAllTransactions,
  createPremiumCompany,
  renamePremiumCompany,
  deletePremiumCompany,
  createPremiumTransaction,
  updatePremiumTransaction,
  deletePremiumTransaction,
  TROY_OZ_PER_GRAM,
  type CompanySummary,
  type PremiumKind,
  type PremiumTx,
} from "@/lib/swap-premium.functions";
import { ShareCompanyDialog } from "./ShareCompanyDialog";
import {
  fmtDateUTC as fmtDate,
  fmtG,
  fmtUSD,
  formatTxNote,
} from "@/lib/swap-share-format";


const KIND_META: Record<
  PremiumKind,
  { label: string; color: string; icon: typeof Plus }
> = {
  add: { label: "Add Gold Balance", color: "text-emerald-400", icon: ArrowUpRight },
  remove: { label: "Remove Clean Gold", color: "text-red-400", icon: ArrowDownRight },
  adjust: { label: "Balance Adjustment", color: "text-amber-400", icon: Pencil },
  discount: { label: "Apply Discount", color: "text-sky-400", icon: ArrowDownRight },
  premium: { label: "Apply Premium", color: "text-fuchsia-400", icon: ArrowUpRight },
};

type View =
  | { kind: "list" }
  | { kind: "company"; companyId: string }
  | { kind: "report-company"; companyId: string }
  | { kind: "report-all" }
  | { kind: "report-history" };

export function PremiumPanel() {
  const [summaries, setSummaries] = useState<CompanySummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const s = await listPremiumCompanies();
      setSummaries(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const addCompany = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await createPremiumCompany({ data: { name: newName.trim() } });
    setNewName("");
    refresh();
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) return;
    await renamePremiumCompany({ data: { id, name: editName.trim() } });
    setEditingId(null);
    refresh();
  };

  const removeCompany = async (id: string, name: string) => {
    try {
      await deletePremiumCompany({ data: { id } });
      toast.success(`Deleted "${name}"`);
      if (view.kind !== "list") setView({ kind: "list" });
      refresh();
    } catch (err) {
      console.error("deletePremiumCompany failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete client code");
    }
  };

  if (view.kind === "company") {
    const summary = summaries?.find((s) => s.company.id === view.companyId);
    return (
      <CompanyDetail
        summary={summary}
        onBack={() => {
          setView({ kind: "list" });
          refresh();
        }}
        onReport={() =>
          setView({ kind: "report-company", companyId: view.companyId })
        }
        onChanged={refresh}
      />
    );
  }

  if (view.kind === "report-company") {
    const summary = summaries?.find((s) => s.company.id === view.companyId);
    return (
      <ReportCompanyStatement
        summary={summary}
        onBack={() => setView({ kind: "company", companyId: view.companyId })}
      />
    );
  }

  if (view.kind === "report-all") {
    return (
      <ReportAllCompanies
        summaries={summaries ?? []}
        onBack={() => setView({ kind: "list" })}
      />
    );
  }

  if (view.kind === "report-history") {
    return <ReportHistory onBack={() => setView({ kind: "list" })} />;
  }

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            Gold Discount / Premium
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track discount and premium charges on gold grams. All amounts in grams.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView({ kind: "report-all" })}
          >
            <FileText className="h-4 w-4 mr-2" /> All Companies Summary
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView({ kind: "report-history" })}
          >
            <ListOrdered className="h-4 w-4 mr-2" /> Transaction History
          </Button>
        </div>
      </header>

      <form
        onSubmit={addCompany}
        className="flex gap-2 p-4 rounded-xl border border-border/60 bg-card/40"
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Client code…"
          className="flex-1"
        />
        <Button type="submit" disabled={!newName.trim()}>
          <Plus className="h-4 w-4 mr-2" /> Add Client Code
        </Button>
      </form>

      {loading && !summaries ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !summaries?.length ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          No companies yet. Add one above.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((s) => (
            <CompanyCard
              key={s.company.id}
              s={s}
              editing={editingId === s.company.id}
              editName={editName}
              onEditStart={() => {
                setEditingId(s.company.id);
                setEditName(s.company.name);
              }}
              onEditCancel={() => setEditingId(null)}
              onEditChange={setEditName}
              onEditSave={() => saveRename(s.company.id)}
              onOpen={() => setView({ kind: "company", companyId: s.company.id })}
              onDelete={() => removeCompany(s.company.id, s.company.name)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CompanyCard({
  s,
  editing,
  editName,
  onEditStart,
  onEditCancel,
  onEditChange,
  onEditSave,
  onOpen,
  onDelete,
}: {
  s: CompanySummary;
  editing: boolean;
  editName: string;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-5 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        {editing ? (
          <div className="flex-1 flex gap-2">
            <Input
              value={editName}
              onChange={(e) => onEditChange(e.target.value)}
              className="h-8"
              autoFocus
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEditSave}>
              <Check className="h-4 w-4 text-emerald-400" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEditCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <button
                type="button"
                onClick={onOpen}
                className="font-semibold truncate text-left hover:text-primary hover:underline underline-offset-4 cursor-pointer"
                title="Open client code"
              >
                {s.company.name}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {s.tx_count} transaction{s.tx_count === 1 ? "" : "s"}
            </p>
          </div>
        )}
        {!editing && (
          <div className="flex gap-1">
            <ShareCompanyDialog summary={s} />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEditStart}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{s.company.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the client code and all its transactions.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <Stat
          label="Total Gold (without Discount / Premium)"
          value={fmtG(s.clean_remaining_grams)}
          tone={s.clean_remaining_grams < 0 ? "danger" : "ok"}
          accent
        />
        <Stat label="Discount / Premium Gold" value={fmtG(s.dp_grams)} tone="sky" />
        <div className="pt-3 border-t border-border/60">
          <Stat
            label="Total Discount / Premium Charges"
            value={fmtUSD(s.dp_charges_usd)}
            tone="fuchsia"
          />
        </div>
      </div>

      <Button className="w-full mt-4" variant="secondary" onClick={onOpen}>
        Open
      </Button>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  accent,
  small,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger" | "sky" | "fuchsia";
  accent?: boolean;
  small?: boolean;
}) {
  const color =
    tone === "danger"
      ? "text-red-400"
      : tone === "ok"
        ? "text-emerald-400"
        : tone === "sky"
          ? "text-sky-400"
          : tone === "fuchsia"
            ? "text-fuchsia-400"
            : accent
              ? "text-primary"
              : "text-foreground";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`${small ? "text-sm" : "text-base"} font-semibold tabular-nums mt-0.5 ${color}`}>
        {value}
      </p>
    </div>
  );
}

function CompanyDetail({
  summary,
  onBack,
  onReport,
  onChanged,
}: {
  summary: CompanySummary | undefined;
  onBack: () => void;
  onReport: () => void;
  onChanged: () => void;
}) {
  const [txs, setTxs] = useState<PremiumTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTx, setEditingTx] = useState<PremiumTx | null>(null);

  const reload = async () => {
    if (!summary) return;
    setLoading(true);
    try {
      const t = await listCompanyTransactions({
        data: { companyId: summary.company.id },
      });
      setTxs(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [summary?.company.id]);

  if (!summary) {
    return (
      <div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <p className="mt-4 text-sm text-muted-foreground">Client code not found.</p>
      </div>
    );
  }

  const handleDeleteTx = async (id: string) => {
    try {
      await deletePremiumTransaction({ data: { id } });
      toast.success("Transaction deleted");
      reload();
      onChanged();
    } catch (err) {
      console.error("deletePremiumTransaction failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete transaction");
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReport}>
            <FileText className="h-4 w-4 mr-2" /> Statement
          </Button>
          <TransactionFormDialog
            mode="create"
            companyId={summary.company.id}
            onSaved={() => {
              reload();
              onChanged();
            }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/60 p-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">{summary.company.name}</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-5">
          <Stat
            label="Total Gold (without Discount / Premium)"
            value={fmtG(summary.clean_remaining_grams)}
            tone={summary.clean_remaining_grams < 0 ? "danger" : "ok"}
            accent
          />
          <Stat
            label="Discount / Premium Gold"
            value={fmtG(summary.dp_grams)}
            tone="sky"
          />
          <Stat
            label="Total Discount / Premium Charges"
            value={fmtUSD(summary.dp_charges_usd)}
            tone="fuchsia"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40">
        <div className="p-4 border-b border-border/60">
          <h3 className="font-semibold">Transactions</h3>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : !txs.length ? (
          <p className="p-6 text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {txs.map((t) => (
              <TxRow
                key={t.id}
                t={t}
                onEdit={() => setEditingTx(t)}
                onDelete={() => handleDeleteTx(t.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {editingTx && (
        <TransactionFormDialog
          mode="edit"
          companyId={summary.company.id}
          tx={editingTx}
          open
          onOpenChange={(o) => {
            if (!o) setEditingTx(null);
          }}
          onSaved={() => {
            setEditingTx(null);
            reload();
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function TxRow({
  t,
  onEdit,
  onDelete,
}: {
  t: PremiumTx;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = KIND_META[t.kind];
  const Icon = meta.icon;
  return (
    <li className="p-4 flex items-center gap-4">
      <div className={`h-10 w-10 rounded-lg bg-card grid place-items-center ${meta.color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
          <span className="text-xs text-muted-foreground">
            {fmtDate(t.created_at)} · by {t.username}
          </span>
        </div>
        {t.kind === "discount" || t.kind === "premium" ? (
          <p className="text-xs text-muted-foreground mt-1 truncate whitespace-nowrap">
            {(() => {
              const isPremium = t.kind === "premium";
              const label = isPremium ? "Premium Applied" : "Discount Applied";
              const sign = isPremium ? "+" : "-";
              const rate = Number(t.per_oz ?? 0).toFixed(0);
              const grams = (Number(t.grams) || 0).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              const valueAbs = Math.abs(Number(t.amount_usd ?? 0)).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              const base = `${label} (${sign}${rate} USD/oz) | Gold: ${grams} g | Value: $${valueAbs}`;
              return t.notes ? `${base} — ${t.notes}` : base;
            })()}
          </p>
        ) : (
          <>
            <div className="text-sm mt-1 tabular-nums">
              <span className="font-medium">{fmtG(Math.abs(Number(t.grams)))}</span>
              {t.kind === "adjust" && (
                <span className="text-muted-foreground">
                  {" "}
                  ({Number(t.grams) >= 0 ? "+" : ""}
                  {Number(t.grams).toFixed(2)} g)
                </span>
              )}
            </div>
            {t.notes && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{t.notes}</p>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={onEdit}
          title="Edit transaction"
        >
          <Pencil className="h-4 w-4 text-primary" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Delete transaction">
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

type TransactionFormDialogProps =
  | {
      mode: "create";
      companyId: string;
      tx?: undefined;
      open?: undefined;
      onOpenChange?: undefined;
      onSaved: () => void;
    }
  | {
      mode: "edit";
      companyId: string;
      tx: PremiumTx;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onSaved: () => void;
    };

function TransactionFormDialog(props: TransactionFormDialogProps) {
  const { mode, companyId, onSaved } = props;
  const isEdit = mode === "edit";

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isEdit ? props.open : internalOpen;
  const setOpen = (v: boolean) => {
    if (isEdit) props.onOpenChange(v);
    else setInternalOpen(v);
  };

  const initialKind: PremiumKind = isEdit ? props.tx.kind : "add";
  const initialGrams = isEdit ? String(props.tx.grams ?? "") : "";
  const initialPerOz =
    isEdit && props.tx.per_oz != null ? String(props.tx.per_oz) : "";
  const initialNotes = isEdit ? props.tx.notes ?? "" : "";

  const [kind, setKind] = useState<PremiumKind>(initialKind);
  const [grams, setGrams] = useState(initialGrams);
  const [perOz, setPerOz] = useState(initialPerOz);
  const [notes, setNotes] = useState(initialNotes);
  const [submitting, setSubmitting] = useState(false);

  // Re-sync when opening for edit or switching tx
  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setGrams(initialGrams);
      setPerOz(initialPerOz);
      setNotes(initialNotes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit ? props.tx.id : null]);

  const gramsNum = parseFloat(grams) || 0;
  const perOzNum = parseFloat(perOz) || 0;
  const ounces = Math.abs(gramsNum) * TROY_OZ_PER_GRAM;
  const charge = ounces * perOzNum;
  const isCharge = kind === "discount" || kind === "premium";

  const reset = () => {
    setKind("add");
    setGrams("");
    setPerOz("");
    setNotes("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!gramsNum) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await updatePremiumTransaction({
          data: {
            id: props.tx.id,
            company_id: companyId,
            kind,
            grams: gramsNum,
            per_oz: isCharge ? perOzNum : null,
            notes: notes.trim() || null,
          },
        });
        toast.success("Transaction updated");
      } else {
        await createPremiumTransaction({
          data: {
            company_id: companyId,
            kind,
            grams: gramsNum,
            per_oz: isCharge ? perOzNum : null,
            notes: notes.trim() || null,
          },
        });
        reset();
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      console.error("premium tx save failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to save transaction");
    } finally {
      setSubmitting(false);
    }
  };

  const dialog = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Transaction" : "New Transaction"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as PremiumKind)}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="add">Add Gold Balance</SelectItem>
              <SelectItem value="remove">Remove Gold Balance</SelectItem>
              <SelectItem value="adjust">Balance Adjustment (+/-)</SelectItem>
              <SelectItem value="discount">Discount Charge</SelectItem>
              <SelectItem value="premium">Premium Charge</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Gold {kind === "adjust" ? "(grams, +/-)" : "(grams)"}</Label>
          <Input
            type="number"
            step="0.01"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            placeholder="e.g. 20000"
            className="mt-1.5 tabular-nums"
            required
          />
        </div>
        {isCharge && (
          <>
            <div>
              <Label>Rate ($/oz)</Label>
              <Input
                type="number"
                step="0.01"
                value={perOz}
                onChange={(e) => setPerOz(e.target.value)}
                placeholder="e.g. 20"
                className="mt-1.5 tabular-nums"
                required
              />
            </div>
            <div className="rounded-lg border border-border/60 bg-card/60 p-3 text-sm space-y-1 tabular-nums">
              <div className="flex justify-between text-muted-foreground">
                <span>Ounces</span>
                <span>{ounces.toFixed(6)} oz</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Calculation</span>
                <span>
                  {ounces.toFixed(2)} × ${perOzNum.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1 border-t border-border/60">
                <span>{kind === "discount" ? "Discount" : "Premium"} Charge</span>
                <span className={kind === "discount" ? "text-sky-400" : "text-fuchsia-400"}>
                  {fmtUSD(charge)}
                </span>
              </div>
            </div>
          </>
        )}
        <div>
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1.5"
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting || !gramsNum}>
          {submitting ? "Saving…" : isEdit ? "Save Changes" : "Save Transaction"}
        </Button>
      </form>
    </DialogContent>
  );

  if (isEdit) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {dialog}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" /> New Transaction
        </Button>
      </DialogTrigger>
      {dialog}
    </Dialog>
  );
}


function ReportCompanyStatement({
  summary,
  onBack,
}: {
  summary: CompanySummary | undefined;
  onBack: () => void;
}) {
  const [txs, setTxs] = useState<PremiumTx[]>([]);
  useEffect(() => {
    if (!summary) return;
    listCompanyTransactions({ data: { companyId: summary.company.id } }).then(setTxs);
  }, [summary?.company.id]);

  if (!summary) return null;

  return (
    <section className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back
      </Button>
      <div className="rounded-xl border border-border/60 bg-card/60 p-8 space-y-6">
        <header className="text-center border-b border-border/60 pb-6">
          <p className="text-xs uppercase tracking-[0.4em] text-primary">Ather Group</p>
          <h1 className="text-2xl font-bold mt-2">Discount / Premium Statement</h1>
          <p className="text-sm text-muted-foreground mt-1">{summary.company.name}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Generated {new Date().toLocaleString("en-US")}
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Total Gold Balance" value={fmtG(summary.total_balance_grams)} accent />
          <Stat
            label="Clean Gold Balance"
            value={fmtG(summary.clean_remaining_grams)}
            tone={summary.clean_remaining_grams < 0 ? "danger" : "ok"}
          />
          <Stat label="Discount / Premium Gold" value={fmtG(summary.dp_grams)} tone="sky" />
          <Stat
            label="Total Discount / Premium Charges"
            value={fmtUSD(summary.dp_charges_usd)}
            tone="fuchsia"
          />
        </div>

        <div>
          <h3 className="font-semibold mb-3">Transaction Log</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
                <th className="py-2">Date</th>
                <th>Type</th>
                <th className="text-right">Grams</th>
                <th className="text-right">$/oz</th>
                <th className="text-right">Charge</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-b border-border/30">
                  <td className="py-2 text-xs">{fmtDate(t.created_at)}</td>
                  <td className={`text-xs font-medium ${KIND_META[t.kind].color}`}>
                    {KIND_META[t.kind].label}
                  </td>
                  <td className="text-right tabular-nums">
                    {Number(t.grams).toFixed(2)}
                  </td>
                  <td className="text-right tabular-nums">
                    {t.per_oz != null ? `$${Number(t.per_oz).toFixed(2)}` : "—"}
                  </td>
                  <td className="text-right tabular-nums">
                    {t.amount_usd != null ? fmtUSD(Number(t.amount_usd)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>


          </table>
        </div>
      </div>
    </section>
  );
}

function ReportAllCompanies({
  summaries,
  onBack,
}: {
  summaries: CompanySummary[];
  onBack: () => void;
}) {
  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, s) => {
        acc.balance += s.total_balance_grams;
        acc.clean += s.clean_remaining_grams;
        acc.dp_g += s.dp_grams;
        acc.dp_usd += s.dp_charges_usd;
        return acc;
      },
      { balance: 0, clean: 0, dp_g: 0, dp_usd: 0 },
    );
  }, [summaries]);

  return (
    <section className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back
      </Button>
      <div className="rounded-xl border border-border/60 bg-card/60 p-8">
        <header className="text-center border-b border-border/60 pb-6 mb-6">
          <p className="text-xs uppercase tracking-[0.4em] text-primary">Ather Group</p>
          <h1 className="text-2xl font-bold mt-2">All Companies Summary</h1>
          <p className="text-xs text-muted-foreground mt-2">
            Generated {new Date().toLocaleString("en-US")}
          </p>
        </header>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
              <th className="py-2">Client Code</th>
              <th className="text-right">Total Gold</th>
              <th className="text-right">Clean Gold</th>
              <th className="text-right">D/P Gold</th>
              <th className="text-right">D/P Charges</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.company.id} className="border-b border-border/30">
                <td className="py-2 font-medium">{s.company.name}</td>
                <td className="text-right tabular-nums">{s.total_balance_grams.toFixed(2)}</td>
                <td className="text-right tabular-nums">
                  {s.clean_remaining_grams.toFixed(2)}
                </td>
                <td className="text-right tabular-nums text-sky-400">
                  {s.dp_grams.toFixed(2)}
                </td>
                <td className="text-right tabular-nums text-fuchsia-400">
                  {fmtUSD(s.dp_charges_usd)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border/80 font-bold">
              <td className="py-3">TOTAL</td>
              <td className="text-right tabular-nums">{totals.balance.toFixed(2)}</td>
              <td className="text-right tabular-nums">{totals.clean.toFixed(2)}</td>
              <td className="text-right tabular-nums text-sky-400">
                {totals.dp_g.toFixed(2)}
              </td>
              <td className="text-right tabular-nums text-fuchsia-400">
                {fmtUSD(totals.dp_usd)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportHistory({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<PremiumTx[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 100;

  useEffect(() => {
    (async () => {
      const s = await listPremiumCompanies();
      setCompanies(Object.fromEntries(s.map((x) => [x.company.id, x.company.name])));
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await listAllTransactions({
          data: {
            limit: pageSize,
            offset: page * pageSize,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
          },
        });
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setPage(0);
  };

  return (
    <section className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back
      </Button>
      <div className="rounded-xl border border-border/60 bg-card/60 p-8">
        <header className="text-center border-b border-border/60 pb-6 mb-6">
          <p className="text-xs uppercase tracking-[0.4em] text-primary">Ather Group</p>
          <h1 className="text-2xl font-bold mt-2">Transaction History</h1>
          <p className="text-xs text-muted-foreground mt-2">
            Showing {rows.length} of {total} · Generated {new Date().toLocaleString("en-US")}
          </p>
        </header>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              className="mt-1.5 h-9"
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              className="mt-1.5 h-9"
            />
          </div>
          {(fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground">No transactions for this range.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((t) => {
              const meta = KIND_META[t.kind];
              const Icon = meta.icon;
              return (
                <li key={t.id} className="py-3 flex items-center gap-4">
                  <div className={`h-9 w-9 rounded-lg bg-card grid place-items-center ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-semibold truncate max-w-[200px]" title={companies[t.company_id] ?? "Unknown company"}>
                        {companies[t.company_id] ?? "Unknown company"}
                      </span>
                      <span className={`text-xs ${meta.color}`}>· {meta.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(t.created_at)} · by {t.username}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-sm font-medium">
                      {Number(t.grams).toFixed(2)} g
                    </div>
                    {t.amount_usd != null && (
                      <div className={`text-xs ${meta.color}`}>
                        {fmtUSD(Number(t.amount_usd))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1 || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
