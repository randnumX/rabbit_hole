import type { ReactNode } from 'react';
import type { AnalysisMode } from '@rabbithole/shared-types';
import type { BusyState } from '@/sidebar/store';
import type { BackendStatusPayload } from '@/shared/messages';
import { StatusPill } from './StatusPill';

interface PanelHeaderProps {
  busyState: BusyState;
  backendStatus: BackendStatusPayload | null;
  analysisMode: AnalysisMode;
  onAnalyze: () => void;
  onRefresh: () => void;
  onToggleDebug: () => void;
  onChangeAnalysisMode: (mode: AnalysisMode) => void;
  onClose: () => void;
}

const MODE_LABELS: Record<AnalysisMode, string> = {
  deterministic: 'Deterministic',
  hybrid: 'Hybrid',
  probabilistic: 'Probabilistic',
};

function availableModes(status: BackendStatusPayload | null): AnalysisMode[] {
  return status?.availableModes ?? ['deterministic'];
}

function AnalyzeIcon({ busy }: { busy: boolean }) {
  if (busy) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3a9 9 0 1 1-9 9" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" strokeLinecap="round" />
      <path d="M11 7v8M7 11h8" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18v-5h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 9A7 7 0 0 1 19 11M16.5 15A7 7 0 0 1 5 13" strokeLinecap="round" />
    </svg>
  );
}

function DebugIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 4h6" strokeLinecap="round" />
      <path d="M10 7h4" strokeLinecap="round" />
      <rect x="7" y="8" width="10" height="9" rx="3" />
      <path d="M4 11h3M17 11h3M5.5 7.5l2 2M18.5 7.5l-2 2M12 17v3" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 5 15 15" strokeLinecap="round" />
      <path d="M15 5 5 15" strokeLinecap="round" />
    </svg>
  );
}

function IconButton({
  disabled = false,
  title,
  onClick,
  children,
}: {
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-moon/76 transition hover:border-white/18 hover:bg-white/[0.1] hover:text-moon disabled:cursor-not-allowed disabled:opacity-45"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
    >
      {children}
    </button>
  );
}

export function PanelHeader({
  busyState,
  backendStatus,
  analysisMode,
  onAnalyze,
  onRefresh,
  onToggleDebug,
  onChangeAnalysisMode,
  onClose,
}: PanelHeaderProps) {
  const busy = busyState !== 'idle';
  const modes = availableModes(backendStatus);

  return (
    <div className="space-y-3 border-b border-white/10 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-moon/55">Conversation terrain</div>
          <div className="mt-1.5 flex items-center gap-2">
            <h1 className="text-[1.7rem] font-semibold tracking-tight text-moon">RabbitHole</h1>
            <StatusPill status={backendStatus} />
          </div>
          <p className="mt-1 text-sm text-moon/58">Follow the trail. Spot the slip.</p>
        </div>

        <IconButton title="Close RabbitHole" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <select
            value={analysisMode}
            className="w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 pr-9 text-sm font-medium text-moon outline-none transition hover:bg-white/[0.06] focus:border-cyan-300/30 focus:bg-white/[0.07]"
            onChange={(event) => onChangeAnalysisMode(event.target.value as AnalysisMode)}
            disabled={busy}
            aria-label="Analysis mode"
          >
            {(['deterministic', 'hybrid', 'probabilistic'] as const).map((mode) => (
              <option key={mode} value={mode} disabled={!modes.includes(mode)}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon/55" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m5 7 5 6 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <IconButton title={busy ? 'Analyzing' : 'Analyze conversation'} onClick={onAnalyze} disabled={busy}>
          <AnalyzeIcon busy={busy} />
        </IconButton>
        <IconButton title="Refresh analysis" onClick={onRefresh} disabled={busy}>
          <RefreshIcon />
        </IconButton>
        <IconButton title="Toggle debug panel" onClick={onToggleDebug}>
          <DebugIcon />
        </IconButton>
      </div>
    </div>
  );
}
