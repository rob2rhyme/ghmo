"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, UsersRound } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { errorMessage, peopleApi, type MemberLite } from "@/src/components/admin/people/api";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, type Group } from "@/src/lib/groups";
import { memberDisplayName } from "@/src/lib/members";

type GroupRow = Group & { memberCount: number; openTaskCount?: number };

export default function GroupsClient() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([peopleApi<{ groups: GroupRow[] }>("/api/admin/groups"), peopleApi<{ members: MemberLite[] }>("/api/organizations/ghmo/members")])
      .then(([list, people]) => {
        if (cancelled) return;
        setGroups(list.groups);
        setMembers(people.members);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, "Could not load groups"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const leadName = useMemo(() => {
    const byId = new Map(members.map(m => [m.id, m]));
    return (id: string | null) => (id ? (byId.get(id) ? memberDisplayName(byId.get(id)!) : null) : null);
  }, [members]);

  if (error && !groups) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!groups) return <Skeleton className="h-64 w-full" />;

  const create = async (body: { name: string; description: string }) => {
    setBusy(true);
    try {
      const { group } = await peopleApi<{ group: GroupRow }>("/api/admin/groups", { method: "POST", body });
      toast.success("Group created");
      setCreating(false);
      router.push(`/admin/groups/${group.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <AdminSectionCard
        title="Groups"
        description="Teams of members: callers, cooks, marketing, shopping. Open a group to add people and choose a lead."
        icon={<UsersRound aria-hidden="true" />}
        actions={
          <Button variant="outline" size="row" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> New group
          </Button>
        }
      >
        {groups.length === 0 ? (
          <EmptyState title="No groups yet" description="Make a group for each team that helps at events." />
        ) : (
          <AdminList bare label="Groups">
            {groups.map(group => {
              const lead = leadName(group.leadMemberId);
              return (
                <AdminListRow
                  key={group.id}
                  href={`/admin/groups/${group.id}` as Route}
                  title={group.name}
                  meta={`${group.memberCount} ${group.memberCount === 1 ? "person" : "people"}${lead ? ` · Lead: ${lead}` : ""}${group.openTaskCount ? ` · ${group.openTaskCount} open ${group.openTaskCount === 1 ? "task" : "tasks"}` : ""}`}
                  badges={
                    <>
                      {group.kind === "callers" ? <Badge variant="default">Phone tree callers</Badge> : null}
                      {!group.active ? <Badge variant="secondary">Switched off</Badge> : null}
                      {group.active && !group.leadMemberId ? <Badge variant="warning">No lead</Badge> : null}
                    </>
                  }
                />
              );
            })}
          </AdminList>
        )}
      </AdminSectionCard>

      {creating ? <NewGroupDialog busy={busy} onClose={() => setCreating(false)} onSave={create} /> : null}
    </div>
  );
}

function NewGroupDialog({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (body: { name: string; description: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void onSave({ name, description });
          }}
        >
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>You add the people and choose a lead on the next page.</DialogDescription>
          </DialogHeader>
          <Field label="Group name">
            <Input value={name} maxLength={GROUP_NAME_MAX} onChange={e => setName(e.target.value)} placeholder="For example: Cooking team" required />
          </Field>
          <Field label="What is it for? (optional)">
            <Textarea value={description} maxLength={GROUP_DESCRIPTION_MAX} onChange={e => setDescription(e.target.value)} rows={3} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
