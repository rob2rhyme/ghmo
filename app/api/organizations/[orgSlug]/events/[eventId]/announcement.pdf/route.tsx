import { NextRequest, NextResponse } from "next/server";
import { ensureOrgSlug, DEFAULT_TIMEZONE } from "@/src/lib/events";
import { getPublishedEvent } from "@/src/lib/publicData.server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatDateTime, type DateInput } from "@/src/lib/format";
import { isValidTimeZone } from "@/src/lib/zonedTime";

export const dynamic = "force-dynamic";

/** Plain text for anyone who opens the link in a browser (never raw JSON on a public link). */
const plain = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * The flyer for a published event, as a PDF. Public, like the event page: it only ever covers published
 * events (decision 2026-11-03). The CDN keeps a copy for a minute, so pdf rendering doesn't rerun on every
 * download; an unpublished event's flyer stops being served within that minute.
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const params = await context.params;
  if (!ensureOrgSlug(params.orgSlug)) return plain("This event isn't available.", 404);
  const event = await getPublishedEvent(params.eventId);
  if (event === undefined) return plain("The flyer can't be made right now. Try again in a few minutes.", 503);
  if (!event) return plain("This event isn't available. It may have been removed, or it hasn't been announced yet.", 404);

  const buffer = await renderEventPdf(event);
  const fileName = `${event.title || "Event"} Announcement.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
      "Cache-Control": "public, s-maxage=60"
    }
  });
}

async function renderEventPdf(event: any): Promise<Uint8Array> {
  const styles = StyleSheet.create({
    page: { padding: 32, fontSize: 12, fontFamily: "Helvetica" },
    title: { fontSize: 20, marginBottom: 8 },
    section: { marginTop: 10 },
    label: { fontWeight: "bold" }
  });

  // Friendly dates in the event's own zone, without seconds ("Sat, Dec 12, 2026 · 7:00 PM").
  const timeZone = isValidTimeZone(event.timezone) ? event.timezone : DEFAULT_TIMEZONE;
  const starts = formatDateTime(event.startsAt as DateInput, { timeZone }) || null;
  const ends = formatDateTime(event.endsAt as DateInput, { timeZone }) || null;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{event.title}</Text>
        {event.summary ? (
          <View style={styles.section}>
            <Text>{event.summary}</Text>
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.label}>Date/Time:</Text>
          <Text>
            {starts ? starts : "Date to be announced"}
            {ends ? ` - ${ends}` : ""}
          </Text>
        </View>
        {event.location ? (
          <View style={styles.section}>
            <Text style={styles.label}>Location:</Text>
            <Text>{event.location}</Text>
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.label}>Details:</Text>
          <Text>{event.body || ""}</Text>
        </View>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);
  return buffer;
}
