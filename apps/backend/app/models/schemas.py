from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ConversationSource(str, Enum):
    chatgpt = "chatgpt"
    claude = "claude"
    gemini = "gemini"
    debug = "debug"


class ConversationRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class AnalysisMode(str, Enum):
    deterministic = "deterministic"
    hybrid = "hybrid"
    probabilistic = "probabilistic"


class DecisionSource(str, Enum):
    deterministic = "deterministic"
    llm = "llm"


class Classification(str, Enum):
    ON_PATH = "ON_PATH"
    DEEPENING = "DEEPENING"
    SIDE_QUEST = "SIDE_QUEST"
    RABBIT_HOLE = "RABBIT_HOLE"
    RETURN_TO_PATH = "RETURN_TO_PATH"


class PathType(str, Enum):
    main = "main"
    side = "side"
    rabbit_hole = "rabbit_hole"
    return_path = "return"


class NodeType(str, Enum):
    start = "start"
    normal = "normal"
    broken = "broken"
    return_node = "return"


class EdgeRelationship(str, Enum):
    main_path = "main_path"
    deepening = "deepening"
    side_quest = "side_quest"
    rabbit_hole_jump = "rabbit_hole_jump"
    return_to_path = "return_to_path"
    fork_out = "fork_out"
    backtrack = "backtrack"
    rejoin_path = "rejoin_path"


class ConversationTurn(BaseModel):
    id: int
    role: ConversationRole
    text: str = Field(min_length=1)
    prompt_text: Optional[str] = None
    response_text: Optional[str] = None
    response_focus_text: Optional[str] = None
    source_roles: Optional[List[ConversationRole]] = None
    source_message_count: Optional[int] = None


class AnalysisRequest(BaseModel):
    conversation_id: str
    source: ConversationSource
    analysis_mode: AnalysisMode = AnalysisMode.deterministic
    turns: List[ConversationTurn]


class RootTopicSummary(BaseModel):
    label: str
    centroid_turn_ids: List[int]


class TurnUiMeta(BaseModel):
    path_type: PathType
    node_type: NodeType


class ClassificationProbabilities(BaseModel):
    ON_PATH: float
    DEEPENING: float
    SIDE_QUEST: float
    RABBIT_HOLE: float
    RETURN_TO_PATH: float


class TurnAnalysis(ConversationTurn):
    topic_label: str
    cluster_id: int
    lineage_id: Optional[int] = None
    fork_turn_id: Optional[int] = None
    anchor_turn_id: Optional[int] = None
    classification: Classification
    drift_score: float
    root_relevance_score: float
    local_coherence_score: float
    prev_similarity: float
    local_similarity: float
    root_similarity: float
    explanation: str
    decision_source: DecisionSource = DecisionSource.deterministic
    classification_probabilities: Optional[ClassificationProbabilities] = None
    ui: TurnUiMeta


class TrailEdge(BaseModel):
    source: int
    target: int
    relationship: EdgeRelationship
    strength: float
    transition_id: Optional[str] = None
    sequence: Optional[int] = None


class AnalysisSummary(BaseModel):
    total_turns: int
    rabbit_holes: int
    side_quests: int
    returns_to_path: int


class AnalysisResponse(BaseModel):
    conversation_id: str
    analysis_mode: AnalysisMode
    root_topic: RootTopicSummary
    turns: List[TurnAnalysis]
    edges: List[TrailEdge]
    summary: AnalysisSummary


class HealthResponse(BaseModel):
    status: str
    model_name: str
    fallback_active: bool = False
    llm_available: bool = False
    llm_model: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_reason: Optional[str] = None
    available_modes: List[AnalysisMode] = Field(default_factory=lambda: [AnalysisMode.deterministic])
