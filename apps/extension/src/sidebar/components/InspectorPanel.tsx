import type { TurnAnalysis } from '@rabbithole/shared-types';
import { classificationCopy } from '@/sidebar/lib/classifications';
import { displayTopicLabel } from '@/sidebar/lib/labels';

interface InspectorPanelProps {
  turn: TurnAnalysis | null;
  onJumpToTurn: (turnId: number) => void;
}

function score(value: number): string {
  return value.toFixed(2);
}

export function InspectorPanel({ turn, onJumpToTurn }: InspectorPanelProps) {
  if (!turn) {
    return (
      <section className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-moon/65">
        Select a node to inspect why RabbitHole placed it on the trail.
      </section>
    );
  }

  const copy = classificationCopy[turn.classification];
  const topicLabel = displayTopicLabel(turn.topic_label, turn.prompt_text);

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-moon/55">Inspector</div>
          <div className="mt-1 text-lg font-semibold text-moon">{topicLabel}</div>
          <div className="mt-1 text-sm text-moon/60">
            Exchange {turn.id} - {turn.role}-led
          </div>
        </div>
        <div
          className="rounded-full border px-3 py-1 text-xs font-semibold"
          style={{
            borderColor: `${copy.accent}55`,
            backgroundColor: copy.fill,
            color: copy.accent,
          }}
        >
          {copy.label}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <ScoreCard label="Drift" value={score(turn.drift_score)} />
        <ScoreCard label="Root" value={score(turn.root_relevance_score)} />
        <ScoreCard label="Local" value={score(turn.local_coherence_score)} />
      </div>

      {turn.classification_probabilities ? (
        <div className="mt-4 rounded-2xl border border-white/8 bg-black/18 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-moon/45">Model confidence</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-moon/45">{turn.decision_source ?? 'deterministic'}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-moon/72">
            {Object.entries(turn.classification_probabilities).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-moon/45">{label.replaceAll('_', ' ')}</div>
                <div className="mt-1 text-sm font-semibold text-moon">{score(value)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-sm leading-relaxed text-moon/80">{turn.explanation}</p>

      {turn.response_focus_text ? (
        <div className="mt-4 rounded-2xl border border-cyan-300/14 bg-cyan-300/[0.06] p-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/60">Semantic focus</div>
          <p className="mt-2 text-sm leading-relaxed text-cyan-50/90">{turn.response_focus_text}</p>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/8 bg-black/18 p-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-moon/45">Message snippet</div>
        <p className="mt-2 text-sm leading-relaxed text-moon/78">{turn.text}</p>
      </div>

      <button
        type="button"
        className="mt-4 rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-moon/85 transition hover:bg-white/8"
        onClick={() => onJumpToTurn(turn.id)}
      >
        Jump to transcript
      </button>
    </section>
  );
}

function ScoreCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/18 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-moon/45">{label}</div>
      <div className="mt-1 text-lg font-semibold text-moon">{value}</div>
    </div>
  );
}
