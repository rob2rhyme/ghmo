import { Clock, ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

type DonateActionProps = {
  /** The GoFundMe campaign page from getDonateUrl(); null until a real link is set. */
  donateUrl: string | null;
  label?: string;
  className?: string;
};

/** The main "give" action: a GoFundMe button when the campaign link is set, otherwise a calm "open soon" note. */
export function DonateAction({ donateUrl, label = "Donate via GoFundMe", className }: DonateActionProps) {
  if (donateUrl) {
    return (
      <Button asChild size="lg" className={cn("w-full sm:w-auto", className)}>
        <a href={donateUrl} target="_blank" rel="noreferrer">
          {label}
          <ExternalLink aria-hidden="true" />
          <span className="sr-only">(opens GoFundMe in a new tab)</span>
        </a>
      </Button>
    );
  }
  return (
    <p className={cn("flex items-start gap-2 rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground", className)}>
      <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        <span className="font-semibold">Donations open soon.</span> Our GoFundMe page is being set up — please check back here.
      </span>
    </p>
  );
}
