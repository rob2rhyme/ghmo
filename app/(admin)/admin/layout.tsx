//app/(admin)/admin/layout.tsx
import type { ReactNode } from "react";

import AdminNavControls from "@/src/components/admin/AdminNavControls";
import FirebaseAdminAuthBootstrap from "@/src/components/admin/FirebaseAdminAuthBootstrap";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <FirebaseAdminAuthBootstrap>
      <div className="space-y-4 md:space-y-6">
        <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Admin tools
              </p>
              <h1 className="text-lg font-semibold text-foreground">
                System home
              </h1>
            </div>
            <AdminNavControls />
          </div>
        </div>
        {children}
      </div>
    </FirebaseAdminAuthBootstrap>
  );
}
