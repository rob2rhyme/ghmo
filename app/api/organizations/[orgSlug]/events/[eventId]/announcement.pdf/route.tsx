import { NextRequest, NextResponse } from "next/server";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { getAppOrigin } from "@/src/lib/appUrl";
import { COMMUNITY_NAME } from "@/src/lib/community";
import { ensureOrgSlug } from "@/src/lib/events";
import { getPublishedEvent } from "@/src/lib/publicData.server";
import { attachmentDisposition, flyerAsciiFileName, flyerContent, flyerFileName, type FlyerContent } from "./flyer";

export const dynamic = "force-dynamic";

/** Plain text for anyone who opens the link in a browser (never raw JSON on a public link). */
const plain = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * The flyer for a published event, as a PDF. Public, like the event page: it only ever covers published
 * events (decision 2026-11-03). The CDN keeps a copy for a minute, so pdf rendering doesn't rerun on every
 * download; an unpublished event's flyer stops being served within that minute.
 *
 * Freshness (R4 P9): the event comes from the cached public loader. Admin saves expire it at once; a change made
 * in the Firebase console shows one request after the cache's 5 minutes run out (unstable_cache serves the old
 * copy while it refreshes).
 */
export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const params = await context.params;
  if (!ensureOrgSlug(params.orgSlug)) return plain("This event isn't available.", 404);
  const event = await getPublishedEvent(params.eventId);
  if (event === undefined) return plain("The flyer can't be made right now. Try again in a few minutes.", 503);
  if (!event) return plain("This event isn't available. It may have been removed, or it hasn't been announced yet.", 404);

  // The footer points to the event page on the configured site address, never the request's Host (the CDN keeps
  // this file). Without a configured address the flyer is still made, just without the link.
  let origin: string | null = null;
  try {
    origin = getAppOrigin(req);
  } catch (error) {
    console.error("Flyer without a site address:", error instanceof Error ? error.message : String(error));
  }

  const buffer = await renderEventPdf(flyerContent(event, origin));
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // Any title works: an ASCII fallback plus the real name in filename* (R4 S2).
      "Content-Disposition": attachmentDisposition(flyerFileName(event.title), flyerAsciiFileName(event.title)),
      "Cache-Control": "public, s-maxage=60"
    }
  });
}

const TEAL = "#0f766e";
const MUTED = "#52525b";

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingHorizontal: 56, paddingBottom: 96, fontSize: 12, fontFamily: "Helvetica", color: "#18181b", lineHeight: 1.4 },
  header: { borderBottomWidth: 2, borderBottomColor: TEAL, paddingBottom: 10, marginBottom: 28 },
  org: { fontSize: 14, fontFamily: "Helvetica-Bold", color: TEAL },
  orgLine: { fontSize: 10, color: MUTED, marginTop: 2 },
  title: { fontSize: 28, fontFamily: "Helvetica-Bold", lineHeight: 1.2, marginBottom: 10 },
  summary: { fontSize: 14, color: "#3f3f46", marginBottom: 6 },
  section: { marginTop: 18 },
  label: { fontSize: 10, fontFamily: "Helvetica-Bold", color: TEAL, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  value: { fontSize: 14 },
  details: { fontSize: 12 },
  footer: { position: "absolute", left: 56, right: 56, bottom: 40, borderTopWidth: 1, borderTopColor: "#d4d4d8", paddingTop: 8, fontSize: 10, color: MUTED }
});

/** US Letter, one page: GHMO header, the title and summary, When and Where, the details if any, and the event page link. */
async function renderEventPdf(content: FlyerContent): Promise<Uint8Array> {
  const doc = (
    <Document title={`${content.title} flyer`} author={COMMUNITY_NAME}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.org}>{COMMUNITY_NAME}</Text>
          <Text style={styles.orgLine}>Harrisburg, Pennsylvania</Text>
        </View>

        <Text style={styles.title}>{content.title}</Text>
        {content.summary ? <Text style={styles.summary}>{content.summary}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.label}>When</Text>
          {content.when ? (
            <>
              <Text style={styles.value}>{content.when.date}</Text>
              <Text style={styles.value}>{content.when.time}</Text>
            </>
          ) : (
            <Text style={styles.value}>Date to be announced</Text>
          )}
        </View>

        {content.where ? (
          <View style={styles.section}>
            <Text style={styles.label}>Where</Text>
            <Text style={styles.value}>{content.where}</Text>
          </View>
        ) : null}

        {content.details ? (
          <View style={styles.section}>
            <Text style={styles.label}>Details</Text>
            <Text style={styles.details}>{content.details}</Text>
          </View>
        ) : null}

        {content.pageUrl ? (
          <View style={styles.footer} fixed>
            <Text>Details and updates: {content.pageUrl}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
