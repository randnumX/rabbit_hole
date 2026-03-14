from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer

from app.config import AnalysisConfig
from app.logging import get_logger

logger = get_logger("app.services.embeddings")


class EmbeddingProvider(Protocol):
    model_name: str
    fallback_active: bool

    def encode_texts(self, texts: Sequence[str]) -> np.ndarray:
        ...


def _normalize_rows(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return vectors / norms


@dataclass
class FallbackEmbeddingProvider:
    model_name: str = "hashing-fallback"
    fallback_active: bool = True

    def __post_init__(self) -> None:
        logger.warning("Activating hashing fallback embedding provider")
        self._vectorizer = HashingVectorizer(
            n_features=512,
            alternate_sign=False,
            norm=None,
            stop_words="english",
            ngram_range=(1, 2),
        )

    def encode_texts(self, texts: Sequence[str]) -> np.ndarray:
        logger.debug("Encoding %s texts with fallback embeddings", len(texts))
        matrix = self._vectorizer.transform(texts)
        dense = matrix.toarray().astype(np.float64)
        return _normalize_rows(dense)


class SentenceTransformerEmbeddingProvider:
    def __init__(self, config: AnalysisConfig) -> None:
        self.model_name = config.model_name
        self.fallback_active = False
        self._config = config
        self._model = None
        self._fallback = None

    def _activate_fallback(self) -> None:
        logger.warning("Sentence transformer unavailable; switching to hashing fallback")
        fallback = FallbackEmbeddingProvider()
        self.model_name = fallback.model_name
        self.fallback_active = fallback.fallback_active
        self._fallback = fallback
        self._model = None

    def _ensure_loaded(self) -> None:
        if self._model is not None or self._fallback is not None:
            return

        try:
            from sentence_transformers import SentenceTransformer
        except Exception as error:
            logger.warning("Failed to import sentence-transformers: %s", error)
            self._activate_fallback()
            return

        try:
            self._model = SentenceTransformer(self._config.model_name)
            logger.info("Loaded sentence transformer model=%s", self._config.model_name)
        except Exception as error:
            logger.warning("Failed to load sentence transformer model=%s error=%s", self._config.model_name, error)
            self._activate_fallback()

    def encode_texts(self, texts: Sequence[str]) -> np.ndarray:
        self._ensure_loaded()

        if self._fallback is not None:
            return self._fallback.encode_texts(texts)

        try:
            logger.debug("Encoding %s texts with sentence transformer model=%s", len(texts), self.model_name)
            embeddings = self._model.encode(  # type: ignore[union-attr]
                list(texts),
                normalize_embeddings=True,
                convert_to_numpy=True,
            )
            return embeddings.astype(np.float64)
        except Exception as error:
            logger.warning("Embedding model failed during encode; falling back. error=%s", error)
            self._activate_fallback()
            return self._fallback.encode_texts(texts)  # type: ignore[union-attr]
