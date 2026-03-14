import { render, screen, within } from '@testing-library/react';
import type { AnalysisResponse } from '@rabbithole/shared-types';
import { TimelineStrip } from '@/sidebar/components/TimelineStrip';

describe('TimelineStrip', () => {
  it('renders fork, backtrack, return, and hole markers on the relevant turns', () => {
    const analysis: AnalysisResponse = {
      conversation_id: 'timeline-markers',
      analysis_mode: 'deterministic',
      root_topic: {
        label: 'main path',
        centroid_turn_ids: [1],
      },
      turns: [
        {
          id: 1,
          role: 'user',
          text: 'Start',
          topic_label: 'start',
          cluster_id: 0,
          classification: 'ON_PATH',
          drift_score: 0.1,
          root_relevance_score: 0.9,
          local_coherence_score: 0.9,
          prev_similarity: 1,
          local_similarity: 0.9,
          root_similarity: 0.9,
          explanation: 'Start',
          ui: { path_type: 'main', node_type: 'start' },
        },
        {
          id: 2,
          role: 'assistant',
          text: 'Fork',
          topic_label: 'fork',
          cluster_id: 1,
          lineage_id: 1,
          fork_turn_id: 1,
          anchor_turn_id: 1,
          classification: 'SIDE_QUEST',
          drift_score: 0.4,
          root_relevance_score: 0.6,
          local_coherence_score: 0.6,
          prev_similarity: 0.5,
          local_similarity: 0.6,
          root_similarity: 0.6,
          explanation: 'Fork',
          ui: { path_type: 'side', node_type: 'normal' },
        },
        {
          id: 3,
          role: 'user',
          text: 'Return',
          topic_label: 'return',
          cluster_id: 0,
          lineage_id: 0,
          anchor_turn_id: 1,
          classification: 'RETURN_TO_PATH',
          drift_score: 0.2,
          root_relevance_score: 0.8,
          local_coherence_score: 0.7,
          prev_similarity: 0.4,
          local_similarity: 0.7,
          root_similarity: 0.8,
          explanation: 'Return',
          ui: { path_type: 'return', node_type: 'return' },
        },
        {
          id: 4,
          role: 'assistant',
          text: 'Hole',
          topic_label: 'hole',
          cluster_id: 3,
          lineage_id: 2,
          anchor_turn_id: 3,
          classification: 'RABBIT_HOLE',
          drift_score: 0.9,
          root_relevance_score: 0.2,
          local_coherence_score: 0.2,
          prev_similarity: 0.2,
          local_similarity: 0.2,
          root_similarity: 0.2,
          explanation: 'Hole',
          ui: { path_type: 'rabbit_hole', node_type: 'broken' },
        },
      ],
      edges: [
        {
          source: 1,
          target: 2,
          relationship: 'fork_out',
          strength: 0.5,
          transition_id: 'transition-2',
          sequence: 0,
        },
        {
          source: 2,
          target: 1,
          relationship: 'backtrack',
          strength: 0.5,
          transition_id: 'transition-3',
          sequence: 0,
        },
        {
          source: 1,
          target: 3,
          relationship: 'rejoin_path',
          strength: 0.5,
          transition_id: 'transition-3',
          sequence: 1,
        },
        {
          source: 3,
          target: 4,
          relationship: 'rabbit_hole_jump',
          strength: 0.2,
          transition_id: 'transition-4',
          sequence: 0,
        },
      ],
      summary: {
        total_turns: 4,
        rabbit_holes: 1,
        side_quests: 1,
        returns_to_path: 1,
      },
    };

    render(<TimelineStrip analysis={analysis} selectedTurnId={3} onSelectTurn={() => {}} />);

    const turn2 = screen.getByRole('button', { name: 'Timeline turn 2' });
    expect(within(turn2).getByLabelText('Fork marker')).toBeTruthy();
    expect(within(turn2).getByLabelText('Backtrack marker')).toBeTruthy();

    const turn3 = screen.getByRole('button', { name: 'Timeline turn 3' });
    expect(within(turn3).getByLabelText('Return marker')).toBeTruthy();

    const turn4 = screen.getByRole('button', { name: 'Timeline turn 4' });
    expect(within(turn4).getByLabelText('Hole marker')).toBeTruthy();
  });
});
