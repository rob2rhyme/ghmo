type AdminKpiCardProps = {
  label: string;
  value: string | number;
};

export default function AdminKpiCard({ label, value }: AdminKpiCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
