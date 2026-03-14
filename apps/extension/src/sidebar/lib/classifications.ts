import type { AnalysisResponse, Classification, TurnAnalysis } from '@rabbithole/shared-types';

export const classificationCopy: Record<
  Classification,
  { label: string; glow: string; stroke: string; fill: string; accent: string }
> = {
  ON_PATH: {
    label: 'On path',
    glow: 'shadow-[0_0_24px_rgba(107,224,184,0.28)]',
    stroke: '#6be0b8',
    fill: 'rgba(107, 224, 184, 0.18)',
    accent: '#6be0b8',
  },
  DEEPENING: {
    label: 'Deepening',
    glow: 'shadow-[0_0_24px_rgba(133,200,255,0.24)]',
    stroke: '#8fd0ff',
    fill: 'rgba(143, 208, 255, 0.16)',
    accent: '#8fd0ff',
  },
  SIDE_QUEST: {
    label: 'Side quest',
    glow: 'shadow-[0_0_24px_rgba(244,205,104,0.22)]',
    stroke: '#f4cd68',
    fill: 'rgba(244, 205, 104, 0.16)',
    accent: '#f4cd68',
  },
  RABBIT_HOLE: {
    label: 'Rabbit hole',
    glow: 'shadow-[0_0_24px_rgba(244,122,85,0.26)]',
    stroke: '#f47a55',
    fill: 'rgba(244, 122, 85, 0.18)',
    accent: '#f47a55',
  },
  RETURN_TO_PATH: {
    label: 'Return',
    glow: 'shadow-[0_0_24px_rgba(172,164,255,0.24)]',
    stroke: '#aca4ff',
    fill: 'rgba(172, 164, 255, 0.16)',
    accent: '#aca4ff',
  },
};

export function getSelectedTurn(
  analysis: AnalysisResponse | null,
  selectedTurnId: number | null,
): TurnAnalysis | null {
  if (!analysis) {
    return null;
  }

  return analysis.turns.find((turn) => turn.id === selectedTurnId) ?? analysis.turns.at(-1) ?? null;
}

export function getCurrentClassification(
  analysis: AnalysisResponse | null,
  selectedTurnId: number | null,
): Classification | null {
  return getSelectedTurn(analysis, selectedTurnId)?.classification ?? null;
}

export function countTurnsByClassification(analysis: AnalysisResponse): Record<Classification, number> {
  return analysis.turns.reduce(
    (accumulator, turn) => {
      accumulator[turn.classification] += 1;
      return accumulator;
    },
    {
      ON_PATH: 0,
      DEEPENING: 0,
      SIDE_QUEST: 0,
      RABBIT_HOLE: 0,
      RETURN_TO_PATH: 0,
    } satisfies Record<Classification, number>,
  );
}
