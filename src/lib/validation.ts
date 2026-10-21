import { NextResponse } from "next/server";
import type { z } from "zod";

/** Default cap for JSON request bodies. Routes that accept images pass a larger limit. */
export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/**
 * Reads and validates a JSON request body with a Zod schema (plan S-15).
 * Rejects bodies over `maxBytes`, invalid JSON and schema violations with a 4xx
 * response that never echoes the input back.
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
  options: { maxBytes?: number } = {}
): Promise<ParsedBody<z.infer<S>>> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return { ok: false, response: NextResponse.json({ error: "Request too large" }, { status: 413 }) };
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid request body" }, { status: 400 }) };
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, response: NextResponse.json({ error: "Request too large" }, { status: 413 }) };
  }

  let json: unknown;
  try {
    json = text.length ? JSON.parse(text) : {};
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join(".") || "(body)"))].slice(0, 10);
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid request", fields }, { status: 400 })
    };
  }
  return { ok: true, data: result.data };
}
