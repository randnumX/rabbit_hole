# RabbitHole Internal Demo

## Slide 1 - Problem Statement

**On slide**

- Start with one core task
- Chat branches into tangents
- Some are useful, not urgent
- UI shows transcript, not structure

**Speaker notes**

I use ChatGPT a lot for learning and problem solving. A pattern I noticed is that I often start with one clear task, but the conversation slowly branches into tangents and sometimes into completely different topics. Those side paths are not always bad, but the interface does not help me see where the drift happened.

## Slide 2 - What I Wanted the Tool to Do

**On slide**

- Surface the main thread
- Separate tangent vs drift
- Return me to the core task
- Save rabbit holes for later

**Speaker notes**

The goal was not to stop exploration. The goal was to make the structure visible, so I can decide what to follow now and what to come back to later.

## Slide 3 - The General Direction

**On slide**

- Visual map of chat drift
- Main path, branches, breaks
- Interactive, not just analytical
- Built inside ChatGPT

**Speaker notes**

That idea became RabbitHole. Instead of only reading the chat linearly, I wanted a view that shows how the conversation evolved.

## Slide 4 - Why a Rabbit and a Trail

**On slide**

- Trail = progress
- Branch = tangent
- Broken node = drift
- Return arc = recovery

**Speaker notes**

I chose a rabbit-trail metaphor because it is easier to read than a generic graph. It maps naturally to the idea of going down a rabbit hole and then coming back.

## Slide 5 - How This Can Be Achieved

**On slide**

- Extract exchanges
- Normalize and summarize
- Score semantic continuity
- Classify each exchange
- Render the trail

**Speaker notes**

At a high level, the system extracts the conversation, turns it into exchange-level units, analyzes continuity, and renders the result inside the ChatGPT UI.

## Slide 6 - System Architecture

**On slide**

- Content script
- Background worker
- FastAPI backend
- Shared types
- Sidebar UI

**Speaker notes**

The extension handles the UI and page integration. The backend handles the semantic scoring and graph generation.

## Slide 7 - How the Backend Classifies Drift

**On slide**

- Root topic from the opening turns
- Mainline plus branch lineages
- Similarity, continuity, drift, novelty
- Rule-ordered classification
- Output states drive the trail

**Speaker notes**

The backend is deterministic by default. It does not only compare each turn to the immediately previous one. It keeps track of the root topic, the active line of discussion, and temporary branches, then classifies each exchange using a set of semantic and lexical signals.

## Slide 8 - Analysis Modes

**On slide**

- Deterministic
- Hybrid
- Probabilistic
- Same UI, different analysis depth

**Speaker notes**

I also kept multiple analysis modes. Deterministic is the main stable path. Hybrid uses a model only to improve summarization of noisy replies. Probabilistic goes further and adds model-assisted classification on top.

## Slide 9 - Live Demo

**On slide**

- Compact rabbit launcher
- Docked sidebar
- Exchange-level nodes
- Click node to jump to transcript
- Live rabbit states

**Speaker notes**

This is the current prototype. I will show the rabbit launcher, the trail UI, transcript jump behavior, and the live rabbit states during typing, waiting, and analysis.

## Slide 10 - Current Prototype State

**On slide**

- End-to-end flow works
- Extraction, scoring, rendering are live
- Click-to-scroll works
- Auto-analysis works
- Still refining edge cases

**Speaker notes**

This is still a prototype, but the main flow now works end to end. What is left is mostly refinement: better labels, tighter semantic behavior, and stronger robustness.

## Slide 11 - What's in the Pipeline

**On slide**

- Better topic labels
- Better branch summaries
- Better unrelated-topic detection
- Support beyond ChatGPT
- Save rabbit holes for later
- Better replay and navigation

**Speaker notes**

The current prototype focuses on visibility. The next step is memory: not just showing where I drifted, but helping me preserve those interesting side paths as things to revisit later.

## Slide 12 - End

**On slide**

- Make drift visible
- Stay on the main task
- Revisit side paths later

**Speaker notes**

That is RabbitHole. It started from a practical issue in how I use chat tools, and the goal is to make long conversations easier to inspect, easier to navigate, and easier to stay focused within.
