export default function OnboardingDocPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-6 py-10">
      <h1 className="text-3xl font-bold">Community Operations</h1>
      <p className="text-slate-600">
        This deployment is a single community instance for the Greater Harrisburg Magar Organization. Configure Firebase, GoFundMe Pro, and social handles via env vars, then manage content, pins, and timelines from Admin.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-slate-700">
        <li>Define environment variables before running the app (Firebase client + admin, GoFundMe Pro secrets, social URLs).</li>
        <li>Login as admin with the configured PIN to access dashboard, content blocks, PINs, and timeline tools.</li>
        <li>Use the manual reconcile action to sync donation totals after webhook setup.</li>
        <li>Whitelist members by adding docs under `community/ghmo-site/members` with `emailLower` set.</li>
      </ul>
    </main>
  );
}
