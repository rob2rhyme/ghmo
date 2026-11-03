import type { Metadata } from "next";
import { getContactEmail } from "@/src/lib/contact";
import EventsClient from "./EventsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events · GHMO" };

export default function EventsPage() {
  return <EventsClient contactEmail={getContactEmail()} />;
}
