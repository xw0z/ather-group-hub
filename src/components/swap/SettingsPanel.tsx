import { useEffect, useState, type FormEvent } from "react";
import { Settings as SettingsIcon, Save, Lock, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getSwapSettings,
  updateSwapSettings,
  type SwapSettings,
} from "@/lib/swap-settings.functions";
import { cached, invalidate, CK } from "@/lib/swap-cache";
import { useLang, type Lang } from "@/lib/purity-i18n";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<SwapSettings | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { setLang } = useLang();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await cached(CK.settings, () => getSwapSettings(), 5 * 60_000);
      setSettings(r.settings);
      setIsAdmin(r.isAdmin);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function patch<K extends keyof SwapSettings>(key: K, value: SwapSettings[K]) {
    setSettings((cur) => (cur ? { ...cur, [key]: value } : cur));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings || !isAdmin) return;
    const applyChoice = window.confirm(
      "Apply changes to existing clients too?\n\nOK = apply to ALL existing clients (default long rate, short rate, margin %).\nCancel = new clients only.",
    );
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const p: Partial<SwapSettings> = {
        default_long_annual_rate: Number(settings.default_long_annual_rate),
        default_short_annual_rate: Number(settings.default_short_annual_rate),
        wednesday_multiplier: Number(settings.wednesday_multiplier),
        skip_saturday: settings.skip_saturday,
        skip_sunday: settings.skip_sunday,
        default_margin_requirement_pct: Number(settings.default_margin_requirement_pct),
        safe_threshold_pct: Number(settings.safe_threshold_pct),
        warning_threshold_pct: Number(settings.warning_threshold_pct),
        xau_api_provider: settings.xau_api_provider || null,
        xau_api_key: settings.xau_api_key || null,
        xau_auto_refresh_seconds: Number(settings.xau_auto_refresh_seconds),
        xau_manual_fallback_price:
          settings.xau_manual_fallback_price === null ||
          Number.isNaN(Number(settings.xau_manual_fallback_price))
            ? null
            : Number(settings.xau_manual_fallback_price),
        company_name: settings.company_name,
        report_footer_text: settings.report_footer_text || null,
        confidentiality_text: settings.confidentiality_text,
        show_logo_on_reports: settings.show_logo_on_reports,
        default_report_format: settings.default_report_format,
        language: settings.language,
      };
      const r = await updateSwapSettings({
        data: { patch: p, applyToExistingClients: applyChoice },
      });
      invalidate(CK.settings, CK.activity, CK.clients);
      setSettings(r.settings);
      setInfo(
        applyChoice
          ? "Saved. Defaults applied to all existing clients."
          : "Saved. Existing clients unchanged.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <section className="rounded-xl border border-border/60 bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      </section>
    );
  }

  const readOnly = !isAdmin;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card p-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <SettingsIcon className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h2 className="text-base font-semibold">Global defaults</h2>
            <p className="text-xs text-muted-foreground">
              Used when creating new clients. Existing client values are preserved unless
              you choose to apply on save.
            </p>
          </div>
        </div>
        {readOnly && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-muted text-muted-foreground">
            <Lock className="h-3 w-3" /> Read only
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {info && <p className="text-sm text-green-600">{info}</p>}

      <Section title="Swap fees">
        <Field label="Default long / buy annual rate %">
          <Input
            type="number"
            step="0.01"
            disabled={readOnly}
            value={settings.default_long_annual_rate}
            onChange={(e) =>
              patch("default_long_annual_rate", Number(e.target.value))
            }
          />
        </Field>
        <Field label="Default short / sell annual benefit %">
          <Input
            type="number"
            step="0.01"
            disabled={readOnly}
            value={settings.default_short_annual_rate}
            onChange={(e) =>
              patch("default_short_annual_rate", Number(e.target.value))
            }
          />
        </Field>
        <Field label="Wednesday multiplier (×)">
          <Input
            type="number"
            step="0.5"
            disabled={readOnly}
            value={settings.wednesday_multiplier}
            onChange={(e) => patch("wednesday_multiplier", Number(e.target.value))}
          />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Weekend charging</Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={settings.skip_saturday}
              onChange={(e) => patch("skip_saturday", e.target.checked)}
            />
            No Saturday fee
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={settings.skip_sunday}
              onChange={(e) => patch("skip_sunday", e.target.checked)}
            />
            No Sunday fee
          </label>
        </div>
      </Section>

      <Section title="Margin">
        <Field label="Default margin requirement %">
          <Input
            type="number"
            step="0.1"
            disabled={readOnly}
            value={settings.default_margin_requirement_pct}
            onChange={(e) =>
              patch("default_margin_requirement_pct", Number(e.target.value))
            }
          />
        </Field>
        <Field label="Safe threshold % (margin level ≥)">
          <Input
            type="number"
            step="1"
            disabled={readOnly}
            value={settings.safe_threshold_pct}
            onChange={(e) => patch("safe_threshold_pct", Number(e.target.value))}
          />
        </Field>
        <Field label="Warning threshold % (margin level ≥)">
          <Input
            type="number"
            step="1"
            disabled={readOnly}
            value={settings.warning_threshold_pct}
            onChange={(e) => patch("warning_threshold_pct", Number(e.target.value))}
          />
        </Field>
        <Field
          label="Critical"
          hint="Always when equity falls below 0 (not configurable)."
        >
          <Input value="Equity < 0" disabled />
        </Field>
      </Section>

      <Section title="Gold price (XAUUSD)">
        <Field label="API provider">
          <Input
            disabled={readOnly}
            value={settings.xau_api_provider ?? ""}
            onChange={(e) => patch("xau_api_provider", e.target.value)}
            placeholder="e.g. goldapi.io"
          />
        </Field>
        <Field
          label="API key"
          hint={readOnly ? "Hidden for staff users." : undefined}
        >
          <Input
            type="password"
            disabled={readOnly}
            value={settings.xau_api_key ?? ""}
            onChange={(e) => patch("xau_api_key", e.target.value)}
            placeholder="Paste API key"
          />
        </Field>
        <Field label="Auto-refresh interval (seconds)">
          <Input
            type="number"
            step="1"
            disabled={readOnly}
            value={settings.xau_auto_refresh_seconds}
            onChange={(e) =>
              patch("xau_auto_refresh_seconds", Number(e.target.value))
            }
          />
        </Field>
        <Field label="Manual fallback price (USD/oz)">
          <Input
            type="number"
            step="0.01"
            disabled={readOnly}
            value={settings.xau_manual_fallback_price ?? ""}
            onChange={(e) =>
              patch(
                "xau_manual_fallback_price",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            placeholder="Optional"
          />
        </Field>
      </Section>

      <Section title="Reports">
        <Field label="Company name">
          <Input
            disabled={readOnly}
            value={settings.company_name}
            onChange={(e) => patch("company_name", e.target.value)}
          />
        </Field>
        <Field label="Default report format">
          <select
            disabled={readOnly}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={settings.default_report_format}
            onChange={(e) =>
              patch(
                "default_report_format",
                e.target.value as SwapSettings["default_report_format"],
              )
            }
          >
            <option value="PNG">PNG</option>
            <option value="PDF">PDF</option>
          </select>
        </Field>
        <Field label="Confidentiality text">
          <Input
            disabled={readOnly}
            value={settings.confidentiality_text}
            onChange={(e) => patch("confidentiality_text", e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Report footer text">
            <Input
              disabled={readOnly}
              value={settings.report_footer_text ?? ""}
              onChange={(e) => patch("report_footer_text", e.target.value)}
              placeholder="Shown at the bottom of generated reports"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={settings.show_logo_on_reports}
              onChange={(e) => patch("show_logo_on_reports", e.target.checked)}
            />
            Show logo on reports
          </label>
        </div>
      </Section>

      {isAdmin && (
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </form>
  );
}
