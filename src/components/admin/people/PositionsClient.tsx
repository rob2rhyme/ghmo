"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Landmark, Plus, RefreshCw } from "lucide-react";
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
import { Segmented } from "@/src/components/ui/segmented";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { NOTE_MAX, TITLE_MAX, monthYear, termStatus, type Position, type Term } from "@/src/lib/positions";
import { REMOVED_MEMBER_LABEL } from "@/src/lib/memberDeletion";
import { memberDisplayName } from "@/src/lib/members";

type Data = { positions: Position[]; terms: Term[]; today: string; superAdmin: boolean };
type View = "current" | "past";

const span = (term: Term) => `${monthYear(term.startsOn)} – ${term.endsOn ? monthYear(term.endsOn) : "now"}`;

export default function PositionsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("current");
  const [seating, setSeating] = useState<Position | null>(null);
  const [editing, setEditing] = useState<Position | "new" | null>(null);
  const [ending, setEnding] = useState<Term | null>(null);
  const [removing, setRemoving] = useState<Term | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const load = () =>
    Promise.all([peopleApi<Data>("/api/admin/positions"), peopleApi<{ members: MemberLite[] }>("/api/organizations/ghmo/members")])
      .then(([positions, list]) => {
        setData(positions);
        setMembers(list.members);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err, "Could not load positions")));

  useEffect(() => {
    void load();
  }, [attempt]);

  const nameOf = useMemo(() => {
    const byId = new Map(members.map(m => [m.id, m]));
    return (id: string) => {
      const member = byId.get(id);
      return member ? memberDisplayName(member) : REMOVED_MEMBER_LABEL;
    };
  }, [members]);

  if (error && !data) {
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
  if (!data) {
    return (
      <div role="status">
        <span className="sr-only">Loading positions…</span>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { positions, terms, today, superAdmin } = data;
  const positionById = new Map(positions.map(p => [p.id, p]));
  const termsFor = (positionId: string) => terms.filter(t => t.positionId === positionId);
  const live = (t: Term) => termStatus(t, today) !== "past";
  const pastTerms = terms.filter(t => termStatus(t, today) === "past");

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
      {!superAdmin ? (
        <Alert>
          <AlertDescription>Everyone on the board can see who holds each position. Only a super admin can change them.</AlertDescription>
        </Alert>
      ) : null}
      <AdminSectionCard
        title="Officer positions"
        description="Who holds each position, and since when. A person can hold several."
        icon={<Landmark aria-hidden="true" />}
        actions={
          superAdmin ? (
            <Button variant="outline" size="row" onClick={() => setEditing("new")}>
              <Plus aria-hidden="true" /> Add a position
            </Button>
          ) : undefined
        }
      >
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: "current", label: "Current" },
            { value: "past", label: "Past terms", count: pastTerms.length }
          ]}
        />
        {view === "current" ? (
          positions.length === 0 ? (
            <EmptyState title="No positions yet" description="A super admin can add the positions your community uses." />
          ) : (
            <AdminList bare label="Positions">
              {positions.map(position => {
                const holders = termsFor(position.id).filter(live);
                return (
                  <AdminListRow
                    key={position.id}
                    stacked
                    title={
                      <span>
                        {position.title}
                        {position.titleNe ? <span className="ml-2 text-sm font-normal text-muted-foreground">{position.titleNe}</span> : null}
                      </span>
                    }
                    badges={
                      <>
                        {!position.active ? <Badge variant="secondary">Turned off</Badge> : holders.length === 0 ? <Badge variant="warning">Vacant</Badge> : null}
                        {position.multiple ? <Badge variant="outline">Several people</Badge> : null}
                      </>
                    }
                    actions={
                      superAdmin ? (
                        <>
                          {position.active ? (
                            <Button size="row" variant="outline" onClick={() => setSeating(position)} aria-label={`Set holder for ${position.title}`}>
                              Set holder
                            </Button>
                          ) : null}
                          <Button size="row" variant="ghost" onClick={() => setEditing(position)} aria-label={`Edit ${position.title}`}>
                            Edit
                          </Button>
                        </>
                      ) : undefined
                    }
                  >
                    {holders.length > 0 ? (
                      <ul className="flex flex-col gap-2">
                        {holders.map(term => (
                          <li key={term.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <span className="font-medium">{nameOf(term.memberId)}</span>
                            <span className="text-muted-foreground">
                              {termStatus(term, today) === "upcoming" ? `starts ${monthYear(term.startsOn)}` : `since ${monthYear(term.startsOn)}`}
                              {term.endsOn ? `, until ${monthYear(term.endsOn)}` : ""}
                            </span>
                            {term.note ? <span className="text-muted-foreground">· {term.note}</span> : null}
                            {superAdmin ? (
                              <Button size="sm" variant="ghost" onClick={() => setEnding(term)} aria-label={`End ${nameOf(term.memberId)}'s term as ${position.title}`}>
                                End term…
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </AdminListRow>
                );
              })}
            </AdminList>
          )
        ) : pastTerms.length === 0 ? (
          <EmptyState title="No past terms yet" description="When a term ends it moves here, so the history stays." />
        ) : (
          <AdminList bare label="Past terms">
            {pastTerms.map(term => (
              <AdminListRow
                key={term.id}
                title={nameOf(term.memberId)}
                meta={`${positionById.get(term.positionId)?.title ?? "Removed position"} · ${span(term)}${term.note ? ` · ${term.note}` : ""}`}
                actions={
                  superAdmin ? (
                    <Button size="row" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setRemoving(term)}>
                      Delete…
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </AdminList>
        )}
      </AdminSectionCard>

      {seating ? (
        <SeatDialog
          position={seating}
          members={members}
          holders={termsFor(seating.id).filter(live)}
          today={today}
          nameOf={nameOf}
          busy={busy}
          onClose={() => setSeating(null)}
          onMemberAdded={member => setMembers(list => [...list, member])}
          onSave={async ({ allowSeveral, ...body }) => {
            const ok = await run(async () => {
              // Keeping the current holder on a one-person seat makes it a seat for several people first.
              if (allowSeveral) await peopleApi(`/api/admin/positions/${seating.id}`, { method: "PATCH", body: { multiple: true } });
              await peopleApi(`/api/admin/positions/${seating.id}/terms`, { method: "POST", body });
            }, "Holder saved");
            if (ok) setSeating(null);
          }}
        />
      ) : null}
      {editing ? (
        <PositionDialog
          position={editing === "new" ? null : editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async body => {
            const ok = await run(
              () => (editing === "new" ? peopleApi("/api/admin/positions", { method: "POST", body }) : peopleApi(`/api/admin/positions/${editing.id}`, { method: "PATCH", body })),
              editing === "new" ? "Position added" : "Position saved"
            );
            if (ok) setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(ending)}
        onOpenChange={open => !open && setEnding(null)}
        title="End this term today?"
        description={ending ? `${nameOf(ending.memberId)} stops holding ${positionById.get(ending.positionId)?.title ?? "this position"} after today. The term stays in the past terms.` : ""}
        confirmLabel="End term"
        busy={busy}
        onConfirm={async () => {
          if (!ending) return;
          const ok = await run(() => peopleApi(`/api/admin/position-terms/${ending.id}`, { method: "PATCH", body: { endsOn: today } }), "Term ended");
          if (ok) setEnding(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={open => !open && setRemoving(null)}
        title="Delete this term?"
        description="Use this only for a term entered by mistake. The history of who served will lose this line."
        confirmLabel="Delete term"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!removing) return;
          const ok = await run(() => peopleApi(`/api/admin/position-terms/${removing.id}`, { method: "DELETE" }), "Term deleted");
          if (ok) setRemoving(null);
        }}
      />
    </div>
  );
}

/** The member picker's value for "someone who isn't on the member list yet". */
const NEW_PERSON = "__new";

type SeatBody = { memberId: string; startsOn: string; endsOn: string | null; note: string; endPrevious: boolean; allowSeveral: boolean };

function SeatDialog({
  position,
  members,
  holders,
  today,
  nameOf,
  busy,
  onClose,
  onMemberAdded,
  onSave
}: {
  position: Position;
  members: MemberLite[];
  holders: Term[];
  today: string;
  nameOf: (id: string) => string;
  busy: boolean;
  onClose: () => void;
  onMemberAdded: (member: MemberLite) => void;
  onSave: (body: SeatBody) => Promise<void>;
}) {
  const people = members.filter(m => m.status === "active").sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));
  const [memberId, setMemberId] = useState(people.length === 0 ? NEW_PERSON : "");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  // A seat held by one person is normally taken over; a seat for several people (board members, advisors) normally gains
  // another person, so ending the others stays an explicit choice there.
  const [endPrevious, setEndPrevious] = useState(!position.multiple);
  const isNew = memberId === NEW_PERSON;
  const needle = search.trim().toLowerCase();
  const shownPeople = needle
    ? people.filter(m => m.id === memberId || memberDisplayName(m).toLowerCase().includes(needle) || m.emailLower.includes(needle))
    : people;
  const holderNames = holders.map(h => nameOf(h.memberId)).join(", ");
  const ready = isNew ? newName.trim() !== "" && newEmail.trim() !== "" : memberId !== "";

  const submit = async () => {
    let id = memberId;
    if (isNew) {
      // Add the person to the member list first, then seat them. If seating then fails, they stay picked, so trying
      // again doesn't add them twice.
      setAdding(true);
      try {
        const created = await peopleApi<{ member: MemberLite }>("/api/organizations/ghmo/members", {
          method: "POST",
          body: { name: newName.trim(), email: newEmail.trim(), status: "active" }
        });
        onMemberAdded(created.member);
        id = created.member.id;
        setMemberId(id);
      } catch (err) {
        toast.error(errorMessage(err, "Could not add this person to the member list"));
        return;
      } finally {
        setAdding(false);
      }
    }
    await onSave({ memberId: id, startsOn, endsOn: endsOn || null, note, endPrevious, allowSeveral: !position.multiple && holders.length > 0 && !endPrevious });
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Set holder: {position.title}</DialogTitle>
            <DialogDescription>Pick the person and the day the term starts. Leave the end date empty if it has no set end.</DialogDescription>
          </DialogHeader>
          {people.length === 0 ? (
            <Alert>
              <AlertDescription>
                No one is on the member list yet. Add the person here, or add everyone at once with Import on the{" "}
                <Link href="/admin/members" className="font-semibold text-foreground underline underline-offset-2">
                  Members page
                </Link>
                .
              </AlertDescription>
            </Alert>
          ) : people.length > 8 ? (
            <Field label="Find a member">
              <Input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email" />
            </Field>
          ) : null}
          <Field label="Member">
            <Select value={memberId} onChange={e => setMemberId(e.target.value)} required>
              <option value="">Choose a member…</option>
              {shownPeople.map(m => (
                <option key={m.id} value={m.id}>
                  {memberDisplayName(m)}
                </option>
              ))}
              <option value={NEW_PERSON}>Someone not on the member list yet…</option>
            </Select>
          </Field>
          {isNew ? (
            <div className="grid gap-4 rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">
                They are added to the member list as well. For someone with only a phone number, add them on the{" "}
                <Link href="/admin/members" className="font-semibold text-foreground underline underline-offset-2">
                  Members page
                </Link>{" "}
                first.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <Input value={newName} maxLength={120} autoComplete="off" onChange={e => setNewName(e.target.value)} required />
                </Field>
                <Field label="Email">
                  <Input type="email" value={newEmail} maxLength={320} autoComplete="off" onChange={e => setNewEmail(e.target.value)} required />
                </Field>
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts on">
              <Input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} required />
            </Field>
            <Field label="Ends on (optional)">
              <Input type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} />
            </Field>
          </div>
          <Field label="Note (optional)">
            <Input value={note} maxLength={NOTE_MAX} onChange={e => setNote(e.target.value)} placeholder="For example: elected at the annual meeting" />
          </Field>
          {holders.length > 0 && position.multiple ? (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={endPrevious} onChange={e => setEndPrevious(e.target.checked)} />
              <span>End {holderNames} the day before (leave unticked to add this person alongside them)</span>
            </label>
          ) : null}
          {holders.length > 0 && !position.multiple ? (
            <fieldset className="grid gap-1 text-sm">
              <legend className="mb-1 font-medium">{holderNames} holds this now</legend>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                <input type="radio" name="seat-mode" className="mt-0.5 size-4 shrink-0 accent-primary" checked={endPrevious} onChange={() => setEndPrevious(true)} />
                <span>End {holderNames} the day before, so this person takes over</span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                <input type="radio" name="seat-mode" className="mt-0.5 size-4 shrink-0 accent-primary" checked={!endPrevious} onChange={() => setEndPrevious(false)} />
                <span>Keep {holderNames} and add this person too ({position.title} will then allow several people)</span>
              </label>
            </fieldset>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy || adding} disabled={!ready || !startsOn}>
              Save holder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PositionDialog({
  position,
  busy,
  onClose,
  onSave
}: {
  position: Position | null;
  busy: boolean;
  onClose: () => void;
  onSave: (body: { title: string; titleNe: string; multiple: boolean; active?: boolean }) => Promise<void>;
}) {
  const [title, setTitle] = useState(position?.title ?? "");
  const [titleNe, setTitleNe] = useState(position?.titleNe ?? "");
  const [multiple, setMultiple] = useState(position?.multiple ?? false);
  const [active, setActive] = useState(position?.active ?? true);

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void onSave(position ? { title, titleNe, multiple, active } : { title, titleNe, multiple });
          }}
        >
          <DialogHeader>
            <DialogTitle>{position ? "Edit position" : "Add a position"}</DialogTitle>
            <DialogDescription>The list is yours to shape: rename a position, or add one your community uses.</DialogDescription>
          </DialogHeader>
          <Field label="Title">
            <Input value={title} maxLength={TITLE_MAX} onChange={e => setTitle(e.target.value)} required />
          </Field>
          <Field label="Title in Nepali (optional)">
            <Input value={titleNe} maxLength={TITLE_MAX} onChange={e => setTitleNe(e.target.value)} />
          </Field>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={multiple} onChange={e => setMultiple(e.target.checked)} />
            <span>Several people can hold this at once (for example board members)</span>
          </label>
          {position ? (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={active} onChange={e => setActive(e.target.checked)} />
              <span>In use. Untick to hide it from the list without losing its history.</span>
            </label>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!title.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
