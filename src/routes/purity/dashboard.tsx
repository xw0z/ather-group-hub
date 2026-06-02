import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
  Pencil,
  Check,
  X,
  FileClock,
  UserCircle,
  KeyRound,
  Link2,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import atherLogoAsset from "@/assets/ather-logo.asset.json";
import {
  createPurityUser,
  deletePurityUser,
  getCurrentPurityUser,
  listPurityUsers,
  updatePurityProfile,
} from "@/lib/purity-users.functions";
import { logActivity, loadActivity, type ActivityRow } from "@/lib/purity-activity";
import { useLang, type Lang } from "@/lib/purity-i18n";

export const Route = createFileRoute("/purity/dashboard")({
  head: () => ({
    meta: [
      { title: "Purity — Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PurityDashboard,
});

export type PurityFormat = "3" | "4";

export type Client = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  purity_format: PurityFormat;
};

export type Trip = {
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

export type Piece = {
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

// Divisor to convert a stored purity number to a 0..1 fraction.
// Both formats divide by 1000 — the "4-digit" format just allows one decimal.
// 3-digit (e.g. 999)   -> 999 / 1000   = 0.999
// 4-digit (e.g. 999.9) -> 999.9 / 1000 = 0.9999
export function purityDivisor(_format: PurityFormat | null | undefined) {
  return 1000;
}

export function formatPurityLabel(format: PurityFormat | null | undefined) {
  return format === "4" ? "4-digit (999.9)" : "3-digit (999)";
}

// Format a purity number for display in supplier's format
export function formatPurityValue(
  value: number | null,
  format: PurityFormat | null | undefined,
) {
  if (value == null) return "—";
  return format === "4"
    ? Number(value).toFixed(1)
    : String(Math.round(Number(value)));
}

// Pure gold (g) using bafleh purity, normalized by supplier format
export function pureGrams(
  weight: number,
  purity: number | null,
  format: PurityFormat | null | undefined = "3",
) {
  if (purity == null) return 0;
  return Number(weight) * (Number(purity) / purityDivisor(format));
}
// Loss per bar (g) using normalized fractions for declared & bafleh
export function lossGrams(
  weight: number,
  declared: number,
  baflehPurity: number | null,
  baflehFormat: PurityFormat | null | undefined = "3",
  declaredFormat: PurityFormat = "3",
) {
  if (baflehPurity == null) return 0;
  const declaredFrac = Number(declared) / purityDivisor(declaredFormat);
  const baflehFrac = Number(baflehPurity) / purityDivisor(baflehFormat);
  return Number(weight) * (declaredFrac - baflehFrac);
}

export function tripDisplayName(trip: Trip) {
  // Always render as TRIP_YYYY-MM-DD based on departure date (ignore legacy stored names).
  return `TRIP_${trip.departure_date}`;
}


export function roundRect(
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

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

// Lazily inject luxury Google Fonts used by the canvas report and wait until
// they are ready so the first render isn't a fallback font.
let _reportFontsLoaded: Promise<void> | null = null;
export function ensureReportFonts(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (_reportFontsLoaded) return _reportFontsLoaded;
  _reportFontsLoaded = (async () => {
    const id = "ather-report-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2" +
        "?family=Cinzel:wght@600;700;800" +
        "&family=Cormorant+Garamond:wght@500;600;700&family=DM+Serif+Display" +
        "&family=Great+Vibes" +
        "&family=Inter:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(link);
    }
    const fontsToLoad = [
      "700 64px 'Cinzel'",
      "400 220px 'DM Serif Display'",
      "700 110px 'Cormorant Garamond'",
      "400 60px 'Great Vibes'",
      "600 24px 'Inter'",
      "700 28px 'Inter'",
    ];
    try {
      const fontSet = (document as Document & { fonts?: { load: (f: string) => Promise<unknown>; ready: Promise<unknown> } }).fonts;
      if (fontSet && typeof fontSet.load === "function") {
        await Promise.all(fontsToLoad.map((f) => fontSet.load(f)));
        await fontSet.ready;
      }
    } catch {
      /* non-fatal – fall back to system fonts */
    }
  })();
  return _reportFontsLoaded;
}




function PurityDashboard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [tab, setTab] = useState<"trips" | "clients" | "search" | "users" | "logs" | "profile">("trips");

  const [clients, setClients] = useState<Client[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [pieces, setPieces] = useState<Record<string, Piece[]>>({});

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        navigate({ to: "/purity", replace: true });
        return;
      }
      setEmail(data.session.user.email ?? "");
      setCurrentUserId(data.session.user.id);
      try {
        const me = await getCurrentPurityUser();
        if (!cancelled) setIsAdmin(me.isAdmin);
      } catch {
        /* ignore */
      }
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
      .order("departure_date", { ascending: false })
      .order("created_at", { ascending: false });
    setTrips((data ?? []) as Trip[]);
  }

  async function loadAllPieces() {
    const { data } = await supabase
      .from("purity_pieces")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
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
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    setPieces((p) => ({ ...p, [tripId]: (data ?? []) as unknown as Piece[] }));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/purity", replace: true });
  }

  const { t, dir } = useLang();

  if (!ready) {
    return (
      <div dir={dir} className="min-h-screen grid place-items-center bg-background text-muted-foreground">
        {t("app.loading")}
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-popover text-popover-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-semibold leading-none">{t("app.name")}</div>
              <div className="text-[11px] text-muted-foreground">{email}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-1" /> {t("app.signOut")}
          </Button>
        </div>
        <nav className="mx-auto max-w-3xl px-2 pb-2 flex gap-1 text-sm">
          <TabBtn active={tab === "trips"} onClick={() => setTab("trips")}>
            <Plane className="h-4 w-4 mr-1.5" /> {t("tab.trips")} ({trips.length})
          </TabBtn>

          <TabBtn active={tab === "clients"} onClick={() => setTab("clients")}>
            <Users className="h-4 w-4 mr-1.5" /> {t("tab.suppliers")}
          </TabBtn>
          <TabBtn active={tab === "search"} onClick={() => setTab("search")}>
            <Search className="h-4 w-4 mr-1.5" /> {t("tab.search")}
          </TabBtn>
          {isAdmin && (
            <TabBtn active={tab === "users"} onClick={() => setTab("users")}>
              <UserPlus className="h-4 w-4 mr-1.5" /> {t("tab.users")}
            </TabBtn>
          )}
          {isAdmin && (
            <TabBtn active={tab === "logs"} onClick={() => setTab("logs")}>
              <FileClock className="h-4 w-4 mr-1.5" /> {t("tab.logs")}
            </TabBtn>
          )}
          <TabBtn active={tab === "profile"} onClick={() => setTab("profile")}>
            <UserCircle className="h-4 w-4 mr-1.5" /> {t("tab.profile")}
          </TabBtn>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 space-y-5">
        {tab === "trips" && (
          <TripsTab
            trips={trips}
            clients={clients}
            pieces={pieces}
            reloadTrips={loadTrips}
          />
        )}
        {tab === "clients" && (
          <ClientsTab clients={clients} reload={loadClients} />
        )}
        {tab === "search" && <SearchTab clients={clients} trips={trips} />}
        
        {tab === "users" && isAdmin && <UsersTab currentUserId={currentUserId} />}
        {tab === "logs" && isAdmin && <LogsTab />}
        {tab === "profile" && <ProfileTab email={email} setEmail={setEmail} /> }
      </main>

      <PurityFooter />
    </div>
  );
}

export function PurityFooter() {
  const { t } = useLang();
  return (
    <footer className="border-t border-border/60 bg-background/80 mt-10">
      <div className="mx-auto max-w-3xl px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Scale className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold tracking-wide">{t("app.name").toUpperCase()}</span>
          <span>· {t("footer.tag")}</span>
        </div>
        <div>© {new Date().getFullYear()} Ather Group</div>
      </div>
    </footer>
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

const TRIPS_PER_PAGE = 10;

function TripsTab({
  trips,
  clients,
  pieces,
  reloadTrips,
}: {
  trips: Trip[];
  clients: Client[];
  pieces: Record<string, Piece[]>;
  reloadTrips: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const { t } = useLang();
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(trips.length / TRIPS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pagedTrips = trips.slice(
    (currentPage - 1) * TRIPS_PER_PAGE,
    currentPage * TRIPS_PER_PAGE,
  );
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
      alert(t("trips.addAtLeastOne"));
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
    await logActivity("create", "trip", {
      departure_date: departure,
      bars: validBars.length,
      scrap_weight: scrapTotal,
      receiver_company: receiverCompany || null,
    }, tripRow.id);
    setSaving(false);
    resetForm();
    setShowNew(false);
    await reloadTrips();
    navigate({ to: "/purity/trips/$tripId", params: { tripId: tripRow.id } });
  }

  async function deleteTrip(id: string) {
    if (!confirm(t("trips.confirmDelete"))) return;
    const trip = trips.find((t) => t.id === id);
    await supabase.from("purity_pieces").delete().eq("trip_id", id);
    await supabase.from("purity_trips").delete().eq("id", id);
    await logActivity("delete", "trip", {
      departure_date: trip?.departure_date ?? null,
      name: trip ? tripDisplayName(trip) : null,
    }, id);
    reloadTrips();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("trips.heading")}</h2>
        <Button size="sm" onClick={() => setShowNew((s) => !s)}>
          <Plus className="h-4 w-4 mr-1" /> {t("trips.new")}
        </Button>
      </div>

      {showNew && (
        <form
          onSubmit={createTrip}
          className="rounded-lg border border-border bg-card p-4 space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("trips.departure")}</Label>
              <Input
                type="date"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                required
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                {t("trips.tripName")} <span className="font-mono">TRIP_{departure}</span>
              </div>
            </div>
            <div>
              <Label>{t("trips.receiver")}</Label>
              <Input
                value={receiverCompany}
                onChange={(e) => setReceiverCompany(e.target.value)}
                placeholder={t("trips.receiverPh")}
              />
            </div>
            <div className="col-span-2">
              <Label>{t("trips.notes")}</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("trips.goldBars")}
              </Label>
              <Button type="button" size="sm" variant="ghost" onClick={addRow}>
                <Plus className="h-4 w-4 mr-1" /> {t("trips.addBar")}
              </Button>
            </div>
            <div className="space-y-2">
              {bars.map((b, i) => {
                const supplierFmt: PurityFormat =
                  (clients.find((c) => c.id === b.clientId)?.purity_format as PurityFormat | undefined) ?? "3";
                const stepAttr = supplierFmt === "4" ? "0.1" : "1";
                const maxAttr = supplierFmt === "4" ? "999.9" : "999";
                const placeholderInit = supplierFmt === "4" ? "999.9" : "999";
                return (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    {i === 0 && <Label className="text-xs">{t("trips.weight")}</Label>}
                    <Input
                      type="number"
                      step="0.001"
                      value={b.weight}
                      onChange={(e) => updateBar(i, { weight: e.target.value })}
                      placeholder="0.000"
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <Label className="text-xs">{t("trips.initial")}</Label>}
                    <Input
                      type="number"
                      step={stepAttr}
                      min="0"
                      max={maxAttr}
                      value={b.initialPurity}
                      onChange={(e) =>
                        updateBar(i, { initialPurity: e.target.value })
                      }
                      placeholder={placeholderInit}
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <Label className="text-xs">{t("trips.bafleh")}</Label>}
                    <Input
                      type="number"
                      step={stepAttr}
                      min="0"
                      max={maxAttr}
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
                    {i === 0 && <Label className="text-xs">{t("trips.supplier")}</Label>}
                    <select
                      value={b.clientId}
                      onChange={(e) => updateBar(i, { clientId: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-popover text-popover-foreground px-2 text-sm"
                    >
                      <option value="" className="bg-popover text-popover-foreground">—</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id} className="bg-popover text-popover-foreground">
                          {c.name} [{c.purity_format === "4" ? "4d" : "3d"}]{c.notes ? ` (${c.notes})` : ""}
                        </option>
                      ))}
                    </select>
                    {b.clientId && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatPurityLabel(supplierFmt)}
                      </div>
                    )}
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
                );
              })}
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("trips.scrapSum")}
              </span>
              <span className="font-mono font-semibold">
                {totalWeight.toFixed(2)} g
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("trips.tipBafleh")}
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
              {t("app.cancel")}
            </Button>
            <Button size="sm" disabled={saving}>
              {saving ? t("app.saving") : t("trips.createBtn")}
            </Button>
          </div>
        </form>
      )}

      {trips.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-10 border border-dashed border-border rounded-lg">
          {t("trips.none")}
        </div>
      )}

      <div className="space-y-3">
        {pagedTrips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            pieces={pieces[trip.id] ?? []}
            clients={clients}
            onDelete={() => deleteTrip(trip.id)}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("app.prev")}
          </Button>
          <div className="text-xs text-muted-foreground">
            {t("app.page")} {currentPage} {t("app.of")} {totalPages} · {trips.length} {t("trips.tripsCount")}
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t("app.next")}
          </Button>
        </div>
      )}
    </section>
  );
}

function TripCard({
  trip,
  pieces,
  clients,
  onDelete,
}: {
  trip: Trip;
  pieces: Piece[];
  clients: Client[];
  onDelete: () => void;
}) {
  const { t } = useLang();
  const fmtFor = (p: Piece): PurityFormat =>
    (clients.find((c) => c.id === p.client_id)?.purity_format as PurityFormat | undefined) ?? "3";
  const totalPure = pieces.reduce(
    (s, p) => s + pureGrams(Number(p.weight_grams), p.bafleh_purity, fmtFor(p)),
    0,
  );
  const totalLoss = pieces.reduce(
    (s, p) =>
      s + lossGrams(Number(p.weight_grams), trip.declared_purity, p.bafleh_purity, fmtFor(p)),
    0,
  );
  const allPriced = pieces.length > 0 && pieces.every((p) => p.bafleh_purity != null);
  const allChecked = pieces.length > 0 && pieces.every((p) => p.checked);
  const allSuppliers = pieces.length > 0 && pieces.every((p) => p.client_id != null);
  const status: "settled" | "ready" | "pending" = trip.is_settled
    ? "settled"
    : allPriced && allChecked
      ? "ready"
      : "pending";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex items-stretch">
      <Link
        to="/purity/trips/$tripId"
        params={{ tripId: trip.id }}
        className="flex-1 min-w-0 flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/40"
      >
        <ChevronRight className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate font-mono">
              {tripDisplayName(trip)}
            </span>
            {status === "settled" ? (
              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600">
                <CheckCircle2 className="h-3 w-3 mr-0.5" /> {t("status.settled")}
              </span>
            ) : status === "ready" ? (
              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600">
                <CheckCircle2 className="h-3 w-3 mr-0.5" /> {t("status.ready")}
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">
                <AlertCircle className="h-3 w-3 mr-0.5" />
                {allPriced ? t("status.awaitingCheck") : t("status.awaitingBafleh")}
              </span>
            )}
            {status !== "settled" && pieces.length > 0 && (
              allSuppliers ? (
                <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> {t("status.suppliersDone")}
                </span>
              ) : (
                <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">
                  <AlertCircle className="h-3 w-3 mr-0.5" /> {t("status.missingSupplier")} ({pieces.filter((p) => p.client_id == null).length})
                </span>
              )
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {t("status.dep")} {trip.departure_date}
            {trip.arrival_date ? ` · ${t("status.arr")} ${trip.arrival_date}` : ""}
            {trip.receiver_company ? ` · → ${trip.receiver_company}` : ""}
            {trip.scrap_weight != null && (
              <> · <span className="text-white font-bold">{t("status.scrap")} {Number(trip.scrap_weight).toFixed(2)} g</span></>
            )}{" "}
            · {pieces.length} {t("status.bars")}
            {allPriced && (
              <>
                {" "}
                · {t("status.pure")} {totalPure.toFixed(2)} g · {t("status.loss")} {totalLoss.toFixed(2)} g
              </>
            )}
          </div>
        </div>
      </Link>
      <button
        onClick={onDelete}
        className="px-3 text-muted-foreground hover:text-destructive border-l border-border"
        aria-label="Delete trip"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}


export function TripHeaderEditor({
  trip,
  onChange,
}: {
  trip: Trip;
  onChange: () => Promise<void>;
}) {
  const { t } = useLang();
  const [arrival, setArrival] = useState(trip.arrival_date ?? "");
  const [receiver, setReceiver] = useState(trip.receiver_company ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!confirm(t("trips.confirmSave"))) return;
    setSaving(true);
    await supabase
      .from("purity_trips")
      .update({
        arrival_date: arrival || null,
        receiver_company: receiver || null,
      })
      .eq("id", trip.id);
    await logActivity("update", "trip", {
      trip: tripDisplayName(trip),
      arrival_date: arrival || null,
      receiver_company: receiver || null,
    }, trip.id);
    setSaving(false);
    await onChange();
  }

  const scrapDisplay =
    trip.scrap_weight != null ? Number(trip.scrap_weight).toFixed(2) : "—";

  return (
    <form
      onSubmit={save}
      className="rounded-md bg-muted/40 p-3 flex flex-col sm:flex-row sm:items-end gap-3"
    >
      <div className="flex-1 min-w-0">
        <Label className="text-xs block mb-1">{t("trips.arrival")}</Label>
        <Input
          type="date"
          value={arrival}
          onChange={(e) => setArrival(e.target.value)}
          className="w-full"
        />
      </div>
      <div className="flex-1 min-w-0">
        <Label className="text-xs block mb-1">{t("trips.receiver")}</Label>
        <Input
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
          placeholder={t("trips.receiverPh")}
          className="w-full"
        />
      </div>
      <div className="flex-1 min-w-0">
        <Label className="text-xs block mb-1">{t("trips.scrapSum")}</Label>
        <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/40 font-mono text-sm">
          {scrapDisplay} g
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={saving}>
          {saving ? t("app.saving") : t("app.save")}
        </Button>
      </div>
    </form>
  );
}

export function TripTotals({
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
  const { t } = useLang();
  const declaredPure =
    trip.scrap_weight != null
      ? (Number(trip.scrap_weight) * Number(trip.declared_purity)) / 1000
      : null;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 grid grid-cols-2 gap-2 text-sm">
      <Stat label={t("stat.barsTotal")} value={`${totalBarWeight.toFixed(2)} g`} />
      <Stat label={t("stat.pureBafleh")} value={`${totalPure.toFixed(2)} g`} />
      {declaredPure != null && (
        <Stat
          label={`${t("stat.declaredPure")} (× ${trip.declared_purity}‰)`}
          value={`${declaredPure.toFixed(2)} g`}
        />
      )}
      <Stat
        label={t("stat.totalLoss")}
        value={`${totalLoss.toFixed(2)} g`}
        highlight
      />
    </div>
  );
}

export function Stat({
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

export function BarsManager({
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
  const { t } = useLang();
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
      await logActivity("create", "bar", {
        trip: tripDisplayName(trip),
        weight_grams: Number(weight),
        label: label || null,
      }, trip.id);
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
    await logActivity("update", "bar", {
      trip: tripDisplayName(trip),
      field: "bafleh_purity",
      value: value === "" ? null : Number(value),
    }, id);
    await onChange();
  }

  async function updateInitialPurity(id: string, value: string) {
    await supabase
      .from("purity_pieces")
      .update({ initial_purity: value === "" ? null : Number(value) })
      .eq("id", id);
    await logActivity("update", "bar", {
      trip: tripDisplayName(trip),
      field: "initial_purity",
      value: value === "" ? null : Number(value),
    }, id);
    await onChange();
  }

  async function toggleChecked(id: string, next: boolean) {
    await supabase.from("purity_pieces").update({ checked: next }).eq("id", id);
    await logActivity("update", "bar", {
      trip: tripDisplayName(trip),
      field: "checked",
      value: next,
    }, id);
    await onChange();
  }

  async function updateClient(id: string, value: string) {
    await supabase
      .from("purity_pieces")
      .update({ client_id: value === "" ? null : value })
      .eq("id", id);
    const supplier = clients.find((c) => c.id === value)?.name ?? null;
    await logActivity("update", "bar", {
      trip: tripDisplayName(trip),
      field: "supplier",
      value: supplier,
    }, id);
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
    await logActivity("delete", "bar", {
      trip: tripDisplayName(trip),
      weight_grams: Number(weightG),
    }, id);
    await onChange();
  }

  const formAddFmt: PurityFormat =
    (clients.find((c) => c.id === clientId)?.purity_format as PurityFormat | undefined) ?? "3";
  const formAddStep = formAddFmt === "4" ? "0.1" : "1";
  const formAddMax = formAddFmt === "4" ? "999.9" : "999";
  const formAddPh = formAddFmt === "4" ? "999.9" : "999";

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t("trips.bars")}
      </div>

      <form onSubmit={addBar} className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-3">
          <Label className="text-xs">{t("trips.weight")}</Label>
          <Input
            type="number"
            step="0.001"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            required
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">{t("trips.initial")}</Label>
          <Input
            type="number"
            step={formAddStep}
            min="0"
            max={formAddMax}
            value={initialPurity}
            onChange={(e) => setInitialPurity(e.target.value)}
            placeholder={formAddPh}
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">{t("trips.bafleh")}</Label>
          <Input
            type="number"
            step={formAddStep}
            min="0"
            max={formAddMax}
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
          <Label className="text-xs">{t("trips.supplier")}</Label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-popover text-popover-foreground px-2 text-sm"
          >
            <option value="" className="bg-popover text-popover-foreground">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id} className="bg-popover text-popover-foreground">
                {c.name} [{c.purity_format === "4" ? "4d" : "3d"}]{c.notes ? ` (${c.notes})` : ""}
              </option>
            ))}
          </select>
          {clientId && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {formatPurityLabel(formAddFmt)}
            </div>
          )}
        </div>
        <div className="col-span-1">
          <Button size="sm" className="w-full" disabled={saving}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {pieces.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-3">
          {t("trips.noBars")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-1.5 pr-2">#</th>
                <th className="text-right py-1.5 pr-2">{t("tbl.weight")}</th>
                <th className="text-right py-1.5 pr-2">{t("tbl.init")}</th>
                <th className="text-right py-1.5 pr-2">{t("tbl.bafleh")}</th>
                <th className="text-right py-1.5 pr-2">{t("tbl.pure")}</th>
                <th className="text-left py-1.5 pr-2">{t("tbl.supplier")}</th>
                <th className="text-right py-1.5 pr-2">{t("tbl.loss")}</th>
                <th className="text-center py-1.5 pr-2">✓</th>
                <th></th>
              </tr>


            </thead>
            <tbody>
              {pieces.map((p, i) => {
                const client = clients.find((c) => c.id === p.client_id);
                const fmt: PurityFormat = (client?.purity_format as PurityFormat | undefined) ?? "3";
                const pure = pureGrams(Number(p.weight_grams), p.bafleh_purity, fmt);
                const loss = lossGrams(
                  Number(p.weight_grams),
                  trip.declared_purity,
                  p.bafleh_purity,
                  fmt,
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
                      {Number(p.weight_grams).toFixed(2)}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <input
                        type="number"
                        step={fmt === "4" ? "0.1" : "1"}
                        min="0"
                        max={fmt === "4" ? "999.9" : "999"}
                        defaultValue={p.initial_purity ?? (fmt === "4" ? 999.9 : 999)}
                        disabled={p.checked}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (p.initial_purity?.toString() ?? (fmt === "4" ? "999.9" : "999"))) {
                            updateInitialPurity(p.id, v);
                          }
                        }}
                        className="w-20 h-7 text-right font-mono bg-transparent border border-input rounded px-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <input
                        type="number"
                        step={fmt === "4" ? "0.1" : "1"}
                        min="0"
                        max={fmt === "4" ? "999.9" : "999"}
                        defaultValue={p.bafleh_purity ?? ""}
                        disabled={p.checked}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (p.bafleh_purity?.toString() ?? "")) {
                            updateBaflehPurity(p.id, v);
                          }
                        }}
                        placeholder="—"
                        className="w-20 h-7 text-right font-mono bg-transparent border border-input rounded px-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {hasBafleh ? pure.toFixed(2) : "—"}
                    </td>
                    <td className="py-1.5 pr-2 max-w-[160px]">
                      <select
                        value={p.client_id ?? ""}
                        disabled={p.checked}
                        onChange={(e) => updateClient(p.id, e.target.value)}
                        className="w-full h-7 bg-popover text-popover-foreground border border-input rounded px-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="" className="bg-popover text-popover-foreground">—</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id} className="bg-popover text-popover-foreground">
                            {c.name} [{c.purity_format === "4" ? "4d" : "3d"}]{c.notes ? ` (${c.notes})` : ""}
                          </option>
                        ))}
                      </select>
                      {client && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatPurityLabel(client.purity_format)}
                        </div>
                      )}
                    </td>
                    <td className={`py-1.5 pr-2 text-right font-mono font-semibold ${lossColor}`}>
                      {hasBafleh ? loss.toFixed(2) : "—"}
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

export function ClientBreakdown({
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
      const supplierFmt: PurityFormat =
        (clients.find((c) => c.id === p.client_id)?.purity_format as PurityFormat | undefined) ?? "3";
      row.bars.push(p);
      row.totalWeight += Number(p.weight_grams);
      row.totalPure += pureGrams(Number(p.weight_grams), p.bafleh_purity, supplierFmt);
      row.totalLoss += lossGrams(
        Number(p.weight_grams),
        trip.declared_purity,
        p.bafleh_purity,
        supplierFmt,
      );
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.totalLoss - a.totalLoss);
  }, [pieces, clients, trip]);

  if (rows.length === 0) return null;

  async function shareClientPDF(r: {
    name: string;
    bars: Piece[];
    totalWeight: number;
    totalPure: number;
    totalLoss: number;
  }) {
    // True vector A4 PDF — selectable text, vector shapes, embedded fonts.
    // Built-in PostScript fonts: helvetica (sans), times (serif), courier (mono).
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
      compress: true,
    });

    // Palette (RGB)
    const GOLD: [number, number, number] = [201, 162, 39];
    const GOLD_DEEP: [number, number, number] = [184, 145, 30];
    const GOLD_SOFT: [number, number, number] = [232, 210, 122];
    const CREAM: [number, number, number] = [249, 247, 241];
    const CREAM_ALT: [number, number, number] = [247, 243, 234];
    const INK: [number, number, number] = [17, 24, 39];
    const CHARCOAL: [number, number, number] = [31, 41, 55];
    const MUTED: [number, number, number] = [107, 114, 128];
    const SUBTLE: [number, number, number] = [156, 163, 175];
    const HAIRLINE: [number, number, number] = [239, 230, 203];
    const RED: [number, number, number] = [192, 57, 43];
    const GREEN: [number, number, number] = [4, 120, 87];

    const W = 210;
    const H = 297;
    const OUTER = 6;
    const PAD = 12;

    // Derived identifiers (same logic as PNG)
    const dep = trip.departure_date || "";
    const depCompact = dep.replace(/-/g, "");
    const hash = Math.abs(
      Array.from(r.name + dep + trip.id).reduce(
        (a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0,
        0,
      ),
    );
    const clientCode = (r.name || "—").toString();
    const reportSerial = String(hash % 10000).padStart(4, "0");
    const reportId = `RP-${depCompact || "00000000"}-${reportSerial}`;
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const reportDate = `${pad2(now.getDate())} ${months[now.getMonth()]} ${now.getFullYear()}`;
    const gstMs = now.getTime() + (now.getTimezoneOffset() + 240) * 60000;
    const gst = new Date(gstMs);
    let hh = gst.getHours();
    const mm = pad2(gst.getMinutes());
    const ampm = hh >= 12 ? "PM" : "AM";
    hh = hh % 12 || 12;
    const reportTime = `${hh}:${mm} ${ampm} (GST)`;

    // Background cream
    doc.setFillColor(...CREAM);
    doc.rect(0, 0, W, H, "F");

    // Outer gold rounded border (double)
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.roundedRect(OUTER, OUTER, W - OUTER * 2, H - OUTER * 2, 3, 3, "S");
    doc.setDrawColor(...GOLD_SOFT);
    doc.setLineWidth(0.2);
    doc.roundedRect(OUTER + 1.2, OUTER + 1.2, W - (OUTER + 1.2) * 2, H - (OUTER + 1.2) * 2, 2.4, 2.4, "S");

    // ===== TOP BAND =====
    // Logo (PNG, top-left). Vector PDFs commonly embed raster logos — text stays vector/selectable.
    try {
      const logoUrl = atherLogoAsset.url as string;
      const blob = await fetch(logoUrl).then((res) => res.blob());
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      // Probe dimensions to keep aspect ratio
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.width, h: img.height });
        img.onerror = () => resolve({ w: 1, h: 1 });
        img.src = dataUrl;
      });
      const logoH = 16;
      const logoW = (dims.w / dims.h) * logoH;
      doc.addImage(dataUrl, "PNG", PAD, OUTER + 4, logoW, logoH, undefined, "FAST");
    } catch {
      /* logo optional */
    }

    // Taglines under logo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GOLD_DEEP);
    doc.text("GOLD & PRECIOUS METALS", PAD, OUTER + 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("TRUST  •  INTEGRITY  •  EXCELLENCE", PAD, OUTER + 30);

    // Center title — vector serif
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...GOLD_DEEP);
    doc.text("GOLD  PURITY  REPORT", W / 2, OUTER + 14, { align: "center" });
    // ornament
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.line(W / 2 - 30, OUTER + 18, W / 2 - 4, OUTER + 18);
    doc.line(W / 2 + 4, OUTER + 18, W / 2 + 30, OUTER + 18);
    doc.setFillColor(...GOLD);
    doc.triangle(W / 2, OUTER + 16.5, W / 2 + 2, OUTER + 18, W / 2, OUTER + 19.5, "F");
    doc.triangle(W / 2, OUTER + 16.5, W / 2 - 2, OUTER + 18, W / 2, OUTER + 19.5, "F");

    // UAE flag (top-right) — vector
    const flagX = W - PAD - 32;
    const flagY = OUTER + 6;
    const flagW = 32;
    const flagH = 20;
    const hoist = 10;
    doc.setFillColor(206, 17, 38);
    doc.rect(flagX, flagY, hoist, flagH, "F");
    doc.setFillColor(0, 151, 57);
    doc.rect(flagX + hoist, flagY, flagW - hoist, flagH / 3, "F");
    doc.setFillColor(255, 255, 255);
    doc.rect(flagX + hoist, flagY + flagH / 3, flagW - hoist, flagH / 3, "F");
    doc.setFillColor(0, 0, 0);
    doc.rect(flagX + hoist, flagY + (2 * flagH) / 3, flagW - hoist, flagH / 3, "F");
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.1);
    doc.rect(flagX, flagY, flagW, flagH, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...CHARCOAL);
    doc.text("Dubai, United Arab Emirates", flagX + flagW / 2, flagY + flagH + 4, { align: "center" });

    // ===== CLIENT CODE BLOCK =====
    let cursorY = OUTER + 36;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("CLIENT CODE", PAD + 4, cursorY + 4);
    doc.setFont("times", "bold");
    doc.setFontSize(56);
    doc.setTextColor(...INK);
    doc.text(clientCode, PAD + 4, cursorY + 24);

    // Right meta column
    const metaX = W - PAD - 4;
    const metaLabel = (label: string, value: string, y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(label, metaX, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...CHARCOAL);
      doc.text(value, metaX, y + 4, { align: "right" });
    };
    metaLabel("REPORT ID", reportId, cursorY + 2);
    metaLabel("DATE", reportDate, cursorY + 11);
    metaLabel("TIME", reportTime, cursorY + 20);

    cursorY += 32;

    // ===== SUMMARY CARDS =====
    const cardGap = 4;
    const cardW = (W - PAD * 2 - cardGap * 2) / 3;
    const cardH = 22;
    const cards: Array<{ label: string; value: string; color: [number, number, number] }> = [
      { label: "BARS", value: String(r.bars.length), color: INK },
      {
        label: "TOTAL WEIGHT (g)",
        value: r.totalWeight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        color: INK,
      },
      {
        label: "TOTAL LOSS (g)",
        value: r.totalLoss.toFixed(2),
        color: r.totalLoss === 0 ? GREEN : RED,
      },
    ];
    cards.forEach((c, i) => {
      const x = PAD + i * (cardW + cardGap);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, cursorY, cardW, cardH, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(c.label, x + 4, cursorY + 7);
      doc.setFont("times", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...c.color);
      doc.text(c.value, x + 4, cursorY + 18);
    });
    cursorY += cardH + 6;

    // ===== TABLE =====
    const tableHeadH = 8;
    const rowH = 7;
    const colNum = PAD + 4;
    const colWeight = PAD + 56;
    const colBafleh = PAD + 100;
    const colPure = PAD + 142;
    const colLoss = W - PAD - 4;

    doc.setFillColor(...GOLD_DEEP);
    doc.roundedRect(PAD, cursorY, W - PAD * 2, tableHeadH, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("#", colNum, cursorY + 5.5);
    doc.text("WEIGHT (g)", colWeight, cursorY + 5.5, { align: "right" });
    doc.text("BAFLEH ‰", colBafleh, cursorY + 5.5, { align: "right" });
    doc.text("PURE (g)", colPure, cursorY + 5.5, { align: "right" });
    doc.text("LOSS (g)", colLoss, cursorY + 5.5, { align: "right" });

    let ry = cursorY + tableHeadH;
    r.bars.forEach((b, i) => {
      const w = Number(b.weight_grams);
      const supplierFmt: PurityFormat =
        (clients.find((c) => c.id === b.client_id)?.purity_format as PurityFormat | undefined) ?? "3";
      const pure = pureGrams(w, b.bafleh_purity, supplierFmt);
      const loss = lossGrams(w, trip.declared_purity, b.bafleh_purity, supplierFmt);

      if (i % 2 === 1) {
        doc.setFillColor(...CREAM_ALT);
        doc.rect(PAD, ry, W - PAD * 2, rowH, "F");
      }
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.1);
      doc.line(PAD, ry + rowH, W - PAD, ry + rowH);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text(String(b.label || i + 1), colNum, ry + 5);

      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      doc.text(w.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), colWeight, ry + 5, { align: "right" });
      doc.text(formatPurityValue(b.bafleh_purity, supplierFmt), colBafleh, ry + 5, { align: "right" });
      doc.text(pure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), colPure, ry + 5, { align: "right" });

      doc.setFont("courier", "bold");
      doc.setTextColor(...(loss === 0 ? GREEN : RED));
      doc.text(loss.toFixed(2), colLoss, ry + 5, { align: "right" });
      ry += rowH;
    });
    cursorY = ry + 6;

    // ===== COMPENSATION STRIP =====
    const compH = 28;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.roundedRect(PAD, cursorY, W - PAD * 2, compH, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("AMOUNT TO COMPENSATE", W / 2, cursorY + 9, { align: "center" });
    doc.setFont("times", "bold");
    doc.setFontSize(26);
    doc.setTextColor(...(r.totalLoss === 0 ? GREEN : GOLD_DEEP));
    doc.text(`${r.totalLoss.toFixed(2)} g of Pure Gold`, W / 2, cursorY + 22, { align: "center" });
    cursorY += compH + 6;

    // ===== VERIFICATION ROW =====
    const verifyH = 30;
    // QR placeholder (vector squares from hash) — same pseudo pattern as PNG
    const qrSize = 26;
    const qrX = PAD + 2;
    const qrY = cursorY + 2;
    doc.setFillColor(255, 255, 255);
    doc.rect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, "F");
    const qrCells = 21;
    const cell = qrSize / qrCells;
    let seed = hash >>> 0;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    doc.setFillColor(...INK);
    for (let y0 = 0; y0 < qrCells; y0++) {
      for (let x0 = 0; x0 < qrCells; x0++) {
        if (rng() > 0.5) {
          doc.rect(qrX + x0 * cell, qrY + y0 * cell, cell + 0.05, cell + 0.05, "F");
        }
      }
    }
    // Finder patterns
    const finder = (fx: number, fy: number) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(fx, fy, cell * 7, cell * 7, "F");
      doc.setFillColor(...INK);
      doc.rect(fx, fy, cell * 7, cell * 7, "F");
      doc.setFillColor(255, 255, 255);
      doc.rect(fx + cell, fy + cell, cell * 5, cell * 5, "F");
      doc.setFillColor(...INK);
      doc.rect(fx + cell * 2, fy + cell * 2, cell * 3, cell * 3, "F");
    };
    finder(qrX, qrY);
    finder(qrX + cell * 14, qrY);
    finder(qrX, qrY + cell * 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...GOLD_DEEP);
    doc.text("Verify this report", qrX + qrSize + 6, cursorY + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Scan the QR code to verify", qrX + qrSize + 6, cursorY + 14);
    doc.text("the authenticity of this report.", qrX + qrSize + 6, cursorY + 18);

    // Signature (right)
    const sigX = W - PAD - 70;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...CHARCOAL);
    doc.text("AUTHORIZED SIGNATURE", sigX, cursorY + 6);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.6);
    doc.lines(
      [
        [10, -4],
        [12, 6],
        [16, -4],
        [14, 2],
      ],
      sigX + 4,
      cursorY + 16,
    );
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(sigX, cursorY + 22, sigX + 66, cursorY + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Quality Assurance Manager", sigX, cursorY + 26);

    cursorY += verifyH + 4;

    // ===== DISCLAIMER =====
    const discH = 14;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(PAD, cursorY, W - PAD * 2, discH, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CHARCOAL);
    doc.text(
      "This report was generated from laboratory purity measurements and is intended for commercial reconciliation purposes.",
      W / 2,
      cursorY + 9,
      { align: "center", maxWidth: W - PAD * 2 - 8 },
    );

    // ===== FOOTER =====
    const footerY = H - OUTER - 12;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(PAD, footerY - 2, W - PAD, footerY - 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("Generated by", PAD, footerY + 3);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GOLD_DEEP);
    doc.text("ATHER", PAD + 14, footerY + 3);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text("Gold & Precious Metals · Generated in Dubai, UAE", PAD, footerY + 7);
    doc.setFontSize(7);
    doc.setTextColor(...SUBTLE);
    doc.text(`Verification ID: ${reportId}`, W - PAD, footerY + 7, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...CHARCOAL);
    doc.text("Dubai, United Arab Emirates", W - PAD, footerY + 3, { align: "right" });

    // Save
    const fileName = `Gold-Purity-Report_${clientCode}_${reportSerial}.pdf`;
    doc.save(fileName);
  }



  async function shareClientImage(r: {
    name: string;
    bars: Piece[];
    totalWeight: number;
    totalPure: number;
    totalLoss: number;
  }) {
    // ===== Portrait premium report (matches uploaded design) =====
    const W = 2000;
    const OUTER = 36;
    const PAD = 80;

    // Palette
    const GOLD = "#C9A227";
    const GOLD_DEEP = "#B8911E";
    const GOLD_SOFT = "#E8D27A";
    const GOLD_TINT = "rgba(201,162,39,0.08)";
    const CREAM = "#F9F7F1";
    const CREAM_ALT = "#F7F3EA";
    const CHARCOAL = "#1F2937";
    const INK = "#111827";
    const MUTED = "#6B7280";
    const SUBTLE = "#9CA3AF";
    const HAIRLINE = "#EFE6CB";
    const RED = "#C0392B";
    const GREEN = "#047857";

    // Load luxury fonts (Cinzel, DM Serif Display, Cormorant Garamond, Inter)
    await ensureReportFonts();

    // Derived identifiers
    const dep = trip.departure_date || "";
    const depCompact = dep.replace(/-/g, "");
    const hash = Math.abs(
      Array.from(r.name + dep + trip.id).reduce(
        (a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0,
        0,
      ),
    );
    // CLIENT CODE — the prominent number is the supplier's code (stored in client.name).
    // The Report ID is a separate identifier and must never replace the client code.
    const clientCode = (r.name || "—").toString();
    const reportSerial = String(hash % 10000).padStart(4, "0");
    const reportId = `RP-${depCompact || "00000000"}-${reportSerial}`;
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const reportDate = `${pad2(now.getDate())} ${months[now.getMonth()]} ${now.getFullYear()}`;
    // GST = UTC+4
    const gstMs = now.getTime() + (now.getTimezoneOffset() + 240) * 60000;
    const gst = new Date(gstMs);
    let hh = gst.getHours();
    const mm = pad2(gst.getMinutes());
    const ampm = hh >= 12 ? "PM" : "AM";
    hh = hh % 12 || 12;
    const reportTime = `${hh}:${mm} ${ampm} (GST)`;

    // Font shorthands
    const FONT_TITLE = "'Cinzel', 'Cormorant Garamond', Georgia, serif";
    const FONT_DISPLAY = "'DM Serif Display', 'Cormorant Garamond', Georgia, serif";
    const FONT_UI = "'Inter', system-ui, -apple-system, sans-serif";

    // Layout
    const topBandH = 380;
    const numberBlockH = 260;
    const cardsY = topBandH + numberBlockH;
    const cardH = 220;
    const cardsBlockH = cardH + 50;
    const tableY = cardsY + cardsBlockH;
    const tableHeadH = 90;
    const rowH = 120;
    const tableBottom = tableY + tableHeadH + rowH * r.bars.length;
    const compY = tableBottom + 50;
    const compH = 280;
    const verifyY = compY + compH + 50;
    const verifyH = 200;
    const disclaimerY = verifyY + verifyH + 30;
    const disclaimerH = 110;
    const bottomY = disclaimerY + disclaimerH + 40;
    const H = bottomY + 90 + OUTER;

    // Render at 2× the logical layout to produce a sharp 4000px-wide PNG
    // (crisp at 300%+ zoom and on WhatsApp re-compression).
    const SCALE = 2;
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Improve typography rendering on canvas
    (ctx as CanvasRenderingContext2D & { textRendering?: string }).textRendering = "geometricPrecision";

    // Preload Ather logo
    const logoImg = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = atherLogoAsset.url;
    });

    // Background cream
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);

    // Subtle Ather logo watermark at 2% opacity (center)
    if (logoImg) {
      ctx.save();
      ctx.globalAlpha = 0.02;
      const wmSize = Math.min(W, H) * 0.55;
      const ratio = logoImg.width / logoImg.height;
      const wmW = wmSize;
      const wmH = wmSize / ratio;
      ctx.drawImage(logoImg, (W - wmW) / 2, (H - wmH) / 2, wmW, wmH);
      ctx.restore();
    }

    // Outer gold rounded border
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    roundRect(ctx, OUTER, OUTER, W - OUTER * 2, H - OUTER * 2, 28);
    ctx.stroke();
    ctx.strokeStyle = GOLD_SOFT;
    ctx.lineWidth = 1;
    roundRect(ctx, OUTER + 6, OUTER + 6, W - (OUTER + 6) * 2, H - (OUTER + 6) * 2, 22);
    ctx.stroke();

    // ===== TOP BAND =====
    // Ather logo (top-left, image only, no wordmark)
    const logoX = PAD + 10;
    const logoY = OUTER + 40;
    const logoBoxH = 160;
    if (logoImg) {
      const ratio = logoImg.width / logoImg.height;
      const drawH = logoBoxH;
      const drawW = drawH * ratio;
      ctx.drawImage(logoImg, logoX, logoY, drawW, drawH);
    }
    // Taglines under logo
    ctx.fillStyle = GOLD_DEEP;
    ctx.font = `700 22px ${FONT_UI}`;
    ctx.textAlign = "left";
    ctx.fillText("GOLD & PRECIOUS METALS", logoX, logoY + logoBoxH + 38);
    ctx.fillStyle = MUTED;
    ctx.font = `500 15px ${FONT_UI}`;
    ctx.fillText("TRUST  •  INTEGRITY  •  EXCELLENCE", logoX, logoY + logoBoxH + 66);

    // Center title — luxury Cinzel
    ctx.textAlign = "center";
    ctx.fillStyle = GOLD_DEEP;
    ctx.font = `700 62px ${FONT_TITLE}`;
    // letter-spacing emulation via spaced text
    const titleText = "GOLD  PURITY  REPORT";
    ctx.fillText(titleText, W / 2, OUTER + 110);
    // ornament
    const ornY = OUTER + 140;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 180, ornY);
    ctx.lineTo(W / 2 - 20, ornY);
    ctx.moveTo(W / 2 + 20, ornY);
    ctx.lineTo(W / 2 + 180, ornY);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(W / 2, ornY - 8);
    ctx.lineTo(W / 2 + 10, ornY);
    ctx.lineTo(W / 2, ornY + 8);
    ctx.lineTo(W / 2 - 10, ornY);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = "left";

    // UAE flag + label (top-right)
    const flagX = W - PAD - 200;
    const flagY = OUTER + 50;
    const flagW = 200;
    const flagH = 130;
    // Red hoist
    const hoist = 60;
    ctx.fillStyle = "#CE1126";
    ctx.fillRect(flagX, flagY, hoist, flagH);
    // Green
    ctx.fillStyle = "#009739";
    ctx.fillRect(flagX + hoist, flagY, flagW - hoist, flagH / 3);
    // White
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(flagX + hoist, flagY + flagH / 3, flagW - hoist, flagH / 3);
    // Black
    ctx.fillStyle = "#000000";
    ctx.fillRect(flagX + hoist, flagY + (2 * flagH) / 3, flagW - hoist, flagH / 3);
    // Frame
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(flagX, flagY, flagW, flagH);
    ctx.fillStyle = CHARCOAL;
    ctx.font = "500 18px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Dubai, United Arab Emirates", flagX + flagW / 2, flagY + flagH + 28);
    ctx.textAlign = "left";

    // ===== CLIENT CODE + META =====
    // Small luxury label above the big code
    const bnY = topBandH + 30;
    ctx.fillStyle = GOLD_DEEP;
    ctx.font = `600 22px ${FONT_UI}`;
    ctx.textAlign = "left";
    ctx.fillText("CLIENT CODE", PAD + 14, bnY + 28);
    // Hairline under label
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD + 14, bnY + 42);
    ctx.lineTo(PAD + 14 + 180, bnY + 42);
    ctx.stroke();
    // The prominent number = supplier code (client.name)
    ctx.fillStyle = "#1E2430";
    ctx.font = `400 220px ${FONT_DISPLAY}`;
    ctx.fillText(clientCode, PAD + 10, bnY + 210);

    // Right meta column (Date / Time / ID)
    const metaX = W - PAD - 540;
    const metaIconCol = metaX;
    const metaLabelCol = metaX + 80;
    const drawMetaIcon = (cy: number, glyph: string) => {
      ctx.fillStyle = GOLD_TINT;
      ctx.beginPath();
      ctx.arc(metaIconCol + 22, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.font = `700 26px ${FONT_UI}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, metaIconCol + 22, cy + 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    };
    const metaRows: { glyph: string; label: string; value: string }[] = [
      { glyph: "▦", label: "Report Date", value: reportDate },
      { glyph: "◷", label: "Report Time", value: reportTime },
      { glyph: "❖", label: "Report ID", value: reportId },
    ];
    metaRows.forEach((m, i) => {
      const cy = topBandH + 30 + i * 76 + 26;
      drawMetaIcon(cy, m.glyph);
      ctx.fillStyle = MUTED;
      ctx.font = `500 18px ${FONT_UI}`;
      ctx.fillText(m.label.toUpperCase(), metaLabelCol, cy - 6);
      ctx.fillStyle = CHARCOAL;
      ctx.font = `600 24px ${FONT_UI}`;
      ctx.fillText(m.value, metaLabelCol, cy + 26);
    });

    // ===== SUMMARY CARDS =====
    const gap = 30;
    const cardW = (W - PAD * 2 - gap * 2) / 3;
    type Card = { label: string; value: string; valueColor: string; iconBg: string; iconColor: string; draw: (cx: number, cy: number) => void };
    const drawBarsIcon = (cx: number, cy: number) => {
      // small stack of gold bars
      ctx.fillStyle = GOLD_SOFT;
      ctx.fillRect(cx - 38, cy - 4, 54, 18);
      ctx.fillStyle = GOLD;
      ctx.fillRect(cx - 30, cy - 22, 54, 18);
      ctx.fillStyle = GOLD_DEEP;
      ctx.fillRect(cx - 22, cy - 40, 54, 18);
    };
    const drawScaleIcon = (cx: number, cy: number) => {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 36, cy + 20);
      ctx.lineTo(cx + 36, cy + 20);
      ctx.moveTo(cx, cy + 20);
      ctx.lineTo(cx, cy - 28);
      ctx.moveTo(cx - 30, cy - 28);
      ctx.lineTo(cx + 30, cy - 28);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy - 28);
      ctx.lineTo(cx - 48, cy + 4);
      ctx.lineTo(cx - 12, cy + 4);
      ctx.closePath();
      ctx.moveTo(cx + 30, cy - 28);
      ctx.lineTo(cx + 12, cy + 4);
      ctx.lineTo(cx + 48, cy + 4);
      ctx.closePath();
      ctx.fillStyle = GOLD_TINT;
      ctx.fill();
      ctx.stroke();
    };
    const drawLossIcon = (cx: number, cy: number) => {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 36, cy - 24);
      ctx.lineTo(cx - 12, cy);
      ctx.lineTo(cx + 6, cy - 14);
      ctx.lineTo(cx + 32, cy + 18);
      ctx.stroke();
      // arrow head
      ctx.beginPath();
      ctx.moveTo(cx + 32, cy + 18);
      ctx.lineTo(cx + 14, cy + 18);
      ctx.lineTo(cx + 32, cy);
      ctx.closePath();
      ctx.fillStyle = RED;
      ctx.fill();
    };
    const cards: Card[] = [
      { label: "BARS", value: String(r.bars.length), valueColor: INK,
        iconBg: GOLD_TINT, iconColor: GOLD, draw: drawBarsIcon },
      { label: "TOTAL WEIGHT (g)", value: r.totalWeight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valueColor: INK,
        iconBg: GOLD_TINT, iconColor: GOLD, draw: drawScaleIcon },
      { label: "TOTAL LOSS (g)", value: r.totalLoss.toFixed(2), valueColor: r.totalLoss === 0 ? GREEN : RED,
        iconBg: "rgba(192,57,43,0.08)", iconColor: RED, draw: drawLossIcon },
    ];
    cards.forEach((c, i) => {
      const x = PAD + i * (cardW + gap);
      ctx.save();
      ctx.shadowColor = "rgba(31,41,55,0.08)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = "#FFFFFF";
      roundRect(ctx, x, cardsY, cardW, cardH, 20);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1;
      roundRect(ctx, x, cardsY, cardW, cardH, 20);
      ctx.stroke();

      // icon circle
      const iconCx = x + 90;
      const iconCy = cardsY + cardH / 2;
      ctx.fillStyle = c.iconBg;
      ctx.beginPath();
      ctx.arc(iconCx, iconCy, 60, 0, Math.PI * 2);
      ctx.fill();
      c.draw(iconCx, iconCy);

      ctx.fillStyle = MUTED;
      ctx.font = "600 22px 'Inter', system-ui, -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(c.label, x + 180, cardsY + 80);
      ctx.fillStyle = c.valueColor;
      ctx.font = "800 58px 'Cormorant Garamond', 'DM Serif Display', Georgia, serif";
      ctx.fillText(c.value, x + 180, cardsY + 152);
    });

    // ===== TABLE =====
    // Header (gold)
    ctx.fillStyle = GOLD_DEEP;
    roundRect(ctx, PAD, tableY, W - PAD * 2, tableHeadH, 8);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 24px 'Inter', system-ui, -apple-system, sans-serif";
    const colNum = PAD + 50;
    const colWeight = PAD + 360;
    const colBafleh = PAD + 770;
    const colPure = PAD + 1180;
    const colLoss = W - PAD - 50;
    ctx.textAlign = "left";
    ctx.fillText("#", colNum, tableY + tableHeadH / 2 + 9);
    ctx.textAlign = "left";
    ctx.fillText("WEIGHT (g)", PAD + 220, tableY + tableHeadH / 2 + 9);
    ctx.fillText("BAFLEH ‰", PAD + 630, tableY + tableHeadH / 2 + 9);
    ctx.fillText("PURE (g)", PAD + 1040, tableY + tableHeadH / 2 + 9);
    ctx.textAlign = "right";
    ctx.fillText("LOSS (g)", colLoss, tableY + tableHeadH / 2 + 9);
    ctx.textAlign = "left";

    // Body
    let ry = tableY + tableHeadH;
    r.bars.forEach((b, i) => {
      const w = Number(b.weight_grams);
      const supplierFmt: PurityFormat =
        (clients.find((c) => c.id === b.client_id)?.purity_format as PurityFormat | undefined) ?? "3";
      const pure = pureGrams(w, b.bafleh_purity, supplierFmt);
      const loss = lossGrams(w, trip.declared_purity, b.bafleh_purity, supplierFmt);

      ctx.fillStyle = i % 2 === 0 ? "#FFFFFF" : CREAM_ALT;
      ctx.fillRect(PAD, ry, W - PAD * 2, rowH);
      ctx.fillStyle = HAIRLINE;
      ctx.fillRect(PAD, ry + rowH - 1, W - PAD * 2, 1);

      ctx.fillStyle = INK;
      ctx.font = "600 28px 'Inter', system-ui, -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(String(b.label || i + 1), colNum, ry + rowH / 2 + 10);

      ctx.font = "500 28px ui-monospace, Menlo, Consolas, monospace";
      ctx.textAlign = "right";
      ctx.fillStyle = INK;
      ctx.fillText(w.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), colWeight, ry + rowH / 2 + 10);
      ctx.fillText(formatPurityValue(b.bafleh_purity, supplierFmt), colBafleh, ry + rowH / 2 + 10);
      ctx.fillText(pure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), colPure, ry + rowH / 2 + 10);

      ctx.fillStyle = loss === 0 ? GREEN : RED;
      ctx.font = "700 28px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(loss.toFixed(2), colLoss, ry + rowH / 2 + 10);
      ry += rowH;
    });
    ctx.textAlign = "left";

    // ===== COMPENSATION STRIP =====
    ctx.save();
    ctx.shadowColor = "rgba(201,162,39,0.25)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, PAD, compY, W - PAD * 2, compH, 22);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.5;
    roundRect(ctx, PAD, compY, W - PAD * 2, compH, 22);
    ctx.stroke();

    // Gold bars cluster (left)
    const gbX = PAD + 100;
    const gbY = compY + compH / 2;
    const drawBar = (x: number, y: number, w0: number, h0: number) => {
      const g = ctx.createLinearGradient(x, y, x, y + h0);
      g.addColorStop(0, GOLD_SOFT);
      g.addColorStop(0.5, GOLD);
      g.addColorStop(1, GOLD_DEEP);
      ctx.fillStyle = g;
      // trapezoid bar (slight)
      ctx.beginPath();
      ctx.moveTo(x + 10, y);
      ctx.lineTo(x + w0 - 10, y);
      ctx.lineTo(x + w0, y + h0);
      ctx.lineTo(x, y + h0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = GOLD_DEEP;
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    drawBar(gbX - 60, gbY - 10, 140, 50);
    drawBar(gbX - 30, gbY - 60, 140, 50);
    drawBar(gbX + 10, gbY - 30, 140, 50);

    // Center text
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    ctx.font = "600 26px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("AMOUNT TO COMPENSATE", W / 2, compY + 90);
    ctx.fillStyle = r.totalLoss === 0 ? GREEN : GOLD_DEEP;
    ctx.font = "800 110px 'Cormorant Garamond', 'DM Serif Display', Georgia, serif";
    ctx.fillText(`${r.totalLoss.toFixed(2)} g of Pure Gold`, W / 2, compY + 200);
    // mini ornament
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 90, compY + 230);
    ctx.lineTo(W / 2 - 12, compY + 230);
    ctx.moveTo(W / 2 + 12, compY + 230);
    ctx.lineTo(W / 2 + 90, compY + 230);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(W / 2, compY + 230, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "left";

    // Quality & Trust medal (right)
    const medCx = W - PAD - 130;
    const medCy = compY + compH / 2;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    // laurel arcs
    ctx.beginPath();
    ctx.arc(medCx, medCy, 70, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(medCx, medCy, 70, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
    // small leaves
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 0.65 + (i * Math.PI * 0.7) / 8;
      const lx = medCx + Math.cos(a) * 70;
      const ly = medCy + Math.sin(a) * 70;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 8, 3, a, 0, Math.PI * 2);
      ctx.fillStyle = GOLD;
      ctx.fill();
      const a2 = -Math.PI * 0.35 + (i * Math.PI * 0.7) / 8;
      const lx2 = medCx + Math.cos(a2) * 70;
      const ly2 = medCy + Math.sin(a2) * 70;
      ctx.beginPath();
      ctx.ellipse(lx2, ly2, 8, 3, a2, 0, Math.PI * 2);
      ctx.fill();
    }
    // diamond
    ctx.save();
    ctx.translate(medCx, medCy - 8);
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(18, -4);
    ctx.lineTo(0, 22);
    ctx.lineTo(-18, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // stars
    ctx.fillStyle = GOLD;
    ctx.font = "700 16px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("★ ★ ★", medCx, medCy - 36);
    ctx.fillStyle = GOLD_DEEP;
    ctx.font = "700 14px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("QUALITY &", medCx, medCy + 36);
    ctx.fillText("TRUST", medCx, medCy + 52);
    ctx.textAlign = "left";

    // ===== VERIFY ROW (QR, verified, signature) =====
    const colW = (W - PAD * 2) / 3;

    // QR code (pseudo pattern from hash)
    const qrSize = 130;
    const qrX = PAD + 10;
    const qrY = verifyY + 10;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
    ctx.fillStyle = INK;
    const qrCells = 21;
    const cell = qrSize / qrCells;
    let seed = hash >>> 0;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let y0 = 0; y0 < qrCells; y0++) {
      for (let x0 = 0; x0 < qrCells; x0++) {
        if (rng() > 0.5) {
          ctx.fillRect(qrX + x0 * cell, qrY + y0 * cell, cell + 0.5, cell + 0.5);
        }
      }
    }
    // finder patterns (3 corners)
    const finder = (fx: number, fy: number) => {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(fx, fy, cell * 7, cell * 7);
      ctx.fillStyle = INK;
      ctx.fillRect(fx, fy, cell * 7, cell * 7);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(fx + cell, fy + cell, cell * 5, cell * 5);
      ctx.fillStyle = INK;
      ctx.fillRect(fx + cell * 2, fy + cell * 2, cell * 3, cell * 3);
    };
    finder(qrX, qrY);
    finder(qrX + cell * 14, qrY);
    finder(qrX, qrY + cell * 14);

    // Verify text (next to QR)
    ctx.fillStyle = GOLD_DEEP;
    ctx.font = "700 24px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("Verify this report", qrX + qrSize + 28, verifyY + 50);
    ctx.fillStyle = MUTED;
    ctx.font = "400 18px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("Scan the QR code to verify", qrX + qrSize + 28, verifyY + 84);
    ctx.fillText("the authenticity of this report.", qrX + qrSize + 28, verifyY + 108);

    // Divider
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD + colW, verifyY + 20);
    ctx.lineTo(PAD + colW, verifyY + verifyH - 20);
    ctx.stroke();

    // Middle: verified shield
    const vx = PAD + colW + 40;
    // shield icon
    ctx.fillStyle = GOLD_TINT;
    ctx.beginPath();
    ctx.moveTo(vx, verifyY + 30);
    ctx.lineTo(vx + 60, verifyY + 30);
    ctx.lineTo(vx + 60, verifyY + 80);
    ctx.quadraticCurveTo(vx + 30, verifyY + 120, vx, verifyY + 80);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = GOLD_DEEP;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(vx + 14, verifyY + 70);
    ctx.lineTo(vx + 26, verifyY + 84);
    ctx.lineTo(vx + 48, verifyY + 56);
    ctx.stroke();

    ctx.fillStyle = GOLD_DEEP;
    ctx.font = "700 22px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("VERIFIED & CERTIFIED", vx + 90, verifyY + 56);
    ctx.fillStyle = MUTED;
    ctx.font = "400 18px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("This report is generated from", vx + 90, verifyY + 90);
    ctx.fillText("laboratory purity measurements.", vx + 90, verifyY + 114);

    // Divider 2
    ctx.strokeStyle = HAIRLINE;
    ctx.beginPath();
    ctx.moveTo(PAD + colW * 2, verifyY + 20);
    ctx.lineTo(PAD + colW * 2, verifyY + verifyH - 20);
    ctx.stroke();

    // Right: signature
    const sx = PAD + colW * 2 + 40;
    ctx.fillStyle = CHARCOAL;
    ctx.font = "700 22px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("AUTHORIZED SIGNATURE", sx, verifyY + 40);
    // signature in Great Vibes script
    ctx.fillStyle = INK;
    ctx.font = "400 64px 'Great Vibes', 'Brush Script MT', cursive";
    ctx.fillText("Ather Quality", sx + 10, verifyY + 100);
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, verifyY + 130);
    ctx.lineTo(sx + 360, verifyY + 130);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.font = "500 18px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("Authorized by Ather Quality Department", sx, verifyY + 156);

    // ===== DISCLAIMER PILL =====
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, PAD, disclaimerY, W - PAD * 2, disclaimerH, 14);
    ctx.fill();
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    roundRect(ctx, PAD, disclaimerY, W - PAD * 2, disclaimerH, 14);
    ctx.stroke();
    // shield glyph
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(PAD + 40, disclaimerY + 30);
    ctx.lineTo(PAD + 80, disclaimerY + 30);
    ctx.lineTo(PAD + 80, disclaimerY + 65);
    ctx.quadraticCurveTo(PAD + 60, disclaimerY + 92, PAD + 40, disclaimerY + 65);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CHARCOAL;
    ctx.font = "500 22px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText(
      "This report was generated from laboratory purity measurements",
      PAD + 110,
      disclaimerY + 50,
    );
    ctx.fillText(
      "and is intended for commercial reconciliation purposes.",
      PAD + 110,
      disclaimerY + 80,
    );

    // ===== BOTTOM CREDITS =====
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(PAD, bottomY - 10);
    ctx.lineTo(W - PAD, bottomY - 10);
    ctx.stroke();
    // left: generated by Ather Gold & Precious Metals
    ctx.fillStyle = GOLD_DEEP;
    ctx.font = "700 20px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Generated by Ather Gold & Precious Metals", PAD, bottomY + 22);
    ctx.fillStyle = MUTED;
    ctx.font = "500 15px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("Premium bullion reconciliation report", PAD, bottomY + 50);

    // center: report verification id
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    ctx.font = "500 14px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("REPORT VERIFICATION ID", W / 2, bottomY + 22);
    ctx.fillStyle = CHARCOAL;
    ctx.font = "600 18px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(reportId, W / 2, bottomY + 50);

    // right: location
    ctx.textAlign = "right";
    ctx.fillStyle = CHARCOAL;
    ctx.font = "600 20px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("Dubai, United Arab Emirates", W - PAD, bottomY + 22);
    ctx.fillStyle = SUBTLE;
    ctx.font = "500 15px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("Ather Gold & Precious Metals · UAE", W - PAD, bottomY + 50);
    ctx.textAlign = "left";

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return;
    const fileName = `Gold-Purity-Report_${clientCode}_${reportSerial}.png`;
    const file = new File([blob], fileName, { type: "image/png" });

    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    };
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      try {
        await nav.share({
          files: [file],
          title: `Gold Purity Report — Client ${clientCode}`,
          text: `Client ${clientCode} · ${r.totalLoss.toFixed(2)} g loss · ${reportId}`,
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
                  {r.totalLoss.toFixed(2)} g loss
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => shareClientPDF(r)}
                  title="Download vector PDF (print quality)"
                >
                  <FileClock className="h-3.5 w-3.5" />
                </Button>

              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {r.bars.length} bars · {r.totalWeight.toFixed(2)} g ·{" "}
              {r.totalPure.toFixed(2)} g pure
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Bars:{" "}
              {r.bars
                .map(
                  (b) =>
                    `${Number(b.weight_grams).toFixed(2)}g @ ${b.bafleh_purity}‰`,
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
  const [notes, setNotes] = useState("");
  const [purityFormat, setPurityFormat] = useState<PurityFormat>("3");
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
      phone: null,
      notes: notes || null,
      purity_format: purityFormat,
    });
    setSaving(false);
    if (!error) {
      await logActivity("create", "supplier", { name, purity_format: purityFormat });
      setName("");
      setNotes("");
      setPurityFormat("3");
      await reload();
    }
  }

  async function deleteClient(id: string) {
    if (!confirm("Delete this supplier? Their bars will become unassigned."))
      return;
    const target = clients.find((c) => c.id === id);
    await supabase.from("purity_clients").delete().eq("id", id);
    await logActivity("delete", "supplier", { name: target?.name ?? null }, id);
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
          <div>
            <Label>Code</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Purity Format <span className="text-destructive">*</span></Label>
          <div className="flex gap-4 mt-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="add-purity-format"
                value="3"
                checked={purityFormat === "3"}
                onChange={() => setPurityFormat("3")}
              />
              3 digits (e.g. 999)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="add-purity-format"
                value="4"
                checked={purityFormat === "4"}
                onChange={() => setPurityFormat("4")}
              />
              4 digits / decimal (e.g. 999.9)
            </label>
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
            <SupplierRow
              key={c.id}
              client={c}
              onDelete={() => deleteClient(c.id)}
              onSaved={reload}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SupplierRow({
  client,
  onDelete,
  onSaved,
}: {
  client: Client;
  onDelete: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [notes, setNotes] = useState(client.notes ?? "");
  const [purityFormat, setPurityFormat] = useState<PurityFormat>(
    (client.purity_format as PurityFormat) ?? "3",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("purity_clients")
      .update({
        name: name.trim(),
        phone: null,
        notes: notes || null,
        purity_format: purityFormat,
      })
      .eq("id", client.id);
    setSaving(false);
    if (!error) {
      await logActivity("update", "supplier", {
        name: name.trim(),
        purity_format: purityFormat,
      }, client.id);
      setEditing(false);
      await onSaved();
    }
  }

  function cancel() {
    setName(client.name);
    setNotes(client.notes ?? "");
    setPurityFormat((client.purity_format as PurityFormat) ?? "3");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-md border border-border bg-card p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Code</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Purity Format</Label>
          <div className="flex gap-4 mt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={`edit-fmt-${client.id}`}
                value="3"
                checked={purityFormat === "3"}
                onChange={() => setPurityFormat("3")}
              />
              3 digits (999)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={`edit-fmt-${client.id}`}
                value="4"
                checked={purityFormat === "4"}
                onChange={() => setPurityFormat("4")}
              />
              4 digits / decimal (999.9)
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Check className="h-4 w-4 mr-1" /> Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card p-3 flex items-center justify-between">
      <div>
        <div className="font-medium flex items-center gap-2">
          {client.name}
          <span
            className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-semibold ${
              client.purity_format === "4"
                ? "bg-sky-500/15 text-sky-600"
                : "bg-amber-500/15 text-amber-600"
            }`}
          >
            {client.purity_format === "4" ? "4-digit · 999.9" : "3-digit · 999"}
          </span>
        </div>
        {client.notes && (
          <div className="text-xs text-muted-foreground">
            {client.notes}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setEditing(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Edit supplier"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete supplier"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
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
                <Link
                  key={p.id}
                  to="/purity/trips/$tripId"
                  params={{ tripId: p.trip_id }}
                  className="block rounded-md border border-border bg-card p-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium font-mono">
                        {Number(p.weight_grams).toFixed(2)} g
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
                      {client?.notes && (
                        <div className="text-xs text-muted-foreground">
                          {client.notes}
                        </div>
                      )}

                    </div>
                  </div>
                </Link>
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

function UsersTab({ currentUserId }: { currentUserId: string }) {
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
      await logActivity("create", "user", { username: username.trim() });
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
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const isAdminRow = u.username?.toLowerCase() === "admin";
              const canDelete = !isSelf && !isAdminRow;
              return (
                <li key={u.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.username}</div>
                    {u.email && (
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </div>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
                          setError(null);
                          setOk(null);
                          try {
                            await deletePurityUser({ data: { id: u.id } });
                            await logActivity("delete", "user", { username: u.username }, u.id);
                            setOk(`User "${u.username}" deleted.`);
                            await load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to delete user.");
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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

function LogsTab() {
  const [logs, setLogs] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  async function load() {
    setLoading(true);
    const rows = await loadActivity(500);
    setLogs(rows);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => {
      const blob = `${l.username} ${l.action} ${l.entity_type} ${JSON.stringify(l.details ?? {})}`.toLowerCase();
      return blob.includes(q);
    });
  }, [logs, query]);

  useEffect(() => {
    setPage(1);
  }, [query, logs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function actionBadge(action: string) {
    const map: Record<string, string> = {
      create: "bg-emerald-500/15 text-emerald-600",
      update: "bg-sky-500/15 text-sky-600",
      delete: "bg-red-500/15 text-red-600",
      settle: "bg-emerald-500/15 text-emerald-600",
      reopen: "bg-amber-500/15 text-amber-600",
    };
    const cls = map[action] ?? "bg-muted text-muted-foreground";
    return (
      <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
        {action}
      </span>
    );
  }

  function summarize(l: ActivityRow): string {
    const d = (l.details ?? {}) as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(d)) {
      if (v == null || v === "") continue;
      parts.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
    return parts.join(" · ");
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Activity log</h2>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>
      <Input
        placeholder="Filter by user, action, entity…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-10">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-10 border border-dashed border-border rounded-lg">
          No activity yet.
        </div>
      ) : (
        <>
          <ul className="rounded-lg border border-border bg-card divide-y divide-border">
            {paged.map((l) => (
              <li key={l.id} className="p-3 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  {actionBadge(l.action)}
                  <span className="font-medium">{l.username}</span>
                  <span className="text-muted-foreground">{l.action}d {l.entity_type}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                    {new Date(l.created_at).toLocaleString()}
                  </span>
                </div>
                {summarize(l) && (
                  <div className="mt-1 text-xs text-muted-foreground break-words">{summarize(l)}</div>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              Page {currentPage} of {totalPages} · {filtered.length} total
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ProfileTab({
  email,
  setEmail,
}: {
  email: string;
  setEmail: (v: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [emailInput, setEmailInput] = useState(email);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [identities, setIdentities] = useState<{ provider: string; id: string }[]>([]);
  const [linkMsg, setLinkMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [linking, setLinking] = useState(false);

  const { t, lang: language, setLang } = useLang();
  const applyLanguage = (l: Lang) => setLang(l);

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentPurityUser();
        setUsername(me.username ?? "");
        if (me.email) setEmailInput(me.email);
      } catch {
        /* ignore */
      }
      const { data } = await supabase.auth.getUser();
      const ids = (data.user?.identities ?? []).map((i) => ({
        provider: i.provider,
        id: i.identity_id ?? i.id,
      }));
      setIdentities(ids);
    })();
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await updatePurityProfile({
        data: {
          username: username.trim() || undefined,
          email: emailInput.trim(),
        },
      });
      setEmail(emailInput.trim());
      await logActivity("update", "profile", { username, email: emailInput });
      setProfileMsg({ type: "ok", text: "Profile saved." });
    } catch (err) {
      setProfileMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd.length < 6) {
      setPwdMsg({ type: "err", text: "Password must be at least 6 characters." });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: "err", text: "Passwords do not match." });
      return;
    }
    setSavingPwd(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentEmail = userData.user?.email;
      if (currentEmail && currentPwd) {
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email: currentEmail,
          password: currentPwd,
        });
        if (signErr) throw new Error("Current password is incorrect.");
      }
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw new Error(error.message);
      await logActivity("update", "profile", { field: "password" });
      setPwdMsg({ type: "ok", text: "Password updated." });
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err) {
      setPwdMsg({ type: "err", text: err instanceof Error ? err.message : "Failed." });
    } finally {
      setSavingPwd(false);
    }
  }

  async function linkGoogle() {
    setLinkMsg(null);
    setLinking(true);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/purity/dashboard` },
      });
      if (error) throw new Error(error.message);
    } catch (err) {
      setLinkMsg({
        type: "err",
        text: err instanceof Error ? err.message : "Failed to start linking.",
      });
    } finally {
      setLinking(false);
    }
  }

  async function unlinkProvider(provider: string) {
    setLinkMsg(null);
    try {
      const { data } = await supabase.auth.getUserIdentities();
      const identity = data?.identities?.find((i) => i.provider === provider);
      if (!identity) return;
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw new Error(error.message);
      setIdentities((prev) => prev.filter((i) => i.provider !== provider));
      setLinkMsg({ type: "ok", text: `Unlinked ${provider}.` });
    } catch (err) {
      setLinkMsg({
        type: "err",
        text: err instanceof Error ? err.message : "Failed to unlink.",
      });
    }
  }

  const hasGoogle = identities.some((i) => i.provider === "google");

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserCircle className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Profile details</h2>
        </div>
        <form onSubmit={saveProfile} className="space-y-3">
          <div>
            <Label className="text-xs">Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {profileMsg && (
            <div className={`text-xs ${profileMsg.type === "ok" ? "text-emerald-500" : "text-destructive"}`}>
              {profileMsg.text}
            </div>
          )}
          <Button type="submit" size="sm" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save"}
          </Button>
        </form>
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Change password</h2>
        </div>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <Label className="text-xs">Current password</Label>
            <Input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <Label className="text-xs">New password</Label>
            <Input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label className="text-xs">Confirm new password</Label>
            <Input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {pwdMsg && (
            <div className={`text-xs ${pwdMsg.type === "ok" ? "text-emerald-500" : "text-destructive"}`}>
              {pwdMsg.text}
            </div>
          )}
          <Button type="submit" size="sm" disabled={savingPwd}>
            {savingPwd ? "Updating…" : "Update password"}
          </Button>
        </form>
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Linked accounts</h2>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded border border-border/60 px-3 py-2">
            <div className="text-sm">
              <div className="font-medium">Google</div>
              <div className="text-xs text-muted-foreground">
                {hasGoogle ? "Connected" : "Not connected"}
              </div>
            </div>
            {hasGoogle ? (
              <Button type="button" size="sm" variant="outline" onClick={() => unlinkProvider("google")}>
                Unlink
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={linkGoogle} disabled={linking}>
                {linking ? "Opening…" : "Link Google"}
              </Button>
            )}
          </div>
          {linkMsg && (
            <div className={`text-xs ${linkMsg.type === "ok" ? "text-emerald-500" : "text-destructive"}`}>
              {linkMsg.text}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Other providers: {identities.filter((i) => i.provider !== "google" && i.provider !== "email").map((i) => i.provider).join(", ") || "none"}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Languages className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Language</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            { code: "en", label: "English" },
            { code: "ar", label: "العربية" },
            { code: "fr", label: "Français" },
          ] as const).map((opt) => (
            <Button
              key={opt.code}
              type="button"
              size="sm"
              variant={language === opt.code ? "default" : "outline"}
              onClick={() => applyLanguage(opt.code)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Current: {language === "ar" ? "العربية (RTL)" : language === "fr" ? "Français" : "English"}
        </div>
      </div>
    </section>
  );
}
