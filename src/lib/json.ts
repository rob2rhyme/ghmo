import "server-only";

type TimestampLike = { toDate?: () => Date; toMillis?: () => number };

function isTimestampLike(value: any): value is TimestampLike {
  return value && typeof value === "object" && (typeof value.toDate === "function" || typeof value.toMillis === "function");
}

export function toPlainJson<T>(value: T): any {
  if (value === null || value === undefined) return value;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Date) return value.toISOString();

  if (isTimestampLike(value)) {
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (typeof value.toMillis === "function") return value.toMillis();
  }

  if (Array.isArray(value)) return value.map(item => toPlainJson(item));

  if (typeof value === "object") {
    const plainObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(value as Record<string, any>)) {
      plainObj[key] = toPlainJson(val);
    }
    return plainObj;
  }

  return value;
}
