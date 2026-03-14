import type { AnalysisResponse } from '@rabbithole/shared-types';
import sampleAnalysis from '../../../examples/conversations/chatgpt-sample-analysis.json';
import { buildTrailLayout } from '@/sidebar/lib/layout';

describe('buildTrailLayout', () => {
  it('positions rabbit holes off the center lane and returns on the center lane', () => {
    const layout = buildTrailLayout(sampleAnalysis as AnalysisResponse, 9);
    const mainTurn = layout.turns.find((turn) => turn.id === 4)!;
    const rabbitHoleTurn = layout.turns.find((turn) => turn.id === 7)!;
    const returnTurn = layout.turns.find((turn) => turn.id === 9)!;

    expect(mainTurn.x).toBe(returnTurn.x);
    expect(rabbitHoleTurn.x).not.toBe(mainTurn.x);
    expect(Math.abs(rabbitHoleTurn.x - mainTurn.x)).toBeGreaterThan(100);
  });

  it('groups backtrack and rejoin edges into a single rabbit traversal route', () => {
    const analysis: AnalysisResponse = {
      conversation_id: 'branch-route',
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
          lineage_id: 0,
          classification: 'ON_PATH',
          drift_score: 0.1,
          root_relevance_score: 0.9,
          local_coherence_score: 0.9,
          prev_similarity: 1,
          local_similarity: 0.9,
          root_similarity: 0.9,
          explanation: 'Start.',
          ui: { path_type: 'main', node_type: 'start' },
        },
        {
          id: 2,
          role: 'assistant',
          text: 'Branch out',
          topic_label: 'branch',
          cluster_id: 1,
          lineage_id: 1,
          fork_turn_id: 1,
          anchor_turn_id: 1,
          classification: 'SIDE_QUEST',
          drift_score: 0.3,
          root_relevance_score: 0.6,
          local_coherence_score: 0.7,
          prev_similarity: 0.6,
          local_similarity: 0.7,
          root_similarity: 0.6,
          explanation: 'Branch.',
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
          local_coherence_score: 0.8,
          prev_similarity: 0.55,
          local_similarity: 0.8,
          root_similarity: 0.8,
          explanation: 'Return.',
          ui: { path_type: 'return', node_type: 'return' },
        },
      ],
      edges: [
        {
          source: 1,
          target: 2,
          relationship: 'fork_out',
          strength: 0.6,
          transition_id: 'transition-2',
          sequence: 0,
        },
        {
          source: 2,
          target: 1,
          relationship: 'backtrack',
          strength: 0.55,
          transition_id: 'transition-3',
          sequence: 0,
        },
        {
          source: 1,
          target: 3,
          relationship: 'rejoin_path',
          strength: 0.55,
          transition_id: 'transition-3',
          sequence: 1,
        },
      ],
      summary: {
        total_turns: 3,
        rabbit_holes: 0,
        side_quests: 1,
        returns_to_path: 1,
      },
    };

    const layout = buildTrailLayout(analysis, 3);

    expect(layout.rabbit?.route).toHaveLength(2);
    expect(layout.rabbit?.route[0].relationship).toBe('backtrack');
    expect(layout.rabbit?.route[1].relationship).toBe('rejoin_path');
    expect(layout.rabbit?.activeTransitionId).toBe('transition-3');
  });
});
