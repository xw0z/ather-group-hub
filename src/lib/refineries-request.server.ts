import { getRequestHeader } from "@tanstack/react-start/server";

export function getRequestMeta(): { ip: string | null; ua: string | null } {
  try {
    const ip = (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
    const ua = getRequestHeader("user-agent") ?? null;
    return { ip, ua };
  } catch {
    return { ip: null, ua: null };
  }
}
