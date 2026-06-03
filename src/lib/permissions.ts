// Shared module + permission constants for the unified Ather platform.

export const MODULES = [
  "purity",
  "margin",
  "swap",
  "premium",
  "reports",
  "audit",
  "users",
  "settings",
] as const;

export type AppModule = (typeof MODULES)[number];

export const MODULE_LABELS: Record<AppModule, string> = {
  purity: "Purity",
  margin: "Margin",
  swap: "Swap",
  premium: "Discount / Premium",
  reports: "Reports",
  audit: "Audit Log",
  users: "Users",
  settings: "Settings",
};

export const ACTIONS = ["view", "create", "edit", "delete", "export", "share"] as const;
export type Action = (typeof ACTIONS)[number];

export type ModulePerm = {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_share: boolean;
};

export type PermissionMap = Partial<Record<AppModule, ModulePerm>>;

export type CurrentUserPermissions = {
  isAdmin: boolean;
  permissions: PermissionMap;
};

const EMPTY: ModulePerm = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_export: false,
  can_share: false,
};

const FULL: ModulePerm = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
  can_export: true,
  can_share: true,
};

export function can(
  perms: CurrentUserPermissions | null | undefined,
  module: AppModule,
  action: Action,
): boolean {
  if (!perms) return false;
  if (perms.isAdmin) return true;
  const row = perms.permissions[module] ?? EMPTY;
  switch (action) {
    case "view":
      return row.can_view;
    case "create":
      return row.can_create;
    case "edit":
      return row.can_edit;
    case "delete":
      return row.can_delete;
    case "export":
      return row.can_export;
    case "share":
      return row.can_share;
  }
}

export function fullPerm(): ModulePerm {
  return { ...FULL };
}
export function emptyPerm(): ModulePerm {
  return { ...EMPTY };
}
