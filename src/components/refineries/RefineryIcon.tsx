import {
  Factory, Building2, Building, Warehouse, Landmark, Store,
  Gem, Diamond, Coins, Scale, Flame, Hammer, Wrench, Cog,
  Shield, Star, Crown, Sparkles, Sun, Moon, Mountain, Trophy,
  type LucideIcon,
} from "lucide-react";

export const REFINERY_ICON_MAP: Record<string, LucideIcon> = {
  factory: Factory, building2: Building2, building: Building, warehouse: Warehouse,
  landmark: Landmark, store: Store, gem: Gem, diamond: Diamond, coins: Coins,
  scale: Scale, flame: Flame, hammer: Hammer, wrench: Wrench, cog: Cog,
  shield: Shield, star: Star, crown: Crown, sparkles: Sparkles, sun: Sun,
  moon: Moon, mountain: Mountain, trophy: Trophy,
};

export const REFINERY_ICON_KEYS = Object.keys(REFINERY_ICON_MAP);

export function RefineryIcon({
  name, iconColor, badgeColor, size = 20, className,
}: {
  name?: string | null;
  iconColor?: string | null;
  badgeColor?: string | null;
  size?: number;
  className?: string;
}) {
  const Icon = REFINERY_ICON_MAP[name ?? "factory"] ?? Factory;
  const padding = Math.max(6, Math.round(size * 0.45));
  return (
    <div
      className={`inline-flex items-center justify-center rounded-md border ${className ?? ""}`}
      style={{
        background: badgeColor ?? "#fef3c7",
        borderColor: iconColor ?? "#f59e0b",
        padding,
      }}
    >
      <Icon size={size} color={iconColor ?? "#f59e0b"} strokeWidth={2} />
    </div>
  );
}

export const REFINERY_COLOR_PRESETS: Array<{ name: string; icon: string; badge: string }> = [
  { name: "Amber", icon: "#f59e0b", badge: "#fef3c7" },
  { name: "Orange", icon: "#f97316", badge: "#fed7aa" },
  { name: "Red", icon: "#ef4444", badge: "#fecaca" },
  { name: "Rose", icon: "#f43f5e", badge: "#fecdd3" },
  { name: "Pink", icon: "#ec4899", badge: "#fbcfe8" },
  { name: "Violet", icon: "#8b5cf6", badge: "#ddd6fe" },
  { name: "Indigo", icon: "#6366f1", badge: "#c7d2fe" },
  { name: "Blue", icon: "#3b82f6", badge: "#bfdbfe" },
  { name: "Sky", icon: "#0ea5e9", badge: "#bae6fd" },
  { name: "Teal", icon: "#14b8a6", badge: "#99f6e4" },
  { name: "Emerald", icon: "#10b981", badge: "#a7f3d0" },
  { name: "Green", icon: "#22c55e", badge: "#bbf7d0" },
  { name: "Lime", icon: "#84cc16", badge: "#d9f99d" },
  { name: "Slate", icon: "#475569", badge: "#e2e8f0" },
  { name: "Stone", icon: "#78716c", badge: "#e7e5e4" },
];
