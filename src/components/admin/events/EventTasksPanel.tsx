"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { toast } from "sonner";
import { ClipboardList, LayoutTemplate, Pencil, Plus, Save } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { errorMessage, peopleApi, type MemberLite } from "@/src/components/admin/people/api";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { MAX_ASSIGNEES, TASK_NOTES_MAX, TASK_TITLE_MAX, TEMPLATE_NAME_MAX, isOverdue, type EventTask, type TaskCounts, type TaskTemplate } from "@/src/lib/eventTasks";
import { formatShortDate } from "@/src/lib/format";
import { memberDisplayName } from "@/src/lib/members";

type GroupLite = { id: string; name: string; active: boolean };
type TasksResponse = { tasks: EventTask[]; today: string; counts: TaskCounts; eventDay: string | null };

const base = (eventId: string) => `/api/admin/organizations/ghmo/events/${encodeURIComponent(eventId)}/tasks`;
export const dueLabel = (dueOn: string) => formatShortDate(dueOn, { timeZone: "UTC" });

/** The task checklist on an event's edit page. Every change saves at once, separately from the event form above. */
export default function EventTasksPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<TasksResponse | null>(null);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventTask | "new" | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<EventTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        peopleApi<TasksResponse>(base(eventId)),
        peopleApi<{ groups: GroupLite[] }>("/api/admin/groups"),
        peopleApi<{ members: MemberLite[] }>("/api/organizations/ghmo/members"),
        peopleApi<{ templates: TaskTemplate[] }>("/api/admin/task-templates")
      ])
        .then(([tasks, group, people, template]) => {
          setData(tasks);
          setGroups(group.groups);
          setMembers(people.members);
          setTemplates(template.templates);
          setError(null);
        })
        .catch((err: unknown) => setError(errorMessage(err, "Could not load the tasks"))),
    [eventId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const groupName = useMemo(() => {
    const byId = new Map(groups.map(g => [g.id, g.name]));
    return (id: string | null) => (id ? (byId.get(id) ?? "Removed group") : null);
  }, [groups]);
  const personName = useMemo(() => {
    const byId = new Map(members.map(m => [m.id, m]));
    return (id: string) => (byId.get(id) ? memberDisplayName(byId.get(id)!) : "Removed member");
  }, [members]);

  if (error && !data) {
    return (
      <AdminSectionCard title="Tasks" icon={<ClipboardList aria-hidden="true" />}>
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{error}</span>
            <Button variant="outline" size="row" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </AdminSectionCard>
    );
  }
  if (!data) return <Skeleton className="h-40 w-full" />;

  const { tasks, today, counts, eventDay } = data;

  const run = async (work: () => Promise<unknown>, message: string): Promise<boolean> => {
    try {
      await work();
      await load();
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };

  const toggle = async (task: EventTask) => {
    setBusyId(task.id);
    await run(() => peopleApi(`${base(eventId)}/${task.id}`, { method: "PATCH", body: { status: task.status === "done" ? "open" : "done" } }), task.status === "done" ? "Task reopened" : "Task done");
    setBusyId(null);
  };

  return (
    <AdminSectionCard
      title="Tasks"
      description={
        counts.total === 0
          ? "Who does what for this event. Changes here save as you go."
          : `${counts.done} of ${counts.total} done${counts.overdue ? `, ${counts.overdue} overdue` : ""}. Changes here save as you go.`
      }
      icon={<ClipboardList aria-hidden="true" />}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="row" onClick={() => setPicking(true)} disabled={templates.length === 0} title={templates.length === 0 ? "No templates yet. Save this event's tasks as one, or make one on the templates page." : undefined}>
            <LayoutTemplate aria-hidden="true" /> Use a template
          </Button>
          <Button variant="outline" size="row" onClick={() => setSaving(true)} disabled={tasks.length === 0}>
            <Save aria-hidden="true" /> Save as template
          </Button>
          <Button size="row" onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" /> Add task
          </Button>
        </div>
      }
    >
      {!eventDay ? (
        <Alert>
          <AlertDescription>This event has no date yet, so template tasks get no due dates. Set the date above, save, then use a template.</AlertDescription>
        </Alert>
      ) : null}
      {tasks.length === 0 ? (
        <EmptyState icon={<ClipboardList aria-hidden="true" />} title="No tasks yet" description="Add the jobs for this event, or start from a template such as General meeting." />
      ) : (
        <AdminList bare label="Tasks">
          {tasks.map(task => {
            const late = isOverdue(task, today);
            const people = task.memberIds.map(personName);
            return (
              <AdminListRow
                key={task.id}
                leading={
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={task.status === "done"}
                    disabled={busyId === task.id}
                    onChange={() => void toggle(task)}
                    aria-label={`${task.title} is done`}
                  />
                }
                title={<span className={task.status === "done" ? "text-muted-foreground line-through" : undefined}>{task.title}</span>}
                badges={
                  <>
                    {late ? <Badge variant="destructive">Overdue</Badge> : null}
                    {task.groupId ? <Badge variant="outline">{groupName(task.groupId)}</Badge> : null}
                  </>
                }
                meta={
                  <>
                    <span>
                      {task.dueOn ? `Due ${dueLabel(task.dueOn)}` : "No due date"}
                      {people.length ? ` · ${people.join(", ")}` : ""}
                    </span>
                    {task.notes ? <span className="mt-0.5 block whitespace-pre-line">{task.notes}</span> : null}
                  </>
                }
                actions={
                  <Button size="row" variant="outline" onClick={() => setEditing(task)} aria-label={`Edit ${task.title}`}>
                    <Pencil aria-hidden="true" /> Edit
                  </Button>
                }
              />
            );
          })}
        </AdminList>
      )}

      {editing ? (
        <TaskDialog
          task={editing === "new" ? null : editing}
          groups={groups}
          members={members}
          busy={busy}
          onClose={() => setEditing(null)}
          onDelete={editing === "new" ? undefined : () => setRemoving(editing)}
          onSave={async body => {
            setBusy(true);
            const ok = await run(
              () => (editing === "new" ? peopleApi(base(eventId), { method: "POST", body }) : peopleApi(`${base(eventId)}/${editing.id}`, { method: "PATCH", body })),
              editing === "new" ? "Task added" : "Task saved"
            );
            setBusy(false);
            if (ok) setEditing(null);
          }}
        />
      ) : null}
      {picking ? (
        <UseTemplateDialog
          templates={templates}
          eventDay={eventDay}
          busy={busy}
          onClose={() => setPicking(false)}
          onApply={async templateId => {
            setBusy(true);
            try {
              const result = await peopleApi<{ created: EventTask[]; skipped: number; undated: number }>(`${base(eventId)}/apply-template`, { method: "POST", body: { templateId } });
              await load();
              const parts = [`${result.created.length} ${result.created.length === 1 ? "task" : "tasks"} added`];
              if (result.skipped) parts.push(`${result.skipped} already there`);
              if (result.undated) parts.push(`${result.undated} without a due date`);
              toast.success(parts.join(", "));
              setPicking(false);
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {saving ? (
        <SaveTemplateDialog
          busy={busy}
          count={tasks.length}
          onClose={() => setSaving(false)}
          onSave={async name => {
            setBusy(true);
            const ok = await run(() => peopleApi("/api/admin/task-templates", { method: "POST", body: { name, fromEventId: eventId } }), "Template saved");
            setBusy(false);
            if (ok) setSaving(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={open => !open && setRemoving(null)}
        title="Remove this task?"
        description={removing ? `"${removing.title}" will be taken off this event.` : ""}
        confirmLabel="Remove task"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          const ok = await run(() => peopleApi(`${base(eventId)}/${removing.id}`, { method: "DELETE" }), "Task removed");
          setBusy(false);
          if (ok) {
            setRemoving(null);
            setEditing(null);
          }
        }}
      />
      <p className="text-sm text-muted-foreground">
        Templates are kept on the{" "}
        <Link href={"/admin/events/templates" as Route} className="underline underline-offset-4">
          task templates page
        </Link>
        .
      </p>
    </AdminSectionCard>
  );
}

function TaskDialog({
  task,
  groups,
  members,
  busy,
  onClose,
  onSave,
  onDelete
}: {
  task: EventTask | null;
  groups: GroupLite[];
  members: MemberLite[];
  busy: boolean;
  onClose: () => void;
  onSave: (body: { title: string; notes: string; groupId: string | null; memberIds: string[]; dueOn: string | null }) => Promise<void>;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [groupId, setGroupId] = useState(task?.groupId ?? "");
  const [dueOn, setDueOn] = useState(task?.dueOn ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(task?.memberIds ?? []));
  const [query, setQuery] = useState("");
  const choosable = groups.filter(g => g.active || g.id === task?.groupId);
  const needle = query.trim().toLowerCase();
  const people = members
    .filter(m => m.status === "active" || picked.has(m.id))
    .filter(m => picked.has(m.id) || !needle || memberDisplayName(m).toLowerCase().includes(needle))
    .sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)) || memberDisplayName(a).localeCompare(memberDisplayName(b)))
    .slice(0, 100);
  const toggle = (id: string) =>
    setPicked(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_ASSIGNEES) next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void onSave({ title, notes, groupId: groupId || null, memberIds: [...picked], dueOn: dueOn || null });
          }}
        >
          <DialogHeader>
            <DialogTitle>{task ? "Edit task" : "Add a task"}</DialogTitle>
            <DialogDescription>Give it to a group, to named people, or both.</DialogDescription>
          </DialogHeader>
          <Field label="Task">
            <Input value={title} maxLength={TASK_TITLE_MAX} onChange={e => setTitle(e.target.value)} placeholder="For example: Cook dal bhat for 60" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Group">
              <Select value={groupId} onChange={e => setGroupId(e.target.value)}>
                <option value="">No group</option>
                {choosable.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.active ? "" : " (switched off)"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due on (optional)">
              <Input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes (optional)" description="Keep notes about the work, not about people. Phone numbers belong on the member's contact card.">
            <Textarea value={notes} maxLength={TASK_NOTES_MAX} rows={3} onChange={e => setNotes(e.target.value)} />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">People ({picked.size} of {MAX_ASSIGNEES} at most)</legend>
            <Input aria-label="Search people" placeholder="Search by name or email" value={query} onChange={e => setQuery(e.target.value)} />
            <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {people.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No one matches.</li> : null}
              {people.map(member => (
                <li key={member.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={picked.has(member.id)} onChange={() => toggle(member.id)} />
                    <span className="break-all">{memberDisplayName(member)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <DialogFooter>
            {onDelete ? (
              <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto" onClick={onDelete}>
                Remove task
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!title.trim()}>
              Save task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UseTemplateDialog({
  templates,
  eventDay,
  busy,
  onClose,
  onApply
}: {
  templates: TaskTemplate[];
  eventDay: string | null;
  busy: boolean;
  onClose: () => void;
  onApply: (templateId: string) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const chosen = templates.find(t => t.id === templateId);
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use a template</DialogTitle>
          <DialogDescription>
            Adds the template&apos;s tasks to this event. Tasks already here, with the same title, are left alone. {eventDay ? "Due dates count from the event day." : "This event has no date, so the new tasks get no due dates."}
          </DialogDescription>
        </DialogHeader>
        <Field label="Template">
          <Select value={templateId} onChange={e => setTemplateId(e.target.value)}>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.items.length} {t.items.length === 1 ? "task" : "tasks"})
              </option>
            ))}
          </Select>
        </Field>
        {chosen ? (
          <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm text-muted-foreground">
            {chosen.items.map(item => (
              <li key={item.title}>{item.title}</li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!templateId} onClick={() => void onApply(templateId)}>
            Add these tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaveTemplateDialog({ busy, count, onClose, onSave }: { busy: boolean; count: number; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void onSave(name);
          }}
        >
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Keeps these {count} {count === 1 ? "task" : "tasks"} with their groups and due dates counted from the event day, ready for the next event. Assigned people are not kept.
            </DialogDescription>
          </DialogHeader>
          <Field label="Template name">
            <Input value={name} maxLength={TEMPLATE_NAME_MAX} onChange={e => setName(e.target.value)} placeholder="For example: Festival day" required />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
