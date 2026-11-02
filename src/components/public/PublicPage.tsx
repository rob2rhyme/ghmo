import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * The frame for every public page inside the site shell. `wide` uses the full content width (lists, grids);
 * `reading` narrows to a comfortable line length for text and forms, and stays left-aligned with the header
 * so titles never jump sideways between pages.
 */
export function PublicPage({ width = "wide", children, className }: { width?: "wide" | "reading"; children: ReactNode; className?: string }) {
  return <div className={cn("flex w-full flex-col gap-8", width === "reading" && "max-w-3xl", className)}>{children}</div>;
}

type PublicPageHeaderProps = {
  /** Short sentence-case label above the title (optional). */
  eyebrow?: string;
  title: ReactNode;
  /** One plain sentence on what the page is for. */
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: Route; label: string };
};

/** One title size and layout for every public page (docs/UI_STYLE.md). */
export function PublicPageHeader({ eyebrow, title, description, actions, back }: PublicPageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      {back ? (
        <Button asChild variant="ghost" className="-ml-3 w-fit text-muted-foreground max-sm:h-11">
          <Link href={back.href}>
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        </Button>
      ) : null}
      {eyebrow ? <p className="text-sm font-semibold text-primary">{eyebrow}</p> : null}
      <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h1>
      {description ? <p className="max-w-2xl text-lg text-muted-foreground">{description}</p> : null}
      {actions ? <div className="flex flex-wrap gap-3 pt-1">{actions}</div> : null}
    </header>
  );
}

/** Section heading inside a public page: one size everywhere. */
export function PublicSectionTitle({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn("text-xl font-semibold tracking-tight md:text-2xl", className)}>
      {children}
    </h2>
  );
}
