//app/(admin)/admin/minutes/page.tsx
import { MeetingMinutesRecord } from "@/src/lib/minutes";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { toPlain } from "@/src/lib/serialize.server";
import { redirect } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import MinutesEditorClient from "@/src/components/admin/minutes/MinutesEditorClient";
import MinutesRecordsClient from "@/src/components/admin/minutes/MinutesRecordsClient";
import { cn } from "@/src/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminMinutesPageProps = {
  searchParams?: Promise<{ mode?: string }>;
};

export default async function AdminMinutesPage({ searchParams }: AdminMinutesPageProps) {
  const { mode: modeParam } = (await searchParams) ?? {};
  let actorInfo: Awaited<ReturnType<typeof requireActiveAdmin>>["actor"] | null = null;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/minutes`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  const minutesRes = await internalFetch(`/api/admin/minutes`);
  if (!minutesRes.ok) {
    const body = await minutesRes.text().catch(() => "");
    throw new Error(`Failed to load minutes (${minutesRes.status}): ${body}`);
  }
  const data = await minutesRes.json();
  const minutes = toPlain(data.minutes ?? []) as MeetingMinutesRecord[];

  const mode = modeParam === "records" ? "records" : "new";

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Meeting Minutes"
        description="Write up each meeting, have another admin approve it, then download or publish it."
      />

      <MinutesTabs mode={mode} />

      <EncryptionGate what="Meeting Minutes">
        {mode === "records" ? (
          <MinutesRecordsClient initialMinutes={minutes} />
        ) : (
          <MinutesEditorClient minutes={minutes} adminActor={toPlain(actorInfo)} />
        )}
      </EncryptionGate>
    </div>
  );
}

const TABS = [
  { mode: "new", label: "Write minutes", href: "/admin/minutes?mode=new" },
  // "Records" is the name the browser tests click; keep it in step with tests/e2e-auth.
  { mode: "records", label: "Records", href: "/admin/minutes?mode=records" }
] as const;

/** One tab bar for the two views. Links (not buttons) so each view has its own address. */
function MinutesTabs({ mode }: { mode: "new" | "records" }) {
  return (
    <nav aria-label="Minutes views" className="flex min-w-0">
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/60 p-1">
        {TABS.map(tab => {
          const selected = tab.mode === mode;
          return (
            <Link
              key={tab.mode}
              href={tab.href}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-card text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
