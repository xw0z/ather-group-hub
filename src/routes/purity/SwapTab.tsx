import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, DollarSign, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/purity-activity";

export type SwapEntry = {
  id: string;
  user_id: string;
  client_name: string;
  usd_amount: number;
  annual_rate: number;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};

const DEFAULT_RATE = 5.4;

function daysBetween(start: string, end: string | null): number {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const ms = e.getTime() - s.getTime();
  const d = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  return d;
}

function dailyFee(usd: number, rate: number): number {
  return (Number(usd) * (Number(rate) / 100)) / 365;
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SwapTab() {
  const [entries, setEntries] = useState<SwapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // form state
  const [clientName, setClientName] = useState("");
  const [usd, setUsd] = useState("");
  const [rate, setRate] = useState(String(DEFAULT_RATE));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEnd, setEditEnd] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editUsd, setEditUsd] = useState("");

  // quick calculator
  const [calcUsd, setCalcUsd] = useState("");
  const [calcRate, setCalcRate] = useState(String(DEFAULT_RATE));
  const [calcDays, setCalcDays] = useState("1");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("purity_swaps")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setEntries(data as SwapEntry[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addEntry(e: FormEvent) {
    e.preventDefault();
    const usdNum = parseFloat(usd);
    const rateNum = parseFloat(rate);
    if (!clientName.trim() || isNaN(usdNum) || usdNum <= 0 || isNaN(rateNum)) return;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { error } = await supabase.from("purity_swaps").insert({
      user_id: uid,
      client_name: clientName.trim(),
      usd_amount: usdNum,
      annual_rate: rateNum,
      start_date: startDate,
      end_date: endDate || null,
      notes: notes.trim() || null,
    });
    if (!error) {
      await logActivity("swap_created", "swap", {
        client: clientName.trim(),
        usd: usdNum,
        rate: rateNum,
      });
      setClientName("");
      setUsd("");
      setRate(String(DEFAULT_RATE));
      setEndDate("");
      setNotes("");
      setShowForm(false);
      load();
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete swap entry for ${name}?`)) return;
    const { error } = await supabase.from("purity_swaps").delete().eq("id", id);
    if (!error) {
      await logActivity("swap_deleted", "swap", { client: name }, id);
      load();
    }
  }

  function startEdit(en: SwapEntry) {
    setEditingId(en.id);
    setEditEnd(en.end_date ?? "");
    setEditRate(String(en.annual_rate));
    setEditUsd(String(en.usd_amount));
  }

  async function saveEdit(id: string) {
    const usdNum = parseFloat(editUsd);
    const rateNum = parseFloat(editRate);
    if (isNaN(usdNum) || isNaN(rateNum)) return;
    const { error } = await supabase
      .from("purity_swaps")
      .update({
        usd_amount: usdNum,
        annual_rate: rateNum,
        end_date: editEnd || null,
      })
      .eq("id", id);
    if (!error) {
      await logActivity("swap_updated", "swap", id, {
        usd: usdNum,
        rate: rateNum,
        end_date: editEnd || null,
      });
      setEditingId(null);
      load();
    }
  }

  const calc = useMemo(() => {
    const u = parseFloat(calcUsd) || 0;
    const r = parseFloat(calcRate) || 0;
    const d = parseInt(calcDays) || 0;
    const daily = dailyFee(u, r);
    return { daily, total: daily * d };
  }, [calcUsd, calcRate, calcDays]);

  const totals = useMemo(() => {
    let totalUsd = 0;
    let totalFee = 0;
    for (const e of entries) {
      const days = daysBetween(e.start_date, e.end_date);
      totalUsd += Number(e.usd_amount);
      totalFee += dailyFee(Number(e.usd_amount), Number(e.annual_rate)) * days;
    }
    return { totalUsd, totalFee };
  }, [entries]);

  return (
    <div className="space-y-5">
      {/* Quick calculator */}
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" /> Quick swap calculator
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">USD</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={calcUsd}
              onChange={(e) => setCalcUsd(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label className="text-xs">Rate %/yr</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={calcRate}
              onChange={(e) => setCalcRate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Days</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={calcDays}
              onChange={(e) => setCalcDays(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Daily fee</div>
            <div className="font-semibold">${fmt(calc.daily)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total fee</div>
            <div className="font-semibold">${fmt(calc.total)}</div>
          </div>
        </div>
      </section>

      {/* Saved entries header */}
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Saved swap entries</h2>
            <p className="text-[11px] text-muted-foreground">
              {entries.length} entries · Total USD ${fmt(totals.totalUsd)} · Total fees $
              {fmt(totals.totalFee)}
            </p>
          </div>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "New"}
          </Button>
        </div>

        {showForm && (
          <form
            onSubmit={addEntry}
            className="grid grid-cols-2 gap-2 mb-4 p-3 rounded-md bg-muted/30"
          >
            <div className="col-span-2">
              <Label className="text-xs">Client name</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client"
                required
              />
            </div>
            <div>
              <Label className="text-xs">USD retrieved</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={usd}
                onChange={(e) => setUsd(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Annual rate %</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="text-xs">Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="text-xs">End date (optional)</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Button type="submit" className="w-full">
                Save entry
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No swap entries yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((en) => {
              const days = daysBetween(en.start_date, en.end_date);
              const daily = dailyFee(Number(en.usd_amount), Number(en.annual_rate));
              const total = daily * days;
              const isEditing = editingId === en.id;
              return (
                <li
                  key={en.id}
                  className="rounded-md border border-border/60 p-3 bg-background"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{en.client_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {en.start_date} → {en.end_date ?? "today"} · {days} day
                        {days !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => saveEdit(en.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEdit(en)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove(en.id, en.client_name)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <Label className="text-xs">USD</Label>
                        <Input
                          type="number"
                          value={editUsd}
                          onChange={(e) => setEditUsd(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Rate %</Label>
                        <Input
                          type="number"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">End date</Label>
                        <Input
                          type="date"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                      <Stat label="USD" value={`$${fmt(Number(en.usd_amount))}`} />
                      <Stat label="Rate" value={`${Number(en.annual_rate).toFixed(2)}%`} />
                      <Stat label="Daily" value={`$${fmt(daily)}`} />
                      <Stat label="Total" value={`$${fmt(total)}`} accent />
                    </div>
                  )}

                  {en.notes && (
                    <div className="text-[11px] text-muted-foreground mt-2">
                      {en.notes}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-md px-2 py-1.5 ${
        accent ? "bg-primary/10 text-primary" : "bg-muted/40"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
