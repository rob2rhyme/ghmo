import type { ReactNode } from "react";
import FirebaseAdminAuthBootstrap from "@/src/components/admin/FirebaseAdminAuthBootstrap";
import AdminShell from "@/src/components/admin/shell/AdminShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminShell>
      <FirebaseAdminAuthBootstrap>{children}</FirebaseAdminAuthBootstrap>
    </AdminShell>
  );
}
