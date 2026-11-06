"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutTemplate, Plus, RefreshCw, Trash2 } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { errorMessage, peopleApi } from "@/src/components/admin/people/api";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { MAX_TEMPLATE_ITEMS, TASK_TITLE_MAX, TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX, type TaskTemplate, type TemplateItem } from "@/src/lib/eventTasks";

type GroupLite = { id: string; name: string; active: boolean };

/** "3 days before the event" for a stored offset. */
const whenLabel = (offset: number | null) => (offset === null ? "no due date" : offset === 0 ? "on the event day" : `${Math.abs(offset)} ${Math.abs(offset) === 1 ? "day" : "days"} ${offset < 0 ? "before" : "after"}`);

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TaskTemplate | "new" | null>(null);
  const [deleting, setDeleting] = useState<TaskTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const load = () =>
    Promise.all([peopleApi<{ templates: TaskTemplate[]; superAdmin: boolean }>("/api/admin/task-templates"), peopleApi<{ groups: GroupLite[] }>("/api/admin/groups")])
      .then(([list, group]) => {
        setTemplates(list.templates);
        setSuperAdmin(list.superAdmin);
        setGroups(group.groups);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err, "Could not load the templates")));

  useEffect(() => {
    void load();
  }, [attempt]);

  if (error && !templates) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <p>{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setError(null);
                setAttempt(n => n + 1);
              }}
            >
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  if (!templates) {
    return (
      <div role="status">
        <span className="sr-only">Loading templates…</span>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const groupName = (id: string | null) => (id ? (groups.find(g => g.id === id)?.name ?? "Removed group") : null);

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
    <AdminSectionCard
      title="Templates"
      description="A ready-made checklist you can add to any event. Save one from an event's own tasks, or write one here."
      icon={<LayoutTemplate aria-hidden="true" />}
      actions={
        <Button variant="outline" size="row" onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" /> New template
        </Button>
      }
    >
      {templates.length === 0 ? (
        <EmptyState icon={<LayoutTemplate aria-hidden="true" />} title="No templates yet" description="Start with the jobs every general meeting needs: book the hall, send the notice, set up chairs, take minutes." />
      ) : (
        <AdminList bare label="Task templates">
          {templates.map(template => (
            <AdminListRow
              key={template.id}
              stacked
              title={template.name}
              meta={template.description || `${template.items.length} ${template.items.length === 1 ? "task" : "tasks"}`}
              actions={
                <>
                  <Button size="row" variant="outline" onClick={() => setEditing(template)} aria-label={`Edit ${template.name}`}>
                    Edit
                  </Button>
                  {superAdmin ? (
                    <Button size="row" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting(template)} aria-label={`Delete ${template.name}`}>
                      <Trash2 aria-hidden="true" /> Delete…
                    </Button>
                  ) : null}
                </>
              }
            >
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {template.items.map(item => (
                  <li key={item.title}>
                    {item.title}
                    <span> · {whenLabel(item.dueOffsetDays)}</span>
                    {item.groupId ? <span> · {groupName(item.groupId)}</span> : null}
                  </li>
                ))}
              </ul>
            </AdminListRow>
          ))}
        </AdminList>
      )}

      {editing ? (
        <TemplateDialog
          template={editing === "new" ? null : editing}
          groups={groups}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async body => {
            const ok = await run(
              () => (editing === "new" ? peopleApi("/api/admin/task-templates", { method: "POST", body }) : peopleApi(`/api/admin/task-templates/${editing.id}`, { method: "PATCH", body })),
              editing === "new" ? "Template saved" : "Template changed"
            );
            if (ok) setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={open => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this template"}?`}
        description="Events keep the tasks they already got from it. Only the template itself goes."
        confirmLabel="Delete template"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await run(() => peopleApi(`/api/admin/task-templates/${deleting.id}`, { method: "DELETE" }), "Template deleted");
          if (ok) setDeleting(null);
        }}
      />
    </AdminSectionCard>
  );
}

type Row = { title: string; notes: string; groupId: string; days: string; direction: "before" | "after" };

const toRow = (item: TemplateItem): Row => ({
  title: item.title,
  notes: item.notes,
  groupId: item.groupId ?? "",
  days: item.dueOffsetDays === null ? "" : String(Math.abs(item.dueOffsetDays)),
  direction: item.dueOffsetDays !== null && item.dueOffsetDays > 0 ? "after" : "before"
});

function TemplateDialog({
  template,
  groups,
  busy,
  onClose,
  onSave
}: {
  template: TaskTemplate | null;
  groups: GroupLite[];
  busy: boolean;
  onClose: () => void;
  onSave: (body: { name: string; description: string; items: TemplateItem[] }) => Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [rows, setRows] = useState<Row[]>(template?.items.map(toRow) ?? [{ title: "", notes: "", groupId: "", days: "", direction: "before" }]);
  const patch = (index: number, change: Partial<Row>) => setRows(list => list.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const items = (): TemplateItem[] =>
    rows
      .filter(row => row.title.trim())
      .map(row => {
        const days = row.days.trim() === "" ? null : Math.max(0, Math.min(365, Math.floor(Number(row.days)) || 0));
        return { title: row.title, notes: row.notes, groupId: row.groupId || null, dueOffsetDays: days === null ? null : row.direction === "before" ? -days : days };
      });
  const usable = groups.filter(g => g.active);

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void onSave({ name, description, items: items() });
          }}
        >
          <DialogHeader>
            <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>Each task can name a group and a due date counted from the event day.</DialogDescription>
          </DialogHeader>
          <Field label="Template name">
            <Input value={name} maxLength={TEMPLATE_NAME_MAX} onChange={e => setName(e.target.value)} placeholder="For example: General meeting" required />
          </Field>
          <Field label="What is it for? (optional)">
            <Textarea value={description} maxLength={TEMPLATE_DESCRIPTION_MAX} rows={2} onChange={e => setDescription(e.target.value)} />
          </Field>
          <div className="grid gap-3">
            {rows.map((row, index) => (
              <fieldset key={index} className="grid gap-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-medium">Task {index + 1}</legend>
                <Field label="Task">
                  <Input value={row.title} maxLength={TASK_TITLE_MAX} onChange={e => patch(index, { title: e.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Group">
                    <Select value={row.groupId} onChange={e => patch(index, { groupId: e.target.value })}>
                      <option value="">No group</option>
                      {usable.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                      {row.groupId && !usable.some(g => g.id === row.groupId) ? <option value={row.groupId}>Removed or turned-off group</option> : null}
                    </Select>
                  </Field>
                  <Field label="Days (blank = no date)">
                    <Input type="number" min={0} max={365} value={row.days} onChange={e => patch(index, { days: e.target.value })} />
                  </Field>
                  <Field label="Counted">
                    <Select value={row.direction} onChange={e => patch(index, { direction: e.target.value as Row["direction"] })} disabled={row.days.trim() === ""}>
                      <option value="before">before the event</option>
                      <option value="after">after the event</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Notes (optional)">
                  <Input value={row.notes} onChange={e => patch(index, { notes: e.target.value })} />
                </Field>
                {rows.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" className="w-fit text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setRows(list => list.filter((_, i) => i !== index))}>
                    Remove task {index + 1}
                  </Button>
                ) : null}
              </fieldset>
            ))}
            <Button type="button" variant="outline" className="w-fit" disabled={rows.length >= MAX_TEMPLATE_ITEMS} onClick={() => setRows(list => [...list, { title: "", notes: "", groupId: "", days: "", direction: "before" }])}>
              <Plus aria-hidden="true" /> Add a task
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!name.trim() || rows.every(row => !row.title.trim())}>
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
