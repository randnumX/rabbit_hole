import { motion } from 'framer-motion';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { AnalysisResponse, Classification, EdgeRelationship, TurnAnalysis } from '@rabbithole/shared-types';
import { RabbitGlyph, rabbitDisplayCopy, rabbitMotionForState, type RabbitDisplayState } from '@/sidebar/components/RabbitGlyph';
import { buildTrailLayout, type PositionedEdge } from '@/sidebar/lib/layout';
import { classificationCopy, countTurnsByClassification } from '@/sidebar/lib/classifications';
import { displayRootTopicLabel } from '@/sidebar/lib/labels';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3.2;
const ZOOM_STEP = 0.15;

declare global {
  interface Window {
    __rabbitholeLastNodeClick?: Record<string, unknown>;
  }
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function recordNodeClick(payload: Record<string, unknown>) {
  window.__rabbitholeLastNodeClick = payload;
}

interface TrailMapProps {
  analysis: AnalysisResponse;
  selectedTurn: TurnAnalysis | null;
  selectedTurnId: number | null;
  rabbitState: RabbitDisplayState;
  onSelectTurn: (turnId: number) => void;
  onJumpToTurn: (turnId: number) => void;
}

function edgeColor(classification: Classification): string {
  return classificationCopy[classification].accent;
}

function RabbitTrailDust({ color }: { color: string }) {
  return (
    <motion.div
      className="absolute left-3 top-9 flex gap-1"
      animate={{ opacity: [0.18, 0.4, 0.18], x: [0, -1, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      {[0, 1, 2].map((index) => (
        <motion.span
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className="block rounded-full"
          style={{ backgroundColor: color }}
          animate={{
            y: [0, -3 - index, 0],
            opacity: [0.18, 0.52 - index * 0.1, 0.12],
            scale: [0.8, 1.1, 0.85],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 0.12,
          }}
        />
      ))}
    </motion.div>
  );
}

function edgeStrokeWidth(classification: Classification, relationship: EdgeRelationship): number {
  if (relationship === 'backtrack') {
    return 2.6;
  }
  if (relationship === 'rejoin_path') {
    return 4.6;
  }
  if (relationship === 'fork_out') {
    return 3.4;
  }
  if (classification === 'RABBIT_HOLE') {
    return 2.5;
  }
  if (classification === 'RETURN_TO_PATH') {
    return 4.5;
  }
  return 3.5;
}

function edgeDashPattern(classification: Classification, relationship: EdgeRelationship): string | undefined {
  if (relationship === 'backtrack') {
    return '6 9';
  }
  if (relationship === 'fork_out') {
    return '5 6';
  }
  if (relationship === 'rejoin_path') {
    return '18 0';
  }
  if (classification === 'SIDE_QUEST') {
    return '5 7';
  }
  if (classification === 'RABBIT_HOLE') {
    return '10 8 3 10';
  }
  if (classification === 'RETURN_TO_PATH') {
    return '20 0';
  }
  return undefined;
}

function edgeOpacity(classification: Classification, relationship: EdgeRelationship): number {
  if (relationship === 'backtrack') {
    return 0.5;
  }
  if (relationship === 'fork_out') {
    return 0.86;
  }
  if (relationship === 'rejoin_path') {
    return 0.92;
  }
  return classification === 'RABBIT_HOLE' ? 0.9 : 0.74;
}

function NodeGlyph({
  classification,
  nodeType,
  x,
  y,
  active,
  nodeId,
}: {
  classification: Classification;
  nodeType: 'start' | 'normal' | 'broken' | 'return';
  x: number;
  y: number;
  active: boolean;
  nodeId: number;
}) {
  const copy = classificationCopy[classification];
  const glowRadius = nodeType === 'broken' ? 24 : 20;

  return (
    <>
      <circle cx={x} cy={y} r={glowRadius} fill={copy.fill} opacity={active ? 0.76 : 0.28} />
      {nodeType === 'broken' ? (
        <>
          <circle cx={x} cy={y} r={17} fill="rgba(12, 6, 5, 0.92)" stroke={copy.stroke} strokeWidth="2.4" strokeDasharray="5 6" />
          <circle cx={x} cy={y} r={8.5} fill="rgba(0,0,0,0.78)" />
          <path
            d={`M ${x - 10} ${y - 8} L ${x - 1} ${y + 1} L ${x - 4} ${y + 11} M ${x + 3} ${y - 9} L ${x + 10} ${y - 1}`}
            stroke={copy.stroke}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx={x - 13} cy={y + 10} r={2} fill={copy.stroke} opacity="0.82" />
          <circle cx={x + 12} cy={y + 12} r={1.7} fill={copy.stroke} opacity="0.58" />
        </>
      ) : nodeType === 'return' ? (
        <>
          <circle cx={x} cy={y} r={15} fill="rgba(9, 16, 26, 0.94)" stroke={copy.stroke} strokeWidth="3" />
          <circle cx={x} cy={y} r={9} fill="none" stroke={copy.stroke} strokeWidth="1.8" opacity="0.8" />
          <path d={`M ${x} ${y + 7} L ${x} ${y - 6} M ${x - 4} ${y - 2} L ${x} ${y - 7} L ${x + 4} ${y - 2}`} stroke={copy.stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : nodeType === 'start' ? (
        <>
          <circle cx={x} cy={y} r={15} fill="rgba(9, 16, 26, 0.94)" stroke={copy.stroke} strokeWidth="3.2" />
          <circle cx={x} cy={y} r={6.5} fill={copy.stroke} opacity="0.9" />
        </>
      ) : (
        <>
          <circle cx={x} cy={y} r={14} fill="rgba(9, 16, 26, 0.94)" stroke={copy.stroke} strokeWidth="3" />
          <circle cx={x} cy={y} r={5.5} fill={copy.stroke} opacity="0.75" />
        </>
      )}
      <text
        x={x}
        y={y + 32}
        textAnchor="middle"
        className="select-none fill-[#eef5ff] text-[10px] font-semibold"
      >
        {nodeId}
      </text>
    </>
  );
}

function RabbitTraveler({
  width,
  height,
  state,
  color,
  fallbackX,
  fallbackY,
  offsetX,
  offsetY,
  route,
}: {
  width: number;
  height: number;
  state: RabbitDisplayState;
  color: string;
  fallbackX: number;
  fallbackY: number;
  offsetX: number;
  offsetY: number;
  route: PositionedEdge[];
}) {
  const pathRefs = useRef<Array<SVGPathElement | null>>([]);
  const [position, setPosition] = useState({ x: fallbackX, y: fallbackY });
  const routeKey = useMemo(() => route.map((segment) => segment.key).join('|'), [route]);

  useEffect(() => {
    setPosition({ x: fallbackX, y: fallbackY });
  }, [fallbackX, fallbackY]);

  useEffect(() => {
    if (!route.length) {
      setPosition({ x: fallbackX, y: fallbackY });
      return;
    }

    const lengths = route.map((_, index) => {
      const path = pathRefs.current[index] as (SVGPathElement & {
        getTotalLength?: () => number;
      }) | null;
      if (!path || typeof path.getTotalLength !== 'function') {
        return 0;
      }
      return path.getTotalLength();
    });
    const totalLength = lengths.reduce((sum, length) => sum + length, 0);
    if (!totalLength) {
      setPosition({ x: fallbackX, y: fallbackY });
      return;
    }

    const durationMs = 1100 + route.length * 260;
    let frameId = 0;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }
      const rawProgress = Math.min((timestamp - startTime) / durationMs, 1);
      const easedProgress = 1 - (1 - rawProgress) ** 3;
      const distance = totalLength * easedProgress;
      let travelled = 0;

      for (let index = 0; index < route.length; index += 1) {
        const segmentLength = lengths[index];
        const path = pathRefs.current[index] as (SVGPathElement & {
          getPointAtLength?: (length: number) => DOMPoint | { x: number; y: number };
        }) | null;
        if (!path || typeof path.getPointAtLength !== 'function') {
          continue;
        }
        if (distance <= travelled + segmentLength || index === route.length - 1) {
          const localDistance = Math.max(0, Math.min(distance - travelled, segmentLength));
          const point = path.getPointAtLength(localDistance);
          setPosition({ x: point.x, y: point.y });
          break;
        }
        travelled += segmentLength;
      }

      if (rawProgress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        setPosition({ x: fallbackX, y: fallbackY });
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [fallbackX, fallbackY, route, routeKey]);

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <g transform={`translate(${offsetX} ${offsetY})`}>
          {route.map((segment, index) => (
            <path
              key={segment.key}
              ref={(node) => {
                pathRefs.current[index] = node;
              }}
              d={segment.path}
              fill="none"
              stroke={color}
              strokeWidth={segment.relationship === 'backtrack' ? 3 : 4}
              strokeLinecap="round"
              strokeDasharray={segment.relationship === 'backtrack' ? '6 9' : undefined}
              opacity={segment.relationship === 'backtrack' ? 0.34 : 0.22}
            />
          ))}
        </g>
      </svg>

      <motion.div
        className="pointer-events-none absolute left-0 top-0"
        animate={{ x: position.x + offsetX - 20, y: position.y + offsetY - 46 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26, mass: 0.7 }}
      >
        <motion.div
          animate={rabbitMotionForState(state)}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <RabbitGlyph color={color} state={state} className="h-10 w-10 drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]" />
          <RabbitTrailDust color={color} />
        </motion.div>
      </motion.div>
    </>
  );
}

export function TrailMap({ analysis, selectedTurn, selectedTurnId, rabbitState, onSelectTurn, onJumpToTurn }: TrailMapProps) {
  const layout = buildTrailLayout(analysis, selectedTurnId);
  const counts = countTurnsByClassification(analysis);
  const currentClassification = selectedTurn?.classification ?? analysis.turns.at(-1)?.classification ?? 'ON_PATH';
  const currentCopy = classificationCopy[currentClassification];
  const rabbitCopy = rabbitDisplayCopy(rabbitState);
  const rootLabel = displayRootTopicLabel(analysis.root_topic.label, analysis.turns[0]?.prompt_text);
  const activeTransitionId = layout.rabbit?.activeTransitionId ?? null;
  const [showHud, setShowHud] = useState(false);
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const viewportHeight = Math.max(300, Math.min(layout.height + 24, 460));
  const canvasWidth = Math.max(layout.width + 128, 420);
  const canvasHeight = layout.height + 60;
  const canvasOffsetX = (canvasWidth - layout.width) / 2;
  const canvasOffsetY = 24;
  const scaledCanvasWidth = Math.round(canvasWidth * zoom);
  const scaledCanvasHeight = Math.round(canvasHeight * zoom);
  const zoomPercent = Math.round(zoom * 100);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    setZoom(1);
    setShowHud(false);
  }, [analysis.conversation_id, analysis.turns.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollLeft = Math.max((scaledCanvasWidth - viewport.clientWidth) / 2, 0);
  }, [analysis.conversation_id, analysis.turns.length, scaledCanvasWidth]);

  const applyZoom = (targetZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const viewport = viewportRef.current;
    const nextZoom = clampZoom(targetZoom);
    const previousZoom = zoomRef.current;

    if (!viewport || nextZoom === previousZoom) {
      setZoom(nextZoom);
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const anchorX = anchor ? anchor.clientX - rect.left : viewport.clientWidth / 2;
    const anchorY = anchor ? anchor.clientY - rect.top : viewport.clientHeight / 2;
    const contentX = (viewport.scrollLeft + anchorX) / previousZoom;
    const contentY = (viewport.scrollTop + anchorY) / previousZoom;

    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(contentX * nextZoom - anchorX, 0);
      viewport.scrollTop = Math.max(contentY * nextZoom - anchorY, 0);
    });
  };

  const handleViewportWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    applyZoom(zoomRef.current + direction * ZOOM_STEP, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
  };

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const dragState = dragStateRef.current;
    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragState.moved = true;
    }

    viewport.scrollLeft = dragState.scrollLeft - deltaX;
    viewport.scrollTop = dragState.scrollTop - deltaY;
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const dragState = dragStateRef.current;
    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    viewport.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
  };

  const activateTurn = (turnId: number) => {
    if (suppressClickRef.current) {
      return;
    }
    onSelectTurn(turnId);
    onJumpToTurn(turnId);
  };

  return (
    <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(74,102,87,0.26),transparent_44%),linear-gradient(180deg,rgba(8,16,25,0.88),rgba(11,18,28,0.99))] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] text-moon/55">Conversation trail</div>
          <div className="mt-1 truncate text-[1.05rem] font-semibold text-moon">{rootLabel}</div>
          <div className="mt-1 text-sm text-moon/58">Exchange nodes. Click to jump.</div>
        </div>
        <div
          className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{
            borderColor: `${currentCopy.accent}55`,
            backgroundColor: currentCopy.fill,
            color: currentCopy.accent,
          }}
        >
          {currentCopy.label}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.04] px-3 py-2.5">
        <div className="min-w-0 text-[10px] uppercase tracking-[0.16em] text-moon/42">
          Drag to pan · Cmd/Ctrl + wheel to zoom
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(9,18,27,0.94),rgba(12,20,30,0.98))] text-moon/82 shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition hover:border-white/20 hover:text-moon"
            aria-label="Zoom out trail"
            onClick={() => applyZoom(zoomRef.current - ZOOM_STEP)}
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 12h12" />
            </svg>
          </button>
          <button
            type="button"
            className="min-w-[58px] rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(9,18,27,0.94),rgba(12,20,30,0.98))] px-3 py-2 text-[11px] font-semibold tracking-[0.12em] text-moon/82 shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition hover:border-white/20 hover:text-moon"
            aria-label="Reset trail zoom"
            onClick={() => applyZoom(1)}
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(9,18,27,0.94),rgba(12,20,30,0.98))] text-moon/82 shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition hover:border-white/20 hover:text-moon"
            aria-label="Zoom in trail"
            onClick={() => applyZoom(zoomRef.current + ZOOM_STEP)}
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 6v12M6 12h12" />
            </svg>
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(9,18,27,0.94),rgba(12,20,30,0.98))] text-moon/82 shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition hover:border-white/20 hover:text-moon"
            aria-label={showHud ? 'Hide trail HUD' : 'Show trail HUD'}
            onClick={() => setShowHud((visible) => !visible)}
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 16.4v-4.8" />
              <circle cx="12" cy="8.2" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative mt-3 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(6,14,23,0.86),rgba(9,17,27,0.98))]">

        <div
          ref={viewportRef}
          className="rabbithole-scrollbar-hidden cursor-grab overflow-auto rounded-[24px] bg-trail-grid bg-[length:20px_20px] active:cursor-grabbing"
          style={{ height: viewportHeight }}
          onWheel={handleViewportWheel}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <div className="relative" style={{ width: scaledCanvasWidth, height: scaledCanvasHeight }}>
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `scale(${zoom})`,
              }}
            >
              <svg width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} className="block">
                <defs>
                  <linearGradient id="trail-base" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(238,245,255,0.22)" />
                    <stop offset="100%" stopColor="rgba(238,245,255,0.04)" />
                  </linearGradient>
                  <filter id="trail-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g transform={`translate(${canvasOffsetX} ${canvasOffsetY})`}>
                  <path
                    d={`M ${layout.width / 2} 24 L ${layout.width / 2} ${layout.height}`}
                    stroke="url(#trail-base)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity="0.55"
                  />

                  {layout.edges.map((edge) => {
                    const target = edge.targetTurn;
                    const isActiveTransition = Boolean(activeTransitionId && edge.transition_id === activeTransitionId);
                    const strokeWidth = edgeStrokeWidth(target.classification, edge.relationship);
                    const strokeOpacity = edgeOpacity(target.classification, edge.relationship);
                    return (
                      <g key={edge.key}>
                        <path
                          d={edge.path}
                          fill="none"
                          stroke={edgeColor(target.classification)}
                          strokeLinecap="round"
                          strokeWidth={strokeWidth + (isActiveTransition ? 4 : 3)}
                          opacity={isActiveTransition ? 0.24 : 0.14}
                          filter="url(#trail-glow)"
                        />
                        <path
                          d={edge.path}
                          fill="none"
                          stroke={edgeColor(target.classification)}
                          strokeDasharray={edgeDashPattern(target.classification, edge.relationship)}
                          strokeLinecap="round"
                          strokeWidth={strokeWidth}
                          opacity={isActiveTransition ? 1 : strokeOpacity}
                        />
                        {target.classification === 'RABBIT_HOLE' ? (
                          <>
                            <circle cx={target.x - target.branchDirection * 16} cy={target.y - 12} r={2.2} fill={edgeColor(target.classification)} opacity="0.8" />
                            <circle cx={target.x + target.branchDirection * 11} cy={target.y - 4} r={1.6} fill={edgeColor(target.classification)} opacity="0.55" />
                          </>
                        ) : null}
                      </g>
                    );
                  })}

                  {layout.turns.map((turn) => {
                    return (
                      <g
                        key={turn.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`Trail node ${turn.id}`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onPointerUp={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          recordNodeClick({
                            turnId: turn.id,
                            ts: Date.now(),
                          });
                          console.info('[RabbitHole] trail node click', {
                            turnId: turn.id,
                          });
                          activateTurn(turn.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            activateTurn(turn.id);
                          }
                        }}
                        className="cursor-pointer outline-none"
                      >
                        <circle cx={turn.x} cy={turn.y} r={26} fill="transparent" stroke="transparent" pointerEvents="all" />
                        <NodeGlyph
                          classification={turn.classification}
                          nodeType={turn.ui.node_type}
                          x={turn.x}
                          y={turn.y}
                          active={turn.active}
                          nodeId={turn.id}
                        />
                      </g>
                    );
                  })}
                </g>
              </svg>

              {layout.rabbit ? (
                <RabbitTraveler
                  width={canvasWidth}
                  height={canvasHeight}
                  state={rabbitState}
                  color={rabbitCopy.accent}
                  fallbackX={layout.rabbit.x}
                  fallbackY={layout.rabbit.y}
                  offsetX={canvasOffsetX}
                  offsetY={canvasOffsetY}
                  route={layout.rabbit.route}
                />
              ) : null}
            </div>
          </div>
        </div>

        {showHud ? (
        <div className="absolute right-3 top-14 z-20 w-[106px] rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,18,27,0.92),rgba(12,20,30,0.98))] p-2.5 shadow-[0_18px_36px_rgba(0,0,0,0.28)] backdrop-blur">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-moon/42">Trail HUD</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <HudMetric label="Turns" value={analysis.summary.total_turns} />
            <HudMetric label="Holes" value={counts.RABBIT_HOLE} />
            <HudMetric label="Side" value={counts.SIDE_QUEST} />
            <HudMetric label="Return" value={counts.RETURN_TO_PATH} />
          </div>
          <div className="mt-2.5 space-y-1.5">
            <LegendSwatch label="Trail" classification="ON_PATH" />
            <LegendSwatch label="Deep" classification="DEEPENING" />
            <LegendSwatch label="Side" classification="SIDE_QUEST" />
            <LegendSwatch label="Hole" classification="RABBIT_HOLE" />
            <LegendSwatch label="Return" classification="RETURN_TO_PATH" />
          </div>
        </div>
        ) : null}
      </div>
    </section>
  );
}

function HudMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-[0.14em] text-moon/38">{label}</div>
      <div className="mt-0.5 text-[0.9rem] font-semibold text-moon">{value}</div>
    </div>
  );
}

function LegendSwatch({ label, classification }: { label: string; classification: Classification }) {
  const copy = classificationCopy[classification];
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/14 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full border" style={{ borderColor: copy.accent, backgroundColor: copy.fill }} />
        <span className="text-[10px] text-moon/76">{label}</span>
      </div>
      <span className="h-1.5 w-4.5 rounded-full" style={{ backgroundColor: copy.accent }} />
    </div>
  );
}
