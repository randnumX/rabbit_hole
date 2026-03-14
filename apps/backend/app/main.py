from __future__ import annotations

import os
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.logging import configure_logging, get_logger
from app.services.analyzer import DEFAULT_ANALYZER

configure_logging()
logger = get_logger("app.main")

@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Backend startup initiated")
    if not os.getenv("PYTEST_CURRENT_TEST") and DEFAULT_ANALYZER.config.local_llm_preload_on_start:
        logger.info("Preloading local language model on startup")
        DEFAULT_ANALYZER.model_assist.preload()
    logger.info("Backend startup complete")
    yield
    logger.info("Backend shutdown complete")


app = FastAPI(
    title="RabbitHole API",
    version="0.1.0",
    description="Local semantic drift analysis service for the RabbitHole browser extension.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.middleware("http")
async def log_requests(request, call_next):
    start = perf_counter()
    logger.info("HTTP request started method=%s path=%s", request.method, request.url.path)
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (perf_counter() - start) * 1000
        logger.exception(
            "HTTP request failed method=%s path=%s duration_ms=%.2f",
            request.method,
            request.url.path,
            duration_ms,
        )
        raise

    duration_ms = (perf_counter() - start) * 1000
    logger.info(
        "HTTP request completed method=%s path=%s status=%s duration_ms=%.2f",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.get("/")
def root() -> dict:
    return {
        "name": "RabbitHole API",
        "docs": "/docs",
        "health": "/api/health",
    }
