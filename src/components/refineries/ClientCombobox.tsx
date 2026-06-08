import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export type ClientOption = {
  id: string;
  name: string;
  code?: string | null;
};

function formatLabel(c: { code?: string | null; name: string }): string {
  const code = (c.code ?? "").trim();
  const name = (c.name ?? "").trim();
  if (code && name) return `${code} (${name})`;
  return code || name || "—";
}

export { formatLabel as formatClientLabel };

export function ClientCombobox({
  clients,
  value,
  onChange,
  placeholder = "Select client",
  disabled,
  className,
  id,
}: {
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = React.useMemo(
    () => clients.find((c) => c.id === value) ?? null,
    [clients, value],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    type Scored = { c: ClientOption; rank: number };
    const scored: Scored[] = [];
    for (const c of clients) {
      const code = (c.code ?? "").toLowerCase();
      const name = (c.name ?? "").toLowerCase();
      let rank = -1;
      if (code === q) rank = 0;
      else if (code.startsWith(q)) rank = 1;
      else if (name.startsWith(q)) rank = 2;
      else if (code.includes(q)) rank = 3;
      else if (name.includes(q)) rank = 4;
      if (rank >= 0) scored.push({ c, rank });
    }
    scored.sort((a, b) => a.rank - b.rank || a.c.name.localeCompare(b.c.name));
    return scored.map((s) => s.c);
  }, [clients, query]);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {selected ? formatLabel(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-[260px] p-0"
        align="start"
      >
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code or name…"
            className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No clients found
            </div>
          ) : (
            filtered.map((c) => {
              const isSel = c.id === value;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    isSel && "bg-accent/50",
                  )}
                >
                  <Check className={cn("h-4 w-4 shrink-0", isSel ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">
                    {c.code ? (
                      <>
                        <span className="font-mono font-semibold">{c.code}</span>
                        {c.name && (
                          <span className="text-muted-foreground"> ({c.name})</span>
                        )}
                      </>
                    ) : (
                      <span>{c.name}</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
