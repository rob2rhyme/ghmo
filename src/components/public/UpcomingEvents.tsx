import "server-only";

import { PublicSectionTitle } from "@/src/components/public/PublicPage";
import { UpcomingEventsList } from "@/src/components/public/UpcomingEventsList";
import { nextEvents } from "@/src/components/public/events/eventDates";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { cachedPageData } from "@/src/lib/publicCache.server";
import { getPublishedEventCards } from "@/src/lib/publicData.server";

/**
 * Spare events sent beyond `limit`: the page is cached, so events that end between the build and a visit drop
 * off in the browser and the next ones take their place.
 */
const SPARE_EVENTS = 3;

/** Home page "Next events": up to three published upcoming events, as the same cards as the Events page. */
export async function UpcomingEvents({ limit = 3 }: { limit?: number }) {
  const events = cachedPageData(await getPublishedEventCards(), "Upcoming events");
  // eslint-disable-next-line react-hooks/purity -- when this cached copy was built; the browser switches to its own clock (useNow)
  const renderedAt = Date.now();
  // An event still ahead in the browser is also ahead at build time, so filtering here only drops what is surely over.
  const candidates = events ? nextEvents(events, renderedAt, limit + SPARE_EVENTS) : null;

  return (
    <section aria-labelledby="home-events" className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <PublicSectionTitle id="home-events">Next events</PublicSectionTitle>
        <p className="text-base text-muted-foreground">Come and join us. Everyone is welcome.</p>
      </div>
      <UpcomingEventsList orgSlug={COMMUNITY_SLUG} events={candidates} limit={limit} renderedAt={renderedAt} />
    </section>
  );
}
