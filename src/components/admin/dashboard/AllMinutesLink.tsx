import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";

/**
 * "All minutes →" for a section card's header (dashboard and Gumba Project). An arrow and the link colour, so on
 * phones, where it wraps under the description, it still reads as a link and not a stray label. Its text lines
 * up with the card's content on phones and with the card's right edge from sm (R4 L9).
 */
export function AllMinutesLink() {
  return (
    <Button asChild variant="ghost" size="row" className="-ml-3 px-3 font-semibold text-primary hover:text-primary sm:-mr-3 sm:ml-0">
      <Link href="/admin/minutes?mode=records">
        All minutes
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}
