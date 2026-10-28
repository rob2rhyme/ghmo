import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/src/lib/security/clientIp";
import { suppressByEmail } from "@/src/lib/memberSuppression.server";
import { verifySvixSignature } from "@/src/lib/svix";

export const dynamic = "force-dynamic";

const ROUTE = "/api/resend/webhook";
const MAX_BODY_BYTES = 64 * 1024;

const eventSchema = z.object({
  type: z.string().max(64),
  data: z
    .object({
      to: z.array(z.string().max(320)).max(50).optional(),
      bounce: z.object({ type: z.string().max(32).optional() }).passthrough().optional()
    })
    .passthrough()
});

/**
 * Resend tells us when a message bounced or was reported as spam. Hard bounces mark the member's
 * address as bounced and complaints opt the member out, so they are skipped from then on (plan §10.3).
 * Requests are checked against the Svix signature with RESEND_WEBHOOK_SECRET; without that secret the
 * route does not exist. The response never says which member was affected.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const valid = verifySvixSignature({
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
    body,
    secret
  });
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { type, data } = parsed.data;
  const meta = { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent"), route: ROUTE };
  const recipients = data.to ?? [];

  if (type === "email.complained") {
    for (const address of recipients) await suppressByEmail(address, "spam_complaint", meta);
  } else if (type === "email.bounced" && data.bounce?.type?.toLowerCase() !== "transient") {
    // Temporary ("transient") bounces, such as a full inbox, are not a reason to stop.
    for (const address of recipients) await suppressByEmail(address, "bounce", meta);
  }
  return NextResponse.json({ ok: true });
}
