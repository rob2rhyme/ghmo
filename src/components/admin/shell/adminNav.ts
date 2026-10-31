import type { Route } from "next";
import {
  CalendarDays,
  FileSignature,
  FolderOpen,
  ListChecks,
  Landmark,
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
  type LucideIcon
} from "lucide-react";

export type AdminNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Heavy client pages: skip prefetching. */
  noPrefetch?: boolean;
};

export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }]
  },
  {
    label: "Governance",
    items: [
      { href: "/admin/comms", label: "Plans & Issues", icon: ScrollText },
      { href: "/admin/chat", label: "Admin Chat", icon: MessagesSquare },
      { href: "/admin/minutes", label: "Meeting Minutes", icon: NotebookPen },
      { href: "/admin/action-items", label: "Action Items", icon: ListChecks }
    ]
  },
  {
    label: "Community",
    items: [
      { href: "/admin/events", label: "Events", icon: CalendarDays },
      { href: "/admin/members", label: "Members", icon: Users },
      { href: "/admin/broadcasts", label: "Broadcasts", icon: Mail },
      { href: "/admin/calling-tree", label: "Calling Tree", icon: Network },
      { href: "/admin/call-campaigns", label: "Call Campaigns", icon: Megaphone },
      { href: "/admin/my-calls", label: "My Calls", icon: PhoneCall },
      { href: "/admin/gumba-project", label: "GUMBA Project", icon: Landmark }
    ]
  },
  {
    label: "Documents",
    items: [
      { href: "/admin/document-generator", label: "Document Generator", icon: FileSignature, noPrefetch: true },
      { href: "/admin/document-gallery", label: "Document Gallery", icon: FolderOpen, noPrefetch: true }
    ]
  },
  {
    label: "Account",
    items: [
      { href: "/admin/security", label: "Security", icon: ShieldCheck },
      { href: "/admin/encryption", label: "Encryption", icon: LockKeyhole }
    ]
  }
];

/** True when `pathname` is this item's page or one of its sub-pages. */
export function isActiveNavItem(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
