from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Sequence

import numpy as np

from app.config import AnalysisConfig


def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    if left.size == 0 or right.size == 0:
        return 0.0
    denominator = np.linalg.norm(left) * np.linalg.norm(right)
    if denominator == 0:
        return 0.0
    return float(np.dot(left, right) / denominator)


def keyword_overlap(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    shared = len(left & right)
    if shared == 0:
        return 0.0
    return shared / max(1, min(len(left), len(right)))


def merge_keyword_sets(keyword_sets: Sequence[set[str]]) -> set[str]:
    merged: set[str] = set()
    for keyword_set in keyword_sets:
        merged.update(keyword_set)
    return merged


def mean_centroid(vectors: Sequence[np.ndarray], fallback: np.ndarray) -> np.ndarray:
    if not vectors:
        return fallback
    stacked = np.vstack(vectors)
    centroid = stacked.mean(axis=0)
    norm = np.linalg.norm(centroid)
    if norm == 0:
        return fallback
    return centroid / norm


@dataclass
class LineageMatch:
    lineage_id: int
    semantic_similarity: float
    keyword_overlap: float
    score: float
    age: int


@dataclass
class TrackedLineage:
    id: int
    lane: str
    created_turn_index: int
    parent_lineage_id: int = 0
    fork_turn_id: Optional[int] = None
    turn_indices: list[int] = field(default_factory=list)
    embeddings: list[np.ndarray] = field(default_factory=list)
    keyword_sets: list[set[str]] = field(default_factory=list)
    last_turn_index: int = -1
    seed_root_similarity: float = 0.0
    seed_mainline_similarity: float = 0.0

    def add_turn(self, *, turn_index: int, embedding: np.ndarray, keywords: set[str]) -> None:
        self.turn_indices.append(turn_index)
        self.embeddings.append(embedding)
        self.keyword_sets.append(set(keywords))
        self.last_turn_index = turn_index

    def centroid(self, fallback: np.ndarray) -> np.ndarray:
        return mean_centroid(self.embeddings, fallback)

    def keywords(self) -> set[str]:
        return merge_keyword_sets(self.keyword_sets)

    def match(
        self,
        *,
        turn_index: int,
        embedding: np.ndarray,
        keywords: set[str],
        fallback_centroid: np.ndarray,
        config: AnalysisConfig,
    ) -> LineageMatch:
        semantic_similarity = cosine_similarity(embedding, self.centroid(fallback_centroid))
        overlap = keyword_overlap(keywords, self.keywords())
        age = max(turn_index - self.last_turn_index, 0)
        recency_bonus = config.lineage_recency_bonus * max(
            0.0,
            1.0 - (age / max(config.lineage_max_age_turns, 1)),
        )
        stale_turns = max(age - config.lineage_max_age_turns, 0)
        stale_penalty = stale_turns * config.lineage_stale_penalty
        score = (
            config.lineage_similarity_weight * semantic_similarity
            + config.lineage_keyword_weight * overlap
            + recency_bonus
            - stale_penalty
        )
        return LineageMatch(
            lineage_id=self.id,
            semantic_similarity=semantic_similarity,
            keyword_overlap=overlap,
            score=score,
            age=age,
        )

    def anchor_score(
        self,
        *,
        root_centroid: np.ndarray,
        mainline_centroid: np.ndarray,
        root_keywords: set[str],
        mainline_keywords: set[str],
    ) -> float:
        centroid = self.centroid(root_centroid)
        root_similarity = cosine_similarity(centroid, root_centroid)
        mainline_similarity = cosine_similarity(centroid, mainline_centroid)
        root_overlap = keyword_overlap(self.keywords(), root_keywords)
        mainline_overlap = keyword_overlap(self.keywords(), mainline_keywords)
        return max(
            0.5 * root_similarity + 0.3 * mainline_similarity + 0.2 * root_overlap,
            0.45 * root_similarity + 0.25 * mainline_similarity + 0.3 * mainline_overlap,
            self.seed_root_similarity * 0.55 + self.seed_mainline_similarity * 0.25 + root_overlap * 0.2,
        )
