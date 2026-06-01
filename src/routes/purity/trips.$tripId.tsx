import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  LogOut,
  Scale,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/purity-activity";
import {
  BarsManager,
  ClientBreakdown,
  PurityFooter,
  TripHeaderEditor,
  TripTotals,
  lossGrams,
  pureGrams,
  tripDisplayName,
  type Client,
  type Piece,
  type Trip,
} from "./dashboard";

export const Route = createFileRoute("/purity/trips/$tripId")({
  head: () => ({
    meta: [
      { title: "Purity — Trip" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TripDetailPage,
});

function TripDetailPage() {
  const { tripId } = Route.useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);

  async function loadAll() {
    const [{ data: t }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("purity_trips").select("*").eq("id", tripId).maybeSingle(),
      supabase.from("purity_clients").select("*").order("name", { ascending: true }),
      supabase
        .from("purity_pieces")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    ]);
    setTrip((t as Trip | null) ?? null);
    setClients((c ?? []) as Client[]);
    setPieces((p ?? []) as unknown as Piece[]);
  }

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        navigate({ to: "/purity", replace: true });
        return;
      }
      setEmail(data.session.user.email ?? "");
      await loadAll();
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/purity", replace: true });
  }

  async function reload() {
    await loadAll();
  }

  async function toggleSettled(next: boolean) {
    if (!trip) return;
    await supabase.from("purity_trips").update({ is_settled: next }).eq("id", trip.id);
    await logActivity(next ? "settle" : "reopen", "trip", {
      trip: tripDisplayName(trip),
    }, trip.id);
    await reload();
  }

  async function deleteTrip() {
    if (!trip) return;
    if (!confirm("Delete this trip and all its bars?")) return;
    await supabase.from("purity_pieces").delete().eq("trip_id", trip.id);
    await supabase.from("purity_trips").delete().eq("id", trip.id);
    await logActivity("delete", "trip", {
      departure_date: trip.departure_date,
      name: tripDisplayName(trip),
    }, trip.id);
    navigate({ to: "/purity/dashboard", replace: true });
  }

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex flex-col bg-popover text-popover-foreground">
        <PurityDetailHeader email={email} onSignOut={handleSignOut} />
        <div className="flex-1 mx-auto max-w-3xl px-4 py-10 text-center text-sm text-muted-foreground">
          Trip not found.{" "}
          <Link to="/purity/dashboard" className="text-primary underline">
            Back to dashboard
          </Link>
        </div>
        <PurityFooter />
      </div>
    );
  }

  const totalBarWeight = pieces.reduce((s, p) => s + Number(p.weight_grams), 0);
  const fmtForPiece = (p: typeof pieces[number]) =>
    (clients.find((c) => c.id === p.client_id)?.purity_format as "3" | "4" | undefined) ?? "3";
  const totalPure = pieces.reduce(
    (s, p) => s + pureGrams(Number(p.weight_grams), p.bafleh_purity, fmtForPiece(p)),
    0,
  );
  const totalLoss = pieces.reduce(
    (s, p) =>
      s + lossGrams(Number(p.weight_grams), trip.declared_purity, p.bafleh_purity, fmtForPiece(p)),
    0,
  );
  const allPriced = pieces.length > 0 && pieces.every((p) => p.bafleh_purity != null);
  const allChecked = pieces.length > 0 && pieces.every((p) => p.checked);

  return (
    <div className="min-h-screen flex flex-col bg-popover text-popover-foreground">
      <PurityDetailHeader email={email} onSignOut={handleSignOut} />

      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/purity/dashboard"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> All trips
          </Link>
          <div className="font-mono font-semibold text-sm">
            {tripDisplayName(trip)}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <TripHeaderEditor trip={trip} onChange={reload} />
          <BarsManager trip={trip} clients={clients} pieces={pieces} onChange={reload} />
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
              <Button size="sm" variant="ghost" onClick={() => toggleSettled(false)}>
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
              onClick={deleteTrip}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete trip
            </Button>
          </div>
        </div>
      </main>

      <PurityFooter />
    </div>
  );
}

function PurityDetailHeader({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
        <Link to="/purity/dashboard" className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold leading-none">Purity</div>
            <div className="text-[11px] text-muted-foreground">{email}</div>
          </div>
        </Link>
        <Button variant="ghost" size="sm" onClick={onSignOut}>
          <LogOut className="h-4 w-4 mr-1" /> Sign out
        </Button>
      </div>
    </header>
  );
}
