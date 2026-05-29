import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  LogOut,
  Plus,
  Scale,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  Users,
  Plane,
  CheckCircle2,
  AlertCircle,
  Share2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  createPurityUser,
  deletePurityUser,
  getCurrentPurityUser,
  listPurityUsers,
} from "@/lib/purity-users.functions";

export const Route = createFileRoute("/purity/dashboard")({
  head: () => ({
    meta: [
      { title: "Purity — Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PurityDashboard,
});

type Client = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
};

type Trip = {
  id: string;
  name: string | null;
  departure_date: string;
  arrival_date: string | null;
  declared_purity: number;
  scrap_weight: number | null;
  notes: string | null;
  receiver_company: string | null;
  is_settled: boolean;
  created_at: string;
};

type Piece = {
  id: string;
  trip_id: string;
  client_id: string | null;
  label: string | null;
  weight_grams: number;
  initial_purity: number | null;
  bafleh_purity: number | null;
  checked: boolean;
  created_at: string;
};

// Pure gold content of a bar (grams) using Bafleh (lab) purity
function pureGrams(weight: number, purity: number | null) {
  if (purity == null) return 0;
  return (Number(weight) * Number(purity)) / 1000;
}
// Loss per bar (grams) = weight * (declared 999 - bafleh) / 1000
function lossGrams(weight: number, declared: number, baflehPurity: number | null) {
  if (baflehPurity == null) return 0;
  return (Number(weight) * (Number(declared) - Number(baflehPurity))) / 1000;
}

function tripDisplayName(trip: Trip) {
  // Always render as TRIP_YYYY-MM-DD based on departure date (ignore legacy stored names).
  return `TRIP_${trip.departure_date}`;
}


function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function PurityDashboard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");

  const [tab, setTab] = useState<"trips" | "clients" | "search" | "users">("trips");

  const [clients, setClients] = useState<Client[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [pieces, setPieces] = useState<Record<string, Piece[]>>({});
  const [openTrip, setOpenTrip] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        navigate({ to: "/purity", replace: true });
        return;
      }
      setEmail(data.session.user.email ?? "");
      await Promise.all([loadClients(), loadTrips(), loadAllPieces()]);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadClients() {
    const { data } = await supabase
      .from("purity_clients")
      .select("*")
      .order("name", { ascending: true });
    setClients((data ?? []) as Client[]);
  }

  async function loadTrips() {
    const { data } = await supabase
      .from("purity_trips")
      .select("*")
      .order("departure_date", { ascending: false });
    setTrips((data ?? []) as Trip[]);
  }

  async function loadAllPieces() {
    const { data } = await supabase
      .from("purity_pieces")
      .select("*")
      .order("created_at", { ascending: true });
    const grouped: Record<string, Piece[]> = {};
    for (const p of (data ?? []) as unknown as Piece[]) {
      (grouped[p.trip_id] ||= []).push(p);
    }
    setPieces(grouped);
  }

  async function loadPieces(tripId: string) {
    const { data } = await supabase
      .from("purity_pieces")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });
    setPieces((p) => ({ ...p, [tripId]: (data ?? []) as unknown as Piece[] }));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/purity", replace: true });
  }

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-semibold leading-none">Purity</div>
              <div className="text-[11px] text-muted-foreground">{email}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </div>
        <nav className="mx-auto max-w-3xl px-2 pb-2 flex gap-1 text-sm">
          <TabBtn active={tab === "trips"} onClick={() => setTab("trips")}>
            <Plane className="h-4 w-4 mr-1.5" /> Trips
          </TabBtn>
          <TabBtn active={tab === "clients"} onClick={() => setTab("clients")}>
            <Users className="h-4 w-4 mr-1.5" /> Suppliers
          </TabBtn>
          <TabBtn active={tab === "search"} onClick={() => setTab("search")}>
            <Search className="h-4 w-4 mr-1.5" /> Search bar
          </TabBtn>
          <TabBtn active={tab === "users"} onClick={() => setTab("users")}>
            <UserPlus className="h-4 w-4 mr-1.5" /> Users
          </TabBtn>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 space-y-5">
        {tab === "trips" && (
          <TripsTab
            trips={trips}
            clients={clients}
            pieces={pieces}
            openTrip={openTrip}
            setOpenTrip={(id) => {
              setOpenTrip(id);
              if (id && !pieces[id]) loadPieces(id);
            }}
            reloadTrips={loadTrips}
            reloadPieces={loadPieces}
          />
        )}
        {tab === "clients" && (
          <ClientsTab clients={clients} reload={loadClients} />
        )}
        {tab === "search" && <SearchTab clients={clients} trips={trips} />}
        {tab === "users" && <UsersTab />}
      </main>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-3 py-2 rounded-md transition-colors ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* -------------------- TRIPS -------------------- */

function TripsTab({
  trips,
  clients,
  pieces,
  openTrip,
  setOpenTrip,
  reloadTrips,
  reloadPieces,
}: {
  trips: Trip[];
  clients: Client[];
  pieces: Record<string, Piece[]>;
  openTrip: string | null;
  setOpenTrip: (id: string | null) => void;
  reloadTrips: () => Promise<void>;
  reloadPieces: (tripId: string) => Promise<void>;
}) {
  const [showNew, setShowNew] = useState(false);
  const [departure, setDeparture] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [receiverCompany, setReceiverCompany] = useState("");
  const [saving, setSaving] = useState(false);

  type DraftBar = {
    weight: string;
    initialPurity: string;
    baflehPurity: string;
    label: string;
    clientId: string;
  };
  const emptyBar: DraftBar = {
    weight: "",
    initialPurity: "999",
    baflehPurity: "",
    label: "",
    clientId: "",
  };
  const [bars, setBars] = useState<DraftBar[]>([{ ...emptyBar }]);

  const totalWeight = bars.reduce(
    (s, b) => s + (b.weight ? Number(b.weight) : 0),
    0,
  );

  function updateBar(i: number, patch: Partial<DraftBar>) {
    setBars((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function addRow() {
    setBars((prev) => [...prev, { ...emptyBar }]);
  }
  function removeRow(i: number) {
    setBars((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function resetForm() {
    setNotes("");
    setReceiverCompany("");
    setBars([{ ...emptyBar }]);
  }

  async function createTrip(e: FormEvent) {
    e.preventDefault();
    const validBars = bars.filter((b) => b.weight && Number(b.weight) > 0);
    if (validBars.length === 0) {
      alert("Add at least one gold bar.");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return;
    }
    const scrapTotal = validBars.reduce((s, b) => s + Number(b.weight), 0);
    const { data: tripRow, error } = await supabase
      .from("purity_trips")
      .insert({
        user_id: u.user.id,
        name: `TRIP_${departure}`,
        departure_date: departure,
        scrap_weight: scrapTotal,
        declared_purity: 999,
        notes: notes || null,
        receiver_company: receiverCompany || null,
      })
      .select()
      .single();
    if (error || !tripRow) {
      setSaving(false);
      return;
    }
    const piecesPayload = validBars.map((b) => ({
      user_id: u.user!.id,
      trip_id: tripRow.id,
      weight_grams: Number(b.weight),
      initial_purity: b.initialPurity === "" ? 999 : Number(b.initialPurity),
      bafleh_purity: b.baflehPurity === "" ? null : Number(b.baflehPurity),
      label: b.label || null,
      client_id: b.clientId || null,
    }));
    await supabase.from("purity_pieces").insert(piecesPayload);
    setSaving(false);
    resetForm();
    setShowNew(false);
    reloadTrips();
  }

  async function deleteTrip(id: string) {
    if (!confirm("Delete this trip and all its bars?")) return;
    await supabase.from("purity_pieces").delete().eq("trip_id", id);
    await supabase.from("purity_trips").delete().eq("id", id);
    reloadTrips();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Trips</h2>
        <Button size="sm" onClick={() => setShowNew((s) => !s)}>
          <Plus className="h-4 w-4 mr-1" /> New trip
        </Button>
      </div>

      {showNew && (
        <form
          onSubmit={createTrip}
          className="rounded-lg border border-border bg-card p-4 space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Departure (Algeria)</Label>
              <Input
                type="date"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                required
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                Trip name: <span className="font-mono">TRIP_{departure}</span>
              </div>
            </div>
            <div>
              <Label>Receiver company (Dubai)</Label>
              <Input
                value={receiverCompany}
                onChange={(e) => setReceiverCompany(e.target.value)}
                placeholder="e.g. Bafleh / Kaloti"
              />
            </div>
            <div className="col-span-2">
              <Label>Notes (optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Gold bars (declared purity 999‰)
              </Label>
              <Button type="button" size="sm" variant="ghost" onClick={addRow}>
                <Plus className="h-4 w-4 mr-1" /> Add bar
              </Button>
            </div>
            <div className="space-y-2">
              {bars.map((b, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    {i === 0 && <Label className="text-xs">Weight (g)</Label>}
                    <Input
                      type="number"
                      step="0.001"
                      value={b.weight}
                      onChange={(e) => updateBar(i, { weight: e.target.value })}
                      placeholder="0.000"
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <Label className="text-xs">Initial ‰</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      value={b.initialPurity}
                      onChange={(e) =>
                        updateBar(i, { initialPurity: e.target.value })
                      }
                      placeholder="999"
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <Label className="text-xs">Bafleh ‰</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      value={b.baflehPurity}
                      onChange={(e) =>
                        updateBar(i, { baflehPurity: e.target.value })
                      }
                      placeholder="—"
                    />
                  </div>
                  <div className="col-span-1">
                    {i === 0 && <Label className="text-xs">#</Label>}
                    <Input
                      value={b.label}
                      onChange={(e) => updateBar(i, { label: e.target.value })}
                      placeholder="#"
                    />
                  </div>
                  <div className="col-span-3">
                    {i === 0 && <Label className="text-xs">Supplier</Label>}
                    <select
                      value={b.clientId}
                      onChange={(e) => updateBar(i, { clientId: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value="">—</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(i)}
                      disabled={bars.length === 1}
                      className="w-full text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">
                Trip scrap weight (sum of bars)
              </span>
              <span className="font-mono font-semibold">
                {totalWeight.toFixed(3)} g
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Tip: leave Bafleh ‰ empty if the lab report hasn't arrived yet —
              you can fill it in later from the trip view.
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                resetForm();
                setShowNew(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={saving}>
              {saving ? "Saving…" : "Create trip"}
            </Button>
          </div>
        </form>
      )}

      {trips.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-10 border border-dashed border-border rounded-lg">
          No trips yet. Create one to start logging gold bars.
        </div>
      )}

      <div className="space-y-3">
        {trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            clients={clients}
            pieces={pieces[trip.id] ?? []}
            open={openTrip === trip.id}
            onToggle={() => setOpenTrip(openTrip === trip.id ? null : trip.id)}
            onDelete={() => deleteTrip(trip.id)}
            onChange={async () => {
              await reloadTrips();
              await reloadPieces(trip.id);
            }}
          />
        ))}
      </div>
    </section>
  );
}

function TripCard({
  trip,
  clients,
  pieces,
  open,
  onToggle,
  onDelete,
  onChange,
}: {
  trip: Trip;
  clients: Client[];
  pieces: Piece[];
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onChange: () => Promise<void>;
}) {
  const totalBarWeight = pieces.reduce(
    (s, p) => s + Number(p.weight_grams),
    0,
  );
  const totalPure = pieces.reduce(
    (s, p) => s + pureGrams(Number(p.weight_grams), p.bafleh_purity),
    0,
  );
  const totalLoss = pieces.reduce(
    (s, p) =>
      s + lossGrams(Number(p.weight_grams), trip.declared_purity, p.bafleh_purity),
    0,
  );
  const allPriced = pieces.length > 0 && pieces.every((p) => p.bafleh_purity != null);
  const allChecked = pieces.length > 0 && pieces.every((p) => p.checked);
  const status: "settled" | "ready" | "pending" = trip.is_settled
    ? "settled"
    : allPriced && allChecked
      ? "ready"
      : "pending";

  async function toggleSettled(next: boolean) {
    await supabase.from("purity_trips").update({ is_settled: next }).eq("id", trip.id);
    await onChange();
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate font-mono">
              {tripDisplayName(trip)}
            </span>
            {status === "settled" ? (
              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600">
                <CheckCircle2 className="h-3 w-3 mr-0.5" /> Settled
              </span>
            ) : status === "ready" ? (
              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600">
                <CheckCircle2 className="h-3 w-3 mr-0.5" /> Ready to settle
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">
                <AlertCircle className="h-3 w-3 mr-0.5" />
                {allPriced ? "Awaiting check" : "Awaiting Bafleh"}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            Dep {trip.departure_date}
            {trip.arrival_date ? ` · Arr ${trip.arrival_date}` : ""}
            {trip.receiver_company ? ` · → ${trip.receiver_company}` : ""}
            {trip.scrap_weight != null && (
              <> · Scrap {Number(trip.scrap_weight).toFixed(2)} g</>
            )}{" "}
            · {pieces.length} bars
            {allPriced && (
              <>
                {" "}
                · Pure {totalPure.toFixed(2)} g · Loss {totalLoss.toFixed(2)} g
              </>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          <TripHeaderEditor trip={trip} onChange={onChange} />
          <BarsManager
            trip={trip}
            clients={clients}
            pieces={pieces}
            onChange={onChange}
          />
          {pieces.some((p) => p.bafleh_purity != null) && (
            <TripTotals
              trip={trip}
              totalBarWeight={totalBarWeight}
              totalPure={totalPure}
              totalLoss={totalLoss}
            />
          )}
          {pieces.some((p) => p.bafleh_purity != null) && (
            <ClientBreakdown trip={trip} clients={clients} pieces={pieces} />
          )}
          <div className="rounded-md border border-border bg-muted/30 p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {pieces.filter((p) => p.checked).length}/{pieces.length} bars checked
              {!allPriced && " · waiting Bafleh purity on some bars"}
            </div>
            {trip.is_settled ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleSettled(false)}
              >
                Reopen trip
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!(allPriced && allChecked)}
                onClick={() => toggleSettled(true)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as settled
              </Button>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete trip
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


function TripHeaderEditor({
  trip,
  onChange,
}: {
  trip: Trip;
  onChange: () => Promise<void>;
}) {
  const [arrival, setArrival] = useState(trip.arrival_date ?? "");
  const [receiver, setReceiver] = useState(trip.receiver_company ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase
      .from("purity_trips")
      .update({
        arrival_date: arrival || null,
        receiver_company: receiver || null,
      })
      .eq("id", trip.id);
    setSaving(false);
    await onChange();
  }

  return (
    <form
      onSubmit={save}
      className="rounded-md bg-muted/40 p-3 flex flex-col sm:flex-row sm:items-end gap-3"
    >
      <div className="flex-1 min-w-0">
        <Label className="text-xs block mb-1">Arrival date (Dubai / Bafleh report)</Label>
        <Input
          type="date"
          value={arrival}
          onChange={(e) => setArrival(e.target.value)}
          className="w-full"
        />
      </div>
      <div className="flex-1 min-w-0">
        <Label className="text-xs block mb-1">Receiver company (Dubai)</Label>
        <Input
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
          placeholder="e.g. Bafleh / Kaloti"
          className="w-full"
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function TripTotals({
  trip,
  totalBarWeight,
  totalPure,
  totalLoss,
}: {
  trip: Trip;
  totalBarWeight: number;
  totalPure: number;
  totalLoss: number;
}) {
  const declaredPure =
    trip.scrap_weight != null
      ? (Number(trip.scrap_weight) * Number(trip.declared_purity)) / 1000
      : null;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 grid grid-cols-2 gap-2 text-sm">
      <Stat label="Bars total weight" value={`${totalBarWeight.toFixed(3)} g`} />
      <Stat label="Pure gold (Bafleh)" value={`${totalPure.toFixed(3)} g`} />
      {declaredPure != null && (
        <Stat
          label={`Declared pure (scrap × ${trip.declared_purity}‰)`}
          value={`${declaredPure.toFixed(3)} g`}
        />
      )}
      <Stat
        label="Total loss"
        value={`${totalLoss.toFixed(3)} g`}
        highlight
      />
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`font-mono ${highlight ? "text-primary font-semibold" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function BarsManager({
  trip,
  clients,
  pieces,
  onChange,
}: {
  trip: Trip;
  clients: Client[];
  pieces: Piece[];
  onChange: () => Promise<void>;
}) {
  const [weight, setWeight] = useState("");
  const [initialPurity, setInitialPurity] = useState("999");
  const [baflehPurity, setBaflehPurity] = useState("");
  const [label, setLabel] = useState("");
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);

  async function addBar(e: FormEvent) {
    e.preventDefault();
    if (!weight) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("purity_pieces").insert({
      user_id: u.user.id,
      trip_id: trip.id,
      weight_grams: Number(weight),
      initial_purity: initialPurity === "" ? 999 : Number(initialPurity),
      bafleh_purity: baflehPurity === "" ? null : Number(baflehPurity),
      label: label || null,
      client_id: clientId || null,
    });
    // After adding a bar, recompute trip scrap = sum of all bar weights.
    if (!error) {
      const newScrap =
        pieces.reduce((s, p) => s + Number(p.weight_grams), 0) + Number(weight);
      await supabase
        .from("purity_trips")
        .update({ scrap_weight: newScrap })
        .eq("id", trip.id);
    }
    setSaving(false);
    if (!error) {
      setWeight("");
      setBaflehPurity("");
      setLabel("");
      await onChange();
    }
  }

  async function updateBaflehPurity(id: string, value: string) {
    await supabase
      .from("purity_pieces")
      .update({ bafleh_purity: value === "" ? null : Number(value) })
      .eq("id", id);
    await onChange();
  }

  async function updateInitialPurity(id: string, value: string) {
    await supabase
      .from("purity_pieces")
      .update({ initial_purity: value === "" ? null : Number(value) })
      .eq("id", id);
    await onChange();
  }

  async function toggleChecked(id: string, next: boolean) {
    await supabase.from("purity_pieces").update({ checked: next }).eq("id", id);
    await onChange();
  }



  async function deleteBar(id: string, weightG: number) {
    await supabase.from("purity_pieces").delete().eq("id", id);
    const newScrap =
      pieces.reduce((s, p) => s + Number(p.weight_grams), 0) - Number(weightG);
    await supabase
      .from("purity_trips")
      .update({ scrap_weight: newScrap < 0 ? 0 : newScrap })
      .eq("id", trip.id);
    await onChange();
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Bars
      </div>

      <form onSubmit={addBar} className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-3">
          <Label className="text-xs">Weight (g)</Label>
          <Input
            type="number"
            step="0.001"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            required
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Initial ‰</Label>
          <Input
            type="number"
            step="0.01"
            value={initialPurity}
            onChange={(e) => setInitialPurity(e.target.value)}
            placeholder="999"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Bafleh ‰</Label>
          <Input
            type="number"
            step="0.01"
            value={baflehPurity}
            onChange={(e) => setBaflehPurity(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="col-span-1">
          <Label className="text-xs">#</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="#"
          />
        </div>
        <div className="col-span-3">
          <Label className="text-xs">Supplier</Label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-1">
          <Button size="sm" className="w-full" disabled={saving}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {pieces.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-3">
          No bars yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-1.5 pr-2">#</th>
                <th className="text-right py-1.5 pr-2">Weight</th>
                <th className="text-right py-1.5 pr-2">Init ‰</th>
                <th className="text-right py-1.5 pr-2">Bafleh ‰</th>
                <th className="text-right py-1.5 pr-2">Pure</th>
                <th className="text-left py-1.5 pr-2">Supplier</th>
                <th className="text-right py-1.5 pr-2">Loss</th>
                <th className="text-center py-1.5 pr-2">✓</th>
                <th></th>
              </tr>


            </thead>
            <tbody>
              {pieces.map((p, i) => {
                const client = clients.find((c) => c.id === p.client_id);
                const pure = pureGrams(Number(p.weight_grams), p.bafleh_purity);
                const loss = lossGrams(
                  Number(p.weight_grams),
                  trip.declared_purity,
                  p.bafleh_purity,
                );
                const hasBafleh = p.bafleh_purity != null;
                const lossColor = hasBafleh
                  ? loss === 0
                    ? "text-emerald-600"
                    : "text-red-600"
                  : "";
                return (
                  <tr key={p.id} className={`border-b border-border/50 ${p.checked ? "bg-emerald-500/5" : ""}`}>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {p.label || i + 1}
                    </td>


                    <td className="py-1.5 pr-2 text-right font-mono">
                      {Number(p.weight_grams).toFixed(3)}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={p.initial_purity ?? 999}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (p.initial_purity?.toString() ?? "999")) {
                            updateInitialPurity(p.id, v);
                          }
                        }}
                        className="w-20 h-7 text-right font-mono bg-transparent border border-input rounded px-1.5"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={p.bafleh_purity ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (p.bafleh_purity?.toString() ?? "")) {
                            updateBaflehPurity(p.id, v);
                          }
                        }}
                        placeholder="—"
                        className="w-20 h-7 text-right font-mono bg-transparent border border-input rounded px-1.5"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {hasBafleh ? pure.toFixed(3) : "—"}
                    </td>
                    <td className="py-1.5 pr-2 truncate max-w-[120px]">
                      {client?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`py-1.5 pr-2 text-right font-mono font-semibold ${lossColor}`}>
                      {hasBafleh ? loss.toFixed(3) : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <input
                        type="checkbox"
                        checked={p.checked}
                        onChange={(e) => toggleChecked(p.id, e.target.checked)}
                        className="h-4 w-4 accent-emerald-600 cursor-pointer"
                        aria-label="Bar checked"
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => deleteBar(p.id, Number(p.weight_grams))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientBreakdown({
  trip,
  clients,
  pieces,
}: {
  trip: Trip;
  clients: Client[];
  pieces: Piece[];
}) {
  const rows = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        bars: Piece[];
        totalWeight: number;
        totalPure: number;
        totalLoss: number;
      }
    >();
    for (const p of pieces) {
      if (p.bafleh_purity == null) continue;
      const key = p.client_id ?? "_none";
      const name =
        clients.find((c) => c.id === p.client_id)?.name ?? "Unassigned";
      const row = map.get(key) ?? {
        name,
        bars: [],
        totalWeight: 0,
        totalPure: 0,
        totalLoss: 0,
      };
      row.bars.push(p);
      row.totalWeight += Number(p.weight_grams);
      row.totalPure += pureGrams(Number(p.weight_grams), p.bafleh_purity);
      row.totalLoss += lossGrams(
        Number(p.weight_grams),
        trip.declared_purity,
        p.bafleh_purity,
      );
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.totalLoss - a.totalLoss);
  }, [pieces, clients, trip]);

  if (rows.length === 0) return null;

  async function shareClientImage(r: {
    name: string;
    bars: Piece[];
    totalWeight: number;
    totalPure: number;
    totalLoss: number;
  }) {
    const tripName = tripDisplayName(trip);
    const W = 1080;
    const rowH = 64;
    const headerH = 320;
    const footerH = 180;
    const tableHeadH = 56;
    const H = headerH + tableHeadH + rowH * r.bars.length + footerH;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b0f1a");
    bg.addColorStop(1, "#141a2b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const gold = ctx.createLinearGradient(0, 0, W, 0);
    gold.addColorStop(0, "#d4af37");
    gold.addColorStop(1, "#f6e27a");
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, W, 8);

    ctx.fillStyle = "#f6e27a";
    ctx.font = "700 30px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("GOLD PURITY REPORT", 48, 70);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 56px system-ui, sans-serif";
    ctx.fillText(r.name, 48, 138);

    ctx.fillStyle = "#9aa3b2";
    ctx.font = "400 24px system-ui, sans-serif";
    ctx.fillText(
      `${tripName}  ·  Dep ${trip.departure_date}${trip.arrival_date ? "  ·  Arr " + trip.arrival_date : ""}${trip.receiver_company ? "  →  " + trip.receiver_company : ""}`,
      48,
      178,
    );

    const cardY = 210;
    const cardH = 90;
    const cardW = (W - 48 * 2 - 24 * 2) / 3;
    const cards: { label: string; value: string; color: string }[] = [
      { label: "BARS", value: String(r.bars.length), color: "#ffffff" },
      { label: "WEIGHT (g)", value: r.totalWeight.toFixed(3), color: "#ffffff" },
      {
        label: "TOTAL LOSS (g)",
        value: r.totalLoss.toFixed(3),
        color: r.totalLoss === 0 ? "#34d399" : "#f87171",
      },
    ];
    cards.forEach((c, i) => {
      const x = 48 + i * (cardW + 24);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      roundRect(ctx, x, cardY, cardW, cardH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(212,175,55,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#9aa3b2";
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.fillText(c.label, x + 18, cardY + 30);
      ctx.fillStyle = c.color;
      ctx.font = "700 32px system-ui, sans-serif";
      ctx.fillText(c.value, x + 18, cardY + 70);
    });

    let y = headerH;
    ctx.fillStyle = "rgba(212,175,55,0.1)";
    ctx.fillRect(48, y, W - 96, tableHeadH);
    ctx.fillStyle = "#d4af37";
    ctx.font = "700 20px system-ui, sans-serif";
    const cols = [
      { label: "#", x: 70, align: "left" as const },
      { label: "WEIGHT (g)", x: 260, align: "right" as const },
      { label: "BAFLEH ‰", x: 520, align: "right" as const },
      { label: "PURE (g)", x: 760, align: "right" as const },
      { label: "LOSS (g)", x: W - 70, align: "right" as const },
    ];
    cols.forEach((c) => {
      ctx.textAlign = c.align;
      ctx.fillText(c.label, c.x, y + 36);
    });
    ctx.textAlign = "left";

    y += tableHeadH;
    r.bars.forEach((b, i) => {
      const w = Number(b.weight_grams);
      const pure = pureGrams(w, b.bafleh_purity);
      const loss = lossGrams(w, trip.declared_purity, b.bafleh_purity);

      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.fillRect(48, y, W - 96, rowH);
      }

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 22px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(String(b.label || i + 1), 70, y + 40);

      ctx.fillStyle = "#ffffff";
      ctx.font = "600 22px ui-monospace, Menlo, Consolas, monospace";
      ctx.textAlign = "right";
      ctx.fillText(w.toFixed(3), 260, y + 40);
      ctx.fillText(String(b.bafleh_purity ?? "—"), 520, y + 40);
      ctx.fillText(pure.toFixed(3), 760, y + 40);

      ctx.fillStyle = loss === 0 ? "#34d399" : "#f87171";
      ctx.font = "700 22px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(loss.toFixed(3), W - 70, y + 40);

      y += rowH;
    });

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(212,175,55,0.15)";
    roundRect(ctx, 48, y + 20, W - 96, 110, 16);
    ctx.fill();
    ctx.fillStyle = "#9aa3b2";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText("AMOUNT TO COMPENSATE", 70, y + 55);
    ctx.fillStyle = r.totalLoss === 0 ? "#34d399" : "#f6e27a";
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.fillText(`${r.totalLoss.toFixed(3)} g of pure gold`, 70, y + 105);

    ctx.fillStyle = "#5b6478";
    ctx.font = "400 16px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Purity report", W - 48, H - 24);
    ctx.textAlign = "left";

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return;
    const fileName = `${tripName}_${r.name.replace(/\s+/g, "_")}.png`;
    const file = new File([blob], fileName, { type: "image/png" });

    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    };
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      try {
        await nav.share({
          files: [file],
          title: `${r.name} — loss report`,
          text: `${r.name}: ${r.totalLoss.toFixed(3)} g loss (${tripName})`,
        });
        return;
      } catch {
        /* fall through */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Loss per supplier
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.name}
            className="rounded-md border border-border bg-muted/30 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium truncate">{r.name}</div>
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={`text-sm font-mono font-semibold ${
                    r.totalLoss === 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {r.totalLoss.toFixed(3)} g loss
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => shareClientImage(r)}
                  title="Share image report (WhatsApp)"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {r.bars.length} bars · {r.totalWeight.toFixed(3)} g ·{" "}
              {r.totalPure.toFixed(3)} g pure
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Bars:{" "}
              {r.bars
                .map(
                  (b) =>
                    `${Number(b.weight_grams).toFixed(3)}g @ ${b.bafleh_purity}‰`,
                )
                .join(", ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* -------------------- CLIENTS -------------------- */

function ClientsTab({
  clients,
  reload,
}: {
  clients: Client[];
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function addClient(e: FormEvent) {
    e.preventDefault();
    if (!name) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("purity_clients").insert({
      user_id: u.user.id,
      name,
      phone: phone || null,
      notes: notes || null,
    });
    setSaving(false);
    if (!error) {
      setName("");
      setPhone("");
      setNotes("");
      await reload();
    }
  }

  async function deleteClient(id: string) {
    if (!confirm("Delete this supplier? Their bars will become unassigned."))
      return;
    await supabase.from("purity_clients").delete().eq("id", id);
    await reload();
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Suppliers</h2>

      <form
        onSubmit={addClient}
        className="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={saving}>
            <Plus className="h-4 w-4 mr-1" /> Add supplier
          </Button>
        </div>
      </form>

      {clients.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-10 border border-dashed border-border rounded-lg">
          No suppliers yet.
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <div
              key={c.id}
              className="rounded-md border border-border bg-card p-3 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{c.name}</div>
                {(c.phone || c.notes) && (
                  <div className="text-xs text-muted-foreground">
                    {[c.phone, c.notes].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button
                onClick={() => deleteClient(c.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------- SEARCH -------------------- */

function SearchTab({
  clients,
  trips,
}: {
  clients: Client[];
  trips: Trip[];
}) {
  const [weight, setWeight] = useState("");
  const [tolerance, setTolerance] = useState("0.05");
  const [results, setResults] = useState<Piece[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!weight) return;
    setSearching(true);
    const w = Number(weight);
    const t = Number(tolerance) || 0;
    const { data } = await supabase
      .from("purity_pieces")
      .select("*")
      .gte("weight_grams", w - t)
      .lte("weight_grams", w + t)
      .order("created_at", { ascending: false });
    setResults((data ?? []) as unknown as Piece[]);
    setSearching(false);
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Search bar by weight</h2>
      <form
        onSubmit={search}
        className="rounded-lg border border-border bg-card p-4 grid grid-cols-12 gap-2 items-end"
      >
        <div className="col-span-6">
          <Label>Weight (g)</Label>
          <Input
            type="number"
            step="0.001"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            required
          />
        </div>
        <div className="col-span-3">
          <Label>± Tolerance</Label>
          <Input
            type="number"
            step="0.001"
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
          />
        </div>
        <div className="col-span-3">
          <Button className="w-full" disabled={searching}>
            <Search className="h-4 w-4 mr-1" />
            {searching ? "…" : "Find"}
          </Button>
        </div>
      </form>

      {results && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No bars match that weight.
            </div>
          ) : (
            results.map((p) => {
              const trip = trips.find((t) => t.id === p.trip_id);
              const client = clients.find((c) => c.id === p.client_id);
              return (
                <div
                  key={p.id}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium font-mono">
                        {Number(p.weight_grams).toFixed(3)} g
                        {p.bafleh_purity != null && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            @ {p.bafleh_purity}‰
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {trip ? tripDisplayName(trip) : "—"}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium text-primary">
                        {client?.name ?? "Unassigned"}
                      </div>
                      {client?.phone && (
                        <div className="text-xs text-muted-foreground">
                          {client.phone}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

/* -------------------- USERS -------------------- */

type PurityUser = {
  id: string;
  username: string;
  email: string | null;
  created_at: string;
};

function UsersTab() {
  const [users, setUsers] = useState<PurityUser[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() {
    try {
      const data = await listPurityUsers();
      setUsers(data as PurityUser[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }
    setBusy(true);
    try {
      await createPurityUser({
        data: {
          username: username.trim(),
          email: email.trim() || undefined,
          password,
        },
      });
      setOk(`User "${username.trim()}" created.`);
      setUsername("");
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Add user
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Only the username and password are required. Email is optional.
        </p>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-username">Username *</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ahmad"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-email">Email (optional)</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="optional"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Password *</Label>
            <Input
              id="new-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 6 characters"
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {ok && <p className="text-sm text-emerald-600">{ok}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </Button>
        </form>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-semibold mb-3">Existing users</h2>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{u.username}</div>
                  {u.email && (
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
