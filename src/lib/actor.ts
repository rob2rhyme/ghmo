export type ActorLike =
  | string
  | {
      name?: string | null;
      roles?: string[] | null;
      role?: string | null;
      type?: string | null;
      email?: string | null;
      uid?: string | null;
      actor?: unknown;
    }
  | null
  | undefined;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  super_admin: "Super admin",
  developer: "Developer",
  member: "Member",
  system: "System"
};

function isEmail(value: string) {
  return value.includes("@");
}

export function humanizeRole(role?: string | null) {
  if (!role) return "";
  const normalized = role.toLowerCase();
  if (ROLE_LABELS[normalized]) return ROLE_LABELS[normalized];
  return normalized
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function resolveRoleLabel(actor: Exclude<ActorLike, string | null | undefined>) {
  const roles = Array.isArray(actor.roles) ? actor.roles : null;
  const role = roles?.[0] || actor.role || actor.type || undefined;
  return humanizeRole(role);
}

export function resolveActorName(actorLike: ActorLike) {
  if (!actorLike) return "Admin";
  if (typeof actorLike === "string") {
    return isEmail(actorLike) ? "Admin" : actorLike;
  }
  if (actorLike.actor && typeof actorLike.actor === "object") {
    return resolveActorName(actorLike.actor as ActorLike);
  }
  const name = actorLike.name?.trim();
  if (name && !isEmail(name)) return name;
  const roleLabel = resolveRoleLabel(actorLike);
  if (roleLabel) return roleLabel;
  return "Admin";
}

export function resolveActorLabel(actorLike: ActorLike) {
  const name = resolveActorName(actorLike);
  if (!actorLike || typeof actorLike === "string") return name;
  const roleLabel = resolveRoleLabel(actorLike);
  if (!roleLabel || roleLabel === name) return name;
  return `${name} (${roleLabel})`;
}
