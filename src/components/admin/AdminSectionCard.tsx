import type { ReactNode } from "react";

type AdminSectionCardProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function AdminSectionCard({
  title,
  description,
  actions,
  children,
  className
}: AdminSectionCardProps) {
  const classes = ["rounded-2xl border border-border bg-card p-5 shadow-xs", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes}>
      {(title || description || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
          <div>
            {title ? <h2 className="text-lg font-semibold text-foreground">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
