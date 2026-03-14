from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.logging import get_logger
from app.models.schemas import AnalysisRequest, AnalysisResponse, HealthResponse
from app.services.analyzer import DEFAULT_ANALYZER

router = APIRouter(prefix="/api")
logger = get_logger("app.api.routes")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    provider = DEFAULT_ANALYZER.embedding_provider
    model_assist = DEFAULT_ANALYZER.model_assist
    llm_available = model_assist.available
    logger.debug(
        "Health check requested embedding_model=%s fallback_active=%s llm_available=%s llm_provider=%s",
        provider.model_name,
        provider.fallback_active,
        llm_available,
        model_assist.provider_name,
    )
    return HealthResponse(
        status="ok",
        model_name=provider.model_name,
        fallback_active=provider.fallback_active,
        llm_available=llm_available,
        llm_model=model_assist.model_name if llm_available else None,
        llm_provider=model_assist.provider_name if llm_available else None,
        llm_reason=None if llm_available else model_assist.unavailable_reason,
        available_modes=model_assist.available_modes(),
    )


@router.post("/analyze", response_model=AnalysisResponse)
def analyze(request: AnalysisRequest) -> AnalysisResponse:
    try:
        logger.info(
            "Analyze request received conversation_id=%s source=%s mode=%s turns=%s",
            request.conversation_id,
            request.source.value,
            request.analysis_mode.value,
            len(request.turns),
        )
        response = DEFAULT_ANALYZER.analyze(request)
        logger.info(
            "Analyze request completed conversation_id=%s mode=%s total_turns=%s rabbit_holes=%s side_quests=%s returns=%s",
            response.conversation_id,
            response.analysis_mode.value,
            response.summary.total_turns,
            response.summary.rabbit_holes,
            response.summary.side_quests,
            response.summary.returns_to_path,
        )
        return response
    except ValueError as error:
        logger.warning(
            "Analyze request rejected conversation_id=%s error=%s",
            request.conversation_id,
            error,
        )
        raise HTTPException(status_code=400, detail=str(error)) from error
