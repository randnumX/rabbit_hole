# RabbitHole Internal Demo Script

Approximate runtime: 15 minutes

## Slide 1 - RabbitHole

“This is RabbitHole. It is a Chrome extension plus a FastAPI backend that tries to make topic drift inside long ChatGPT conversations visible. It is still a prototype, but the core interaction model is working.”

## Slide 2 - Problem Statement

“The problem came from my own usage pattern. I usually start a chat with one clear task, but as the conversation goes on, it starts branching into side questions and rabbit holes. Some of those are useful, but not necessarily at that moment. The UI gives me a transcript, but it does not show the structure of the conversation.”

## Slide 3 - What I Wanted the Tool to Do

“So the tool I wanted was pretty simple conceptually. I wanted it to surface the main thread, separate useful tangents from true drift, help me get back to the original task, and eventually save good rabbit holes to revisit later.”

## Slide 4 - The General Direction

“That became RabbitHole. The general direction is to turn a conversation into a visual map instead of only a transcript. The map should show the main path, side branches, and real breaks in topic continuity. And it should stay inside ChatGPT so the tool works in-context.”

## Slide 5 - Why a Rabbit and a Trail

“I used a rabbit and trail metaphor because it is much easier to read than a generic graph. A trail means progress. A branch means a tangent. A broken node means actual drift. A return arc means the conversation found its way back to the main thread.”

## Slide 6 - How This Can Be Achieved

“At a high level, the pipeline is straightforward. First extract exchange-level conversation units from the page. Then normalize and summarize them. Then score semantic continuity between exchanges. Then classify each exchange. Then render the result as a trail UI.”

## Slide 7 - System Architecture

“Architecturally, the extension does the page integration and UI. The content script extracts the conversation and handles transcript interaction. The background worker manages caching and backend calls. The FastAPI backend does the semantic analysis. Shared types keep the frontend and backend contracts aligned.”

## Slide 8 - How the Backend Classifies Drift

“This is the main technical part. The backend builds a root topic from the opening turns, then tracks a mainline and temporary branch lineages. For each new exchange, it computes multiple signals: previous-turn similarity, root relevance, local and branch continuity, plus drift and novelty. Then it applies rule-ordered classification to decide whether the turn is on path, deepening, a side quest, a rabbit hole, or a return.”

“The reason I went with this approach is that a conversation can evolve without actually being off topic. So the classifier needs more structure than just comparing each turn to the immediately previous turn.”

## Slide 9 - Analysis Modes

“There are also multiple analysis modes. Deterministic is the default and most stable. Hybrid uses a model to improve summarization of noisy assistant replies, but keeps final classification deterministic. Probabilistic goes further and overlays model-assisted classification. So I have a deterministic backbone, with more experimental modes on top of it.”

## Slide 10 - Live Demo

“Here I’ll show the current prototype. The launcher starts as a compact rabbit. The sidebar opens as a docked panel. The trail is exchange-level, not raw message-level. Clicking a node jumps back to the relevant part of the transcript. The rabbit also has live states for typing, waiting, analyzing, and classified conversation status.”

Demo sequence:

1. Open the rabbit launcher.
2. Show the trail and inspector.
3. Click a node and jump to the transcript.
4. Type in the composer to show the listening state.
5. Send a message and show waiting.
6. Let the reply finish and show auto-analysis.

## Slide 11 - Current Prototype State

“The current prototype works end to end. Extraction, scoring, and rendering are all live. Click-to-scroll works. Auto-analysis works when the conversation updates. What is still happening now is refinement: better labels, tighter edge-case handling, and more robust semantics.”

## Slide 12 - What's in the Pipeline

“The next things I want to add are better topic labels, stronger branch summaries, and better unrelated-topic detection. I also want support beyond ChatGPT. One feature I care about a lot is the ability to save rabbit holes to revisit later, because that completes the original product idea: not just seeing drift, but preserving good side explorations for when the main task is done.”

## Slide 13 - End

“That is RabbitHole. It came from a workflow problem I kept running into myself. The goal is not to stop exploration. The goal is to make drift visible, stay on the main task when needed, and come back to interesting side paths later.”
