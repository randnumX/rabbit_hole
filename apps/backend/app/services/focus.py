from __future__ import annotations

import re
from typing import Iterable, Optional, Sequence

from app.config import AnalysisConfig

SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])(?:\s+|(?=[A-Z0-9]))")
NOISY_LINE_PATTERN = re.compile(r"^\s*(?:[-*•]|\d+[.)]|[₹$€£])")
CALL_TO_ACTION_PATTERN = re.compile(r"^(?:would you like|if you like|let me know|i can also)\b", re.IGNORECASE)
WORD_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9+-]{1,}")
CONTEXTUAL_PROMPT_PATTERN = re.compile(
    r"^(?:yes|yes please|yeah|yep|ok(?:ay)?|cool|and\b|also\b|then\b|what about|what if|how about|"
    r"would it|can i|can we|is it|is that|is this|give me|show me|part of this|this amount|that amount|"
    r"sorry\b|i meant\b|no not this\b)",
    re.IGNORECASE,
)
CONTEXTUAL_TOKENS = {
    "this",
    "that",
    "it",
    "those",
    "these",
    "same",
    "amount",
    "plan",
    "roadmap",
    "timeline",
    "checklist",
}


def normalize_text(text: Optional[str]) -> str:
    return re.sub(r"\n{3,}", "\n\n", (text or "").replace("\r\n", "\n")).strip()


def _iter_sentences(text: str) -> Iterable[str]:
    for block in text.split("\n"):
        stripped = block.strip()
        if not stripped:
            continue
        if SENTENCE_SPLIT_PATTERN.search(stripped):
            for sentence in SENTENCE_SPLIT_PATTERN.split(stripped):
                sentence = sentence.strip()
                if sentence:
                    yield sentence
            continue
        yield stripped


def _keyword_tokens(text: str) -> set[str]:
    return {match.group(0).lower() for match in WORD_PATTERN.finditer(text)}


def _digit_ratio(text: str) -> float:
    if not text:
        return 0.0
    digit_count = sum(character.isdigit() for character in text)
    return digit_count / max(len(text), 1)


def _is_noisy_line(text: str) -> bool:
    normalized = text.strip()
    if not normalized:
        return True
    if len(normalized) < 16:
        return True
    if _digit_ratio(normalized) > 0.22:
        return True
    return bool(NOISY_LINE_PATTERN.match(normalized))


def _score_sentence(sentence: str, prompt_keywords: set[str], index: int) -> float:
    tokens = _keyword_tokens(sentence)
    if not tokens:
        return -5.0
    overlap = len(tokens & prompt_keywords)
    unique_score = min(len(tokens), 12) * 0.35
    prompt_score = overlap * 1.8
    length_penalty = max(len(sentence) - 220, 0) * 0.01
    numeric_penalty = _digit_ratio(sentence) * 6.0
    ordering_bias = max(0, 4 - index) * 0.4
    noise_penalty = 2.4 if _is_noisy_line(sentence) else 0.0
    question_penalty = 0.8 if sentence.endswith("?") else 0.0
    cta_penalty = 1.4 if CALL_TO_ACTION_PATTERN.match(sentence.strip()) else 0.0
    return prompt_score + unique_score + ordering_bias - length_penalty - numeric_penalty - noise_penalty - question_penalty - cta_penalty


def heuristic_focus_summary(prompt_text: str, response_text: str, config: AnalysisConfig) -> str:
    normalized_response = normalize_text(response_text)
    if not normalized_response:
        return ""

    prompt_keywords = _keyword_tokens(prompt_text)
    sentences = list(_iter_sentences(normalized_response))
    if not sentences:
        return normalized_response[: config.focus_summary_char_budget].strip()

    selected: list[tuple[int, str]] = []
    for index, sentence in enumerate(sentences):
        score = _score_sentence(sentence, prompt_keywords, index)
        if score <= 0:
            continue
        selected.append((index, sentence))

    if not selected:
        selected = list(enumerate(sentences[: config.focus_summary_sentence_limit]))
    else:
        selected = sorted(
            selected,
            key=lambda item: (
                _score_sentence(item[1], prompt_keywords, item[0]),
                -item[0],
            ),
            reverse=True,
        )[: config.focus_summary_sentence_limit]
        selected.sort(key=lambda item: item[0])

    summary = " ".join(sentence for _, sentence in selected).strip()
    if len(summary) <= config.focus_summary_char_budget:
        return summary
    return summary[: config.focus_summary_char_budget].rsplit(" ", 1)[0].strip()


def should_model_summarize(response_text: str, config: AnalysisConfig) -> bool:
    normalized = normalize_text(response_text)
    if len(normalized) < config.focus_summary_min_response_chars:
        return False
    line_count = len([line for line in normalized.splitlines() if line.strip()])
    return line_count >= 4 or _digit_ratio(normalized) > 0.08


def build_analysis_text(prompt_text: str, response_focus_text: str, fallback_text: str) -> str:
    prompt = normalize_text(prompt_text)
    focus = normalize_text(response_focus_text)
    if prompt and focus:
        return f"User intent: {prompt}\nAssistant focus: {focus}"
    if prompt:
        return prompt
    if focus:
        return focus
    return normalize_text(fallback_text)


def contextualize_prompt_text(prompt_text: str, previous_context: str, config: AnalysisConfig) -> str:
    prompt = normalize_text(prompt_text)
    context = normalize_text(previous_context)
    if not prompt or not context:
        return prompt

    prompt_tokens = _keyword_tokens(prompt)
    context_tokens = _keyword_tokens(context)
    if not prompt_tokens or not context_tokens:
        return prompt

    overlap = len(prompt_tokens & context_tokens) / max(1, min(len(prompt_tokens), len(context_tokens)))
    has_context_cue = bool(CONTEXTUAL_PROMPT_PATTERN.match(prompt)) or any(
        token in CONTEXTUAL_TOKENS for token in prompt_tokens
    )
    short_or_sparse = (
        len(prompt) <= config.contextual_prompt_char_threshold
        or len(prompt_tokens) <= config.contextual_prompt_keyword_threshold
    )

    if not has_context_cue:
        if not short_or_sparse:
            return prompt
        if overlap < config.contextual_prompt_implicit_overlap_threshold:
            return prompt
        if overlap >= config.contextual_prompt_overlap_threshold:
            return prompt

    if not short_or_sparse and not has_context_cue:
        return prompt

    trimmed_context = context
    if len(trimmed_context) > config.contextual_prompt_context_char_budget:
        trimmed_context = trimmed_context[: config.contextual_prompt_context_char_budget].rsplit(" ", 1)[0].strip()

    return f"Context: {trimmed_context}\nFollow-up: {prompt}"


def merge_role_text(parts: Sequence[str]) -> str:
    return "\n\n".join(part.strip() for part in parts if part and part.strip())
