import { Link } from "@tanstack/react-router";
import { useState } from "react";

const nav = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/companies", label: "Companies" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-sm bg-gradient-ember shadow-ember">
            <span className="font-display font-black text-ember-foreground text-sm">A</span>
          </span>
          <span className="font-display font-bold tracking-[0.25em] text-sm">ATHER GROUP</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="px-4 py-2 text-sm tracking-wide text-muted-foreground hover:text-foreground transition-colors relative"
              activeProps={{ className: "px-4 py-2 text-sm tracking-wide text-foreground relative" }}
              activeOptions={{ exact: n.to === "/" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/contact"
            className="hidden md:inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium tracking-[0.2em] uppercase border border-ember text-ember hover:bg-ember hover:text-ember-foreground transition-all"
          >
            Get in touch
          </Link>
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden flex flex-col gap-1.5 p-2"
            aria-label="Menu"
          >
            <span className={`h-px w-6 bg-foreground transition-all ${open ? "rotate-45 translate-y-[7px]" : ""}`} />
            <span className={`h-px w-6 bg-foreground transition-all ${open ? "opacity-0" : ""}`} />
            <span className={`h-px w-6 bg-foreground transition-all ${open ? "-rotate-45 -translate-y-[7px]" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <nav className="flex flex-col p-6 gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="py-3 text-lg font-display border-b border-border/40"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
