import { classificationCopy } from '@/sidebar/lib/classifications';

const items = [
  { key: 'ON_PATH', label: 'Trail' },
  { key: 'SIDE_QUEST', label: 'Side quest' },
  { key: 'RABBIT_HOLE', label: 'Rabbit hole' },
  { key: 'RETURN_TO_PATH', label: 'Return' },
] as const;

export function Legend() {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-moon/55">Legend</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {items.map((item) => {
          const copy = classificationCopy[item.key];
          return (
            <div key={item.key} className="flex items-center gap-3 rounded-2xl border border-white/6 bg-black/16 px-3 py-2">
              <span
                className="h-3.5 w-3.5 rounded-full border"
                style={{ borderColor: copy.accent, backgroundColor: copy.fill }}
              />
              <span className="text-sm text-moon/80">{item.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
