import { useEffect, useState } from "react";
import { getMyPermissions } from "@/lib/permissions.functions";
import { cached, CK } from "@/lib/swap-cache";
import type { CurrentUserPermissions } from "@/lib/permissions";

export function useMyPermissions() {
  const [perms, setPerms] = useState<CurrentUserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    cached(CK.myPerms, () => getMyPermissions(), 60_000)
      .then((r) => {
        if (!cancelled) setPerms(r as CurrentUserPermissions);
      })
      .catch(() => {
        if (!cancelled) setPerms({ isAdmin: false, permissions: {} });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { perms, loading };
}
