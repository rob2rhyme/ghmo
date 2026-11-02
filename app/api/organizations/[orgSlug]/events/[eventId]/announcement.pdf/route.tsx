import { NextRequest, NextResponse } from "next/server";
import { assertMember } from "@/src/lib/auth";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";
import { eventsCollectionPath, ensureOrgSlug, normalizeEvent, DEFAULT_TIMEZONE } from "@/src/lib/events";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { formatDateTime, type DateInput } from "@/src/lib/format";
import { isValidTimeZone } from "@/src/lib/zonedTime";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const member = await assertMember(req);
    if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getAdminDb();
    const primaryRef = db.collection(eventsCollectionPath(params.orgSlug)).doc(params.eventId);
    const primarySnap = await primaryRef.get();
    const fallbackSnap = primarySnap.exists
      ? null
      : await db.collection(`community/${COMMUNITY_ID}/events`).doc(params.eventId).get();
    const docSnap = primarySnap.exists ? primarySnap : fallbackSnap;
    if (!docSnap?.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const event = normalizeEvent(docSnap);
    if (event.status !== "published") return NextResponse.json({ error: "Not found" }, { status: 404 });

    const buffer = await renderEventPdf(event);
    const fileName = `${event.title || "Event"} Announcement.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`
      }
    });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
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
