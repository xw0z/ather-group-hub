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
  listPremiumCompanies,
  listCompanyTransactions,
  listAllTransactions,
  createPremiumCompany,
  renamePremiumCompany,
  deletePremiumCompany,
  createPremiumTransaction,
  deletePremiumTransaction,
  GRAMS_PER_OZ,
  type CompanySummary,
  type PremiumKind,
  type PremiumTx,
} from "@/lib/swap-premium.functions";

const fmtG = (n: number) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
const fmtUSD = (n: number) => {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${s}` : `$${s}`;
};
const fmtDate = (d: string) =>
  new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const KIND_META: Record<
  PremiumKind,
  { label: string; color: string; icon: typeof Plus }
> = {
  add: { label: "Add Gold Balance", color: "text-emerald-400", icon: ArrowUpRight },
  remove: { label: "Remove Gold Balance", color: "text-red-400", icon: ArrowDownRight },
  adjust: { label: "Balance Adjustment", color: "text-amber-400", icon: Pencil },
  discount: { label: "Discount Charge", color: "text-sky-400", icon: ArrowDownRight },
  premium: { label: "Premium Charge", color: "text-fuchsia-400", icon: ArrowUpRight },
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
    if (!confirm(`Delete "${name}" and all its transactions?`)) return;
    await deletePremiumCompany({ data: { id } });
    if (view.kind !== "list") setView({ kind: "list" });
    refresh();
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
          placeholder="Company name…"
          className="flex-1"
        />
        <Button type="submit" disabled={!newName.trim()}>
          <Plus className="h-4 w-4 mr-2" /> Add Company
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
              <h3 className="font-semibold truncate">{s.company.name}</h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {s.tx_count} transaction{s.tx_count === 1 ? "" : "s"}
            </p>
          </div>
        )}
        {!editing && (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEditStart}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Total Balance" value={fmtG(s.total_balance_grams)} accent />
        <Stat
          label="Clean Remaining"
          value={fmtG(s.clean_remaining_grams)}
          tone={s.clean_remaining_grams < 0 ? "danger" : "ok"}
        />
        <Stat label="Discounted" value={fmtG(s.discounted_grams)} tone="sky" />
        <Stat label="Premium" value={fmtG(s.premium_grams)} tone="fuchsia" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 pt-3 border-t border-border/60">
        <Stat label="Total Discount" value={fmtUSD(s.total_discount_usd)} tone="sky" small />
        <Stat label="Total Premium" value={fmtUSD(s.total_premium_usd)} tone="fuchsia" small />
      </div>
      <div className="mt-3 flex items-center justify-between pt-3 border-t border-border/60">
        <span className="text-xs text-muted-foreground">Net Result</span>
        <span
          className={`text-base font-bold tabular-nums ${s.net_usd >= 0 ? "text-emerald-400" : "text-red-400"}`}
        >
          {fmtUSD(s.net_usd)}
        </span>
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
        <p className="mt-4 text-sm text-muted-foreground">Company not found.</p>
      </div>
    );
  }

  const handleDeleteTx = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    await deletePremiumTransaction({ data: { id } });
    reload();
    onChanged();
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
          <NewTransactionDialog
            companyId={summary.company.id}
            onCreated={() => {
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <Stat label="Total Balance" value={fmtG(summary.total_balance_grams)} accent />
          <Stat
            label="Clean Remaining"
            value={fmtG(summary.clean_remaining_grams)}
            tone={summary.clean_remaining_grams < 0 ? "danger" : "ok"}
          />
          <Stat label="Discounted" value={fmtG(summary.discounted_grams)} tone="sky" />
          <Stat label="Premium" value={fmtG(summary.premium_grams)} tone="fuchsia" />
          <Stat label="Total Discount" value={fmtUSD(summary.total_discount_usd)} tone="sky" />
          <Stat label="Total Premium" value={fmtUSD(summary.total_premium_usd)} tone="fuchsia" />
          <div className="col-span-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Net Result
            </p>
            <p
              className={`text-2xl font-bold tabular-nums mt-0.5 ${summary.net_usd >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {fmtUSD(summary.net_usd)}
            </p>
          </div>
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
              <TxRow key={t.id} t={t} onDelete={() => handleDeleteTx(t.id)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TxRow({ t, onDelete }: { t: PremiumTx; onDelete: () => void }) {
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
        <div className="text-sm mt-1 tabular-nums">
          <span className="font-medium">{fmtG(Math.abs(Number(t.grams)))}</span>
          {(t.kind === "discount" || t.kind === "premium") && t.per_oz != null && (
            <span className="text-muted-foreground">
              {" · "}@ ${Number(t.per_oz).toFixed(2)}/oz ·{" "}
              <span className={meta.color}>{fmtUSD(Number(t.amount_usd ?? 0))}</span>
            </span>
          )}
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
      </div>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-red-400" />
      </Button>
    </li>
  );
}

function NewTransactionDialog({
  companyId,
  onCreated,
}: {
  companyId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PremiumKind>("add");
  const [grams, setGrams] = useState("");
  const [perOz, setPerOz] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const gramsNum = parseFloat(grams) || 0;
  const perOzNum = parseFloat(perOz) || 0;
  const ounces = Math.abs(gramsNum) * GRAMS_PER_OZ;
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
      setOpen(false);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" /> New Transaction
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Transaction</DialogTitle>
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
            <Label>
              Gold {kind === "adjust" ? "(grams, +/-)" : "(grams)"}
            </Label>
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
            {submitting ? "Saving…" : "Save Transaction"}
          </Button>
        </form>
      </DialogContent>
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
          <Stat label="Total Balance" value={fmtG(summary.total_balance_grams)} accent />
          <Stat
            label="Clean Remaining"
            value={fmtG(summary.clean_remaining_grams)}
            tone={summary.clean_remaining_grams < 0 ? "danger" : "ok"}
          />
          <Stat label="Discounted" value={fmtG(summary.discounted_grams)} tone="sky" />
          <Stat label="Premium" value={fmtG(summary.premium_grams)} tone="fuchsia" />
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/60">
          <Stat label="Total Discount" value={fmtUSD(summary.total_discount_usd)} tone="sky" />
          <Stat label="Total Premium" value={fmtUSD(summary.total_premium_usd)} tone="fuchsia" />
          <Stat
            label="Net Result"
            value={fmtUSD(summary.net_usd)}
            tone={summary.net_usd >= 0 ? "ok" : "danger"}
            accent
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
        acc.disc_g += s.discounted_grams;
        acc.prem_g += s.premium_grams;
        acc.disc += s.total_discount_usd;
        acc.prem += s.total_premium_usd;
        acc.net += s.net_usd;
        return acc;
      },
      { balance: 0, clean: 0, disc_g: 0, prem_g: 0, disc: 0, prem: 0, net: 0 },
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
              <th className="py-2">Company</th>
              <th className="text-right">Balance</th>
              <th className="text-right">Clean</th>
              <th className="text-right">Disc. g</th>
              <th className="text-right">Prem. g</th>
              <th className="text-right">Discount $</th>
              <th className="text-right">Premium $</th>
              <th className="text-right">Net</th>
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
                  {s.discounted_grams.toFixed(2)}
                </td>
                <td className="text-right tabular-nums text-fuchsia-400">
                  {s.premium_grams.toFixed(2)}
                </td>
                <td className="text-right tabular-nums text-sky-400">
                  {fmtUSD(s.total_discount_usd)}
                </td>
                <td className="text-right tabular-nums text-fuchsia-400">
                  {fmtUSD(s.total_premium_usd)}
                </td>
                <td
                  className={`text-right tabular-nums font-semibold ${s.net_usd >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {fmtUSD(s.net_usd)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border/80 font-bold">
              <td className="py-3">TOTAL</td>
              <td className="text-right tabular-nums">{totals.balance.toFixed(2)}</td>
              <td className="text-right tabular-nums">{totals.clean.toFixed(2)}</td>
              <td className="text-right tabular-nums text-sky-400">
                {totals.disc_g.toFixed(2)}
              </td>
              <td className="text-right tabular-nums text-fuchsia-400">
                {totals.prem_g.toFixed(2)}
              </td>
              <td className="text-right tabular-nums text-sky-400">{fmtUSD(totals.disc)}</td>
              <td className="text-right tabular-nums text-fuchsia-400">
                {fmtUSD(totals.prem)}
              </td>
              <td
                className={`text-right tabular-nums ${totals.net >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {fmtUSD(totals.net)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportHistory({ onBack }: { onBack: () => void }) {
  const [txs, setTxs] = useState<PremiumTx[] | null>(null);
  const [companies, setCompanies] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [t, s] = await Promise.all([
        listAllTransactions(),
        listPremiumCompanies(),
      ]);
      setTxs(t);
      setCompanies(Object.fromEntries(s.map((x) => [x.company.id, x.company.name])));
    })();
  }, []);

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
            Most recent 500 transactions · Generated {new Date().toLocaleString("en-US")}
          </p>
        </header>

        {!txs ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !txs.length ? (
          <p className="text-sm text-muted-foreground">No transactions recorded.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {txs.map((t) => {
              const meta = KIND_META[t.kind];
              const Icon = meta.icon;
              return (
                <li key={t.id} className="py-3 flex items-center gap-4">
                  <div className={`h-9 w-9 rounded-lg bg-card grid place-items-center ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-semibold">
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
      </div>
    </section>
  );
}
