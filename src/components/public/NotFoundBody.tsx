import Link from "next/link";
import type { Route } from "next";
import { SearchX } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { MessagePage } from "@/src/components/public/MessagePage";

const LINKS: { href: Route; label: string }[] = [
  { href: "/c/ghmo/events" as Route, label: "Events" },
  { href: "/donate", label: "Gumba Project" },
  { href: "/minutes", label: "Minutes" }
];

/** The 404 message, shared by app/global-not-found.tsx and each route group's not-found.tsx. */
export function NotFoundBody() {
  return (
    <MessagePage
      icon={<SearchX />}
      eyebrow="Error 404"
      title="Page not found"
      description="The page you are looking for does not exist or has moved. These links can help you find your way."
      actions={
        <>
          <Button asChild size="lg">
            <Link href="/">Go to the home page</Link>
          </Button>
          <span className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
            {LINKS.map(link => (
              <Button key={link.href} asChild size="lg" variant="link" className="text-foreground">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
          </span>
        </>
      }
    />
  );
}
