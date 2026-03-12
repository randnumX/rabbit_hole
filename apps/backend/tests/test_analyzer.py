from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

from app.config import DEFAULT_CONFIG
from app.main import app
from app.models.schemas import AnalysisMode, AnalysisRequest, AnalysisResponse, ConversationRole, ConversationSource, ConversationTurn
from app.services.analyzer import DriftAnalyzer
from app.services.focus import contextualize_prompt_text


class FakeEmbeddingProvider:
    model_name = "fake-provider"
    fallback_active = False

    def __init__(self, embeddings: list[list[float]]) -> None:
        self._embeddings = np.array(embeddings, dtype=np.float64)

    def encode_texts(self, texts: list[str]) -> np.ndarray:
        return self._embeddings


def build_request() -> AnalysisRequest:
    turns = [
        ConversationTurn(id=1, role=ConversationRole.user, text="Let's design a browser extension for ChatGPT."),
        ConversationTurn(id=2, role=ConversationRole.assistant, text="We can use a content script and sidebar UI."),
        ConversationTurn(id=3, role=ConversationRole.user, text="How should the semantic drift visualization work?"),
        ConversationTurn(id=4, role=ConversationRole.assistant, text="Show a side quest branch for an accessibility detour."),
        ConversationTurn(id=5, role=ConversationRole.user, text="Actually, how do regex capture groups work?"),
        ConversationTurn(id=6, role=ConversationRole.assistant, text="We should return to the browser extension plan and transcript scrolling."),
    ]
    return AnalysisRequest(conversation_id="fixture-conversation", source=ConversationSource.debug, turns=turns)


def test_analyzer_classifies_path_side_rabbit_and_return() -> None:
    embeddings = [
        [1.0, 0.0, 0.0],
        [0.95, 0.05, 0.0],
        [0.9, 0.1, 0.0],
        [0.45, 0.7, 0.0],
        [0.0, 0.0, 1.0],
        [0.96, 0.12, 0.0],
    ]
    analyzer = DriftAnalyzer(embedding_provider=FakeEmbeddingProvider(embeddings))

    response = analyzer.analyze(build_request())

    assert response.analysis_mode == AnalysisMode.deterministic
    assert response.turns[0].classification == "ON_PATH"
    assert response.turns[1].classification == "ON_PATH"
    assert response.turns[2].classification in {"ON_PATH", "DEEPENING"}
    assert response.turns[3].classification == "SIDE_QUEST"
    assert response.turns[4].classification == "RABBIT_HOLE"
    assert response.turns[5].classification == "RETURN_TO_PATH"
    assert response.summary.rabbit_holes == 1
    assert response.summary.side_quests == 1
    assert response.summary.returns_to_path == 1
    assert any(edge.relationship == "fork_out" for edge in response.edges)
    assert any(edge.relationship == "backtrack" for edge in response.edges)
    assert any(edge.relationship == "rejoin_path" for edge in response.edges)
    branch_turn = response.turns[3]
    assert branch_turn.lineage_id is not None and branch_turn.lineage_id > 0
    assert branch_turn.fork_turn_id is not None


def test_analyzer_handles_deepening_without_false_rabbit_hole() -> None:
    embeddings = [
        [1.0, 0.0, 0.0],
        [0.98, 0.02, 0.0],
        [0.83, 0.15, 0.0],
        [0.78, 0.20, 0.0],
    ]
    analyzer = DriftAnalyzer(embedding_provider=FakeEmbeddingProvider(embeddings))

    response = analyzer.analyze(
        AnalysisRequest(
            conversation_id="deepening-case",
            source=ConversationSource.debug,
            analysis_mode=AnalysisMode.probabilistic,
            turns=[
                ConversationTurn(id=1, role=ConversationRole.user, text="Plan the extension architecture."),
                ConversationTurn(id=2, role=ConversationRole.assistant, text="We need a background worker."),
                ConversationTurn(id=3, role=ConversationRole.user, text="How should the worker cache backend requests?"),
                ConversationTurn(id=4, role=ConversationRole.assistant, text="Use a map keyed by page URL and turn count."),
            ],
        )
    )

    assert response.analysis_mode == AnalysisMode.deterministic
    assert all(turn.classification != "RABBIT_HOLE" for turn in response.turns)
    assert any(turn.classification in {"DEEPENING", "ON_PATH"} for turn in response.turns[2:])


def test_health_route_returns_model_metadata() -> None:
    client = TestClient(app)
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "model_name" in payload
    assert "available_modes" in payload


def test_troubleshooting_thread_stays_on_path_when_terms_become_more_technical() -> None:
    analyzer = DriftAnalyzer(
        embedding_provider=FakeEmbeddingProvider(
            [
                [1.0, 0.0, 0.0],
                [0.48, 0.52, 0.0],
                [0.36, 0.64, 0.0],
                [0.28, 0.72, 0.0],
                [0.22, 0.78, 0.0],
            ]
        )
    )

    response = analyzer.analyze(
        AnalysisRequest(
            conversation_id="drum-troubleshooting",
            source=ConversationSource.debug,
            turns=[
                ConversationTurn(
                    id=1,
                    role=ConversationRole.user,
                    text="User: What is the Alesis Nitro Max hi-hat control?\n\nAssistant: It controls open and closed hi-hat states.",
                    prompt_text="What is the Alesis Nitro Max hi-hat control?",
                    response_text="It controls open and closed hi-hat states.",
                ),
                ConversationTurn(
                    id=2,
                    role=ConversationRole.user,
                    text="User: It stays closed after I lift my foot.\n\nAssistant: That points to calibration or pedal sensing.",
                    prompt_text="It stays closed after I lift my foot.",
                    response_text="That points to calibration or pedal sensing.",
                ),
                ConversationTurn(
                    id=3,
                    role=ConversationRole.user,
                    text="User: The utility menu shows S-S.\n\nAssistant: S-S is splash sensitivity, not the core open-close sensor.",
                    prompt_text="The utility menu shows S-S.",
                    response_text="S-S is splash sensitivity, not the core open-close sensor.",
                ),
                ConversationTurn(
                    id=4,
                    role=ConversationRole.user,
                    text="User: Can I fix the potentiometer?\n\nAssistant: Yes, if the hi-hat pedal sensor is dirty or worn.",
                    prompt_text="Can I fix the potentiometer?",
                    response_text="Yes, if the hi-hat pedal sensor is dirty or worn.",
                ),
                ConversationTurn(
                    id=5,
                    role=ConversationRole.user,
                    text="User: How do I clean the membrane?\n\nAssistant: Use isopropyl alcohol on the membrane contacts and recalibrate the pedal.",
                    prompt_text="How do I clean the membrane?",
                    response_text="Use isopropyl alcohol on the membrane contacts and recalibrate the pedal.",
                ),
            ],
        )
    )

    classifications = [turn.classification for turn in response.turns]
    assert classifications[0] == "ON_PATH"
    assert classifications.count("RABBIT_HOLE") == 0
    assert all(classification in {"ON_PATH", "DEEPENING", "SIDE_QUEST"} for classification in classifications)
    assert classifications[-1] in {"ON_PATH", "DEEPENING"}


def test_sample_analysis_fixture_matches_schema() -> None:
    fixture_path = Path(__file__).resolve().parents[3] / "examples" / "conversations" / "chatgpt-sample-analysis.json"
    fixture_payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    if hasattr(AnalysisResponse, "model_validate"):
        response = AnalysisResponse.model_validate(fixture_payload)
    else:
        response = AnalysisResponse.parse_obj(fixture_payload)

    assert response.summary.total_turns == len(response.turns)


def test_contextualize_prompt_text_carries_forward_branch_context_for_sparse_follow_ups() -> None:
    prompt = "Yes please. And I am 26 right now. Help me come with the best plan out there."
    previous_context = "Cost of a Class 1 aviation medical in India vs USA and the visa process for USA flight training."

    contextualized = contextualize_prompt_text(prompt, previous_context, DEFAULT_CONFIG)

    assert contextualized.startswith("Context:")
    assert "visa process" in contextualized
    assert prompt in contextualized


def test_contextualize_prompt_text_does_not_carry_forward_unrelated_short_prompt() -> None:
    prompt = "What is water sold even though its a basic need?"
    previous_context = "How attention, embeddings, RoPE, and transformer vectors work inside an LLM."

    contextualized = contextualize_prompt_text(prompt, previous_context, DEFAULT_CONFIG)

    assert contextualized == prompt


def test_prepare_turns_keeps_unrelated_short_prompt_uncontextualized() -> None:
    analyzer = DriftAnalyzer(embedding_provider=FakeEmbeddingProvider([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]))
    turns = [
        ConversationTurn(
            id=1,
            role=ConversationRole.user,
            text="Explain RoPE and attention in transformers.",
            prompt_text="Explain RoPE and attention in transformers.",
            response_text="RoPE rotates query and key vectors to encode relative position in attention.",
        ),
        ConversationTurn(
            id=2,
            role=ConversationRole.user,
            text="What is water sold even though its a basic need?",
            prompt_text="What is water sold even though its a basic need?",
        ),
    ]

    prepared_turns = analyzer._prepare_turns(turns, AnalysisMode.deterministic)

    assert prepared_turns[1].prompt_text == "What is water sold even though its a basic need?"
