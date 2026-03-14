# RabbitHole

RabbitHole is a local demo project that injects a storytelling sidebar into ChatGPT and visualizes topic drift as a rabbit moving along a conversation trail. Healthy progression stays on the main trail. Side explorations branch off. Major semantic drift becomes a rabbit hole with broken connectors and explicit explanation.

The backend now uses a multi-lineage scorer instead of a single rolling trajectory:
- one root intent
- one evolving mainline
- several temporary sub-lineages scored in parallel

## Stack
- Chrome extension: Manifest V3, React, TypeScript, Vite, Tailwind CSS, Framer Motion, Zustand
- Backend: FastAPI, sentence-transformers, scikit-learn, numpy, ruptures, local Hugging Face SLM runtime, optional OpenAI fallback
- Shared contracts: TypeScript workspace package

## Prerequisites
- Node `20+`
- `pnpm`
- Python `3.11+`
- Google Chrome

The current machine this repo was planned on only exposed Python `3.9.6` and did not have `node` or `pnpm` installed. Install the required runtimes first before running the demo.

## Install Dependencies

```bash
pnpm install
```

## Run The Backend

```bash
cd apps/backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will start at `http://127.0.0.1:8000`.

Optional logging override:

```bash
export RABBITHOLE_LOG_LEVEL=DEBUG
```

### Local SLM Mode

RabbitHole now supports three analysis modes in the sidebar:
- `Deterministic`: multi-lineage scorer only
- `Hybrid`: local SLM summarizes long assistant replies, then the multi-lineage scorer classifies
- `Probabilistic`: local SLM summarizes and classifies each exchange, while the backend still keeps the deterministic metrics for inspection

By default the backend is configured to use a local Hugging Face instruct model:

```bash
export RABBITHOLE_LOCAL_LLM_MODEL=HuggingFaceTB/SmolLM2-1.7B-Instruct
```

On the first backend start, the model will be downloaded into the Hugging Face cache and then loaded by FastAPI. This can take time.

If you want a lighter first-run model that starts faster on CPU, use:

```bash
export RABBITHOLE_LOCAL_LLM_MODEL=HuggingFaceTB/SmolLM2-360M-Instruct
```

Optional local overrides:

```bash
export RABBITHOLE_LOCAL_LLM_CACHE_DIR=/absolute/path/to/model-cache
export RABBITHOLE_LOCAL_LLM_DEVICE=cpu
export RABBITHOLE_LOCAL_LLM_PRELOAD_ON_START=true
```

If you want a stronger but heavier local model, override the model name before starting FastAPI:

```bash
export RABBITHOLE_LOCAL_LLM_MODEL=Qwen/Qwen2.5-3B-Instruct
```

### Optional OpenAI fallback

If you want to fall back to OpenAI instead of the local model:

```bash
export RABBITHOLE_LLM_PROVIDER=openai
export OPENAI_API_KEY=your_key_here
export RABBITHOLE_LLM_MODEL=gpt-4o-mini
```

## Build Or Watch The Extension

From the repo root:

```bash
pnpm dev:extension
```

That watches and rebuilds the extension into `apps/extension/dist`.

For a one-off production build:

```bash
pnpm build
```

## Load The Extension In Chrome
1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select `apps/extension/dist`.

## Test On ChatGPT
1. Start the backend locally.
2. Load the unpacked extension in Chrome.
3. Open a ChatGPT conversation at `https://chatgpt.com/`.
4. Open the RabbitHole launcher.
5. Pick `Deterministic`, `Hybrid`, or `Probabilistic` in the header.
6. Click `Analyze`.
7. Inspect the root topic, rabbit path, side quests, rabbit-hole events, and return-to-path nodes.
8. Click any node to scroll to the matching transcript turn in ChatGPT.

## Debug And Demo Mode
- If live ChatGPT extraction fails, open the debug panel in the extension sidebar.
- Paste a transcript with `User:` and `Assistant:` prefixes, or load the sample fixture.
- The sample raw and analyzed fixtures live in `examples/conversations/`.

## Test Commands
- Backend: `cd apps/backend && pytest`
- Extension: `pnpm test:extension`

## Project Highlights
- Centralized drift thresholds in `apps/backend/app/config.py`
- Multi-lineage scorer combines previous-turn similarity, root-topic relevance, evolving mainline affinity, and temporary branch lineage matches
- Local SLM assist for long-response semantic focus summaries and probabilistic turn classification
- ChatGPT-first site adapter pattern for future Claude and Gemini support
- SVG trail renderer with rabbit motion states for on-path, side quest, rabbit hole, and return
- Click-through transcript navigation from visualization nodes

## Demo Assets
- Raw fixture: `examples/conversations/chatgpt-sample-raw.json`
- Analyzed fixture: `examples/conversations/chatgpt-sample-analysis.json`
- Demo walkthrough: `docs/demo-walkthrough.md`
