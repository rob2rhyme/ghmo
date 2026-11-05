import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/src/lib/admin";
import { envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { countTasks } from "@/src/lib/eventTasks";
import { listTasksForGroup, readEventInfo } from "@/src/lib/eventTasks.server";
import { POSITION_TIME_ZONE, todayIn } from "@/src/lib/positions";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Every task given to a group, across events, each with its event's title (plan §15, 11-B). Any admin may read. */
export async function GET(req: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { groupId } = await context.params;
    if (!ID.test(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const tasks = await listTasksForGroup(groupId);
    const events = new Map<string, { title: string; day: string | null }>();
    for (const eventId of new Set(tasks.map(task => task.eventId))) {
      const info = await readEventInfo(eventId);
      if (info) events.set(eventId, { title: info.title, day: info.day });
    }
    const today = todayIn(new Date(), POSITION_TIME_ZONE);
    return NextResponse.json({
      today,
      counts: countTasks(tasks, today),
      tasks: tasks.map(task => ({ ...task, eventTitle: events.get(task.eventId)?.title ?? "Deleted event", eventDay: events.get(task.eventId)?.day ?? null }))
    });
  } catch (error) {
    return routeError(error);
  }
}
