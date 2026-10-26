import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

type AdminSectionCardProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function AdminSectionCard({ title, description, actions, children, className }: AdminSectionCardProps) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5 shadow-xs md:p-6", className)}>
      {(title || description || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold tracking-tight text-foreground md:text-lg">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
