import type { AnalysisResponse, TurnAnalysis } from '@rabbithole/shared-types';
import { classificationCopy } from '@/sidebar/lib/classifications';

interface SummaryCardProps {
  analysis: AnalysisResponse;
  selectedTurn: TurnAnalysis | null;
}

export function SummaryCard({ analysis, selectedTurn }: SummaryCardProps) {
  const currentClassification = selectedTurn?.classification ?? analysis.turns.at(-1)?.classification;
  const currentCopy = currentClassification ? classificationCopy[currentClassification] : null;

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/6 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-moon/55">Root topic</div>
          <div className="mt-1 text-lg font-semibold text-moon">{analysis.root_topic.label}</div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-moon/45">
            Mode: {analysis.analysis_mode.replaceAll('_', ' ')}
          </div>
        </div>
        {currentCopy ? (
          <div
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: `${currentCopy.accent}55`,
              backgroundColor: currentCopy.fill,
              color: currentCopy.accent,
            }}
          >
            {currentCopy.label}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Trail nodes" value={String(analysis.summary.total_turns)} />
        <Metric label="Rabbit holes" value={String(analysis.summary.rabbit_holes)} />
        <Metric label="Side quests" value={String(analysis.summary.side_quests)} />
        <Metric label="Returns" value={String(analysis.summary.returns_to_path)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/18 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-moon/45">{label}</div>
      <div className="mt-1 text-xl font-semibold text-moon">{value}</div>
    </div>
  );
}
