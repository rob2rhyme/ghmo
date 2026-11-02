import "server-only";

import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, Clock, ExternalLink, Mail } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { SocialIcon } from "@/src/components/public/SocialIcon";
import { getSocialProfiles } from "@/src/components/public/socialProfiles";
import { getContactEmail } from "@/src/lib/contact";
import { cn } from "@/src/lib/utils";

type DonateActionProps = {
  /** The GoFundMe campaign page from getDonateUrl(); null until a real link is set. */
  donateUrl: string | null;
  label?: string;
  /** While donations are closed, also offer other ways to take part (events, YouTube, email). */
  alternatives?: boolean;
  className?: string;
};

/**
 * The main "give" action: a GoFundMe button when the campaign link is set. Until then, a calm "open soon"
 * notice and, so the page is not a dead end, other ways to take part.
 */
export function DonateAction({ donateUrl, label = "Donate via GoFundMe", alternatives = true, className }: DonateActionProps) {
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

  const youtube = alternatives ? getSocialProfiles().find(profile => profile.source === "youtube") : undefined;
  const contactEmail = alternatives ? getContactEmail() : null;

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <Alert variant="info" role="note">
        <Clock />
        <AlertTitle>Donations open soon</AlertTitle>
        <AlertDescription>Our GoFundMe page is being set up. Please check back here.</AlertDescription>
      </Alert>
      {alternatives ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href={"/c/ghmo/events" as Route}>
              <CalendarDays aria-hidden="true" />
              See upcoming events
            </Link>
          </Button>
          {youtube ? (
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href={youtube.href} target="_blank" rel="noreferrer">
                <SocialIcon source="youtube" className="size-4" />
                Watch us on YouTube
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          ) : null}
          {contactEmail ? (
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href={`mailto:${contactEmail}`}>
                <Mail aria-hidden="true" />
                Email us
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
