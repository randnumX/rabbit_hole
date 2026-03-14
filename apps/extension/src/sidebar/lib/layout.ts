import type { AnalysisResponse, Classification, EdgeRelationship, TrailEdge, TurnAnalysis } from '@rabbithole/shared-types';

const WIDTH = 344;
const CENTER_X = WIDTH / 2;
const TOP_PADDING = 52;
const ROW_GAP = 98;

export interface PositionedTurn extends TurnAnalysis {
  x: number;
  y: number;
  branchDirection: -1 | 1;
  active: boolean;
}

export interface PositionedEdge extends TrailEdge {
  key: string;
  path: string;
  dashed: boolean;
  sourceTurn: PositionedTurn;
  targetTurn: PositionedTurn;
}

export interface TrailLayout {
  width: number;
  height: number;
  turns: PositionedTurn[];
  edges: PositionedEdge[];
  rabbit: {
    x: number;
    y: number;
    classification: Classification;
    route: PositionedEdge[];
    activeTransitionId: string | null;
  } | null;
}

function branchDirection(lineageId: number): -1 | 1 {
  return lineageId % 2 === 0 ? -1 : 1;
}

function buildLineageLaneMap(turns: TurnAnalysis[]): Map<number, { direction: -1 | 1; depth: number }> {
  const laneMap = new Map<number, { direction: -1 | 1; depth: number }>();

  for (const turn of turns) {
    const lineageId = turn.lineage_id ?? null;
    if (!lineageId || lineageId <= 0 || laneMap.has(lineageId)) {
      continue;
    }

    const forkTurn = turn.fork_turn_id ? turns.find((candidate) => candidate.id === turn.fork_turn_id) : null;
    const parentLineageId = forkTurn?.lineage_id ?? 0;
    const parentLane = parentLineageId ? laneMap.get(parentLineageId) : null;
    laneMap.set(lineageId, {
      direction: parentLane?.direction ?? branchDirection(lineageId),
      depth: (parentLane?.depth ?? 0) + 1,
    });
  }

  return laneMap;
}

function xOffset(turn: TurnAnalysis, laneMap: Map<number, { direction: -1 | 1; depth: number }>, turnLookup: Map<number, TurnAnalysis>): number {
  const lineageId = turn.lineage_id ?? 0;
  if (lineageId > 0) {
    const lane = laneMap.get(lineageId);
    if (lane) {
      return lane.direction * (96 + (lane.depth - 1) * 54);
    }
  }

  if (turn.ui.path_type === 'rabbit_hole') {
    const anchorTurn = turn.anchor_turn_id ? turnLookup.get(turn.anchor_turn_id) : null;
    const anchorLineageId = anchorTurn?.lineage_id ?? 0;
    const lane = anchorLineageId > 0 ? laneMap.get(anchorLineageId) : null;
    const direction = lane?.direction ?? branchDirection(Math.abs(turn.cluster_id) + 1);
    const baseOffset = lane ? Math.abs(direction * (96 + (lane.depth - 1) * 54)) : 104;
    return direction * (baseOffset + 76);
  }

  return 0;
}

function buildSequentialPath(source: PositionedTurn, target: PositionedTurn): string {
  const deltaY = Math.max((target.y - source.y) / 2, 24);
  return `M ${source.x} ${source.y} C ${source.x} ${source.y + deltaY}, ${target.x} ${target.y - deltaY}, ${target.x} ${target.y}`;
}

function buildForkPath(source: PositionedTurn, target: PositionedTurn): string {
  const travelY = target.y - source.y;
  const control1X = source.x;
  const control1Y = source.y + Math.max(18, travelY * 0.26);
  const control2X = target.x;
  const control2Y = target.y - Math.max(24, travelY * 0.3);
  return `M ${source.x} ${source.y} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${target.x} ${target.y}`;
}

function buildRejoinPath(source: PositionedTurn, target: PositionedTurn): string {
  const swingX = source.x + (CENTER_X - source.x) * 0.42;
  const midY = (source.y + target.y) / 2;
  return `M ${source.x} ${source.y} C ${source.x} ${midY - 22}, ${swingX} ${midY + 10}, ${target.x} ${target.y}`;
}

function buildBacktrackPath(source: PositionedTurn, target: PositionedTurn): string {
  const edgeX = source.x >= CENTER_X ? WIDTH - 26 : 26;
  return `M ${source.x} ${source.y} C ${edgeX} ${source.y - 16}, ${edgeX} ${target.y + 16}, ${target.x} ${target.y}`;
}

function buildPath(relationship: EdgeRelationship, source: PositionedTurn, target: PositionedTurn): string {
  switch (relationship) {
    case 'fork_out':
      return buildForkPath(source, target);
    case 'backtrack':
      return buildBacktrackPath(source, target);
    case 'rejoin_path':
      return buildRejoinPath(source, target);
    default:
      return buildSequentialPath(source, target);
  }
}

export function buildTrailLayout(
  analysis: AnalysisResponse,
  selectedTurnId: number | null,
): TrailLayout {
  const rawTurnLookup = new Map(analysis.turns.map((turn) => [turn.id, turn]));
  const laneMap = buildLineageLaneMap(analysis.turns);
  const turns = analysis.turns.map((turn, index) => {
    const x = CENTER_X + xOffset(turn, laneMap, rawTurnLookup);
    const y = TOP_PADDING + index * ROW_GAP;
    return {
      ...turn,
      x,
      y,
      branchDirection: branchDirection(turn.lineage_id ?? Math.abs(turn.cluster_id) + 1),
      active: turn.id === selectedTurnId || (!selectedTurnId && index === analysis.turns.length - 1),
    };
  });

  const turnLookup = new Map(turns.map((turn) => [turn.id, turn]));
  const edges = analysis.edges
    .map((edge) => {
      const source = turnLookup.get(edge.source);
      const target = turnLookup.get(edge.target);
      if (!source || !target) {
        return null;
      }

      return {
        ...edge,
        key: `${edge.source}-${edge.target}-${edge.relationship}-${edge.sequence ?? 0}`,
        path: buildPath(edge.relationship, source, target),
        dashed: ['side_quest', 'rabbit_hole_jump', 'backtrack', 'fork_out'].includes(edge.relationship),
        sourceTurn: source,
        targetTurn: target,
      } satisfies PositionedEdge;
    })
    .filter((edge): edge is PositionedEdge => Boolean(edge));

  const rabbitTurn = turns.find((turn) => turn.active) ?? turns.at(-1) ?? null;
  const rabbitRoute = rabbitTurn
    ? (() => {
        const incomingEdges = edges.filter((edge) => edge.target === rabbitTurn.id);
        const finalSegment = incomingEdges.slice().sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0)).at(-1) ?? null;
        if (!finalSegment) {
          return { route: [] as PositionedEdge[], activeTransitionId: null };
        }
        if (!finalSegment.transition_id) {
          return { route: [finalSegment], activeTransitionId: null };
        }
        return {
          route: edges
            .filter((edge) => edge.transition_id === finalSegment.transition_id)
            .slice()
            .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0)),
          activeTransitionId: finalSegment.transition_id,
        };
      })()
    : { route: [] as PositionedEdge[], activeTransitionId: null };

  return {
    width: WIDTH,
    height: turns.length * ROW_GAP + TOP_PADDING,
    turns,
    edges,
    rabbit: rabbitTurn
      ? {
          x: rabbitTurn.x,
          y: rabbitTurn.y,
          classification: rabbitTurn.classification,
          route: rabbitRoute.route,
          activeTransitionId: rabbitRoute.activeTransitionId,
        }
      : null,
  };
}
