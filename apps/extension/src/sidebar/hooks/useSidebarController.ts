import { useEffect, useMemo, useRef } from 'react';
import type { AnalysisMode, AnalysisRequest } from '@rabbithole/shared-types';
import type { ConversationActivityHandlers } from '@/adapters/types';
import type {
  AnalyzeResponsePayload,
  BackendStatusPayload,
  SampleConversationPayload,
} from '@/shared/messages';
import { buildAnalysisRequestFingerprint } from '@/shared/requestFingerprint';
import { buildDebugAnalysisRequest, parseDebugTranscript } from '@/shared/transcript';
import type { TranscriptTargetContext } from '@/shared/transcriptTarget';
import { useSidebarStore } from '@/sidebar/store';

export interface SidebarBindings {
  extractConversation: () => { request: AnalysisRequest; warnings: string[] };
  analyzeRequest: (request: AnalysisRequest, force: boolean) => Promise<AnalyzeResponsePayload>;
  loadSampleConversation: () => Promise<SampleConversationPayload>;
  jumpToTurn: (turnId: number, context?: TranscriptTargetContext) => void;
  fetchBackendStatus: () => Promise<BackendStatusPayload>;
  watchConversationActivity: (handlers: ConversationActivityHandlers) => () => void;
  setDockedLayout: (open: boolean, width: number) => void;
}

export function useSidebarController(bindings: SidebarBindings) {
  const store = useSidebarStore();
  const lastAnalyzedFingerprintRef = useRef<string | null>(null);
  const autoAnalysisInFlightRef = useRef(false);
  const pendingAutoAnalysisRef = useRef(false);

  function withMode(request: AnalysisRequest): AnalysisRequest {
    return {
      ...request,
      analysis_mode: useSidebarStore.getState().analysisMode,
    };
  }

  function syncModeAvailability(status: BackendStatusPayload) {
    const availableModes = status.availableModes ?? ['deterministic'];
    const currentStore = useSidebarStore.getState();
    if (!availableModes.includes(currentStore.analysisMode)) {
      currentStore.setAnalysisMode('deterministic');
    }
  }

  useEffect(() => {
    void refreshBackendStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bindings.setDockedLayout(store.open, store.panelWidth);
    return () => bindings.setDockedLayout(false, store.panelWidth);
  }, [bindings, store.open, store.panelWidth]);

  useEffect(() => {
    return bindings.watchConversationActivity({
      onTypingChange(typing) {
        const currentStore = useSidebarStore.getState();
        if (typing) {
          currentStore.setLiveActivity('typing');
          return;
        }
        if (currentStore.liveActivity === 'typing') {
          currentStore.setLiveActivity('idle');
        }
      },
      onWaitingChange(waiting) {
        const currentStore = useSidebarStore.getState();
        if (waiting) {
          currentStore.setLiveActivity('waiting');
          return;
        }
        if (currentStore.liveActivity === 'waiting') {
          currentStore.setLiveActivity('idle');
        }
      },
      onConversationSettled() {
        void autoAnalyzeConversation();
      },
    });
  }, [bindings]);

  async function refreshBackendStatus() {
    const status = await bindings.fetchBackendStatus();
    const currentStore = useSidebarStore.getState();
    currentStore.setBackendStatus(status);
    syncModeAvailability(status);
    if (status.status === 'offline' && !currentStore.analysis) {
      currentStore.setDebugMode(true);
      return;
    }
    if (status.status === 'online') {
      void autoAnalyzeConversation();
    }
  }

  async function runAnalysisRequest(
    request: AnalysisRequest,
    force: boolean,
    options: { openPanel?: boolean; suppressErrors?: boolean } = {},
  ) {
    const { openPanel = true, suppressErrors = false } = options;
    const requestWithMode = withMode(request);
    const currentStore = useSidebarStore.getState();
    currentStore.setBusyState('analyzing');
    if (!suppressErrors) {
      currentStore.setError(null);
    }
    currentStore.setLastRequest(requestWithMode);

    try {
      const result = await bindings.analyzeRequest(requestWithMode, force);
      const nextStore = useSidebarStore.getState();
      nextStore.setAnalysisMode(result.analysis.analysis_mode ?? requestWithMode.analysis_mode ?? 'deterministic');
      nextStore.setAnalysis(result.analysis);
      nextStore.setBusyState('idle');
      if (openPanel) {
        nextStore.setOpen(true);
      }
      if (nextStore.liveActivity === 'waiting') {
        nextStore.setLiveActivity('idle');
      }
      lastAnalyzedFingerprintRef.current = buildAnalysisRequestFingerprint(requestWithMode);
      return result;
    } catch (error) {
      const nextStore = useSidebarStore.getState();
      nextStore.setBusyState('idle');
      if (!suppressErrors) {
        nextStore.setError(error instanceof Error ? error.message : 'Unable to analyze this conversation.');
        nextStore.setDebugMode(true);
      }
      throw error;
    }
  }

  async function autoAnalyzeConversation() {
    const currentStore = useSidebarStore.getState();
    if (currentStore.debugMode || currentStore.backendStatus?.status === 'offline') {
      return;
    }

    if (autoAnalysisInFlightRef.current) {
      pendingAutoAnalysisRef.current = true;
      return;
    }

    let extracted;
    try {
      extracted = bindings.extractConversation();
    } catch {
      return;
    }

    if (extracted.request.turns.length === 0) {
      return;
    }

    const requestWithMode = withMode(extracted.request);
    const fingerprint = buildAnalysisRequestFingerprint(requestWithMode);
    if (fingerprint === lastAnalyzedFingerprintRef.current && currentStore.analysis) {
      return;
    }

    autoAnalysisInFlightRef.current = true;
    currentStore.setWarnings(extracted.warnings);

    try {
      await runAnalysisRequest(extracted.request, false, { openPanel: false, suppressErrors: true });
    } finally {
      autoAnalysisInFlightRef.current = false;
      if (pendingAutoAnalysisRef.current) {
        pendingAutoAnalysisRef.current = false;
        void autoAnalyzeConversation();
      }
    }
  }

  async function analyzeLiveConversation(force = true) {
    const currentStore = useSidebarStore.getState();
    currentStore.setOpen(true);
    currentStore.setBusyState('extracting');
    currentStore.setError(null);

    try {
      const extracted = bindings.extractConversation();
      currentStore.setWarnings(extracted.warnings);

      if (extracted.request.turns.length === 0) {
        currentStore.setBusyState('idle');
        currentStore.setError('No visible ChatGPT turns were found. Use the debug panel or load the sample fixture.');
        currentStore.setDebugMode(true);
        return;
      }

      await runAnalysisRequest(extracted.request, force);
    } catch (error) {
      const nextStore = useSidebarStore.getState();
      nextStore.setBusyState('idle');
      nextStore.setError(error instanceof Error ? error.message : 'Failed to extract the conversation.');
      nextStore.setDebugMode(true);
    }
  }

  async function refreshAnalysis() {
    if (store.lastRequest) {
      await runAnalysisRequest(store.lastRequest, false);
      return;
    }
    await analyzeLiveConversation(false);
  }

  async function analyzeDebugTranscript() {
    const turns = parseDebugTranscript(store.debugTranscript);
    if (turns.length === 0) {
      store.setError('Paste a transcript with User:/Assistant: prefixes or valid JSON turns first.');
      store.setDebugMode(true);
      return;
    }

    const request = buildDebugAnalysisRequest(turns);
    await runAnalysisRequest(request, true);
  }

  async function loadSample() {
    store.setBusyState('idle');
    store.setError(null);
    const sample = await bindings.loadSampleConversation();
    store.setAnalysisMode(sample.analysis.analysis_mode ?? sample.request.analysis_mode ?? 'deterministic');
    store.setLastRequest(sample.request);
    store.setAnalysis(sample.analysis);
    store.setDebugMode(false);
    store.setOpen(true);
  }

  const selectedTurn = useMemo(
    () => store.analysis?.turns.find((turn) => turn.id === store.selectedTurnId) ?? store.analysis?.turns.at(-1) ?? null,
    [store.analysis, store.selectedTurnId],
  );

  return {
    ...store,
    selectedTurn,
    refreshBackendStatus,
    analyzeLiveConversation,
    refreshAnalysis,
    analyzeDebugTranscript,
    loadSample,
    selectTurn: store.setSelectedTurnId,
    setAnalysisMode: (analysisMode: AnalysisMode) => store.setAnalysisMode(analysisMode),
    setPanelWidth: store.setPanelWidth,
    jumpToTurn: (turnId: number) => {
      store.setSelectedTurnId(turnId);
      const turn = store.analysis?.turns.find((item) => item.id === turnId);
      const context = turn
        ? {
            promptText: turn.prompt_text ?? undefined,
            responseText: turn.response_text ?? undefined,
            text: turn.text ?? undefined,
          }
        : undefined;
      try {
        console.info('[RabbitHole] sidebar jump dispatch', {
          turnId,
          topicLabel: turn?.topic_label ?? null,
          classification: turn?.classification ?? null,
        });
        bindings.jumpToTurn(turnId, context);
      } catch (error) {
        store.setError(error instanceof Error ? error.message : 'Could not jump to that transcript turn.');
      }
    },
  };
}
