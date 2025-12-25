import "server-only";

type TimestampLike = { toDate?: () => Date; toMillis?: () => number };

function isTimestampLike(value: any): value is TimestampLike {
  return value && typeof value === "object" && (typeof value.toDate === "function" || typeof value.toMillis === "function");
}

export function toPlain<T>(value: T): any {
  if (value === null) return null;
  if (value === undefined) return undefined;

  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return value;

  if (value instanceof Date) return value.getTime();

  if (isTimestampLike(value)) {
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
  }

  if (Array.isArray(value)) {
    return value.map(item => toPlain(item)).filter(v => v !== undefined);
  }

  if (type === "object") {
    const plain: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      const mapped = toPlain(v);
      if (mapped !== undefined) plain[k] = mapped;
    }
    return plain;
  }

  return undefined;
}
