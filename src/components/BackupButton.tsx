import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { backupApp } from "@/lib/app-backup.functions";

export function BackupButton({
  app,
  label = "Backup",
  className,
}: {
  app: "purity" | "swap" | "margin" | "premium";
  label?: string;
  className?: string;
}) {
  const run = useServerFn(backupApp);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await run({ data: { app } });
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const ts = res.generatedAt.replace(/[:.]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${app}-backup_${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("[backup] failed:", err);
      alert(
        `Backup failed.\n\n${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={download}
      disabled={busy}
      className={className}
      title="Download a local JSON backup of all app data"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <Download className="h-4 w-4 mr-1.5" />
      )}
      {label}
    </Button>
  );
}
