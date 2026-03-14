import { collapseConversationTurns, isLowSignalAcknowledgement } from '@/shared/conversation';

describe('collapseConversationTurns', () => {
  it('collapses prompt and response into exchange-level nodes', () => {
    const turns = collapseConversationTurns([
      { id: 1, role: 'user', text: 'Build the extension' },
      { id: 2, role: 'assistant', text: 'Start with the manifest' },
      { id: 3, role: 'user', text: 'How should the sidebar work?' },
      { id: 4, role: 'assistant', text: 'Inject a docked panel' },
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0].text).toContain('User: Build the extension');
    expect(turns[0].text).toContain('Assistant: Start with the manifest');
    expect(turns[0].prompt_text).toBe('Build the extension');
    expect(turns[0].response_text).toBe('Start with the manifest');
    expect(turns[1].text).toContain('Inject a docked panel');
  });

  it('keeps acknowledgements from creating a separate node', () => {
    const turns = collapseConversationTurns([
      { id: 1, role: 'user', text: 'Explain the main trail.' },
      { id: 2, role: 'assistant', text: 'The rabbit stays centered on the main path.' },
      { id: 3, role: 'user', text: 'okay' },
      { id: 4, role: 'assistant', text: 'Side quests branch left or right.' },
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].text).toContain('User: okay');
    expect(turns[0].prompt_text).toBe('Explain the main trail.');
    expect(turns[0].response_text).toContain('The rabbit stays centered');
  });

  it('detects low-signal acknowledgements', () => {
    expect(isLowSignalAcknowledgement('yes')).toBe(true);
    expect(isLowSignalAcknowledgement('thanks')).toBe(true);
    expect(isLowSignalAcknowledgement('why?')).toBe(false);
  });
});
