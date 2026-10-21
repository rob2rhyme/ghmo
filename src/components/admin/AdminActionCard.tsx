//src/components/admin/AdminActionCard.tsx
import type { Route } from "next";
import Link from "next/link";
import { cloneElement, type ReactElement, type SVGProps } from "react";

type IconEl = ReactElement<SVGProps<SVGSVGElement>>;

type AdminActionCardProps = {
  href: Route;
  title: string;
  description: string;
  icon?: IconEl;
};

export default function AdminActionCard({
  href,
  title,
  description,
  icon,
}: AdminActionCardProps) {
  const renderIcon = (className: string) => {
    if (!icon) return null;

    const prevClassName =
      typeof icon.props.className === "string" ? icon.props.className : "";
    const merged = [prevClassName, className].filter(Boolean).join(" ");

    return cloneElement(icon, { className: merged });
  };

  return (
    <Link
      href={href}
      className="group flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="relative flex h-20 items-center justify-center bg-linear-to-br from-slate-50 via-white to-slate-100 md:h-24 lg:h-28 dark:from-slate-900 dark:via-slate-900/80 dark:to-slate-950">
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl dark:bg-primary/15" />
        <div className="absolute -left-8 bottom-0 h-16 w-16 rounded-full bg-slate-300/40 blur-2xl dark:bg-slate-700/30" />

        <div className="absolute -right-2 -bottom-8 opacity-10">
          {renderIcon("h-24 w-24 text-foreground dark:text-white")}
        </div>

        <div className="relative z-10">
          {renderIcon(
            "h-8 w-8 text-foreground/80 dark:text-slate-100 md:h-9 md:w-9"
          )}
        </div>
      </div>

      <div className="flex h-full flex-col justify-between px-4 py-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground dark:text-slate-100">
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground dark:text-slate-300">
            {description}
          </p>
        </div>

        <span className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">
          Open
        </span>
      </div>
    </Link>
  );
}
