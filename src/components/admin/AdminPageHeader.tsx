import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type AdminPageHeaderProps = {
  title: string;
  /** One plain sentence (20 words or fewer) on what the page is for. */
  description?: ReactNode;
  /** The page's main action(s): one default-size primary, optionally an outline next to it. */
  actions?: ReactNode;
  /** Detail and form pages: a link back to the section, labelled with its name ("Events"). */
  back?: { href: Route; label: string };
  /** Small status shown beside the title (e.g. a Badge). */
  badge?: ReactNode;
};

export default function AdminPageHeader({ title, description, actions, back, badge }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      {back ? (
        <Button asChild variant="ghost" className="-ml-3 w-fit text-muted-foreground max-sm:h-11">
          <Link href={back.href}>
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        </Button>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl">{title}</h1>
            {badge}
          </div>
          {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground md:text-base">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
