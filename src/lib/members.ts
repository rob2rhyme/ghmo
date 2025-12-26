export type MemberStatus = "active" | "disabled";

export function isMemberStatus(value?: string): value is MemberStatus {
  return value === "active" || value === "disabled";
}

export function normalizeMemberEmail(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

export function normalizeMemberName(value?: string | null) {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function sanitizeMemberRoles(value?: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const roles: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    roles.push(trimmed);
  }
  return roles;
}
