import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

type MessagePageProps = {
  icon?: ReactNode;
  /** Small label above the title, e.g. "Error 404". */
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Primary action first, then secondary ones (Buttons, size="lg"). */
  actions?: ReactNode;
  children?: ReactNode;
  /** "page" for a whole-page message (404, link doesn't work); "inline" inside a page. */
  variant?: "page" | "inline";
  className?: string;
  /** Heading level: h1 when the message is the page. */
  as?: "h1" | "h2";
};

/**
 * One look for every "we can't help you here" message: 404, a link that doesn't work, a board-only tool,
 * an event that isn't available, an error page. Icon tile, title, one sentence, then the ways forward.
 */
export function MessagePage({ icon, eyebrow, title, description, actions, children, variant = "page", className, as: Heading = "h1" }: MessagePageProps) {
  return (
    <div
      role={variant === "inline" ? "status" : undefined}
      className={cn("mx-auto flex w-full max-w-lg flex-col items-center gap-4 text-center", variant === "page" ? "py-12 md:py-16" : "py-8", className)}
    >
      {icon ? (
        <span className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-7" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-2">
        {eyebrow ? <p className="text-sm font-semibold text-primary">{eyebrow}</p> : null}
        <Heading className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{title}</Heading>
        {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:flex-wrap">{actions}</div> : null}
      {children}
    </div>
  );
}
