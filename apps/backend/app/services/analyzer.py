from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Optional, Sequence

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from app.config import AnalysisConfig, DEFAULT_CONFIG
from app.logging import get_logger
from app.models.schemas import (
    AnalysisMode,
    AnalysisRequest,
    AnalysisResponse,
    AnalysisSummary,
    Classification,
    DecisionSource,
    EdgeRelationship,
    NodeType,
    PathType,
    RootTopicSummary,
    TrailEdge,
    TurnAnalysis,
    TurnUiMeta,
)
from app.services.embeddings import EmbeddingProvider, SentenceTransformerEmbeddingProvider
from app.services.focus import build_analysis_text, contextualize_prompt_text, normalize_text
from app.services.lineages import TrackedLineage, cosine_similarity, keyword_overlap, mean_centroid, merge_keyword_sets
from app.services.model_assist import ModelAssistService, ProbabilisticTurnInput

logger = get_logger("app.services.analyzer")

MAIN_PATH_CLASSES = {
    Classification.ON_PATH,
    Classification.DEEPENING,
    Classification.RETURN_TO_PATH,
}
NON_RABBIT_CLASSES = MAIN_PATH_CLASSES | {Classification.SIDE_QUEST}
KEYWORD_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9+-]{2,}")
STOPWORDS = {
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "your",
    "what",
    "when",
    "where",
    "have",
    "just",
    "into",
    "them",
    "then",
    "they",
    "like",
    "will",
    "would",
    "there",
    "also",
    "about",
    "need",
    "does",
    "how",
    "can",
    "you",
    "are",
    "not",
    "but",
    "its",
    "it",
    "was",
    "out",
    "all",
    "any",
}


@dataclass(frozen=True)
class PreparedTurn:
    prompt_text: str
    response_text: str
    response_focus_text: str
    analysis_text: str
    topic_text: str


@dataclass(frozen=True)
class BranchSignal:
    similarity: float
    score: float
    anchor: float
    keyword_overlap: float
    lineage_id: Optional[int]


@dataclass(frozen=True)
class TurnTraversalMeta:
    lineage_id: Optional[int]
    fork_turn_id: Optional[int]
    anchor_turn_id: Optional[int]


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    if left.size == 0 or right.size == 0:
        return 0.0
    denominator = np.linalg.norm(left) * np.linalg.norm(right)
    if denominator == 0:
        return 0.0
    return float(np.dot(left, right) / denominator)


def _mean_centroid(vectors: Sequence[np.ndarray], fallback: np.ndarray) -> np.ndarray:
    if not vectors:
        return fallback
    stacked = np.vstack(vectors)
    centroid = stacked.mean(axis=0)
    norm = np.linalg.norm(centroid)
    if norm == 0:
        return fallback
    return centroid / norm


def _fit_clusterer(distance_threshold: float, embeddings: np.ndarray) -> np.ndarray:
    if len(embeddings) == 1:
        return np.array([0], dtype=int)

    from sklearn.cluster import AgglomerativeClustering

    kwargs = {
        "n_clusters": None,
        "distance_threshold": distance_threshold,
        "linkage": "average",
    }

    try:
        clusterer = AgglomerativeClustering(metric="cosine", **kwargs)
    except TypeError:
        clusterer = AgglomerativeClustering(affinity="cosine", **kwargs)

    return clusterer.fit_predict(embeddings)


def _detect_change_points(distances: np.ndarray) -> set[int]:
    if len(distances) < 3:
        return set()

    try:
        import ruptures as rpt

        algo = rpt.Pelt(model="rbf").fit(distances.reshape(-1, 1))
        breakpoints = algo.predict(pen=0.35)
        return {max(point, 1) for point in breakpoints[:-1]}
    except Exception:
        threshold = float(np.quantile(distances, 0.8))
        return {index + 1 for index, distance in enumerate(distances) if distance >= threshold}


def _top_terms_for_texts(texts: Sequence[str]) -> list[str]:
    if not texts:
        return ["Conversation topic"]

    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=250)
    try:
        matrix = vectorizer.fit_transform(texts)
    except ValueError:
        return ["Conversation topic"]
    scores = np.asarray(matrix.sum(axis=0)).ravel()
    if scores.size == 0:
        return ["Conversation topic"]

    feature_names = vectorizer.get_feature_names_out()
    ranked = scores.argsort()[::-1]
    labels = [feature_names[index].replace("_", " ") for index in ranked[:3] if scores[index] > 0]
    return labels or ["Conversation topic"]


def _build_topic_labels(texts: Sequence[str], cluster_ids: np.ndarray) -> dict[int, str]:
    labels: dict[int, str] = {}
    for cluster_id in sorted(set(cluster_ids.tolist())):
        cluster_texts = [text for text, cid in zip(texts, cluster_ids) if cid == cluster_id]
        labels[cluster_id] = " / ".join(_top_terms_for_texts(cluster_texts)[:2])
    return labels


def _build_root_topic_label(root_texts: Sequence[str]) -> str:
    return " / ".join(_top_terms_for_texts(root_texts)[:2])


def _keyword_set(text: str) -> set[str]:
    return {
        token.lower()
        for token in KEYWORD_PATTERN.findall(text)
        if token.lower() not in STOPWORDS
    }


def _merge_keyword_sets(keyword_sets: Sequence[set[str]]) -> set[str]:
    merged: set[str] = set()
    for keyword_set in keyword_sets:
        merged.update(keyword_set)
    return merged


def _keyword_overlap(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    shared = len(left & right)
    if shared == 0:
        return 0.0
    return shared / max(1, min(len(left), len(right)))


def _boost_similarity(similarity: float, overlap: float, weight: float) -> float:
    if overlap <= 0:
        return similarity
    return _clamp(similarity + overlap * weight)


def _select_best_branch_signal(
    *,
    lineages: Sequence[TrackedLineage],
    turn_index: int,
    embedding: np.ndarray,
    keywords: set[str],
    root_centroid: np.ndarray,
    mainline_centroid: np.ndarray,
    root_keywords: set[str],
    mainline_keywords: set[str],
    config: AnalysisConfig,
) -> BranchSignal:
    if not lineages:
        return BranchSignal(similarity=0.0, score=0.0, anchor=0.0, keyword_overlap=0.0, lineage_id=None)

    best_signal = BranchSignal(similarity=0.0, score=0.0, anchor=0.0, keyword_overlap=0.0, lineage_id=None)
    fallback_centroid = mainline_centroid if mainline_centroid.size else root_centroid

    for lineage in lineages:
        match = lineage.match(
            turn_index=turn_index,
            embedding=embedding,
            keywords=keywords,
            fallback_centroid=fallback_centroid,
            config=config,
        )
        anchor = lineage.anchor_score(
            root_centroid=root_centroid,
            mainline_centroid=mainline_centroid,
            root_keywords=root_keywords,
            mainline_keywords=mainline_keywords,
        )
        signal = BranchSignal(
            similarity=match.semantic_similarity,
            score=match.score,
            anchor=anchor,
            keyword_overlap=match.keyword_overlap,
            lineage_id=lineage.id,
        )
        if signal.score > best_signal.score:
            best_signal = signal

    return best_signal


def _build_explanation(
    classification: Classification,
    topic_label: str,
    root_similarity: float,
    local_coherence: float,
    crossed_boundary: bool,
) -> str:
    boundary_note = " A topic boundary was also detected." if crossed_boundary else ""

    if classification == Classification.ON_PATH:
        return (
            f"This turn stays on the main thread around {topic_label} with strong local coherence "
            f"({local_coherence:.2f}) and root relevance ({root_similarity:.2f}).{boundary_note}"
        )

    if classification == Classification.DEEPENING:
        return (
            f"This turn deepens the ongoing topic into {topic_label} while remaining connected to the "
            f"root topic ({root_similarity:.2f}) and local cluster ({local_coherence:.2f}).{boundary_note}"
        )

    if classification == Classification.SIDE_QUEST:
        return (
            f"This turn branches into {topic_label}. It drifts from the immediate trail but still keeps "
            f"some connection to the root topic ({root_similarity:.2f}) or nearby cluster ({local_coherence:.2f}).{boundary_note}"
        )

    if classification == Classification.RETURN_TO_PATH:
        return (
            f"This turn reconnects to the main thread through {topic_label}. Root relevance recovered to "
            f"{root_similarity:.2f}, indicating a return from the earlier drift.{boundary_note}"
        )

    return (
        f"This turn likely diverged from the main thread because it introduced {topic_label} with low "
        f"root relevance ({root_similarity:.2f}) and low local coherence ({local_coherence:.2f}).{boundary_note}"
    )


def _build_edge_relationship(classification: Classification) -> EdgeRelationship:
    if classification == Classification.DEEPENING:
        return EdgeRelationship.deepening
    if classification == Classification.SIDE_QUEST:
        return EdgeRelationship.side_quest
    if classification == Classification.RABBIT_HOLE:
        return EdgeRelationship.rabbit_hole_jump
    if classification == Classification.RETURN_TO_PATH:
        return EdgeRelationship.return_to_path
    return EdgeRelationship.main_path


def _ui_meta_for_classification(classification: Classification, is_first: bool) -> TurnUiMeta:
    if is_first:
        return TurnUiMeta(path_type=PathType.main, node_type=NodeType.start)
    if classification == Classification.SIDE_QUEST:
        return TurnUiMeta(path_type=PathType.side, node_type=NodeType.normal)
    if classification == Classification.RABBIT_HOLE:
        return TurnUiMeta(path_type=PathType.rabbit_hole, node_type=NodeType.broken)
    if classification == Classification.RETURN_TO_PATH:
        return TurnUiMeta(path_type=PathType.return_path, node_type=NodeType.return_node)
    return TurnUiMeta(path_type=PathType.main, node_type=NodeType.normal)


def _build_transition_edges(
    turns,
    analyses: Sequence[TurnAnalysis],
    traversal_meta: Sequence[TurnTraversalMeta],
) -> list[TrailEdge]:
    edges: list[TrailEdge] = []
    for index in range(1, len(turns)):
        previous_turn = turns[index - 1]
        current_turn = turns[index]
        current_analysis = analyses[index]
        previous_meta = traversal_meta[index - 1]
        current_meta = traversal_meta[index]
        transition_id = f"transition-{current_turn.id}"
        direct_relationship = _build_edge_relationship(current_analysis.classification)

        if current_analysis.classification == Classification.RABBIT_HOLE:
            edges.append(
                TrailEdge(
                    source=previous_turn.id,
                    target=current_turn.id,
                    relationship=direct_relationship,
                    strength=round(current_analysis.prev_similarity, 4),
                    transition_id=transition_id,
                    sequence=0,
                )
            )
            continue

        if current_meta.lineage_id == previous_meta.lineage_id:
            edges.append(
                TrailEdge(
                    source=previous_turn.id,
                    target=current_turn.id,
                    relationship=direct_relationship,
                    strength=round(current_analysis.prev_similarity, 4),
                    transition_id=transition_id,
                    sequence=0,
                )
            )
            continue

        anchor_turn_id = current_meta.anchor_turn_id or current_meta.fork_turn_id or previous_meta.fork_turn_id
        if anchor_turn_id and anchor_turn_id != previous_turn.id:
            edges.append(
                TrailEdge(
                    source=previous_turn.id,
                    target=anchor_turn_id,
                    relationship=EdgeRelationship.backtrack,
                    strength=round(current_analysis.prev_similarity, 4),
                    transition_id=transition_id,
                    sequence=0,
                )
            )

        followup_relationship = EdgeRelationship.rejoin_path
        if current_meta.lineage_id is not None and current_meta.lineage_id > 0:
            followup_relationship = EdgeRelationship.fork_out
        elif current_analysis.classification not in {Classification.RETURN_TO_PATH, Classification.ON_PATH}:
            followup_relationship = direct_relationship

        edges.append(
            TrailEdge(
                source=anchor_turn_id or previous_turn.id,
                target=current_turn.id,
                relationship=followup_relationship,
                strength=round(current_analysis.prev_similarity, 4),
                transition_id=transition_id,
                sequence=1 if anchor_turn_id and anchor_turn_id != previous_turn.id else 0,
            )
        )

    return edges


class DriftAnalyzer:
    def __init__(
        self,
        config: AnalysisConfig = DEFAULT_CONFIG,
        embedding_provider: Optional[EmbeddingProvider] = None,
        model_assist: Optional[ModelAssistService] = None,
    ) -> None:
        self.config = config
        self.embedding_provider = embedding_provider or SentenceTransformerEmbeddingProvider(config)
        self.model_assist = model_assist or ModelAssistService(config)

    def analyze(self, request: AnalysisRequest) -> AnalysisResponse:
        turns = [turn for turn in request.turns if normalize_text(turn.text)]
        if not turns:
            raise ValueError("Conversation does not contain any non-empty turns.")

        actual_mode = self._resolve_mode(request.analysis_mode)
        logger.info(
            "Starting analysis conversation_id=%s requested_mode=%s resolved_mode=%s turns=%s",
            request.conversation_id,
            request.analysis_mode.value,
            actual_mode.value,
            len(turns),
        )
        prepared_turns = self._prepare_turns(turns, actual_mode)
        deterministic_response = self._analyze_deterministic(
            conversation_id=request.conversation_id,
            turns=turns,
            prepared_turns=prepared_turns,
            analysis_mode=actual_mode,
        )

        if actual_mode != AnalysisMode.probabilistic:
            return deterministic_response

        probabilistic_response = self._apply_probabilistic_overlay(
            response=deterministic_response,
            prepared_turns=prepared_turns,
        )
        if probabilistic_response is not None:
            logger.info("Probabilistic overlay applied conversation_id=%s", request.conversation_id)
            return probabilistic_response

        logger.info("Probabilistic overlay unavailable; returning fallback mode=%s", deterministic_response.analysis_mode.value)
        deterministic_response.analysis_mode = AnalysisMode.hybrid if self.model_assist.available else AnalysisMode.deterministic
        return deterministic_response

    def _resolve_mode(self, requested_mode: AnalysisMode) -> AnalysisMode:
        if requested_mode == AnalysisMode.deterministic:
            return requested_mode
        if self.model_assist.available:
            return requested_mode
        return AnalysisMode.deterministic

    def _prepare_turns(self, turns, analysis_mode: AnalysisMode) -> list[PreparedTurn]:
        prepared_turns: list[PreparedTurn] = []
        previous_context = ""
        for turn in turns:
            raw_prompt_text = normalize_text(turn.prompt_text) or normalize_text(turn.text)
            prompt_text = contextualize_prompt_text(raw_prompt_text, previous_context, self.config)
            response_text = normalize_text(turn.response_text)
            if turn.response_focus_text:
                response_focus_text = normalize_text(turn.response_focus_text)
            elif response_text:
                response_focus_text = self.model_assist.summarize_response(
                    prompt_text=prompt_text,
                    response_text=response_text,
                    mode=analysis_mode,
                )
            else:
                response_focus_text = ""

            topic_text = normalize_text("\n\n".join(part for part in [prompt_text, response_focus_text] if part)) or normalize_text(
                turn.text
            )
            prepared_turns.append(
                PreparedTurn(
                    prompt_text=prompt_text,
                    response_text=response_text,
                    response_focus_text=response_focus_text,
                    analysis_text=build_analysis_text(prompt_text, response_focus_text, turn.text),
                    topic_text=topic_text,
                )
            )
            previous_context = topic_text or normalize_text(turn.text)
        logger.debug("Prepared %s turns for analysis mode=%s", len(prepared_turns), analysis_mode.value)
        return prepared_turns

    def _analyze_deterministic(
        self,
        *,
        conversation_id: str,
        turns,
        prepared_turns: Sequence[PreparedTurn],
        analysis_mode: AnalysisMode,
    ) -> AnalysisResponse:
        analysis_texts = [prepared.analysis_text for prepared in prepared_turns]
        topic_texts = [prepared.topic_text for prepared in prepared_turns]
        keyword_sets = [_keyword_set(prepared.topic_text) for prepared in prepared_turns]
        embeddings = self.embedding_provider.encode_texts(analysis_texts)
        cluster_ids = _fit_clusterer(self.config.cluster_distance_threshold, embeddings)
        topic_labels = _build_topic_labels(topic_texts, cluster_ids)
        logger.debug(
            "Computed embeddings and cluster labels conversation_id=%s clusters=%s",
            conversation_id,
            len(set(cluster_ids.tolist())),
        )

        pairwise_distances = np.array(
            [1.0 - cosine_similarity(embeddings[index], embeddings[index - 1]) for index in range(1, len(embeddings))],
            dtype=np.float64,
        )
        change_points = _detect_change_points(pairwise_distances)

        root_count = min(self.config.root_turn_window, len(turns))
        root_indices = list(range(root_count))
        root_embeddings = [embeddings[index] for index in root_indices]
        root_centroid = mean_centroid(root_embeddings, embeddings[0])
        root_label = _build_root_topic_label([topic_texts[index] for index in root_indices])
        root_keywords = merge_keyword_sets([keyword_sets[index] for index in root_indices])
        logger.info(
            "Root topic established conversation_id=%s root_label=%s root_turn_ids=%s",
            conversation_id,
            root_label,
            [turns[index].id for index in root_indices],
        )

        analyses: list[TurnAnalysis] = []
        traversal_meta: list[TurnTraversalMeta] = []
        mainline_lineage = TrackedLineage(id=0, lane="mainline", created_turn_index=0, parent_lineage_id=0)
        branch_lineages: dict[int, TrackedLineage] = {}
        next_branch_id = 1
        previous_classification = Classification.ON_PATH
        previous_root_similarity = 1.0
        last_stable_turn_id: Optional[int] = None

        for index, (turn, prepared) in enumerate(zip(turns, prepared_turns)):
            embedding = embeddings[index]
            keywords = keyword_sets[index]
            mainline_centroid = mainline_lineage.centroid(root_centroid)
            mainline_keywords = mainline_lineage.keywords() or root_keywords
            prev_keywords = keyword_sets[index - 1] if index > 0 else root_keywords

            prev_similarity = 1.0 if index == 0 else cosine_similarity(embedding, embeddings[index - 1])
            root_similarity = cosine_similarity(embedding, root_centroid)
            main_path_similarity = cosine_similarity(embedding, mainline_centroid)
            prev_keyword_overlap = keyword_overlap(keywords, prev_keywords)
            root_keyword_overlap = keyword_overlap(keywords, root_keywords)
            main_path_keyword_overlap = keyword_overlap(keywords, mainline_keywords)
            best_branch = _select_best_branch_signal(
                lineages=list(branch_lineages.values()),
                turn_index=index,
                embedding=embedding,
                keywords=keywords,
                root_centroid=root_centroid,
                mainline_centroid=mainline_centroid,
                root_keywords=root_keywords,
                mainline_keywords=mainline_keywords,
                config=self.config,
            )
            local_similarity = max(main_path_similarity, best_branch.similarity)
            local_keyword_overlap = max(main_path_keyword_overlap, best_branch.keyword_overlap)
            continuity_overlap = max(
                prev_keyword_overlap,
                local_keyword_overlap,
                root_keyword_overlap,
                main_path_keyword_overlap,
                best_branch.keyword_overlap,
            )
            branch_anchor = max(best_branch.anchor, root_similarity, main_path_similarity, continuity_overlap)

            prev_similarity = _boost_similarity(prev_similarity, prev_keyword_overlap, self.config.lexical_prev_boost)
            local_similarity = _boost_similarity(
                local_similarity,
                max(local_keyword_overlap, prev_keyword_overlap, best_branch.keyword_overlap),
                self.config.lexical_local_boost,
            )
            root_similarity = _boost_similarity(root_similarity, root_keyword_overlap, self.config.lexical_root_boost)
            main_path_similarity = _boost_similarity(
                main_path_similarity,
                max(main_path_keyword_overlap, local_keyword_overlap, root_keyword_overlap, best_branch.keyword_overlap),
                self.config.lexical_main_path_boost,
            )
            branch_similarity = _boost_similarity(best_branch.similarity, best_branch.keyword_overlap, self.config.lexical_local_boost)
            local_coherence = 0.5 * local_similarity + 0.3 * prev_similarity + 0.2 * max(main_path_similarity, branch_similarity)
            novelty_score = 1.0 - max(local_similarity, root_similarity, main_path_similarity)
            change_point_bonus = self.config.change_point_bonus if index in change_points else 0.0
            drift_score = _clamp(
                1.0
                - (
                    self.config.weight_prev_similarity * prev_similarity
                    + self.config.weight_local_similarity * local_similarity
                    + self.config.weight_root_similarity * root_similarity
                    + self.config.weight_main_path_similarity * max(main_path_similarity, branch_similarity)
                )
                + change_point_bonus
            )

            classification = self._classify_turn(
                index=index,
                previous_classification=previous_classification,
                previous_root_similarity=previous_root_similarity,
                prev_similarity=prev_similarity,
                local_similarity=local_similarity,
                root_similarity=root_similarity,
                main_path_similarity=main_path_similarity,
                branch_similarity=branch_similarity,
                branch_anchor=branch_anchor,
                novelty_score=novelty_score,
                drift_score=drift_score,
                continuity_overlap=continuity_overlap,
            )
            logger.debug(
                "Turn classified conversation_id=%s turn_id=%s classification=%s prev=%.3f root=%.3f mainline=%.3f branch=%.3f drift=%.3f",
                conversation_id,
                turn.id,
                classification.value,
                prev_similarity,
                root_similarity,
                main_path_similarity,
                branch_similarity,
                drift_score,
            )

            topic_label = topic_labels[int(cluster_ids[index])]
            explanation = _build_explanation(
                classification=classification,
                topic_label=topic_label,
                root_similarity=root_similarity,
                local_coherence=local_coherence,
                crossed_boundary=index in change_points,
            )

            previous_meta = traversal_meta[-1] if traversal_meta else None
            create_branch_id: Optional[int] = None
            assigned_lineage_id: Optional[int]
            fork_turn_id: Optional[int] = None
            anchor_turn_id: Optional[int] = None

            if index == 0:
                assigned_lineage_id = 0
            elif classification == Classification.RABBIT_HOLE:
                assigned_lineage_id = None
                anchor_turn_id = last_stable_turn_id
            elif classification in {Classification.ON_PATH, Classification.RETURN_TO_PATH}:
                assigned_lineage_id = 0
                if previous_meta and previous_meta.lineage_id not in {None, 0}:
                    anchor_turn_id = previous_meta.fork_turn_id or last_stable_turn_id
                elif previous_classification == Classification.RABBIT_HOLE:
                    anchor_turn_id = last_stable_turn_id
            else:
                if best_branch.lineage_id is not None and best_branch.score >= self.config.lineage_match_threshold:
                    assigned_lineage_id = best_branch.lineage_id
                    fork_turn_id = branch_lineages[assigned_lineage_id].fork_turn_id
                elif branch_anchor >= self.config.lineage_create_threshold:
                    assigned_lineage_id = next_branch_id
                    create_branch_id = next_branch_id
                    fork_turn_id = turns[index - 1].id if index > 0 else None
                else:
                    assigned_lineage_id = 0

                if assigned_lineage_id is not None and assigned_lineage_id > 0:
                    anchor_turn_id = fork_turn_id

            traversal_meta.append(
                TurnTraversalMeta(
                    lineage_id=assigned_lineage_id,
                    fork_turn_id=fork_turn_id,
                    anchor_turn_id=anchor_turn_id,
                )
            )

            analyses.append(
                TurnAnalysis(
                    id=turn.id,
                    role=turn.role,
                    text=turn.text,
                    prompt_text=prepared.prompt_text or None,
                    response_text=prepared.response_text or None,
                    response_focus_text=prepared.response_focus_text or None,
                    source_roles=turn.source_roles,
                    source_message_count=turn.source_message_count,
                    topic_label=topic_label,
                    cluster_id=int(cluster_ids[index]),
                    lineage_id=assigned_lineage_id,
                    fork_turn_id=fork_turn_id,
                    anchor_turn_id=anchor_turn_id,
                    classification=classification,
                    drift_score=round(drift_score, 4),
                    root_relevance_score=round(root_similarity, 4),
                    local_coherence_score=round(local_coherence, 4),
                    prev_similarity=round(prev_similarity, 4),
                    local_similarity=round(local_similarity, 4),
                    root_similarity=round(root_similarity, 4),
                    explanation=explanation,
                    decision_source=DecisionSource.deterministic,
                    ui=_ui_meta_for_classification(classification, is_first=index == 0),
                )
            )

            if classification in MAIN_PATH_CLASSES:
                mainline_lineage.add_turn(turn_index=index, embedding=embedding, keywords=keywords)
                logger.debug("Turn added to mainline conversation_id=%s turn_id=%s", conversation_id, turn.id)

            if assigned_lineage_id is not None and assigned_lineage_id > 0:
                if create_branch_id is not None:
                    parent_lineage_id = previous_meta.lineage_id if previous_meta and previous_meta.lineage_id is not None else 0
                    branch_lineages[create_branch_id] = TrackedLineage(
                        id=create_branch_id,
                        lane="branch",
                        created_turn_index=index,
                        parent_lineage_id=parent_lineage_id,
                        fork_turn_id=fork_turn_id,
                        seed_root_similarity=root_similarity,
                        seed_mainline_similarity=main_path_similarity,
                    )
                    logger.debug(
                        "Created new branch lineage conversation_id=%s turn_id=%s lineage_id=%s anchor=%.3f fork_turn_id=%s",
                        conversation_id,
                        turn.id,
                        create_branch_id,
                        branch_anchor,
                        fork_turn_id,
                    )
                    next_branch_id += 1

                branch_lineages[assigned_lineage_id].add_turn(turn_index=index, embedding=embedding, keywords=keywords)
                if create_branch_id is None:
                    logger.debug(
                        "Turn attached to branch lineage conversation_id=%s turn_id=%s lineage_id=%s score=%.3f",
                        conversation_id,
                        turn.id,
                        assigned_lineage_id,
                        best_branch.score,
                    )

            previous_classification = classification
            previous_root_similarity = root_similarity
            if assigned_lineage_id is not None:
                last_stable_turn_id = turn.id

        edges = _build_transition_edges(turns, analyses, traversal_meta)

        summary = AnalysisSummary(
            total_turns=len(analyses),
            rabbit_holes=sum(1 for turn in analyses if turn.classification == Classification.RABBIT_HOLE),
            side_quests=sum(1 for turn in analyses if turn.classification == Classification.SIDE_QUEST),
            returns_to_path=sum(1 for turn in analyses if turn.classification == Classification.RETURN_TO_PATH),
        )
        logger.info(
            "Deterministic analysis complete conversation_id=%s mode=%s total_turns=%s rabbit_holes=%s side_quests=%s returns=%s branches=%s",
            conversation_id,
            analysis_mode.value,
            summary.total_turns,
            summary.rabbit_holes,
            summary.side_quests,
            summary.returns_to_path,
            len(branch_lineages),
        )

        return AnalysisResponse(
            conversation_id=conversation_id,
            analysis_mode=analysis_mode,
            root_topic=RootTopicSummary(
                label=root_label,
                centroid_turn_ids=[turns[index].id for index in root_indices],
            ),
            turns=analyses,
            edges=edges,
            summary=summary,
        )

    def _apply_probabilistic_overlay(
        self,
        *,
        response: AnalysisResponse,
        prepared_turns: Sequence[PreparedTurn],
    ) -> Optional[AnalysisResponse]:
        turn_inputs = [
            ProbabilisticTurnInput(
                id=turn.id,
                prompt_text=prepared.prompt_text,
                response_focus_text=prepared.response_focus_text or normalize_text(turn.text),
                prev_similarity=turn.prev_similarity,
                local_similarity=turn.local_similarity,
                root_similarity=turn.root_similarity,
                mainline_similarity=turn.local_similarity,
                branch_similarity=max(turn.local_similarity - turn.root_similarity, 0.0),
                lineage_anchor_score=max(turn.root_similarity, turn.local_coherence_score),
                drift_score=turn.drift_score,
                local_coherence_score=turn.local_coherence_score,
            )
            for turn, prepared in zip(response.turns, prepared_turns)
        ]

        decision = self.model_assist.classify_conversation(
            root_topic_label=response.root_topic.label,
            turns=turn_inputs,
        )
        if decision is None:
            logger.warning("Probabilistic overlay failed or unavailable")
            return None

        decision_by_id = {item.id: item for item in decision.turns}
        response.root_topic.label = decision.root_topic_label
        response.analysis_mode = AnalysisMode.probabilistic

        for index, turn in enumerate(response.turns):
            overlay = decision_by_id.get(turn.id)
            if overlay is None:
                continue
            turn.topic_label = overlay.topic_label
            turn.classification = overlay.classification
            turn.explanation = overlay.explanation
            turn.classification_probabilities = overlay.probabilities
            turn.decision_source = DecisionSource.llm
            turn.ui = _ui_meta_for_classification(overlay.classification, is_first=index == 0)

        for index, edge in enumerate(response.edges, start=1):
            edge.relationship = _build_edge_relationship(response.turns[index].classification)

        response.summary = AnalysisSummary(
            total_turns=len(response.turns),
            rabbit_holes=sum(1 for turn in response.turns if turn.classification == Classification.RABBIT_HOLE),
            side_quests=sum(1 for turn in response.turns if turn.classification == Classification.SIDE_QUEST),
            returns_to_path=sum(1 for turn in response.turns if turn.classification == Classification.RETURN_TO_PATH),
        )
        logger.info(
            "Probabilistic overlay complete total_turns=%s rabbit_holes=%s side_quests=%s returns=%s",
            response.summary.total_turns,
            response.summary.rabbit_holes,
            response.summary.side_quests,
            response.summary.returns_to_path,
        )
        return response

    def _classify_turn(
        self,
        *,
        index: int,
        previous_classification: Classification,
        previous_root_similarity: float,
        prev_similarity: float,
        local_similarity: float,
        root_similarity: float,
        main_path_similarity: float,
        branch_similarity: float,
        branch_anchor: float,
        novelty_score: float,
        drift_score: float,
        continuity_overlap: float,
    ) -> Classification:
        if index == 0:
            return Classification.ON_PATH

        if previous_classification in {Classification.SIDE_QUEST, Classification.RABBIT_HOLE} and (
            root_similarity >= self.config.return_root_similarity
            and main_path_similarity >= self.config.return_main_path_similarity
            and (root_similarity - previous_root_similarity) >= self.config.return_similarity_rebound
        ):
            return Classification.RETURN_TO_PATH

        if (
            prev_similarity < self.config.rabbit_prev_similarity
            and local_similarity < self.config.rabbit_local_similarity
            and root_similarity < self.config.rabbit_root_similarity
            and main_path_similarity < self.config.rabbit_main_path_similarity
            and branch_similarity < self.config.branch_rabbit_guard
            and continuity_overlap <= self.config.rabbit_lexical_overlap_max
            and drift_score >= self.config.rabbit_drift_score
        ):
            return Classification.RABBIT_HOLE

        if (
            prev_similarity >= self.config.on_path_prev_similarity
            and local_similarity >= self.config.on_path_local_similarity
            and root_similarity >= self.config.on_path_root_similarity
            and main_path_similarity >= self.config.on_path_main_path_similarity
        ):
            return Classification.ON_PATH

        if (
            continuity_overlap >= self.config.on_path_lexical_overlap
            and prev_similarity >= self.config.on_path_continuity_prev_similarity
            and local_similarity >= self.config.on_path_continuity_local_similarity
            and root_similarity >= self.config.on_path_continuity_root_similarity
            and main_path_similarity >= self.config.on_path_continuity_main_path_similarity
        ):
            return Classification.ON_PATH

        if (
            branch_similarity >= self.config.branch_deepening_similarity
            and branch_anchor >= self.config.branch_deepening_anchor
            and self.config.deepening_novelty_min <= novelty_score <= self.config.deepening_novelty_max
        ):
            return Classification.DEEPENING

        if (
            local_similarity >= self.config.deepening_local_similarity
            and root_similarity >= self.config.deepening_root_similarity
            and main_path_similarity >= self.config.deepening_main_path_similarity
            and self.config.deepening_novelty_min <= novelty_score <= self.config.deepening_novelty_max
        ):
            return Classification.DEEPENING

        if (
            continuity_overlap >= self.config.deepening_lexical_overlap
            and local_similarity >= self.config.deepening_continuity_local_similarity
            and root_similarity >= self.config.deepening_continuity_root_similarity
            and main_path_similarity >= self.config.deepening_continuity_main_path_similarity
        ):
            return Classification.DEEPENING

        if (
            branch_similarity >= self.config.branch_side_similarity
            and branch_anchor >= self.config.branch_side_anchor
        ):
            return Classification.SIDE_QUEST

        if (
            root_similarity >= self.config.side_quest_root_similarity
            or local_similarity >= self.config.side_quest_local_similarity
            or main_path_similarity >= self.config.side_quest_root_similarity
        ):
            return Classification.SIDE_QUEST

        return Classification.RABBIT_HOLE


DEFAULT_ANALYZER = DriftAnalyzer()
