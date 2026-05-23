import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40 mt-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-20">
        <div className="grid md:grid-cols-12 gap-12">
          <div className="md:col-span-5">
            <div className="flex items-center gap-3 mb-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-gradient-ember">
                <span className="font-display font-black text-ember-foreground">A</span>
              </span>
              <span className="font-display font-bold tracking-[0.25em]">ATHER GROUP</span>
            </div>
            <p className="text-muted-foreground max-w-sm leading-relaxed">
              A diversified holding company building enduring value across precious metals,
              global trade, automotive and currency markets.
            </p>
          </div>

          <div className="md:col-span-3">
            <h4 className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Group</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/about" className="hover:text-ember transition-colors">About</Link></li>
              <li><Link to="/companies" className="hover:text-ember transition-colors">Companies</Link></li>
              <li><Link to="/contact" className="hover:text-ember transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div className="md:col-span-4">
            <h4 className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Reach us</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="mailto:augustus@ather.group" className="hover:text-ember transition-colors">augustus@ather.group</a></li>
              <li><a href="tel:+16194320431" className="hover:text-ember transition-colors">+1 619 432 0431</a></li>
              <li>World Wide</li>
            </ul>
          </div>
        </div>

        <div className="mt-20 pt-8 border-t border-border/60 flex flex-col md:flex-row justify-between gap-4 text-xs text-muted-foreground tracking-wide">
          <span>&copy; {new Date().getFullYear()} Ather Group. All rights reserved.</span>
          <span className="tracking-[0.3em] uppercase">Forging value &middot; Built to last</span>
        </div>
      </div>
    </footer>
  );
}
