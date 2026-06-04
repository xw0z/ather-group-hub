import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { restoreApp } from "@/lib/app-backup.functions";

export function RestoreButton({
  app,
  label = "Restore",
  className,
}: {
  app: "purity" | "swap" | "margin" | "premium";
  label?: string;
  className?: string;
}) {
  const run = useServerFn(restoreApp);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ok = window.confirm(
      `Restore ${app.toUpperCase()} from "${file.name}"?\n\nThis will overwrite existing rows with matching IDs and insert any missing rows. This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const text = await file.text();
      const res = await run({ data: { app, payload: text } });
      const lines = Object.entries(res.report)
        .map(([t, r]) => `${t}: ${r.inserted}${r.skipped ? ` (${r.skipped})` : ""}`)
        .join("\n");
      alert(`Restore complete.\n\n${lines}`);
    } catch (err) {
      console.error("[restore] failed:", err);
      alert(
        `Restore failed.\n\n${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onFile}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={className}
        title={label === "Restore" ? "Restore app data from a JSON backup file" : label}
        aria-label={label}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}
