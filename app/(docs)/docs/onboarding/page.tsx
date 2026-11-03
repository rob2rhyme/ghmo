import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LifeBuoy, LockKeyhole, LogIn, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PublicPage, PublicPageHeader } from "@/src/components/public/PublicPage";
import { Button } from "@/src/components/ui/button";

export const metadata: Metadata = { title: "Board member guide · GHMO" };

type Section = { icon: LucideIcon; title: string; steps: string[]; note?: string };

const SECTIONS: Section[] = [
  {
    icon: LogIn,
    title: "Signing in for the first time",
    steps: [
      "Ask a super admin to add your email address to the board list.",
      "Open Board member sign in, type your email and press “Email me a sign-in link”.",
      "Open the link from your email on the same device.",
      "Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or similar) and scan the QR code shown on screen.",
      "Type the 6-digit code from the app. You will see 8 recovery codes once: write them down and keep them somewhere other than your email."
    ]
  },
  {
    icon: Smartphone,
    title: "Signing in after that",
    steps: [
      "Request an email link as before, then type the current 6-digit code from your authenticator app.",
      "Optional and faster: add a passkey under Security. A passkey lets you sign in with your fingerprint, face or phone screen lock."
    ]
  },
  {
    icon: LockKeyhole,
    title: "Setting up encryption on your device",
    steps: [
      "Open Encryption in the admin menu and give this device a name you will recognize, such as “Sita’s laptop”.",
      "Another board member approves your device. Before they do, compare the safety code on both screens by phone or in person.",
      "After that, private records (chat, minutes, phone numbers) open on this device. Lock it when you step away."
    ],
    note: "A super admin turns encryption on once, with two trusted people present. Each of them keeps a paper copy of the recovery key."
  },
  {
    icon: LifeBuoy,
    title: "If you lose your phone or leave the board",
    steps: [
      "Lost your phone: sign in with one of your recovery codes, or ask a super admin to reset your authenticator app.",
      "Lost a device that was set up for encryption: tell a super admin straight away so they can remove it.",
      "Leaving the board: a super admin turns off your access and removes your devices."
    ]
  }
];

export default function OnboardingDocPage() {
  return (
    <PublicPage width="reading">
      <PublicPageHeader
        eyebrow="For board members"
        title="Board member guide"
        description="How to sign in to the GHMO admin console, keep your account safe, and set up encryption on your devices."
        actions={
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/admin/login">
              <KeyRound aria-hidden="true" />
              Board member sign in
            </Link>
          </Button>
        }
      />

      <ol className="flex flex-col gap-4">
        {SECTIONS.map(({ icon: Icon, title, steps, note }) => (
          <li key={title} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs md:p-6">
            <h2 className="flex items-center gap-3 text-lg font-semibold">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              {title}
            </h2>
            <ol className="flex list-decimal flex-col gap-2 pl-6 text-foreground/90 marker:font-semibold marker:text-muted-foreground">
              {steps.map(step => (
                <li key={step} className="pl-1">
                  {step}
                </li>
              ))}
            </ol>
            {note ? <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">{note}</p> : null}
          </li>
        ))}
      </ol>
    </PublicPage>
  );
}
