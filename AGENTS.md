# AGENTS.md

## Project Purpose
RabbitHole is a Chrome extension plus FastAPI backend that visualizes semantic topic drift inside ChatGPT conversations through a rabbit-on-a-trail metaphor. The main demo flow is: extract a conversation from ChatGPT, analyze drift locally, and render an animated sidebar that shows the main trail, side quests, rabbit holes, and returns to path.

## Repo Layout
- `apps/extension`: Manifest V3 Chrome extension, React sidebar UI, ChatGPT DOM extraction, background worker messaging.
- `apps/backend`: FastAPI analysis service, embedding pipeline, drift classification, response schema.
- `packages/shared-types`: Shared TypeScript contracts used by the extension.
- `examples/conversations`: Raw and analyzed fixtures for debug mode and demos.
- `docs`: Walkthrough and product-facing demo notes.

## Run Commands
### Backend
1. Install Python `3.11+`.
2. Create a virtual environment inside `apps/backend/.venv`.
3. Install dependencies with `pip install -r requirements.txt`.
4. Start the API from `apps/backend` with `uvicorn app.main:app --reload`.
5. The backend now defaults to a local Hugging Face SLM for `Hybrid` and `Probabilistic` modes. On first run it may download the configured model into the local Hugging Face cache.
6. Optional: export `RABBITHOLE_LOCAL_LLM_MODEL` to switch models, or `RABBITHOLE_LLM_PROVIDER=openai` plus `OPENAI_API_KEY` to force the OpenAI fallback.

### Extension
1. Install Node `20+` and `pnpm`.
2. Run `pnpm install` from the repo root.
3. Build the extension with `pnpm build` or watch with `pnpm dev:extension`.
4. Load `apps/extension/dist` as an unpacked extension in Chrome Developer Mode.

## Coding Conventions
- Favor small typed modules over broad utility layers.
- Keep semantic thresholds centralized in `apps/backend/app/config.py`.
- Keep UI motion and trail rendering logic localized to the sidebar visualization modules.
- Use Tailwind utility classes for styling and Framer Motion for meaningful state transitions.
- Preserve site-specific extraction behind adapter boundaries; do not hardcode ChatGPT selectors outside `apps/extension/src/adapters`.
- Add comments only where the code would otherwise hide an important decision or edge case.

## Architectural Principles
- ChatGPT is the only fully supported provider in the MVP. Claude and Gemini stay scaffolded behind the adapter interface.
- The background worker owns backend communication and request caching.
- The content script owns DOM extraction, page anchoring, and transcript scrolling.
- The backend returns a fully explainable JSON contract; the frontend should not re-classify turns.
- Drift scoring should treat a conversation as root intent + evolving mainline + temporary sub-lineages, not as a single rolling centroid.
- Demo clarity beats analytical depth. If a feature does not improve "where did we go down a rabbit hole?", it is likely out of scope.

## Key Implementation Ownership
- Drift logic: `apps/backend/app/config.py`, `apps/backend/app/services/analyzer.py`, and `apps/backend/app/services/lineages.py`
- Model-assisted summarization and probabilistic classification: `apps/backend/app/services/model_assist.py` and `apps/backend/app/services/local_llm.py`
- Exchange text focus heuristics: `apps/backend/app/services/focus.py`
- Embedding and clustering helpers: `apps/backend/app/services/embeddings.py`
- API schemas: `apps/backend/app/models/schemas.py`
- ChatGPT extraction: `apps/extension/src/adapters/chatgpt.ts`
- Messaging contract: `apps/extension/src/shared/messages.ts`
- Sidebar state: `apps/extension/src/sidebar/store.ts`
- Trail layout and animation: `apps/extension/src/sidebar/lib/layout.ts` and `apps/extension/src/sidebar/components/TrailMap.tsx`

## Testing
- Backend tests: run `pytest` from `apps/backend`.
- Extension tests: run `pnpm test:extension` from the repo root.
- Before changing the analysis schema, update the fixture validation tests in both backend and frontend.
