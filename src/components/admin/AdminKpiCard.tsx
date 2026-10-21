type AdminKpiCardProps = {
  label: string;
  value: string | number;
};

export default function AdminKpiCard({ label, value }: AdminKpiCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
