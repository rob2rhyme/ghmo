//app/(public)/page.tsx
import Link from "next/link";
import Image from "next/image";
import ThemeLogo from "@/src/components/ThemeLogo";
import MultimediaHomeContent from "@/src/components/Multimedia/MultimediaHomeContent";

export default async function CommunityLanding() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center gap-6 px-1 py-12 text-center md:px-6">
      <div className="inline-flex items-center justify-center">
        <ThemeLogo />
      </div>
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-wide text-primary/80">
          Welcome to
        </p>
        <h1 className="text-4xl font-bold sm:text-5xl">
          Greater Harrisburg Magar Organization
        </h1>
        <div className="mx-auto max-w-3xl">
          <Image
            src="/assets/ghmo-akkha.png"
            alt="Greater Harrisburg Magar Organization emblem"
            width={800}
            height={320}
            className="h-auto w-full object-contain"
            priority
          />
        </div>
        <p className="max-w-3xl text-lg text-muted-foreground dark:text-slate-200">
          Secure, member-first hub with magic-link access, hardened admin controls,
          fundraising, document generation, and multimedia highlights.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/donate"
          className="rounded-md bg-primary px-5 py-3 text-white shadow-xs hover:bg-primary/90"
        >
          Donate
        </Link>
        <Link
          href="/docs/onboarding"
          className="rounded-md border border-border px-5 py-3 text-foreground hover:border-primary/40 dark:border-slate-700 dark:text-slate-100"
        >
          Onboarding Guide
        </Link>
        <Link
          href="/c/ghmo/events"
          className="rounded-md border border-border px-5 py-3 text-foreground hover:border-primary/40 dark:border-slate-700 dark:text-slate-100"
        >
          Events
        </Link>
      </div>
      <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 text-left shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase text-muted-foreground">Members</p>
          <p className="mt-1 text-sm text-foreground/80 dark:text-slate-200">
            Whitelist-only access with email magic links and audit logging.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-left shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase text-muted-foreground">Admins</p>
        <p className="mt-1 text-sm text-foreground/80 dark:text-slate-200">
          Magic-link login, meeting minutes, document tools, and GoFundMe
          reconciliation.
        </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-left shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase text-muted-foreground">Docs & Guides</p>
          <p className="mt-1 text-sm text-foreground/80 dark:text-slate-200">
            Keep operational instructions in the onboarding guide and expand as
            you grow.
          </p>
        </div>
      </div>
      <MultimediaHomeContent />
    </main>
  );
}
