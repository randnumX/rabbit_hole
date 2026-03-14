import type { AnalysisResponse, EdgeRelationship, TrailEdge } from '@rabbithole/shared-types';
import { classificationCopy } from '@/sidebar/lib/classifications';

interface TimelineStripProps {
  analysis: AnalysisResponse;
  selectedTurnId: number | null;
  onSelectTurn: (turnId: number) => void;
}

interface TimelineMarker {
  relationship: EdgeRelationship;
  label: string;
  accent: string;
}

const TIMELINE_MARKER_ORDER: EdgeRelationship[] = [
  'fork_out',
  'backtrack',
  'rejoin_path',
  'rabbit_hole_jump',
];

function markerForEdge(edge: TrailEdge, turnId: number): TimelineMarker | null {
  if (edge.relationship === 'fork_out' && edge.target === turnId) {
    return { relationship: edge.relationship, label: 'Fork', accent: '#f5d15b' };
  }

  if (edge.relationship === 'backtrack' && edge.source === turnId) {
    return { relationship: edge.relationship, label: 'Backtrack', accent: '#86b9ff' };
  }

  if (edge.relationship === 'rejoin_path' && edge.target === turnId) {
    return { relationship: edge.relationship, label: 'Return', accent: '#b89cff' };
  }

  if (edge.relationship === 'rabbit_hole_jump' && edge.target === turnId) {
    return { relationship: edge.relationship, label: 'Hole', accent: '#ff8a5f' };
  }

  return null;
}

function markersForTurn(analysis: AnalysisResponse, turnId: number): TimelineMarker[] {
  const markers = analysis.edges
    .map((edge) => markerForEdge(edge, turnId))
    .filter((marker): marker is TimelineMarker => marker !== null);

  markers.sort(
    (left, right) =>
      TIMELINE_MARKER_ORDER.indexOf(left.relationship) - TIMELINE_MARKER_ORDER.indexOf(right.relationship),
  );

  return markers;
}

function MarkerGlyph({ relationship, accent }: TimelineMarker) {
  if (relationship === 'fork_out') {
    return (
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9V3" />
        <path d="M3 4.5h3.5c1 0 2-.8 2-1.9V2" />
        <circle cx="3" cy="9" r="1" fill={accent} stroke="none" />
        <circle cx="8.5" cy="2" r="1" fill={accent} stroke="none" />
      </svg>
    );
  }

  if (relationship === 'backtrack') {
    return (
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3.5H5.5A2.5 2.5 0 0 0 3 6v2" />
        <path d="M4.8 7.2 3 9 1.2 7.2" />
      </svg>
    );
  }

  if (relationship === 'rejoin_path') {
    return (
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2.5v3.5A2.5 2.5 0 0 0 5.5 8.5H9" />
        <path d="M7.2 6.7 9 8.5 7.2 10.3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3.5" strokeDasharray="2 2" />
      <path d="M4.2 4.1 7.8 7.9M7.5 4 5.7 6.2 7 8" />
    </svg>
  );
}

export function TimelineStrip({ analysis, selectedTurnId, onSelectTurn }: TimelineStripProps) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/5 p-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.22em] text-moon/55">Timeline</div>
        <div className="text-[11px] uppercase tracking-[0.16em] text-moon/40">Overview</div>
      </div>
      <div className="rabbithole-scrollbar-hidden relative mt-3 overflow-x-auto pb-1">
        <div className="pointer-events-none absolute left-0 right-0 top-6 h-px bg-white/8" />
        <div className="relative flex min-w-max items-center gap-2 pr-1">
          {analysis.turns.map((turn) => {
            const copy = classificationCopy[turn.classification];
            const active = turn.id === selectedTurnId;
            const markers = markersForTurn(analysis, turn.id);
            return (
              <button
                key={turn.id}
                type="button"
                className={`flex min-w-[34px] shrink-0 flex-col items-center rounded-[18px] border px-2 py-1.5 text-[10px] transition ${
                  active
                    ? 'border-white/20 bg-white/10 text-moon shadow-[0_0_24px_rgba(255,255,255,0.08)]'
                    : 'border-white/8 bg-black/18 text-moon/62 hover:bg-white/8'
                }`}
                onClick={() => onSelectTurn(turn.id)}
                aria-label={`Timeline turn ${turn.id}`}
              >
                <div className="flex min-h-[14px] items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 rounded-full border"
                    style={{ borderColor: copy.accent, backgroundColor: copy.fill }}
                  />
                  {markers.length ? (
                    <div className="flex items-center gap-1">
                      {markers.map((marker) => (
                        <span
                          key={`${turn.id}-${marker.relationship}`}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/8 bg-black/22"
                          title={marker.label}
                          aria-label={`${marker.label} marker`}
                        >
                          <MarkerGlyph {...marker} />
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span className="mt-1.5 font-semibold">{turn.id}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
