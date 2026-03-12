from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Optional


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class AnalysisConfig:
    model_name: str = "all-MiniLM-L6-v2"
    root_turn_window: int = 3
    local_window: int = 3
    cluster_distance_threshold: float = 0.35
    change_point_bonus: float = 0.08
    on_path_prev_similarity: float = 0.55
    on_path_local_similarity: float = 0.72
    on_path_root_similarity: float = 0.52
    on_path_main_path_similarity: float = 0.58
    on_path_continuity_prev_similarity: float = 0.42
    on_path_continuity_local_similarity: float = 0.5
    on_path_continuity_root_similarity: float = 0.46
    on_path_continuity_main_path_similarity: float = 0.48
    on_path_lexical_overlap: float = 0.34
    deepening_local_similarity: float = 0.70
    deepening_root_similarity: float = 0.38
    deepening_main_path_similarity: float = 0.46
    deepening_continuity_local_similarity: float = 0.46
    deepening_continuity_root_similarity: float = 0.34
    deepening_continuity_main_path_similarity: float = 0.4
    deepening_lexical_overlap: float = 0.24
    deepening_novelty_min: float = 0.20
    deepening_novelty_max: float = 0.45
    side_quest_root_similarity: float = 0.38
    side_quest_local_similarity: float = 0.45
    rabbit_prev_similarity: float = 0.35
    rabbit_local_similarity: float = 0.35
    rabbit_root_similarity: float = 0.32
    rabbit_main_path_similarity: float = 0.34
    rabbit_lexical_overlap_max: float = 0.16
    rabbit_drift_score: float = 0.68
    return_root_similarity: float = 0.62
    return_main_path_similarity: float = 0.6
    return_similarity_rebound: float = 0.18
    weight_prev_similarity: float = 0.18
    weight_local_similarity: float = 0.28
    weight_root_similarity: float = 0.32
    weight_main_path_similarity: float = 0.22
    lexical_prev_boost: float = 0.08
    lexical_local_boost: float = 0.22
    lexical_root_boost: float = 0.14
    lexical_main_path_boost: float = 0.18
    lineage_similarity_weight: float = 0.76
    lineage_keyword_weight: float = 0.24
    lineage_recency_bonus: float = 0.08
    lineage_stale_penalty: float = 0.035
    lineage_max_age_turns: int = 6
    lineage_match_threshold: float = 0.42
    lineage_create_threshold: float = 0.38
    branch_deepening_similarity: float = 0.5
    branch_deepening_anchor: float = 0.48
    branch_side_similarity: float = 0.36
    branch_side_anchor: float = 0.3
    branch_rabbit_guard: float = 0.28
    focus_summary_char_budget: int = 280
    focus_summary_sentence_limit: int = 2
    focus_summary_min_response_chars: int = 180
    contextual_prompt_char_threshold: int = 116
    contextual_prompt_keyword_threshold: int = 9
    contextual_prompt_overlap_threshold: float = 0.22
    contextual_prompt_implicit_overlap_threshold: float = 0.08
    contextual_prompt_context_char_budget: int = 180
    llm_timeout_seconds: float = 20.0
    llm_summary_temperature: float = 0.1
    llm_classification_temperature: float = 0.15
    llm_model: str = os.getenv("RABBITHOLE_LLM_MODEL", "gpt-4o-mini")
    llm_provider: str = os.getenv("RABBITHOLE_LLM_PROVIDER", "local")
    local_llm_enabled: bool = _env_flag("RABBITHOLE_LOCAL_LLM_ENABLED", True)
    local_llm_preload_on_start: bool = _env_flag("RABBITHOLE_LOCAL_LLM_PRELOAD_ON_START", True)
    local_llm_model: str = os.getenv("RABBITHOLE_LOCAL_LLM_MODEL", "HuggingFaceTB/SmolLM2-1.7B-Instruct")
    local_llm_cache_dir: Optional[str] = os.getenv("RABBITHOLE_LOCAL_LLM_CACHE_DIR")
    local_llm_device: Optional[str] = os.getenv("RABBITHOLE_LOCAL_LLM_DEVICE")
    local_llm_trust_remote_code: bool = _env_flag("RABBITHOLE_LOCAL_LLM_TRUST_REMOTE_CODE", False)
    local_llm_summary_max_new_tokens: int = 96
    local_llm_classification_max_new_tokens: int = 420
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY") or os.getenv("RABBITHOLE_OPENAI_API_KEY")


DEFAULT_CONFIG = AnalysisConfig()
