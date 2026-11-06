import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PublicPage, PublicPageHeader, PublicSectionTitle } from "@/src/components/public/PublicPage";
import { getContactEmail } from "@/src/lib/contact";
import { pageMetadata } from "@/src/lib/siteMetadata";

export const metadata: Metadata = pageMetadata("Privacy · GHMO", "What the GHMO website keeps about you, why, and how to ask for it to be removed.", "/privacy");

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <PublicSectionTitle>{title}</PublicSectionTitle>
      <div className="flex flex-col gap-3 text-base text-foreground/90">{children}</div>
    </section>
  );
}

/** Plain-words privacy notice. Describes what the code does; the board reviews the wording (plan §23). */
export default function PrivacyPage() {
  const contactEmail = getContactEmail();
  const ask = contactEmail ? (
    <>
      email{" "}
      <a href={`mailto:${contactEmail}`} className="font-semibold text-primary underline-offset-4 hover:underline">
        {contactEmail}
      </a>
    </>
  ) : (
    "tell a GHMO board member"
  );

  return (
    <PublicPage width="reading" className="gap-8">
      <PublicPageHeader title="Privacy" description="What this website keeps about you, why, and what you can ask us to do. Updated November 2026." />

      <Section title="Visiting the website">
        <p>There are no adverts, no analytics and no tracking cookies. We don&apos;t sell or share information about visitors.</p>
        <p>
          Like any website, the server that hosts it (Vercel) briefly records the address your request came from, to keep the site running and safe. To stop abuse,
          checking a document code and some other forms count requests per address for a short time; those counts delete themselves.
        </p>
        <p>
          The Media page shows pictures from GHMO&apos;s YouTube and Facebook pages, which your browser loads from those services. Videos and posts open on their own sites, under
          their own privacy rules. Donations are made on GoFundMe, which handles your payment; we only see the totals and what GoFundMe shares with organizers.
        </p>
        <p>Your browser may keep a copy of pages for offline use, and remembers whether you chose the light or dark look. You can clear both in your browser&apos;s settings.</p>
      </Section>

      <Section title="Members">
        <p>
          For members we keep a name, an email address and, if you gave one, a phone number, plus whether you agreed to emails or calls. Phone numbers and private notes
          are encrypted, so only board members&apos; own devices can read them, not the website&apos;s server.
        </p>
        <p>
          We use them to send GHMO announcements you agreed to, and for the board&apos;s calling list before events. Every announcement has a link to stop them. When you press it,
          we keep a record that you asked, with the time, your internet address and browser, so we can show we respected it.
        </p>
        <p>If you sign in with an email link, your browser remembers the address you typed until you finish signing in.</p>
      </Section>

      <Section title="Board members">
        <p>
          Board members sign in with a passkey and keep a sign-in cookie for up to 8 hours. To keep the organization&apos;s records safe, the site keeps a log of what board members
          change (who, what and when, with the internet address and browser used).
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          To see what we hold about you, correct it (including changing your email address), stop emails or calls, or have your member record removed, {ask}. A board member can remove a member and what is held about
          them from inside the site. If your record is removed after you asked us to stop emailing you, we keep only a scrambled copy of your address, so a later import doesn&apos;t start emails again.
        </p>
        <p>
          Approved meeting minutes are public on the <Link href="/minutes" className="font-semibold text-primary underline-offset-4 hover:underline">Minutes</Link> page and may
          name people who took part in a meeting.
        </p>
      </Section>
    </PublicPage>
  );
}
