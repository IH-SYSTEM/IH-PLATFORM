const STATUS = {
  pending: { label: "確認中", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "承認済み", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "却下", cls: "bg-accent-soft text-accent" },
} as const;

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? STATUS.pending;
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}
