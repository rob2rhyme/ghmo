import { AlertTriangle, Info, Wrench } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Badge } from "@/src/components/ui/badge";
import type { SetupItem } from "@/src/lib/siteSetup";

/** Super admins only: what is missing or unsafe in the site's settings, problems first. Names settings, never their values. */
export default function SiteSetupCard({ items }: { items: SetupItem[] }) {
  const problems = items.filter(item => item.level === "problem").length;
  return (
    <AdminSectionCard
      icon={<Wrench aria-hidden="true" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Site setup
          {problems > 0 ? <Badge variant="warning">{problems === 1 ? "1 to fix" : `${problems} to fix`}</Badge> : <Badge variant="secondary">Suggestions</Badge>}
        </span>
      }
      description="Only super admins see this. Settings in Vercel take effect after the next deployment."
    >
      <ul className="flex flex-col gap-3" aria-label="Site setup">
        {items.map(item => (
          <li key={item.id} className="flex items-start gap-3 text-sm" data-testid="setup-item">
            {item.level === "problem" ? (
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span>
              <span className="font-medium">{item.title}.</span> <span className="text-muted-foreground">{item.fix}</span>
            </span>
          </li>
        ))}
      </ul>
    </AdminSectionCard>
  );
}
