/** A small fetch helper for the Positions and Groups pages: JSON in and out, and the server's own words on a failure. */
export async function peopleApi<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body)
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

export const errorMessage = (error: unknown, fallback = "Something went wrong. Try again.") => (error instanceof Error ? error.message : fallback);

export type MemberLite = { id: string; name?: string | null; emailLower: string; status: "active" | "disabled"; groupIds?: string[] };
