import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/purity/")({
  head: () => ({
    meta: [
      { title: "Purity — Sign in" },
      { name: "description", content: "Internal Ather Group tool for tracking gold bar purities." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PurityLoginPage,
});

function PurityLoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/purity/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/purity/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/purity/dashboard` },
        });
        if (error) throw error;
        setInfo("Account created. If email confirmation is required, check your inbox.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
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
            <p className="font-display text-xl tracking-tight">Purity</p>
            <p className="text-xs text-muted-foreground">Gold bar purity tracking</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-8">
          <h1 className="font-display text-2xl mb-2">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Log trips, pieces and weights to track every bar's purity.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@ather.group" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            {info && <p className="text-sm text-muted-foreground">{info}</p>}

            <Button type="submit" disabled={loading}
              className="w-full bg-ember text-ember-foreground hover:bg-ember/90">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
            className="mt-6 text-xs text-muted-foreground hover:text-foreground transition w-full text-center"
          >
            {mode === "signin" ? "Need an account? Create one" : "Have an account? Sign in"}
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Internal Ather Group tool · authorised personnel only
        </p>
      </div>
    </main>
  );
}
