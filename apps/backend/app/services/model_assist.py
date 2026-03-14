from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from typing import Any, Optional, Sequence

from app.config import AnalysisConfig
from app.logging import get_logger
from app.models.schemas import AnalysisMode, Classification, ClassificationProbabilities
from app.services.focus import heuristic_focus_summary, normalize_text, should_model_summarize
from app.services.local_llm import LocalGenerationClient

logger = get_logger("app.services.model_assist")

CLASSIFICATION_NAMES = [
    Classification.ON_PATH.value,
    Classification.DEEPENING.value,
    Classification.SIDE_QUEST.value,
    Classification.RABBIT_HOLE.value,
    Classification.RETURN_TO_PATH.value,
]


@dataclass(frozen=True)
class ProbabilisticTurnInput:
    id: int
    prompt_text: str
    response_focus_text: str
    prev_similarity: float
    local_similarity: float
    root_similarity: float
    mainline_similarity: float
    branch_similarity: float
    lineage_anchor_score: float
    drift_score: float
    local_coherence_score: float


@dataclass(frozen=True)
class ProbabilisticTurnDecision:
    id: int
    topic_label: str
    classification: Classification
    explanation: str
    probabilities: ClassificationProbabilities


@dataclass(frozen=True)
class ProbabilisticConversationDecision:
    root_topic_label: str
    turns: list[ProbabilisticTurnDecision]


def _safe_output_text(response: Any) -> str:
    output_text = getattr(response, "output_text", "")
    if isinstance(output_text, str):
        return output_text.strip()
    return ""


def _extract_json_payload(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if not stripped:
        raise ValueError("Model response was empty.")

    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("Model response did not contain a JSON object.") from None
        return json.loads(stripped[start : end + 1])


def _normalize_probabilities(raw: dict[str, Any], fallback: Classification) -> ClassificationProbabilities:
    values: dict[str, float] = {}
    total = 0.0
    for name in CLASSIFICATION_NAMES:
        try:
            value = max(float(raw.get(name, 0.0)), 0.0)
        except (TypeError, ValueError):
            value = 0.0
        values[name] = value
        total += value

    if total <= 0:
        values = {name: 0.0 for name in CLASSIFICATION_NAMES}
        values[fallback.value] = 1.0
        total = 1.0

    normalized = {name: round(values[name] / total, 4) for name in CLASSIFICATION_NAMES}
    return ClassificationProbabilities(**normalized)


class ModelAssistService:
    def __init__(self, config: AnalysisConfig) -> None:
        self.config = config
        self.model_name = config.local_llm_model if config.local_llm_enabled else config.llm_model
        self.provider_name: Optional[str] = None
        self._local_client = LocalGenerationClient(config) if config.local_llm_enabled else None
        self._openai_client = None
        self._summary_cache: dict[str, str] = {}
        self._classification_cache: dict[str, ProbabilisticConversationDecision] = {}
        self._unavailable_reason: Optional[str] = None

    @property
    def available(self) -> bool:
        return self._ensure_backend() is not None

    @property
    def unavailable_reason(self) -> Optional[str]:
        self._ensure_backend()
        return self._unavailable_reason

    def preload(self) -> None:
        logger.info("Preloading model assist backend")
        self._ensure_backend()

    def available_modes(self) -> list[AnalysisMode]:
        modes = [AnalysisMode.deterministic]
        if self.available:
            modes.extend([AnalysisMode.hybrid, AnalysisMode.probabilistic])
        return modes

    def summarize_response(self, *, prompt_text: str, response_text: str, mode: AnalysisMode) -> str:
        heuristic = heuristic_focus_summary(prompt_text, response_text, self.config)
        if mode == AnalysisMode.deterministic or not should_model_summarize(response_text, self.config):
            logger.debug("Using heuristic response focus summary mode=%s", mode.value)
            return heuristic

        if not self.available:
            logger.debug("Model assist unavailable; falling back to heuristic summary")
            return heuristic

        cache_key = self._hash_key("summary", prompt_text, response_text)
        cached = self._summary_cache.get(cache_key)
        if cached:
            logger.debug("Summary cache hit")
            return cached

        system_prompt = (
            "You compress long assistant replies for RabbitHole's semantic drift tracker. "
            "Keep the main topic, decision, or technical direction. Drop lists, prices, sales language, and repeated examples. "
            "Return plain text only in 1-2 short sentences."
        )
        user_prompt = (
            f"User prompt:\n{prompt_text}\n\n"
            f"Assistant response:\n{response_text}"
        )

        try:
            summary = self._generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_new_tokens=self.config.local_llm_summary_max_new_tokens,
                temperature=self.config.llm_summary_temperature,
            )
            logger.debug("Model-assisted summary generated provider=%s", self.provider_name)
        except Exception as error:
            logger.warning("Model-assisted summary failed; using heuristic fallback. error=%s", error)
            return heuristic

        cleaned = normalize_text(summary)
        if not cleaned:
            return heuristic

        if len(cleaned) > self.config.focus_summary_char_budget:
            cleaned = cleaned[: self.config.focus_summary_char_budget].rsplit(" ", 1)[0].strip()

        self._summary_cache[cache_key] = cleaned
        return cleaned

    def classify_conversation(
        self,
        *,
        root_topic_label: str,
        turns: Sequence[ProbabilisticTurnInput],
    ) -> Optional[ProbabilisticConversationDecision]:
        if not self.available:
            logger.debug("Probabilistic classification unavailable; no model backend")
            return None

        payload = {
            "root_topic_label": root_topic_label,
            "turns": [
                {
                    "id": turn.id,
                    "prompt_text": turn.prompt_text,
                    "response_focus_text": turn.response_focus_text,
                    "prev_similarity": turn.prev_similarity,
                    "local_similarity": turn.local_similarity,
                    "root_similarity": turn.root_similarity,
                    "mainline_similarity": turn.mainline_similarity,
                    "branch_similarity": turn.branch_similarity,
                    "lineage_anchor_score": turn.lineage_anchor_score,
                    "drift_score": turn.drift_score,
                    "local_coherence_score": turn.local_coherence_score,
                }
                for turn in turns
            ],
        }
        cache_key = self._hash_key("probabilistic", json.dumps(payload, ensure_ascii=False, sort_keys=True))
        cached = self._classification_cache.get(cache_key)
        if cached:
            logger.debug("Probabilistic classification cache hit")
            return cached

        system_prompt = (
            "You classify RabbitHole exchange nodes. Use the root topic plus the provided similarity metrics. "
            "Treat repeated technical troubleshooting within the same root problem as ON_PATH or DEEPENING, not as a rabbit hole. "
            "Use SIDE_QUEST only for still-related branches. Use RABBIT_HOLE only when the turn is weak against the root topic, mainline, and branch lineages. "
            "Return JSON only."
        )
        user_prompt = (
            "Return this exact shape:\n"
            '{"root_topic_label":"string","turns":[{"id":1,"topic_label":"string","classification":"ON_PATH","explanation":"string","probabilities":{"ON_PATH":0.0,"DEEPENING":0.0,"SIDE_QUEST":0.0,"RABBIT_HOLE":0.0,"RETURN_TO_PATH":0.0}}]}\n'
            "Probabilities must sum to 1.\n\n"
            f"Conversation data:\n{json.dumps(payload, ensure_ascii=False)}"
        )

        try:
            raw_response = self._generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_new_tokens=self.config.local_llm_classification_max_new_tokens,
                temperature=self.config.llm_classification_temperature,
            )
            parsed = _extract_json_payload(raw_response)
            logger.debug("Probabilistic classification generated provider=%s turns=%s", self.provider_name, len(turns))
        except Exception as error:
            logger.warning("Probabilistic classification failed. error=%s", error)
            return None

        decisions: list[ProbabilisticTurnDecision] = []
        turn_map = {turn.id: turn for turn in turns}
        for item in parsed.get("turns", []):
            try:
                turn_id = int(item["id"])
                classification = Classification(item["classification"])
            except (KeyError, TypeError, ValueError):
                continue

            if turn_id not in turn_map:
                continue

            probabilities = _normalize_probabilities(item.get("probabilities", {}), classification)
            decisions.append(
                ProbabilisticTurnDecision(
                    id=turn_id,
                    topic_label=normalize_text(item.get("topic_label")) or "Conversation topic",
                    classification=classification,
                    explanation=normalize_text(item.get("explanation")) or "Model-assisted classification.",
                    probabilities=probabilities,
                )
            )

        if len(decisions) != len(turns):
            logger.warning(
                "Probabilistic classification returned incomplete decisions expected=%s actual=%s",
                len(turns),
                len(decisions),
            )
            return None

        decisions.sort(key=lambda decision: decision.id)
        result = ProbabilisticConversationDecision(
            root_topic_label=normalize_text(parsed.get("root_topic_label")) or root_topic_label,
            turns=decisions,
        )
        self._classification_cache[cache_key] = result
        return result

    def _generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_new_tokens: int,
        temperature: float,
    ) -> str:
        backend = self._ensure_backend()
        if backend is None:
            raise RuntimeError(self._unavailable_reason or "No model backend is available.")

        if self.provider_name == "local":
            return backend.generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
            )

        prompt = f"{system_prompt.strip()}\n\n{user_prompt.strip()}"
        response = backend.responses.create(
            model=self.model_name,
            input=prompt,
            temperature=temperature,
            max_output_tokens=max_new_tokens,
        )
        return _safe_output_text(response)

    def _ensure_backend(self):
        order = self._provider_order()
        logger.debug("Resolving model assist backend provider_order=%s", order)
        for provider in order:
            if provider == "local":
                backend = self._ensure_local_client()
                if backend is not None:
                    return backend
            if provider == "openai":
                backend = self._ensure_openai_client()
                if backend is not None:
                    return backend
        return None

    def _provider_order(self) -> list[str]:
        preferred = self.config.llm_provider.strip().lower()
        order: list[str] = []
        if preferred in {"local", "openai"}:
            order.append(preferred)
        for provider in ["local", "openai"]:
            if provider not in order:
                order.append(provider)
        return order

    def _ensure_local_client(self):
        if self._local_client is None:
            return None
        if self._local_client.available:
            self.provider_name = "local"
            self.model_name = self._local_client.model_name
            self._unavailable_reason = None
            logger.debug("Model assist backend ready provider=local model=%s", self.model_name)
            return self._local_client
        self._unavailable_reason = self._local_client.unavailable_reason
        logger.debug("Local model assist unavailable reason=%s", self._unavailable_reason)
        return None

    def _ensure_openai_client(self):
        if self._openai_client is not None:
            self.provider_name = "openai"
            self.model_name = self.config.llm_model
            self._unavailable_reason = None
            logger.debug("Model assist backend ready provider=openai model=%s", self.model_name)
            return self._openai_client
        if not self.config.openai_api_key:
            if not self._unavailable_reason:
                self._unavailable_reason = "No local model or OpenAI API key is configured."
            logger.debug("OpenAI model assist unavailable reason=%s", self._unavailable_reason)
            return None

        try:
            from openai import OpenAI
        except Exception as error:
            if not self._unavailable_reason:
                self._unavailable_reason = f"OpenAI SDK unavailable: {error}"
            logger.warning(self._unavailable_reason)
            return None

        try:
            self._openai_client = OpenAI(api_key=self.config.openai_api_key, timeout=self.config.llm_timeout_seconds)
            self.provider_name = "openai"
            self.model_name = self.config.llm_model
            self._unavailable_reason = None
            logger.info("Initialized OpenAI model assist model=%s", self.model_name)
            return self._openai_client
        except Exception as error:
            if not self._unavailable_reason:
                self._unavailable_reason = f"OpenAI client setup failed: {error}"
            logger.warning(self._unavailable_reason)
            self._openai_client = None
            return None

    def _hash_key(self, *parts: str) -> str:
        hasher = hashlib.sha256()
        for part in parts:
            hasher.update(part.encode("utf-8"))
            hasher.update(b"\x00")
        return hasher.hexdigest()
