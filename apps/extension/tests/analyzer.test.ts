import type { AnalysisRequest, ConversationTurn } from '@rabbithole/shared-types';
import { DriftAnalyzer } from '@/analysis/analyzer';
import { FakeEmbeddingProvider } from '@/analysis/embeddings';
import { contextualizePromptText } from '@/analysis/focus';
import { DEFAULT_CONFIG } from '@/analysis/config';

function buildRequest(): AnalysisRequest {
  const turns: ConversationTurn[] = [
    { id: 1, role: 'user', text: "Let's design a browser extension for ChatGPT." },
    { id: 2, role: 'assistant', text: 'We can use a content script and sidebar UI.' },
    { id: 3, role: 'user', text: 'How should the semantic drift visualization work?' },
    { id: 4, role: 'assistant', text: 'Show a side quest branch for an accessibility detour.' },
    { id: 5, role: 'user', text: 'Actually, how do regex capture groups work?' },
    { id: 6, role: 'assistant', text: 'We should return to the browser extension plan and transcript scrolling.' },
  ];
  return { conversation_id: 'fixture-conversation', source: 'debug', turns };
}

describe('DriftAnalyzer', () => {
  it('classifies path, side-quest, rabbit-hole, and return-to-path turns with the right edges', async () => {
    const request = buildRequest();
    const embeddings = [
      [1.0, 0.0, 0.0],
      [0.95, 0.05, 0.0],
      [0.9, 0.1, 0.0],
      [0.45, 0.7, 0.0],
      [0.0, 0.0, 1.0],
      [0.96, 0.12, 0.0],
    ];
    const analyzer = new DriftAnalyzer({ embeddingProvider: new FakeEmbeddingProvider(embeddings) });

    const response = await analyzer.analyze(request);

    expect(response.analysis_mode).toBe('deterministic');
    expect(response.turns[0].classification).toBe('ON_PATH');
    expect(response.turns[1].classification).toBe('ON_PATH');
    expect(['ON_PATH', 'DEEPENING']).toContain(response.turns[2].classification);
    expect(response.turns[3].classification).toBe('SIDE_QUEST');
    expect(response.turns[4].classification).toBe('RABBIT_HOLE');
    expect(response.turns[5].classification).toBe('RETURN_TO_PATH');
    expect(response.summary.rabbit_holes).toBe(1);
    expect(response.summary.side_quests).toBe(1);
    expect(response.summary.returns_to_path).toBe(1);
    expect(response.edges.some((edge) => edge.relationship === 'fork_out')).toBe(true);
    expect(response.edges.some((edge) => edge.relationship === 'backtrack')).toBe(true);
    expect(response.edges.some((edge) => edge.relationship === 'rejoin_path')).toBe(true);

    const branchTurn = response.turns[3];
    expect(branchTurn.lineage_id).not.toBeNull();
    expect(branchTurn.lineage_id!).toBeGreaterThan(0);
    expect(branchTurn.fork_turn_id).not.toBeNull();
  });

  it('does not misclassify legitimate deepening as a rabbit hole', async () => {
    const turns: ConversationTurn[] = [
      { id: 1, role: 'user', text: 'Plan the extension architecture.' },
      { id: 2, role: 'assistant', text: 'We need a background worker.' },
      { id: 3, role: 'user', text: 'How should the worker cache backend requests?' },
      { id: 4, role: 'assistant', text: 'Use a map keyed by page URL and turn count.' },
    ];
    const request: AnalysisRequest = {
      conversation_id: 'deepening-case',
      source: 'debug',
      analysis_mode: 'probabilistic',
      turns,
    };
    const embeddings = [
      [1.0, 0.0, 0.0],
      [0.98, 0.02, 0.0],
      [0.83, 0.15, 0.0],
      [0.78, 0.2, 0.0],
    ];
    const analyzer = new DriftAnalyzer({ embeddingProvider: new FakeEmbeddingProvider(embeddings) });

    const response = await analyzer.analyze(request);

    // No LLM configured -> probabilistic downgrades to deterministic.
    expect(response.analysis_mode).toBe('deterministic');
    expect(response.turns.every((turn) => turn.classification !== 'RABBIT_HOLE')).toBe(true);
    expect(response.turns.slice(2).some((turn) => turn.classification === 'DEEPENING' || turn.classification === 'ON_PATH')).toBe(
      true,
    );
  });

  it('keeps a technical troubleshooting thread on-path as terms become more specific', async () => {
    const turns: ConversationTurn[] = [
      {
        id: 1,
        role: 'user',
        text: 'User: What is the Alesis Nitro Max hi-hat control?\n\nAssistant: It controls open and closed hi-hat states.',
        prompt_text: 'What is the Alesis Nitro Max hi-hat control?',
        response_text: 'It controls open and closed hi-hat states.',
      },
      {
        id: 2,
        role: 'user',
        text: 'User: It stays closed after I lift my foot.\n\nAssistant: That points to calibration or pedal sensing.',
        prompt_text: 'It stays closed after I lift my foot.',
        response_text: 'That points to calibration or pedal sensing.',
      },
      {
        id: 3,
        role: 'user',
        text: 'User: The utility menu shows S-S.\n\nAssistant: S-S is splash sensitivity, not the core open-close sensor.',
        prompt_text: 'The utility menu shows S-S.',
        response_text: 'S-S is splash sensitivity, not the core open-close sensor.',
      },
      {
        id: 4,
        role: 'user',
        text: 'User: Can I fix the potentiometer?\n\nAssistant: Yes, if the hi-hat pedal sensor is dirty or worn.',
        prompt_text: 'Can I fix the potentiometer?',
        response_text: 'Yes, if the hi-hat pedal sensor is dirty or worn.',
      },
      {
        id: 5,
        role: 'user',
        text: 'User: How do I clean the membrane?\n\nAssistant: Use isopropyl alcohol on the membrane contacts and recalibrate the pedal.',
        prompt_text: 'How do I clean the membrane?',
        response_text: 'Use isopropyl alcohol on the membrane contacts and recalibrate the pedal.',
      },
    ];
    const request: AnalysisRequest = { conversation_id: 'drum-troubleshooting', source: 'debug', turns };
    const embeddings = [
      [1.0, 0.0, 0.0],
      [0.48, 0.52, 0.0],
      [0.36, 0.64, 0.0],
      [0.28, 0.72, 0.0],
      [0.22, 0.78, 0.0],
    ];
    const analyzer = new DriftAnalyzer({ embeddingProvider: new FakeEmbeddingProvider(embeddings) });

    const response = await analyzer.analyze(request);

    const classifications = response.turns.map((turn) => turn.classification);
    expect(classifications[0]).toBe('ON_PATH');
    expect(classifications.filter((c) => c === 'RABBIT_HOLE')).toHaveLength(0);
    expect(classifications.every((c) => ['ON_PATH', 'DEEPENING', 'SIDE_QUEST'].includes(c))).toBe(true);
    expect(['ON_PATH', 'DEEPENING']).toContain(classifications[classifications.length - 1]);
  });
});

describe('contextualizePromptText', () => {
  it('carries forward branch context for sparse follow-ups', () => {
    const prompt = 'Yes please. And I am 26 right now. Help me come with the best plan out there.';
    const previousContext =
      'Cost of a Class 1 aviation medical in India vs USA and the visa process for USA flight training.';

    const contextualized = contextualizePromptText(prompt, previousContext, DEFAULT_CONFIG);

    expect(contextualized.startsWith('Context:')).toBe(true);
    expect(contextualized).toContain('visa process');
    expect(contextualized).toContain(prompt);
  });

  it('does not carry forward context for an unrelated short prompt', () => {
    const prompt = 'What is water sold even though its a basic need?';
    const previousContext = 'How attention, embeddings, RoPE, and transformer vectors work inside an LLM.';

    const contextualized = contextualizePromptText(prompt, previousContext, DEFAULT_CONFIG);

    expect(contextualized).toBe(prompt);
  });
});

describe('DriftAnalyzer._prepareTurns (via prepareTurnsForTesting)', () => {
  it('keeps an unrelated short follow-up prompt uncontextualized', async () => {
    const turns: ConversationTurn[] = [
      {
        id: 1,
        role: 'user',
        text: 'Explain RoPE and attention in transformers.',
        prompt_text: 'Explain RoPE and attention in transformers.',
        response_text: 'RoPE rotates query and key vectors to encode relative position in attention.',
      },
      {
        id: 2,
        role: 'user',
        text: 'What is water sold even though its a basic need?',
        prompt_text: 'What is water sold even though its a basic need?',
      },
    ];
    const analyzer = new DriftAnalyzer({
      embeddingProvider: new FakeEmbeddingProvider([
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
      ]),
    });

    const prepared = await analyzer.prepareTurnsForTesting(turns, 'deterministic');

    expect(prepared[1].promptText).toBe('What is water sold even though its a basic need?');
  });
});
