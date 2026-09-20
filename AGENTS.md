# AGENTS.md

## Project Purpose
RabbitHole is a Chrome extension that visualizes semantic topic drift inside ChatGPT conversations through a rabbit-on-a-trail metaphor. The entire analysis pipeline runs inside the extension (background service worker) — there is no backend process. The main demo flow is: extract a conversation from ChatGPT, analyze drift locally in-browser, and render an animated sidebar that shows the main trail, side quests, rabbit holes, and returns to path.

## Repo Layout
- `apps/extension`: Manifest V3 Chrome extension, React sidebar UI, ChatGPT DOM extraction, background worker messaging, and the in-extension analysis engine.
- `packages/shared-types`: Shared TypeScript contracts used across the extension (also the `AnalysisResponse`/`TurnAnalysis` output contract produced by the analysis engine).
- `examples/conversations`: Raw and analyzed fixtures for debug mode and demos.
- `docs`: Walkthrough and product-facing demo notes.

## Run Commands
### Extension
1. Install Node `20+` and `pnpm`.
2. Run `pnpm install` from the repo root.
3. Build the extension with `pnpm build` or watch with `pnpm dev:extension`.
4. Load `apps/extension/dist` as an unpacked extension in Chrome Developer Mode.

No backend process is required. `Deterministic` mode works immediately (in-browser embeddings via transformers.js, with a hashing fallback if the model fails to load). `Hybrid` and `Probabilistic` modes require the user to configure an LLM endpoint (a remote OpenAI-compatible API, or a local server such as Ollama or LM Studio) in the sidebar's Settings panel.

## Coding Conventions
- Favor small typed modules over broad utility layers.
- Keep semantic thresholds centralized in `apps/extension/src/analysis/config.ts`.
- Keep UI motion and trail rendering logic localized to the sidebar visualization modules.
- Use Tailwind utility classes for styling and Framer Motion for meaningful state transitions.
- Preserve site-specific extraction behind adapter boundaries; do not hardcode ChatGPT selectors outside `apps/extension/src/adapters`.
- Add comments only where the code would otherwise hide an important decision or edge case.

## Architectural Principles
- ChatGPT is the only fully supported provider in the MVP. Claude and Gemini stay scaffolded behind the adapter interface.
- The background service worker owns the analysis engine, LLM endpoint calls, and request caching.
- The content script owns DOM extraction, page anchoring, and transcript scrolling.
- The analysis engine returns a fully explainable JSON contract (`AnalysisResponse`); the sidebar UI should not re-classify turns.
- Drift scoring should treat a conversation as root intent + evolving mainline + temporary sub-lineages, not as a single rolling centroid.
- LLM connectivity (Hybrid/Probabilistic modes) is always a user-configured HTTP endpoint speaking the OpenAI chat-completions wire format — never a bundled/managed model process.
- Demo clarity beats analytical depth. If a feature does not improve "where did we go down a rabbit hole?", it is likely out of scope.

## Key Implementation Ownership
- Drift logic: `apps/extension/src/analysis/config.ts`, `apps/extension/src/analysis/analyzer.ts`, and `apps/extension/src/analysis/lineages.ts`
- Embeddings (in-browser transformers.js + hashing fallback): `apps/extension/src/analysis/embeddings.ts`
- Clustering and topic labeling: `apps/extension/src/analysis/clustering.ts` and `apps/extension/src/analysis/tfidf.ts`
- Changepoint detection: `apps/extension/src/analysis/changepoints.ts`
- Exchange text focus heuristics: `apps/extension/src/analysis/focus.ts`
- LLM endpoint client (summarization + probabilistic classification): `apps/extension/src/analysis/llmClient.ts`
- Background wiring (message handling, caching, LLM settings lookup): `apps/extension/src/background/index.ts`
- LLM endpoint settings persistence + permission requests: `apps/extension/src/shared/llmSettings.ts`
- ChatGPT extraction: `apps/extension/src/adapters/chatgpt.ts`
- Messaging contract: `apps/extension/src/shared/messages.ts`
- Sidebar state: `apps/extension/src/sidebar/store.ts`
- Settings UI: `apps/extension/src/sidebar/components/SettingsPanel.tsx`
- Trail layout and animation: `apps/extension/src/sidebar/lib/layout.ts` and `apps/extension/src/sidebar/components/TrailMap.tsx`

## Testing
- Extension tests: run `pnpm test:extension` from the repo root.
- Analysis engine tests (drift classification, edge relationships, contextual prompt heuristics) live in `apps/extension/tests/analyzer.test.ts`.
- Before changing the analysis schema, update the fixture validation tests and the shared `AnalysisResponse` type in `packages/shared-types`.
