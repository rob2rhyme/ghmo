import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

type AdminSectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Shown at the right of the title row (stays there from sm up). */
  actions?: ReactNode;
  /** Optional small icon before the title; always muted, size 5. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Heading level for the title (default h2). */
  as?: "h2" | "h3";
};

/**
 * The one section box in the admin (same padding, radius and title size as Card). Use it for every
 * titled section; use a bare Card only for boxes without a title.
 */
export default function AdminSectionCard({ title, description, actions, icon, children, className, as: Heading = "h2" }: AdminSectionCardProps) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs md:p-6", className)}>
      {title || description || actions ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <Heading className="flex items-center gap-2 text-base font-semibold leading-tight text-foreground">
                {icon ? <span className="text-muted-foreground [&_svg]:size-5">{icon}</span> : null}
                {title}
              </Heading>
            ) : null}
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
