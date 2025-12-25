import { NextRequest, NextResponse } from "next/server";
import { assertMember } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { eventsCollectionPath, ensureOrgSlug, normalizeEvent, DEFAULT_TIMEZONE } from "@/src/lib/events";
import { pdf, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string; eventId: string } }) {
  if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const member = await assertMember(req);
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const primaryRef = adminDb.collection(eventsCollectionPath(params.orgSlug)).doc(params.eventId);
  const primarySnap = await primaryRef.get();
  const fallbackSnap = primarySnap.exists
    ? null
    : await adminDb.collection(`community/${COMMUNITY_ID}/events`).doc(params.eventId).get();
  const docSnap = primarySnap.exists ? primarySnap : fallbackSnap;
  if (!docSnap?.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const event = normalizeEvent(docSnap);
  if (event.status !== "published") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderEventPdf(event);
  const fileName = `${event.title || "Event"} Announcement.pdf`;
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`
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

  const starts =
    event.startsAt && new Date(event.startsAt.toDate?.() || event.startsAt).toLocaleString("en-US", { timeZone: event.timezone || DEFAULT_TIMEZONE });
  const ends =
    event.endsAt && new Date(event.endsAt.toDate?.() || event.endsAt).toLocaleString("en-US", { timeZone: event.timezone || DEFAULT_TIMEZONE });

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
            {starts ? starts : "TBD"}
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

  const buffer = (await pdf(doc).toBuffer()) as unknown as Uint8Array;
  return buffer;
}
