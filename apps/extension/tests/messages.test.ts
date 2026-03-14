import type { AnalysisResponse } from '@rabbithole/shared-types';
import sampleAnalysis from '../../../examples/conversations/chatgpt-sample-analysis.json';
import { buildScrollMessage } from '@/shared/messages';
import { countTurnsByClassification, getCurrentClassification } from '@/sidebar/lib/classifications';

describe('extension messaging helpers', () => {
  it('builds scroll-to-turn payloads', () => {
    expect(buildScrollMessage(7)).toEqual({
      type: 'SCROLL_TO_TURN',
      payload: { turnId: 7 },
    });
  });

  it('derives summary counts and current classification from analysis payloads', () => {
    const analysis = sampleAnalysis as AnalysisResponse;
    const counts = countTurnsByClassification(analysis);
    const current = getCurrentClassification(analysis, 9);

    expect(counts.RABBIT_HOLE).toBe(2);
    expect(counts.SIDE_QUEST).toBe(2);
    expect(current).toBe('RETURN_TO_PATH');
  });
});
