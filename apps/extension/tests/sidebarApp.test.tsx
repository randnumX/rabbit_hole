import { act, render, screen } from '@testing-library/react';
import type { AnalysisResponse } from '@rabbithole/shared-types';
import { SidebarApp } from '@/sidebar/App';
import { useSidebarStore } from '@/sidebar/store';
import type { SidebarBindings } from '@/sidebar/hooks/useSidebarController';

const bindings: SidebarBindings = {
  extractConversation: () => {
    throw new Error('not used');
  },
  analyzeRequest: async () => {
    throw new Error('not used');
  },
  loadSampleConversation: async () => {
    throw new Error('not used');
  },
  jumpToTurn: () => {},
  fetchBackendStatus: async () => ({
    status: 'online',
    checkedAt: Date.now(),
    availableModes: ['deterministic'],
  }),
  watchConversationActivity: () => () => {},
  setDockedLayout: () => {},
};

describe('SidebarApp launcher', () => {
  beforeEach(() => {
    useSidebarStore.setState({
      open: false,
      debugMode: false,
      busyState: 'idle',
      liveActivity: 'idle',
      error: null,
      warnings: [],
      backendStatus: {
        status: 'online',
        checkedAt: Date.now(),
        availableModes: ['deterministic'],
      },
      analysisMode: 'deterministic',
      analysis: null,
      lastRequest: null,
      selectedTurnId: null,
      debugTranscript: '',
      panelWidth: 400,
    });
  });

  it('renders a compact rabbit-only launcher that reflects the current classification', async () => {
    const analysis: AnalysisResponse = {
      conversation_id: 'launcher-state',
      analysis_mode: 'deterministic',
      root_topic: {
        label: 'root',
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
          text: 'Hole',
          topic_label: 'hole',
          cluster_id: 1,
          classification: 'RABBIT_HOLE',
          drift_score: 0.8,
          root_relevance_score: 0.2,
          local_coherence_score: 0.2,
          prev_similarity: 0.2,
          local_similarity: 0.2,
          root_similarity: 0.2,
          explanation: 'Hole',
          ui: { path_type: 'rabbit_hole', node_type: 'broken' },
        },
      ],
      edges: [],
      summary: {
        total_turns: 2,
        rabbit_holes: 1,
        side_quests: 0,
        returns_to_path: 0,
      },
    };

    useSidebarStore.setState({
      analysis,
      selectedTurnId: 2,
    });

    await act(async () => {
      render(<SidebarApp bindings={bindings} />);
    });

    expect(screen.getByRole('button', { name: 'Open RabbitHole (Rabbit hole)' })).toBeTruthy();
    expect(screen.queryByText(/Open trail view/i)).toBeNull();
  });

  it('switches the launcher rabbit into listening mode while the composer is active', async () => {
    useSidebarStore.setState({
      liveActivity: 'typing',
    });

    await act(async () => {
      render(<SidebarApp bindings={bindings} />);
    });

    expect(screen.getByRole('button', { name: 'Open RabbitHole (Listening)' })).toBeTruthy();
  });
});
