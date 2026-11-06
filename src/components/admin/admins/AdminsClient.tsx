"use client";

import Link from "next/link";
import type { Route } from "next";
import { RefreshCw, ShieldCheck, UserCog, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ADMIN_NAME_MAX, type AdminRole, type AdminView } from "@/src/lib/adminManagement";

const dayText = (millis: number) => new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong");
  return data as T;
}

type ListAnswer = { admins: AdminView[] };
type OffAnswer = ListAnswer & { changed: boolean; pushDevicesRemoved: number; encryptionReminder: boolean };

/**
 * Admins (plan §22, 17-B): who can sign in, with the actions a super admin has. The server enforces every rule, including
 * that you can't turn yourself off or change your own role and that the last active super admin stays, so this page
 * only hides what would be refused and shows the server's message for anything else.
 */
export default function AdminsClient() {
  const [admins, setAdmins] = useState<AdminView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  /** After adding: what to tell the new admin. */
  const [justAdded, setJustAdded] = useState<{ name: string; email: string } | null>(null);

  const [turningOff, setTurningOff] = useState<AdminView | null>(null);
  const [alsoPush, setAlsoPush] = useState(true);
  const [changingRole, setChangingRole] = useState<{ admin: AdminView; role: AdminRole } | null>(null);
  const [renaming, setRenaming] = useState<AdminView | null>(null);
  /** After turning someone off: the encryption reminder. */
  const [offNotice, setOffNotice] = useState<{ name: string; pushDevicesRemoved: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/admins", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((data: ListAnswer) => {
        if (!cancelled) setAdmins(data.admins);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!admins) {
    if (loadFailed) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load the admin list</AlertTitle>
          <AlertDescription>
            <p>Check your internet connection and try again.</p>
            <div className="mt-3">
              <Button
                variant="outline"
                onClick={() => {
                  setLoadFailed(false);
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
    return (
      <div role="status">
        <span className="sr-only">Loading the admin list…</span>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const addAdmin = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const data = await call<ListAnswer>("/api/admin/admins", "POST", { name, email, role });
      setAdmins(data.admins);
      setJustAdded({ name: name.trim(), email: email.trim().toLowerCase() });
      setName("");
      setEmail("");
      setRole("admin");
      toast.success("Admin added");
    });
  };

  const turnOff = () =>
    run(async () => {
      if (!turningOff) return;
      const data = await call<OffAnswer>(`/api/admin/admins/${encodeURIComponent(turningOff.id)}`, "PATCH", { status: "disabled", removePushDevices: alsoPush });
      setAdmins(data.admins);
      setOffNotice(data.encryptionReminder ? { name: turningOff.name, pushDevicesRemoved: data.pushDevicesRemoved } : null);
      setTurningOff(null);
      toast.success(`${turningOff.name} is turned off`);
    });

  const turnOn = (target: AdminView) =>
    run(async () => {
      const data = await call<ListAnswer>(`/api/admin/admins/${encodeURIComponent(target.id)}`, "PATCH", { status: "active" });
      setAdmins(data.admins);
      setOffNotice(null);
      toast.success(`${target.name} is turned on`);
    });

  const changeRole = () =>
    run(async () => {
      if (!changingRole) return;
      const data = await call<ListAnswer>(`/api/admin/admins/${encodeURIComponent(changingRole.admin.id)}`, "PATCH", { role: changingRole.role });
      setAdmins(data.admins);
      setChangingRole(null);
      toast.success(`${changingRole.admin.name} is now ${changingRole.role === "super_admin" ? "a super admin" : "an admin"}`);
    });

  const rename = (target: AdminView, nextName: string) =>
    run(async () => {
      const data = await call<ListAnswer>(`/api/admin/admins/${encodeURIComponent(target.id)}`, "PATCH", { name: nextName });
      setAdmins(data.admins);
      setRenaming(null);
      toast.success("Name updated");
    });

  return (
    <div className="flex flex-col gap-6">
      {offNotice ? (
        <Alert>
          <AlertTitle>{offNotice.name} is turned off</AlertTitle>
          <AlertDescription>
            <p>
              Their access ends within about a minute.
              {offNotice.pushDevicesRemoved > 0 ? ` ${offNotice.pushDevicesRemoved === 1 ? "Their push device was" : `Their ${offNotice.pushDevicesRemoved} push devices were`} turned off.` : ""}
            </p>
            <p className="mt-2">
              If they used encryption on any device, also revoke it:{" "}
              <Link href={"/admin/encryption" as Route} className="font-medium underline underline-offset-4">
                Admin → Encryption
              </Link>
              , tick their devices, and choose Remove selected and make new keys. That needs your own unlocked device, so it is a separate step.
            </p>
            <div className="mt-3">
              <Button variant="outline" size="row" onClick={() => setOffNotice(null)}>
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <AdminSectionCard as="h2" icon={<UserCog aria-hidden="true" />} title="Everyone who can sign in" description="Super admins can do everything an admin can, and also manage admins, delete members, set officers and control push for the site.">
        <AdminList bare label="Admins">
          {admins.map(item => (
            <AdminListRow
              key={item.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {item.name}
                  {item.isYou ? <Badge variant="secondary">You</Badge> : null}
                </span>
              }
              badges={
                <>
                  {item.role === "super_admin" ? <Badge>Super admin</Badge> : <Badge variant="outline">Admin</Badge>}
                  {item.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Turned off</Badge>}
                </>
              }
              meta={`${item.email} · ${item.lastLoginAt ? `Last signed in ${dayText(item.lastLoginAt)}` : "Has not signed in yet"}`}
              actions={
                <>
                  <Button variant="outline" size="row" disabled={busy} onClick={() => setRenaming(item)} aria-label={`Edit name of ${item.name}`}>
                    Edit name
                  </Button>
                  {!item.isYou ? (
                    <>
                      <Button
                        variant="outline"
                        size="row"
                        disabled={busy}
                        onClick={() => setChangingRole({ admin: item, role: item.role === "super_admin" ? "admin" : "super_admin" })}
                        aria-label={item.role === "super_admin" ? `Make ${item.name} an ordinary admin` : `Make ${item.name} a super admin`}
                      >
                        <ShieldCheck aria-hidden="true" />
                        {item.role === "super_admin" ? "Make admin…" : "Make super admin…"}
                      </Button>
                      {item.active ? (
                        <Button
                          variant="ghost"
                          size="row"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={busy}
                          onClick={() => {
                            setAlsoPush(true);
                            setTurningOff(item);
                          }}
                          aria-label={`Turn off ${item.name}`}
                        >
                          Turn off…
                        </Button>
                      ) : (
                        <Button variant="ghost" size="row" loading={busy} onClick={() => void turnOn(item)} aria-label={`Turn on ${item.name}`}>
                          Turn on
                        </Button>
                      )}
                    </>
                  ) : null}
                </>
              }
            />
          ))}
        </AdminList>
      </AdminSectionCard>

      <AdminSectionCard as="h2" icon={<UserPlus aria-hidden="true" />} title="Add an admin" description="Nothing is emailed. After you add them, ask them to open the sign-in page and enter this email address; they then set up their authenticator app as usual.">
        <form onSubmit={addAdmin} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input id="admin-name" value={name} onChange={e => setName(e.target.value)} maxLength={ADMIN_NAME_MAX} autoComplete="off" />
            </Field>
            <Field label="Email" description="They sign in with this address. It can't be changed later.">
              <Input id="admin-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" placeholder="name@example.org" />
            </Field>
          </div>
          <Field label="Role">
            <Select id="admin-role" value={role} onChange={e => setRole(e.target.value as AdminRole)}>
              <option value="admin">Admin</option>
              <option value="super_admin">Super admin</option>
            </Select>
          </Field>
          <div>
            <Button type="submit" loading={busy} disabled={!name.trim() || !email.trim()}>
              Add admin
            </Button>
          </div>
        </form>
        {justAdded ? (
          <Alert>
            <AlertTitle>{justAdded.name} can now sign in</AlertTitle>
            <AlertDescription>Ask them to open the admin sign-in page and enter {justAdded.email}. Nothing has been emailed to them.</AlertDescription>
          </Alert>
        ) : null}
      </AdminSectionCard>

      <ConfirmDialog
        open={turningOff !== null}
        onOpenChange={open => !open && setTurningOff(null)}
        title={turningOff ? `Turn off ${turningOff.name}?` : "Turn off this admin?"}
        description="They can't sign in or use the admin area, and any open session ends within about a minute. Nothing they wrote is removed. You can turn them back on at any time."
        confirmLabel="Turn off"
        destructive
        busy={busy}
        onConfirm={turnOff}
      >
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={alsoPush} onChange={e => setAlsoPush(e.target.checked)} />
          <span>Also turn off their push notification devices, so a lost phone stops getting alerts</span>
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={changingRole !== null}
        onOpenChange={open => !open && setChangingRole(null)}
        title={changingRole ? (changingRole.role === "super_admin" ? `Make ${changingRole.admin.name} a super admin?` : `Make ${changingRole.admin.name} an ordinary admin?`) : "Change role?"}
        description={
          changingRole?.role === "super_admin"
            ? "A super admin can add and turn off admins, delete members, set officers, edit the calling tree and control push for the whole site. Only do this for someone the board trusts with that."
            : "They keep their access but lose those extra powers."
        }
        confirmLabel={changingRole?.role === "super_admin" ? "Make super admin" : "Make admin"}
        busy={busy}
        onConfirm={changeRole}
      />

      {renaming ? <RenameDialog admin={renaming} busy={busy} onClose={() => setRenaming(null)} onSave={next => rename(renaming, next)} /> : null}
    </div>
  );
}

/** Fixes a name. An email address can't be changed (plan §22, D55). */
function RenameDialog({ admin, busy, onClose, onSave }: { admin: AdminView; busy: boolean; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(admin.name);
  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void onSave(value);
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit name: {admin.name}</DialogTitle>
            <DialogDescription>For a typo. Their email address can&apos;t be changed: add the right address as a new admin and turn this one off.</DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input value={value} onChange={e => setValue(e.target.value)} maxLength={ADMIN_NAME_MAX} autoComplete="off" disabled={busy} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!value.trim() || value.trim() === admin.name}>
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
