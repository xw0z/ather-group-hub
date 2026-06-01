import { DollarSign } from "lucide-react";

export function SwapFooter() {
  return (
    <footer className="border-t border-border/60 bg-background/80 mt-10">
      <div className="mx-auto max-w-3xl px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <DollarSign className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold tracking-wide">SWAP</span>
          <span>· Daily swap fees tracker</span>
        </div>
        <div>© {new Date().getFullYear()} Ather Group</div>
      </div>
    </footer>
  );
}
