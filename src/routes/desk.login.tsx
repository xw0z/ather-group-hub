import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/purity-i18n";
import {
  bootstrapSwapAdmin,
  getCurrentSwapUser,
  swapSignInWithUsername,
  swapNeedsBootstrap,
} from "@/lib/swap-users.functions";
import { getMyRefineryAssignment } from "@/lib/refineries.functions";
import { recordLogin } from "@/lib/swap-profile.functions";


async function postLoginRedirect(navigate: ReturnType<typeof useNavigate>) {
  try {
    const a = await getMyRefineryAssignment();
    if (!a.isAdmin && a.refineryId) {
      navigate({ to: "/desk/refineries", search: { r: a.refineryId, tab: "dashboard" }, replace: true });
      return;
    }
  } catch { /* ignore */ }
  navigate({ to: "/desk/app/dashboard", replace: true });
}

export const Route = createFileRoute("/desk/login")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Sign in" },
      { name: "description", content: "ATHER DESK · internal staff workspace." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DeskLoginPage,
});

function DeskLoginPage() {
  const navigate = useNavigate();
  const { t } = useLang();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);

  useEffect(() => {
    swapNeedsBootstrap()
      .then((r) => setNeedsBootstrap(r.needsBootstrap))
      .catch(() => setNeedsBootstrap(false));
  }, []);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      try {
        const me = await getCurrentSwapUser();
        if (me.isSwapUser) await postLoginRedirect(navigate);
      } catch {
        /* not a platform user */
      }
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) check();
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError(t("login.enterCreds"));
      return;

    }
    setLoading(true);
    try {
      const tokens = await swapSignInWithUsername({
        data: { username: username.trim(), password },
      });
      const { error: setErr } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (setErr) throw setErr;
      const me = await getCurrentSwapUser();
      if (!me.isSwapUser) {
        await supabase.auth.signOut();
        throw new Error(t("auth.notAuthorized"));
      }
      // Record login event (non-blocking)
      try {
        const { data: u } = await supabase.auth.getUser();
        if (u.user?.id) {
          void recordLogin({ data: { user_id: u.user.id, identifier: username.trim(), status: "success" } });
        }
      } catch { /* ignore */ }
      await postLoginRedirect(navigate);
    } catch (err) {
      void recordLogin({ data: { identifier: username.trim(), status: "failed" } }).catch(() => {});
      setError(err instanceof Error ? err.message : t("auth.signInFailed"));

    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError(t("auth.bootstrapPick"));
      return;

    }
    setLoading(true);
    try {
      await bootstrapSwapAdmin({ data: { username: username.trim(), password, email } });
      const tokens = await swapSignInWithUsername({
        data: { username: username.trim(), password },
      });
      const { error: setErr } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (setErr) throw setErr;
      navigate({ to: "/desk/app/dashboard", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.setupFailed"));

    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="h-11 w-11 rounded-md bg-ember/15 border border-ember/40 flex items-center justify-center">
            <Scale className="h-5 w-5 text-ember" />
          </div>
          <div>
            <p className="font-display text-xl tracking-[0.25em]">ATHER DESK</p>
            <p className="text-xs text-muted-foreground">{t("auth.staffOnly")}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-8">
          {needsBootstrap ? (
            <>
              <h1 className="font-display text-2xl mb-2">{t("auth.bootstrapTitle")}</h1>
              <p className="text-sm text-muted-foreground mb-8">{t("auth.bootstrapDesc")}</p>
              <form onSubmit={handleBootstrap} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username">{t("login.username")}</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.emailOpt")}</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("login.password")}</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full bg-ember text-ember-foreground hover:bg-ember/90">
                  {loading ? t("auth.bootstrapWait") : t("auth.bootstrapSubmit")}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl mb-2">{t("login.title")}</h1>
              <p className="text-sm text-muted-foreground mb-8">{t("auth.oneAccount")}</p>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username">{t("login.username")}</Label>
                  <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("login.password")}</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full bg-ember text-ember-foreground hover:bg-ember/90">
                  {loading ? t("login.wait") : t("login.submit")}
                </Button>
              </form>
            </>
          )}
        </div>


        <p className="text-xs text-muted-foreground text-center mt-6 tracking-[0.2em]">
          PURITY · MARGIN · SWAP · DISCOUNT/PREMIUM · REPORTS
        </p>
      </div>
    </main>
  );
}
