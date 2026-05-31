import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  bootstrapSwapAdmin,
  getCurrentSwapUser,
  resolveSwapUsernameToEmail,
  swapNeedsBootstrap,
} from "@/lib/swap-users.functions";

export const Route = createFileRoute("/swap/")({
  head: () => ({
    meta: [
      { title: "Swap — Sign in" },
      { name: "description", content: "Daily swap-fee calculator for gold trading clients." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SwapLoginPage,
});

function SwapLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);

  useEffect(() => {
    swapNeedsBootstrap().then((r) => setNeedsBootstrap(r.needsBootstrap)).catch(() => setNeedsBootstrap(false));
  }, []);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      try {
        const me = await getCurrentSwapUser();
        if (me.isSwapUser) {
          navigate({ to: "/swap/dashboard", replace: true });
        }
      } catch {
        /* not a swap user, stay on login */
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
      setError("Enter your username and password.");
      return;
    }
    setLoading(true);
    try {
      const { email } = await resolveSwapUsernameToEmail({ data: { username: username.trim() } });
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
      const me = await getCurrentSwapUser();
      if (!me.isSwapUser) {
        await supabase.auth.signOut();
        throw new Error("This account is not allowed in Swap.");
      }
      navigate({ to: "/swap/dashboard", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError("Pick a username and password.");
      return;
    }
    setLoading(true);
    try {
      await bootstrapSwapAdmin({ data: { username: username.trim(), password, email } });
      // Now log in
      const resolved = await resolveSwapUsernameToEmail({ data: { username: username.trim() } });
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: resolved.email,
        password,
      });
      if (signErr) throw signErr;
      navigate({ to: "/swap/dashboard", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="h-11 w-11 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-display text-xl tracking-tight">Swap</p>
            <p className="text-xs text-muted-foreground">Daily swap-fee calculator</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-8">
          {needsBootstrap ? (
            <>
              <h1 className="font-display text-2xl mb-2">Create the first admin</h1>
              <p className="text-sm text-muted-foreground mb-8">
                No Swap users exist yet. Set up the first admin account.
              </p>
              <form onSubmit={handleBootstrap} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Setting up…" : "Create admin & sign in"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl mb-2">Sign in</h1>
              <p className="text-sm text-muted-foreground mb-8">Swap section · staff only</p>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Please wait…" : "Sign in"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
