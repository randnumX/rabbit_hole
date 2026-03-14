import type { AnalysisRequest } from '@rabbithole/shared-types';
import { buildAnalysisRequestFingerprint } from '@/shared/requestFingerprint';

describe('buildAnalysisRequestFingerprint', () => {
  it('changes when the last exchange text changes even if the turn count does not', () => {
    const baseRequest: AnalysisRequest = {
      conversation_id: 'conversation',
      source: 'chatgpt',
      analysis_mode: 'deterministic',
      turns: [
        {
          id: 1,
          role: 'user',
          text: 'User: Explain RoPE\n\nAssistant: RoPE rotates vectors.',
          prompt_text: 'Explain RoPE',
          response_text: 'RoPE rotates vectors.',
        },
      ],
    };

    const updatedRequest: AnalysisRequest = {
      ...baseRequest,
      turns: [
        {
          ...baseRequest.turns[0],
          text: 'User: Explain RoPE\n\nAssistant: RoPE rotates query and key vectors for relative position.',
          response_text: 'RoPE rotates query and key vectors for relative position.',
        },
      ],
    };

    expect(buildAnalysisRequestFingerprint(updatedRequest)).not.toBe(buildAnalysisRequestFingerprint(baseRequest));
  });
});
