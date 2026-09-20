import type { AnalysisMode, AnalysisRequest, AnalysisResponse } from '@rabbithole/shared-types';
import type { BackendStatusPayload } from '@/shared/messages';
import { SIDEBAR_WIDTH_PX } from '@/shared/config';
import { create } from 'zustand';

export type BusyState = 'idle' | 'extracting' | 'analyzing';
export type LiveActivityState = 'idle' | 'typing' | 'waiting';

interface SidebarState {
  open: boolean;
  debugMode: boolean;
  busyState: BusyState;
  liveActivity: LiveActivityState;
  error: string | null;
  warnings: string[];
  backendStatus: BackendStatusPayload | null;
  analysisMode: AnalysisMode;
  analysis: AnalysisResponse | null;
  lastRequest: AnalysisRequest | null;
  selectedTurnId: number | null;
  debugTranscript: string;
  panelWidth: number;
  settingsOpen: boolean;
  llmEndpointUrl: string;
  llmApiKey: string;
  llmModel: string;
  setOpen: (open: boolean) => void;
  setDebugMode: (debugMode: boolean) => void;
  setBusyState: (busyState: BusyState) => void;
  setLiveActivity: (liveActivity: LiveActivityState) => void;
  setError: (error: string | null) => void;
  setWarnings: (warnings: string[]) => void;
  setBackendStatus: (backendStatus: BackendStatusPayload | null) => void;
  setAnalysisMode: (analysisMode: AnalysisMode) => void;
  setAnalysis: (analysis: AnalysisResponse | null) => void;
  setLastRequest: (lastRequest: AnalysisRequest | null) => void;
  setSelectedTurnId: (selectedTurnId: number | null) => void;
  setDebugTranscript: (debugTranscript: string) => void;
  setPanelWidth: (panelWidth: number) => void;
  setSettingsOpen: (settingsOpen: boolean) => void;
  setLlmEndpointUrl: (llmEndpointUrl: string) => void;
  setLlmApiKey: (llmApiKey: string) => void;
  setLlmModel: (llmModel: string) => void;
  hydrateLlmSettings: (settings: { endpointUrl: string; apiKey?: string; model: string } | null) => void;
  resetForConversation: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  open: false,
  debugMode: false,
  busyState: 'idle',
  liveActivity: 'idle',
  error: null,
  warnings: [],
  backendStatus: null,
  analysisMode: 'deterministic',
  analysis: null,
  lastRequest: null,
  selectedTurnId: null,
  debugTranscript: '',
  panelWidth: SIDEBAR_WIDTH_PX,
  settingsOpen: false,
  llmEndpointUrl: '',
  llmApiKey: '',
  llmModel: '',
  setOpen: (open) => set({ open }),
  setDebugMode: (debugMode) => set({ debugMode }),
  setBusyState: (busyState) => set({ busyState }),
  setLiveActivity: (liveActivity) => set({ liveActivity }),
  setError: (error) => set({ error }),
  setWarnings: (warnings) => set({ warnings }),
  setBackendStatus: (backendStatus) => set({ backendStatus }),
  setAnalysisMode: (analysisMode) => set({ analysisMode }),
  setAnalysis: (analysis) =>
    set({
      analysis,
      selectedTurnId: analysis?.turns.at(-1)?.id ?? null,
    }),
  setLastRequest: (lastRequest) => set({ lastRequest }),
  setSelectedTurnId: (selectedTurnId) => set({ selectedTurnId }),
  setDebugTranscript: (debugTranscript) => set({ debugTranscript }),
  setPanelWidth: (panelWidth) => set({ panelWidth }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setLlmEndpointUrl: (llmEndpointUrl) => set({ llmEndpointUrl }),
  setLlmApiKey: (llmApiKey) => set({ llmApiKey }),
  setLlmModel: (llmModel) => set({ llmModel }),
  hydrateLlmSettings: (settings) =>
    set({
      llmEndpointUrl: settings?.endpointUrl ?? '',
      llmApiKey: settings?.apiKey ?? '',
      llmModel: settings?.model ?? '',
    }),
  resetForConversation: () =>
    set({
      analysis: null,
      lastRequest: null,
      selectedTurnId: null,
      warnings: [],
      error: null,
      liveActivity: 'idle',
    }),
}));
