import type { Route } from "next";
import {
  CalendarDays,
  FileSignature,
  FolderOpen,
  ListChecks,
  Landmark,
  Medal,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessagesSquare,
  Megaphone,
  Network,
  PhoneCall,
  NotebookPen,
  ScrollText,
  ShieldCheck,
  Users,
  UserCog,
  UsersRound,
  type LucideIcon
} from "lucide-react";

export type AdminNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Extra words the jump dialog (Ctrl/⌘ K) matches, so "passkey" finds Security. Comma separated. */
  keywords?: string;
  /** Shown only to a super admin (the page and its routes also refuse everyone else). */
  superAdminOnly?: boolean;
};

export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, keywords: "home, overview, activity, totals" }]
  },
  {
    label: "Governance",
    items: [
      { href: "/admin/comms", label: "Plans & Issues", icon: ScrollText, keywords: "topics, threads, proposals, discussion, vote" },
      { href: "/admin/chat", label: "Admin chat", icon: MessagesSquare, keywords: "messages, talk, board chat" },
      { href: "/admin/minutes", label: "Meeting minutes", icon: NotebookPen, keywords: "notes, decisions, attendance, records" },
      { href: "/admin/action-items", label: "Action items", icon: ListChecks, keywords: "tasks, to do, follow up, overdue" }
    ]
  },
  {
    label: "Community",
    items: [
      { href: "/admin/events", label: "Events", icon: CalendarDays, keywords: "new event, calendar, programs, schedule" },
      { href: "/admin/members", label: "Members", icon: Users, keywords: "people, contacts, phone numbers, consent, import, email list" },
      { href: "/admin/positions", label: "Positions", icon: Medal, keywords: "president, treasurer, secretary, board, officers, terms, who holds" },
      { href: "/admin/groups", label: "Groups", icon: UsersRound, keywords: "teams, cooks, marketing, shopping, callers, lead, committee" },
      { href: "/admin/broadcasts", label: "Broadcasts", icon: Mail, keywords: "announcement, newsletter, send email, messenger" },
      { href: "/admin/calling-tree", label: "Calling tree", icon: Network, keywords: "callers, phone tree, assignments" },
      { href: "/admin/call-campaigns", label: "Call campaigns", icon: Megaphone, keywords: "phone round, rsvp, script, call progress" },
      { href: "/admin/my-calls", label: "My calls", icon: PhoneCall, keywords: "my people, log a call, call list" },
      { href: "/admin/gumba-project", label: "Gumba Project", icon: Landmark, keywords: "donations, fundraising, gofundme, goal, temple" }
    ]
  },
  {
    label: "Documents",
    items: [
      { href: "/admin/document-generator", label: "Document generator", icon: FileSignature, keywords: "letter, certificate, invitation, make a document, print" },
      { href: "/admin/document-gallery", label: "Document gallery", icon: FolderOpen, keywords: "saved documents, letters, certificates, signatures" }
    ]
  },
  {
    label: "Account",
    items: [
      { href: "/admin/admins", label: "Admins", icon: UserCog, keywords: "add an admin, turn off, turn on, remove access, super admin, role, who is an admin", superAdminOnly: true },
      { href: "/admin/security", label: "Security", icon: ShieldCheck, keywords: "passkey, authenticator, sign-in, password, two-step, notifications" },
      { href: "/admin/encryption", label: "Encryption", icon: LockKeyhole, keywords: "devices, unlock, recovery key, approve device, lock" }
    ]
  }
];

/** The navigation a person sees: super-admin-only pages are left out for everyone else. */
export function navFor(superAdmin: boolean): AdminNavGroup[] {
  return ADMIN_NAV.map(group => ({ ...group, items: group.items.filter(item => superAdmin || !item.superAdminOnly) })).filter(group => group.items.length > 0);
}

/** True when `pathname` is this item's page or one of its sub-pages. */
export function isActiveNavItem(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
