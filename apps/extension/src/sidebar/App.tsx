import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'framer-motion';
import { PanelHeader } from '@/sidebar/components/PanelHeader';
import { RabbitGlyph, rabbitDisplayCopy, rabbitMotionForState, type RabbitDisplayState } from '@/sidebar/components/RabbitGlyph';
import { TrailMap } from '@/sidebar/components/TrailMap';
import { InspectorPanel } from '@/sidebar/components/InspectorPanel';
import { TimelineStrip } from '@/sidebar/components/TimelineStrip';
import { DebugPanel } from '@/sidebar/components/DebugPanel';
import { useSidebarController, type SidebarBindings } from '@/sidebar/hooks/useSidebarController';
import {
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_VIEWPORT_GAP_PX,
} from '@/shared/config';

interface SidebarAppProps {
  bindings: SidebarBindings;
}

function clampPanelWidth(width: number): number {
  const maxWidth = Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, window.innerWidth - SIDEBAR_VIEWPORT_GAP_PX));
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH_PX), maxWidth);
}

function BusyRing({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2.2" />
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function deriveRabbitState(controller: ReturnType<typeof useSidebarController>): RabbitDisplayState {
  if (controller.busyState === 'extracting' || controller.busyState === 'analyzing') {
    return 'ANALYZING';
  }

  if (controller.liveActivity === 'typing') {
    return 'LISTENING';
  }

  if (controller.liveActivity === 'waiting') {
    return 'WAITING';
  }

  return controller.analysis?.turns.at(-1)?.classification ?? 'ON_PATH';
}

export function SidebarApp({ bindings }: SidebarAppProps) {
  const controller = useSidebarController(bindings);
  const resizeStateRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const syncPanelWidth = () => {
      const nextWidth = clampPanelWidth(controller.panelWidth);
      if (nextWidth !== controller.panelWidth) {
        controller.setPanelWidth(nextWidth);
      }
    };

    syncPanelWidth();
    window.addEventListener('resize', syncPanelWidth);
    return () => window.removeEventListener('resize', syncPanelWidth);
  }, [controller.panelWidth, controller.setPanelWidth]);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: controller.panelWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = resizeState.startX - event.clientX;
    controller.setPanelWidth(clampPanelWidth(resizeState.startWidth + deltaX));
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    resizeStateRef.current = null;
  };

  const rabbitState = deriveRabbitState(controller);
  const launcherCopy =
    controller.backendStatus?.status === 'offline'
      ? {
          label: 'Offline',
          accent: '#fb923c',
          fill: 'rgba(251, 146, 60, 0.16)',
        }
      : rabbitDisplayCopy(rabbitState);
  const launcherBusy = controller.busyState !== 'idle';
  const launcherLabel = `Open RabbitHole (${launcherCopy.label})`;

  return (
    <div className="rabbithole-shell font-sans text-moon">
      {!controller.open ? (
        <button
          type="button"
          className="pointer-events-auto group fixed right-5 top-5 z-[2147483647] flex h-14 w-14 items-center justify-center rounded-full border bg-[linear-gradient(135deg,rgba(16,26,36,0.94),rgba(14,22,32,0.98))] shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur transition hover:-translate-y-0.5"
          style={{
            borderColor: `${launcherCopy.accent}4d`,
            boxShadow: `0 18px 40px rgba(0,0,0,0.32), 0 0 0 1px ${launcherCopy.fill}, 0 0 28px ${launcherCopy.fill}`,
          }}
          onClick={() => controller.setOpen(true)}
          aria-label={launcherLabel}
          title={launcherLabel}
        >
          <span
            className="absolute inset-1.5 rounded-full blur"
            style={{ backgroundColor: launcherCopy.fill, opacity: launcherBusy ? 0.8 : 0.5 }}
          />
          <span
            className="absolute inset-[5px] rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,28,0.98),rgba(10,16,24,0.98))]"
            aria-hidden="true"
          />
          <motion.span
            className="relative z-[1]"
            animate={rabbitMotionForState(rabbitState)}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <RabbitGlyph color={launcherCopy.accent} state={rabbitState} />
          </motion.span>
          <span
            className="absolute bottom-0.5 right-0.5 z-[2] flex h-5 w-5 items-center justify-center rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(10,18,28,0.98),rgba(10,16,24,0.98))]"
            style={{ color: launcherCopy.accent }}
            aria-hidden="true"
          >
            {launcherBusy ? (
              <BusyRing color={launcherCopy.accent} />
            ) : (
              <span
                className="h-2.5 w-2.5 rounded-full border"
                style={{
                  borderColor: launcherCopy.accent,
                  backgroundColor: launcherCopy.fill,
                  boxShadow: `0 0 16px ${launcherCopy.fill}`,
                }}
              />
            )}
          </span>
        </button>
      ) : null}

      {controller.open ? (
        <aside
          className="pointer-events-auto fixed right-0 top-0 z-[2147483647] flex h-screen flex-col overflow-hidden border-l border-white/10 bg-[linear-gradient(180deg,rgba(7,14,22,0.98),rgba(12,18,28,0.99))] p-3.5 shadow-[-24px_0_64px_rgba(0,0,0,0.32)] backdrop-blur-xl"
          style={{ width: clampPanelWidth(controller.panelWidth) }}
        >
          <div
            className="absolute left-0 top-0 h-full w-3 -translate-x-1.5 cursor-ew-resize touch-none"
            aria-label="Resize RabbitHole sidebar"
            role="separator"
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          >
            <div className="absolute left-1.5 top-1/2 h-28 w-[3px] -translate-y-1/2 rounded-full bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] transition hover:bg-emerald-300/35" />
          </div>

          <PanelHeader
            busyState={controller.busyState}
            backendStatus={controller.backendStatus}
            analysisMode={controller.analysisMode}
            onAnalyze={() => void controller.analyzeLiveConversation(true)}
            onRefresh={() => void controller.refreshAnalysis()}
            onToggleDebug={() => controller.setDebugMode(!controller.debugMode)}
            onChangeAnalysisMode={controller.setAnalysisMode}
            onClose={() => controller.setOpen(false)}
          />

          <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
            {controller.analysis ? (
              <>
                <TrailMap
                  analysis={controller.analysis}
                  selectedTurn={controller.selectedTurn}
                  selectedTurnId={controller.selectedTurnId}
                  rabbitState={rabbitState}
                  onSelectTurn={controller.selectTurn}
                  onJumpToTurn={controller.jumpToTurn}
                />
                <TimelineStrip
                  analysis={controller.analysis}
                  selectedTurnId={controller.selectedTurnId}
                  onSelectTurn={controller.selectTurn}
                />
                <InspectorPanel turn={controller.selectedTurn} onJumpToTurn={controller.jumpToTurn} />
              </>
            ) : (
              <EmptyState
                onAnalyze={() => void controller.analyzeLiveConversation(true)}
                onLoadSample={() => void controller.loadSample()}
              />
            )}

            {controller.debugMode ? (
              <DebugPanel
                debugTranscript={controller.debugTranscript}
                error={controller.error}
                warnings={controller.warnings}
                onTranscriptChange={controller.setDebugTranscript}
                onAnalyzeTranscript={() => void controller.analyzeDebugTranscript()}
                onLoadSample={() => void controller.loadSample()}
              />
            ) : controller.error ? (
              <div className="rounded-[24px] border border-red-300/18 bg-red-400/8 p-4 text-sm text-red-100">
                {controller.error}
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function EmptyState({
  onAnalyze,
  onLoadSample,
}: {
  onAnalyze: () => void;
  onLoadSample: () => void;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(63,92,77,0.28),transparent_44%),rgba(255,255,255,0.04)] p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-moon/55">Ready to trace the conversation</div>
      <h2 className="mt-2 text-lg font-semibold text-moon">Analyze exchange-level trail nodes.</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-moon/62">
        Prompt + reply collapse into one node so the path stays readable.
      </p>

      <div className="mt-4 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(9,18,27,0.78),rgba(12,20,30,0.94))] p-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-moon/42">Preview</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-full border border-emerald-300 bg-emerald-300/20" />
            <span className="h-8 w-10 rounded-full border border-dashed border-amber-300/70" />
            <span className="h-4 w-4 rounded-full border border-orange-300 bg-orange-300/18" />
            <span className="h-5 w-5 rounded-full border border-violet-300 bg-violet-300/18" />
          </div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-moon/45">Trail / Side / Hole / Return</div>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          className="rounded-full border border-emerald-300/30 bg-emerald-300/12 px-4 py-2 text-sm font-medium text-emerald-50 hover:bg-emerald-300/18"
          onClick={onAnalyze}
        >
          Analyze live chat
        </button>
        <button
          type="button"
          className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-moon/85 hover:bg-white/8"
          onClick={onLoadSample}
        >
          Load seeded demo
        </button>
      </div>
    </section>
  );
}
