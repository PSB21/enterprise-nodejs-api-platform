const STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 ring-rose-200',
  revoked: 'bg-slate-100 text-slate-700 ring-slate-300',
  published: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  draft: 'bg-slate-100 text-slate-700 ring-slate-300',
  deprecated: 'bg-orange-50 text-orange-800 ring-orange-200',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STYLES[status] ?? STYLES.draft}`}
    >
      {status}
    </span>
  );
}
