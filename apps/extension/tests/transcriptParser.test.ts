import { buildDebugAnalysisRequest, parseDebugTranscript } from '@/shared/transcript';

describe('parseDebugTranscript', () => {
  it('parses role-prefixed transcripts', () => {
    const turns = parseDebugTranscript(`
      User: Build a browser extension
      Assistant: Start with the manifest
      User: How do I render the rabbit trail?
    `);

    expect(turns).toEqual([
      { id: 1, role: 'user', text: 'Build a browser extension' },
      { id: 2, role: 'assistant', text: 'Start with the manifest' },
      { id: 3, role: 'user', text: 'How do I render the rabbit trail?' },
    ]);
  });

  it('builds a debug analysis request', () => {
    const request = buildDebugAnalysisRequest([
      { id: 1, role: 'user', text: 'Hello' },
      { id: 2, role: 'assistant', text: 'World' },
    ]);

    expect(request.conversation_id).toBe('debug-pasted-transcript');
    expect(request.source).toBe('debug');
  });
});
