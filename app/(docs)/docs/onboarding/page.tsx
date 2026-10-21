export default function OnboardingDocPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-6 py-10">
      <h1 className="text-3xl font-bold">Community Operations</h1>
      <p className="text-slate-600">
        This deployment is a single community instance for the Greater Harrisburg Magar Organization. Configure Firebase, GoFundMe Pro, and social handles via env vars, then manage content and meeting minutes from Admin. The full roadmap and security plan live in docs/PROJECT_PLAN.md.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-slate-700">
        <li>Define environment variables before running the app (Firebase client + admin, GoFundMe Pro secrets, social URLs).</li>
        <li>
          Set `FEATURE_EMAIL_ADMIN_LOGIN=true` and `FEATURE_PIN_LOGIN=false`. PIN login is being removed; admins sign in
          with an email magic link at `/admin/login`.
        </li>
        <li>Passkeys will be required for every admin once Phase 2 ships. Magic links will then be used only for first setup and lost-device recovery.</li>
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
