import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LogOut, Plus, Scale, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/purity/dashboard")({
  head: () => ({
    meta: [
      { title: "Purity — Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PurityDashboard,
});

type Trip = {
  id: string;
  name: string | null;
  delivery_date: string;
  notes: string | null;
  created_at: string;
};

type Piece = {
  id: string;
  trip_id: string;
  label: string | null;
  weight_grams: number;
  purity: number | null;
  created_at: string;
};

function PurityDashboard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [pieces, setPieces] = useState<Record<string, Piece[]>>({});
  const [openTrip, setOpenTrip] = useState<string | null>(null);
  const [showNewTrip, setShowNewTrip] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        navigate({ to: "/purity", replace: true });
        return;
      }
      setEmail(data.session.user.email ?? "");
      await loadTrips();
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/purity", replace: true });
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [navigate]);

  async function loadTrips() {
    const { data, error } = await supabase
      .from("purity_trips")
      .select("*")
      .order("delivery_date", { ascending: false });
    if (!error && data) setTrips(data as Trip[]);
  }

  async function loadPieces(tripId: string) {
    const { data, error } = await supabase
      .from("purity_pieces")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });
    if (!error && data) setPieces((prev) => ({ ...prev, [tripId]: data as Piece[] }));
  }

  async function toggleTrip(id: string) {
    if (openTrip === id) { setOpenTrip(null); return; }
    setOpenTrip(id);
    if (!pieces[id]) await loadPieces(id);
  }

  async function deleteTrip(id: string) {
    if (!confirm("Delete this trip and all its pieces?")) return;
    await supabase.from("purity_trips").delete().eq("id", id);
    setTrips((t) => t.filter((x) => x.id !== id));
  }

  async function deletePiece(tripId: string, pieceId: string) {
    await supabase.from("purity_pieces").delete().eq("id", pieceId);
    setPieces((p) => ({ ...p, [tripId]: (p[tripId] || []).filter((x) => x.id !== pieceId) }));
  }

  if (!ready) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-ember/15 border border-ember/40 flex items-center justify-center">
              <Scale className="h-4 w-4 text-ember" />
            </div>
            <div>
              <p className="font-display text-lg leading-none">Purity</p>
              <p className="text-[11px] text-muted-foreground mt-1">{email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/purity", replace: true }); }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl">Trips</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {trips.length} {trips.length === 1 ? "trip" : "trips"} logged
            </p>
          </div>
          <Button
            onClick={() => setShowNewTrip((s) => !s)}
            className="bg-ember text-ember-foreground hover:bg-ember/90"
          >
            <Plus className="h-4 w-4 mr-2" /> New trip
          </Button>
        </div>

        {showNewTrip && (
          <NewTripForm
            onCreated={async (trip) => {
              setTrips((t) => [trip, ...t]);
              setShowNewTrip(false);
              setOpenTrip(trip.id);
              setPieces((p) => ({ ...p, [trip.id]: [] }));
            }}
            onCancel={() => setShowNewTrip(false)}
          />
        )}

        {trips.length === 0 && !showNewTrip && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">No trips yet. Create your first to start logging pieces.</p>
          </div>
        )}

        <div className="space-y-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              open={openTrip === trip.id}
              pieces={pieces[trip.id]}
              onToggle={() => toggleTrip(trip.id)}
              onDelete={() => deleteTrip(trip.id)}
              onPieceAdded={(p) =>
                setPieces((prev) => ({ ...prev, [trip.id]: [...(prev[trip.id] || []), p] }))
              }
              onPieceDeleted={(pid) => deletePiece(trip.id, pid)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function NewTripForm({ onCreated, onCancel }: { onCreated: (t: Trip) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setError("Not signed in"); setSubmitting(false); return; }
    const { data, error } = await supabase
      .from("purity_trips")
      .insert({ user_id: uid, name: name || null, delivery_date: deliveryDate, notes: notes || null })
      .select()
      .single();
    setSubmitting(false);
    if (error) { setError(error.message); return; }
    onCreated(data as Trip);
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-6 mb-4 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="trip-name">Name (optional)</Label>
          <Input id="trip-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dubai run #4" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trip-date">Delivery date</Label>
          <Input id="trip-date" type="date" required value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="trip-notes">Notes (optional)</Label>
        <Input id="trip-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Supplier, courier, reference…" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting} className="bg-ember text-ember-foreground hover:bg-ember/90">
          {submitting ? "Saving…" : "Save trip"}
        </Button>
      </div>
    </form>
  );
}

function TripCard({
  trip, open, pieces, onToggle, onDelete, onPieceAdded, onPieceDeleted,
}: {
  trip: Trip;
  open: boolean;
  pieces: Piece[] | undefined;
  onToggle: () => void;
  onDelete: () => void;
  onPieceAdded: (p: Piece) => void;
  onPieceDeleted: (pid: string) => void;
}) {
  const totalWeight = useMemo(
    () => (pieces || []).reduce((s, p) => s + Number(p.weight_grams), 0),
    [pieces]
  );
  const avgPurity = useMemo(() => {
    const list = (pieces || []).filter((p) => p.purity != null);
    if (list.length === 0) return null;
    const weightedSum = list.reduce((s, p) => s + Number(p.purity) * Number(p.weight_grams), 0);
    const weightTotal = list.reduce((s, p) => s + Number(p.weight_grams), 0);
    return weightTotal > 0 ? weightedSum / weightTotal : null;
  }, [pieces]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface/40 transition text-left">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <div>
            <p className="font-medium">{trip.name || "Untitled trip"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Delivery {new Date(trip.delivery_date).toLocaleDateString()} ·{" "}
              {(pieces || []).length} {(pieces || []).length === 1 ? "piece" : "pieces"}
              {pieces && pieces.length > 0 && ` · ${totalWeight.toFixed(3)} g`}
              {avgPurity != null && ` · avg ${avgPurity.toFixed(2)}‰`}
            </p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-muted-foreground hover:text-destructive p-1"
          aria-label="Delete trip"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </button>

      {open && (
        <div className="border-t border-border px-5 py-5 space-y-4">
          {trip.notes && <p className="text-sm text-muted-foreground italic">{trip.notes}</p>}

          {pieces && pieces.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface/50 text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Piece</th>
                    <th className="text-right px-3 py-2 font-medium">Weight (g)</th>
                    <th className="text-right px-3 py-2 font-medium">Purity (‰)</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {pieces.map((p, i) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2">{p.label || `#${i + 1}`}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(p.weight_grams).toFixed(3)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.purity != null ? Number(p.purity).toFixed(2) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => onPieceDeleted(p.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete piece">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <AddPieceForm tripId={trip.id} onAdded={onPieceAdded} />
        </div>
      )}
    </div>
  );
}

function AddPieceForm({ tripId, onAdded }: { tripId: string; onAdded: (p: Piece) => void }) {
  const [label, setLabel] = useState("");
  const [weight, setWeight] = useState("");
  const [purity, setPurity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const w = parseFloat(weight);
    if (!w || w <= 0) { setError("Weight must be greater than 0"); return; }
    const p = purity ? parseFloat(purity) : null;
    if (p != null && (isNaN(p) || p <= 0 || p > 1000)) { setError("Purity must be between 0 and 1000 ‰"); return; }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setError("Not signed in"); setSubmitting(false); return; }
    const { data, error } = await supabase
      .from("purity_pieces")
      .insert({ trip_id: tripId, user_id: uid, label: label || null, weight_grams: w, purity: p })
      .select()
      .single();
    setSubmitting(false);
    if (error) { setError(error.message); return; }
    onAdded(data as Piece);
    setLabel(""); setWeight(""); setPurity("");
  }

  return (
    <form onSubmit={submit} className="grid sm:grid-cols-[1fr_120px_120px_auto] gap-2 items-end">
      <div className="space-y-1">
        <Label htmlFor={`label-${tripId}`} className="text-xs">Piece label</Label>
        <Input id={`label-${tripId}`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bar #1" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`weight-${tripId}`} className="text-xs">Weight (g)</Label>
        <Input id={`weight-${tripId}`} type="number" step="0.001" min="0" required value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="100.000" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`purity-${tripId}`} className="text-xs">Purity (‰)</Label>
        <Input id={`purity-${tripId}`} type="number" step="0.01" min="0" max="1000" value={purity} onChange={(e) => setPurity(e.target.value)} placeholder="999.90" />
      </div>
      <Button type="submit" disabled={submitting} className="bg-ember text-ember-foreground hover:bg-ember/90">
        {submitting ? "…" : "Add piece"}
      </Button>
      {error && <p className="text-sm text-destructive sm:col-span-4">{error}</p>}
    </form>
  );
}
