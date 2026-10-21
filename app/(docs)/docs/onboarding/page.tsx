export default function OnboardingDocPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-6 py-10">
      <h1 className="text-3xl font-bold">Community Operations</h1>
      <p className="text-muted-foreground">
        This deployment is a single community instance for the Greater Harrisburg Magar Organization. Configure Firebase, GoFundMe Pro, and social handles via env vars, then manage content and meeting minutes from Admin. The full roadmap and security plan live in docs/PROJECT_PLAN.md.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-foreground/80">
        <li>Define environment variables before running the app (Firebase client + admin, GoFundMe Pro secrets, social URLs).</li>
        <li>
          Set `FEATURE_EMAIL_ADMIN_LOGIN=true`. Admins sign in with an email magic link at `/admin/login` (PIN login
          has been removed).
        </li>
        <li>
          Every admin signs in with a passkey (fingerprint, face or device PIN). The first time, use the email link on
          `/admin/login`, then create a passkey. Add a second passkey on another device under Admin → Security.
        </li>
        <li>
          Lost a device? Use the email link again and create a new passkey. Another admin must approve it under Admin →
          Security before it works; confirm with them by phone or in person first.
        </li>
        <li>
          First admin: set `BOOTSTRAP_ADMIN_SECRET` (32+ random characters), then `POST /api/admin/bootstrap` with
          the secret, email and name. It works once; remove the secret afterwards.
        </li>
        <li>Use the manual reconcile action to sync donation totals after webhook setup.</li>
        <li>
          Allowlist admins by adding docs under `organizations/ghmo/admins` with `emailLower` and
          `status: &quot;active&quot;` (and optional `name`/`roles`) set.
        </li>
        <li>
          End-to-end encryption (planned): before it is switched on, two named trustees must each keep a paper copy of
          the recovery key. Without it, losing every admin device means losing all encrypted data.
        </li>
      </ul>
    </main>
  );
}
