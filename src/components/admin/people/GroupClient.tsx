"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, UsersRound } from "lucide-react";
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
import { SearchInput } from "@/src/components/ui/search-input";
import { Segmented } from "@/src/components/ui/segmented";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, type Group } from "@/src/lib/groups";
import { dueLabel } from "@/src/components/admin/events/EventTasksPanel";
import { isOverdue, type EventTask } from "@/src/lib/eventTasks";
import { memberDisplayName } from "@/src/lib/members";

type Detail = { group: Group; memberIds: string[]; superAdmin: boolean; adminAccess?: Record<string, boolean> | null };
type GroupTask = EventTask & { eventTitle: string; eventDay: string | null };
type TaskList = { tasks: GroupTask[]; today: string };

export default function GroupClient({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [taskList, setTaskList] = useState<TaskList | null>(null);
  const [taskView, setTaskView] = useState<"open" | "done">("open");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([
      peopleApi<Detail>(`/api/admin/groups/${groupId}`),
      peopleApi<{ members: MemberLite[] }>("/api/organizations/ghmo/members"),
      peopleApi<TaskList>(`/api/admin/groups/${groupId}/tasks`)
    ])
      .then(([group, people, tasks]) => {
        setDetail(group);
        setMembers(people.members);
        setTaskList(tasks);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err, "Could not load this group")));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  if (error && !detail) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!detail) return <Skeleton className="h-64 w-full" />;

  const { group, memberIds, superAdmin, adminAccess } = detail;
  const inGroup = memberIds
    .map(id => byId.get(id))
    .filter((m): m is MemberLite => Boolean(m))
    .sort((a, b) => Number(b.id === group.leadMemberId) - Number(a.id === group.leadMemberId) || memberDisplayName(a).localeCompare(memberDisplayName(b)));
  const outside = members.filter(m => m.status === "active" && !memberIds.includes(m.id));

  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await work();
      await load();
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/groups" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All groups
      </Link>
      <AdminSectionCard
        title={group.name}
        description={group.description || "No description yet."}
        icon={<UsersRound aria-hidden="true" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="row" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {superAdmin && !group.builtIn ? (
              <Button variant="ghost" size="row" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          {group.kind === "callers" ? <Badge>Phone tree callers</Badge> : null}
          {!group.active ? <Badge variant="secondary">Switched off</Badge> : null}
          {!group.leadMemberId ? <Badge variant="warning">No lead yet</Badge> : null}
        </div>
        {group.kind === "callers" ? (
          <Alert>
            <AlertDescription>Callers must have admin access to use My Calls. The calling tree page uses this group to suggest who should call.</AlertDescription>
          </Alert>
        ) : null}
      </AdminSectionCard>

      <AdminSectionCard
        title={`People (${inGroup.length})`}
        actions={
          <Button variant="outline" size="row" onClick={() => setAdding(true)} disabled={outside.length === 0}>
            <UserPlus aria-hidden="true" /> Add people
          </Button>
        }
      >
        {inGroup.length === 0 ? (
          <EmptyState title="No one in this group yet" description="Add people, then choose one of them as the lead." />
        ) : (
          <AdminList bare label="People in this group">
            {inGroup.map(member => {
              const isLead = member.id === group.leadMemberId;
              const name = memberDisplayName(member);
              return (
                <AdminListRow
                  key={member.id}
                  title={<span className="break-all">{name}</span>}
                  badges={
                    <>
                      {isLead ? <Badge>Lead</Badge> : null}
                      {adminAccess && member.status === "active" ? (
                        adminAccess[member.id] ? <Badge variant="success">Admin</Badge> : <Badge variant="warning">Needs admin access to use My Calls</Badge>
                      ) : null}
                      {member.status === "disabled" ? <Badge variant="secondary">Disabled</Badge> : null}
                    </>
                  }
                  actions={
                    <>
                      {!isLead ? (
                        <Button
                          size="row"
                          variant="outline"
                          loading={busy}
                          aria-label={`Make ${name} the lead`}
                          onClick={() => run(() => peopleApi(`/api/admin/groups/${groupId}`, { method: "PATCH", body: { leadMemberId: member.id } }), "Lead set")}
                        >
                          Make lead
                        </Button>
                      ) : null}
                      <Button
                        size="row"
                        variant="ghost"
                        loading={busy}
                        disabled={isLead}
                        title={isLead ? "Choose another lead first" : undefined}
                        aria-label={`Remove ${name} from the group`}
                        onClick={() => run(() => peopleApi(`/api/admin/groups/${groupId}/members`, { method: "POST", body: { remove: [member.id] } }), "Removed from the group")}
                      >
                        Remove
                      </Button>
                    </>
                  }
                />
              );
            })}
          </AdminList>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Tasks" description="Event jobs given to this group, across all events.">
        {!taskList || taskList.tasks.length === 0 ? (
          <EmptyState title="No tasks for this group yet" description="Give this group a job from an event's Tasks section." />
        ) : (
          <>
            <Segmented
              label="Show"
              value={taskView}
              onChange={setTaskView}
              options={[
                { value: "open", label: "Open", count: taskList.tasks.filter(t => t.status === "open").length },
                { value: "done", label: "Done", count: taskList.tasks.filter(t => t.status === "done").length }
              ]}
            />
            <AdminList bare label="Group tasks">
              {taskList.tasks
                .filter(t => t.status === taskView)
                .map(task => (
                  <AdminListRow
                    key={task.id}
                    href={`/admin/events/${task.eventId}/edit` as Route}
                    title={task.title}
                    badges={isOverdue(task, taskList.today) ? <Badge variant="destructive">Overdue</Badge> : undefined}
                    meta={`${task.eventTitle}${task.dueOn ? ` · Due ${dueLabel(task.dueOn)}` : ""}`}
                  />
                ))}
            </AdminList>
          </>
        )}
      </AdminSectionCard>

      {adding ? (
        <AddPeopleDialog
          people={outside}
          busy={busy}
          onClose={() => setAdding(false)}
          onSave={async ids => {
            const ok = await run(() => peopleApi(`/api/admin/groups/${groupId}/members`, { method: "POST", body: { add: ids } }), ids.length === 1 ? "Person added" : `${ids.length} people added`);
            if (ok) setAdding(false);
          }}
        />
      ) : null}
      {editing ? (
        <EditGroupDialog
          group={group}
          busy={busy}
          onClose={() => setEditing(false)}
          onSave={async body => {
            const ok = await run(() => peopleApi(`/api/admin/groups/${groupId}`, { method: "PATCH", body }), "Group saved");
            if (ok) setEditing(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${group.name}?`}
        description={`This removes the group from ${inGroup.length} ${inGroup.length === 1 ? "person" : "people"}. The people themselves stay on the member list.`}
        confirmLabel="Delete group"
        destructive
        busy={busy}
        onConfirm={async () => {
          const ok = await run(() => peopleApi(`/api/admin/groups/${groupId}`, { method: "DELETE" }), "Group deleted");
          if (ok) router.push("/admin/groups");
        }}
      />
    </div>
  );
}

function AddPeopleDialog({ people, busy, onClose, onSave }: { people: MemberLite[]; busy: boolean; onClose: () => void; onSave: (ids: string[]) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const needle = query.trim().toLowerCase();
  const shown = people
    .filter(m => !needle || memberDisplayName(m).toLowerCase().includes(needle) || m.emailLower.includes(needle))
    .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)))
    .slice(0, 200);
  const toggle = (id: string) =>
    setPicked(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add people</DialogTitle>
          <DialogDescription>Tick the members to add, then save.</DialogDescription>
        </DialogHeader>
        <SearchInput aria-label="Search members" placeholder="Search by name or email" value={query} onChange={setQuery} />
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {shown.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No one matches.</li> : null}
          {shown.map(member => (
            <li key={member.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={picked.has(member.id)} onChange={() => toggle(member.id)} />
                <span className="break-all">{memberDisplayName(member)}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={picked.size === 0} onClick={() => void onSave([...picked])}>
            Add {picked.size || ""} {picked.size === 1 ? "person" : "people"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditGroupDialog({
  group,
  busy,
  onClose,
  onSave
}: {
  group: Group;
  busy: boolean;
  onClose: () => void;
  onSave: (body: { name: string; description: string; active: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [active, setActive] = useState(group.active);
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void onSave({ name, description, active });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit group</DialogTitle>
            <DialogDescription>Change the name or what it is for.</DialogDescription>
          </DialogHeader>
          <Field label="Group name">
            <Input value={name} maxLength={GROUP_NAME_MAX} onChange={e => setName(e.target.value)} required />
          </Field>
          <Field label="What is it for? (optional)">
            <Textarea value={description} maxLength={GROUP_DESCRIPTION_MAX} onChange={e => setDescription(e.target.value)} rows={3} />
          </Field>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={active} onChange={e => setActive(e.target.checked)} />
            <span>In use. Untick to switch the group off without deleting it.</span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
