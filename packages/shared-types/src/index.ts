export type ConversationSource = 'chatgpt' | 'claude' | 'gemini' | 'debug';
export type ConversationRole = 'user' | 'assistant' | 'system';
export type AnalysisMode = 'deterministic' | 'hybrid' | 'probabilistic';
export type DecisionSource = 'deterministic' | 'llm';
export type Classification =
  | 'ON_PATH'
  | 'DEEPENING'
  | 'SIDE_QUEST'
  | 'RABBIT_HOLE'
  | 'RETURN_TO_PATH';
export type PathType = 'main' | 'side' | 'rabbit_hole' | 'return';
export type NodeType = 'start' | 'normal' | 'broken' | 'return';
export type EdgeRelationship =
  | 'main_path'
  | 'deepening'
  | 'side_quest'
  | 'rabbit_hole_jump'
  | 'return_to_path'
  | 'fork_out'
  | 'backtrack'
  | 'rejoin_path';

export interface ConversationTurn {
  id: number;
  role: ConversationRole;
  text: string;
  prompt_text?: string;
  response_text?: string;
  response_focus_text?: string;
  source_roles?: ConversationRole[];
  source_message_count?: number;
}

export interface AnalysisRequest {
  conversation_id: string;
  source: ConversationSource;
  analysis_mode?: AnalysisMode;
  turns: ConversationTurn[];
}

export interface RootTopicSummary {
  label: string;
  centroid_turn_ids: number[];
}

export interface TurnUiMeta {
  path_type: PathType;
  node_type: NodeType;
}

export interface ClassificationProbabilities {
  ON_PATH: number;
  DEEPENING: number;
  SIDE_QUEST: number;
  RABBIT_HOLE: number;
  RETURN_TO_PATH: number;
}

export interface TurnAnalysis extends ConversationTurn {
  topic_label: string;
  cluster_id: number;
  lineage_id?: number | null;
  fork_turn_id?: number | null;
  anchor_turn_id?: number | null;
  classification: Classification;
  drift_score: number;
  root_relevance_score: number;
  local_coherence_score: number;
  prev_similarity: number;
  local_similarity: number;
  root_similarity: number;
  explanation: string;
  decision_source?: DecisionSource;
  classification_probabilities?: ClassificationProbabilities | null;
  ui: TurnUiMeta;
}

export interface TrailEdge {
  source: number;
  target: number;
  relationship: EdgeRelationship;
  strength: number;
  transition_id?: string | null;
  sequence?: number | null;
}

export interface AnalysisSummary {
  total_turns: number;
  rabbit_holes: number;
  side_quests: number;
  returns_to_path: number;
}

export interface AnalysisResponse {
  conversation_id: string;
  analysis_mode: AnalysisMode;
  root_topic: RootTopicSummary;
  turns: TurnAnalysis[];
  edges: TrailEdge[];
  summary: AnalysisSummary;
}
