import "server-only";
import { COMMUNITY_SLUG } from "./community";
import { fail, type Failure } from "./adminRoute.server";
import { normalizeBroadcastContent } from "./broadcast";
import { hashBroadcast } from "./broadcastHash";
import { eventCopyFields, taskCopyFields } from "./copies";
import { listTasksForEvent } from "./eventTasks.server";
import { findEventDoc, primaryEventsPath } from "./events";
import { getAdminDb } from "./firebaseAdmin";
import { orgBroadcastsCollectionPath, orgEventTasksCollectionPath, orgGroupsCollectionPath } from "./firestorePaths";

const db = () => getAdminDb();

/** Copies an event as a new draft (D88), and its tasks when asked (D89). */
export async function copyEvent(input: { eventId: string; withTasks: boolean; actorUid: string; now: Date }): Promise<{ ok: true; id: string; title: string; sourceTitle: string; tasks: number } | Failure> {
  const source = await findEventDoc(db(), input.eventId);
  if (!source?.exists) return fail(404, "That event doesn't exist.");
  const data = source.data() ?? {};
  const fields = eventCopyFields(data);
  const ref = db().collection(primaryEventsPath()).doc();
  const batch = db().batch();
  batch.create(ref, { ...fields, copiedFrom: input.eventId, createdAt: input.now, updatedAt: input.now, createdByUid: input.actorUid });
  let tasks = 0;
  if (input.withTasks) {
    const sourceTasks = await listTasksForEvent(input.eventId);
    // A group that was deleted or switched off since is left off the copied task, as when applying a template.
    const groupIds = [...new Set(sourceTasks.map(task => task.groupId).filter((id): id is string => Boolean(id)))];
    const groupSnaps = groupIds.length ? await db().getAll(...groupIds.map(id => db().collection(orgGroupsCollectionPath(COMMUNITY_SLUG)).doc(id))) : [];
    const usable = new Set(groupSnaps.filter(snap => snap.exists && snap.get("active") !== false).map(snap => snap.id));
    for (const task of sourceTasks.slice(0, 400)) {
      batch.create(db().collection(orgEventTasksCollectionPath(COMMUNITY_SLUG)).doc(), {
        eventId: ref.id,
        ...taskCopyFields(task, usable),
        createdBy: input.actorUid,
        createdAt: input.now,
        updatedAt: input.now
      });
      tasks += 1;
    }
  }
  await batch.commit();
  return { ok: true, id: ref.id, title: String(fields.title), sourceTitle: String(data.title ?? "an event"), tasks };
}

/** Copies a broadcast, in any state, as a new draft that needs approval again (D90). */
export async function copyBroadcast(input: { broadcastId: string; actorUid: string; actorName: string; now: Date }): Promise<{ ok: true; id: string; subject: string } | Failure> {
  const col = db().collection(orgBroadcastsCollectionPath(COMMUNITY_SLUG));
  const source = await col.doc(input.broadcastId).get();
  if (!source.exists) return fail(404, "That broadcast doesn't exist.");
  const data = source.data() ?? {};
  const checked = normalizeBroadcastContent({ subject: data.subject, body: data.body });
  if (!checked.ok) return fail(400, checked.error);
  const ref = col.doc();
  await ref.create({
    ...checked.content,
    audience: data.audience ?? "all",
    status: "draft",
    contentHash: hashBroadcast(checked.content),
    copiedFrom: input.broadcastId,
    createdByUid: input.actorUid,
    createdByName: input.actorName,
    createdAt: input.now,
    updatedAt: input.now
  });
  return { ok: true, id: ref.id, subject: checked.content.subject };
}
