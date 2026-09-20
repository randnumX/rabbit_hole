import type { AnalysisResponse } from '@rabbithole/shared-types';
import fixture from '../../../examples/conversations/chatgpt-sample-analysis.json';

describe('golden AnalysisResponse fixture', () => {
  it('matches the AnalysisResponse shape and internally-consistent summary counts', () => {
    const response = fixture as unknown as AnalysisResponse;

    expect(typeof response.conversation_id).toBe('string');
    expect(['deterministic', 'hybrid', 'probabilistic']).toContain(response.analysis_mode);
    expect(typeof response.root_topic.label).toBe('string');
    expect(Array.isArray(response.root_topic.centroid_turn_ids)).toBe(true);
    expect(Array.isArray(response.turns)).toBe(true);
    expect(Array.isArray(response.edges)).toBe(true);

    expect(response.summary.total_turns).toBe(response.turns.length);
    expect(response.summary.rabbit_holes).toBe(response.turns.filter((t) => t.classification === 'RABBIT_HOLE').length);
    expect(response.summary.side_quests).toBe(response.turns.filter((t) => t.classification === 'SIDE_QUEST').length);
    expect(response.summary.returns_to_path).toBe(
      response.turns.filter((t) => t.classification === 'RETURN_TO_PATH').length,
    );

    for (const turn of response.turns) {
      expect(typeof turn.id).toBe('number');
      expect(typeof turn.topic_label).toBe('string');
      expect(typeof turn.cluster_id).toBe('number');
      expect(['ON_PATH', 'DEEPENING', 'SIDE_QUEST', 'RABBIT_HOLE', 'RETURN_TO_PATH']).toContain(turn.classification);
      expect(typeof turn.ui.path_type).toBe('string');
      expect(typeof turn.ui.node_type).toBe('string');
    }
  });
});
