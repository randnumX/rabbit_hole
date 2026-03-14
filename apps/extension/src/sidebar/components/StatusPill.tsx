import type { BackendStatusPayload } from '@/shared/messages';

interface StatusPillProps {
  status: BackendStatusPayload | null;
}

export function StatusPill({ status }: StatusPillProps) {
  const online = status?.status === 'online';
  const label = online ? (status?.fallbackActive ? 'Fallback embeddings' : 'Backend ready') : 'Demo mode';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
        online
          ? 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100'
          : 'border-orange-400/30 bg-orange-400/10 text-orange-100'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-300' : 'bg-orange-300'}`} />
      {label}
    </div>
  );
}
