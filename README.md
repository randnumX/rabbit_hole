# RabbitHole

RabbitHole is a local demo project that injects a storytelling sidebar into ChatGPT and visualizes topic drift as a rabbit moving along a conversation trail. Healthy progression stays on the main trail. Side explorations branch off. Major semantic drift becomes a rabbit hole with broken connectors and explicit explanation.

RabbitHole is a pure Chrome extension — there is no backend process. All analysis (embeddings, clustering, and the multi-lineage drift scorer) runs in-browser inside the extension's background service worker:
- one root intent
- one evolving mainline
- several temporary sub-lineages scored in parallel

## Stack
- Chrome extension: Manifest V3, React, TypeScript, Vite, Tailwind CSS, Framer Motion, Zustand
- In-extension analysis engine: transformers.js (in-browser embeddings, WASM), a hand-rolled multi-lineage drift scorer, and an OpenAI-chat-completions-compatible client for optional LLM assist
- Shared contracts: TypeScript workspace package

## Prerequisites
- Node `20+`
- `pnpm`
- Google Chrome

## Install Dependencies

```bash
pnpm install
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

## Analysis Modes

RabbitHole supports three analysis modes in the sidebar:
- `Deterministic`: multi-lineage scorer only. Works immediately, no configuration needed. Embeddings run in-browser via transformers.js (`Xenova/all-MiniLM-L6-v2`), falling back to a deterministic hashing embedding if the model fails to load.
- `Hybrid`: an LLM summarizes long assistant replies, then the multi-lineage scorer classifies.
- `Probabilistic`: an LLM summarizes and classifies each exchange, while the deterministic metrics are still kept for inspection.

Hybrid and Probabilistic modes require an LLM endpoint. Open the sidebar's Settings panel (gear icon) and configure:
- **Endpoint URL** — a full URL speaking the OpenAI chat-completions wire format, e.g.:
  - Remote: `https://api.openai.com/v1/chat/completions`
  - Local (Ollama): `http://localhost:11434/v1/chat/completions`
  - Local (LM Studio): `http://localhost:1234/v1/chat/completions`
- **Model** — the model name to send in each request.
- **API key** — optional, needed for most remote providers, usually left blank for local servers.

The first time you save a new endpoint, Chrome will prompt you to grant that origin permission (RabbitHole requests it at runtime via `optional_host_permissions`, rather than declaring a broad static permission upfront).

## Test On ChatGPT
1. Load the unpacked extension in Chrome (no backend to start).
2. Open a ChatGPT conversation at `https://chatgpt.com/`.
3. Open the RabbitHole launcher.
4. Pick `Deterministic`, `Hybrid`, or `Probabilistic` in the header (Hybrid/Probabilistic require an LLM endpoint configured in Settings).
5. Click `Analyze`.
6. Inspect the root topic, rabbit path, side quests, rabbit-hole events, and return-to-path nodes.
7. Click any node to scroll to the matching transcript turn in ChatGPT.

## Debug And Demo Mode
- If live ChatGPT extraction fails, open the debug panel in the extension sidebar.
- Paste a transcript with `User:` and `Assistant:` prefixes, or load the sample fixture.
- The sample raw and analyzed fixtures live in `examples/conversations/`.

## Test Commands
- Extension: `pnpm test:extension`
- Typecheck: `pnpm typecheck:extension`

## Project Highlights
- Centralized drift thresholds in `apps/extension/src/analysis/config.ts`
- Multi-lineage scorer combines previous-turn similarity, root-topic relevance, evolving mainline affinity, and temporary branch lineage matches
- In-browser embeddings (transformers.js) with a deterministic hashing fallback — no network dependency for Deterministic mode
- Configurable LLM endpoint (remote or `localhost`) for Hybrid/Probabilistic-mode summarization and classification
- ChatGPT-first site adapter pattern for future Claude and Gemini support
- SVG trail renderer with rabbit motion states for on-path, side quest, rabbit hole, and return
- Click-through transcript navigation from visualization nodes

## Demo Assets
- Raw fixture: `examples/conversations/chatgpt-sample-raw.json`
- Analyzed fixture: `examples/conversations/chatgpt-sample-analysis.json`
- Demo walkthrough: `docs/demo-walkthrough.md`
