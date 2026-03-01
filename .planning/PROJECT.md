# BGA2 — Board Game Arena Competitor

## What This Is

A digital board game platform with two pillars: a genre-agnostic game engine that runs in the browser (desktop + mobile PWA), and an AI-powered local-first game creation toolkit that lets creators describe a board game, feed it source materials (rulebooks, art assets, rulings), and generate a playable digital implementation. Players find and play games online, both synchronously and asynchronously. Think Board Game Arena, but with radically better tooling for game creation and a modern player experience.

## Core Value

Any board game can be faithfully digitized and played online — the engine handles the hard parts (multiplayer, UI, rules enforcement, mobile parity) so creators focus on what makes their game unique.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Genre-agnostic game engine with primitives: board/zones, piece system, turn structure, UI framework, rules enforcement (state machines), effects/animations, multiplayer
- [ ] Renderer abstraction layer — isolate rendering so it can be swapped (Canvas 2D, WebGL, Godot WASM) without rewriting game logic
- [ ] Web-based player interface that works equally well on desktop browser and mobile (PWA) with zoom in/out for consistent feel
- [ ] Synchronous and asynchronous play with configurable turn timing (notifications, deadlines, auto-skip)
- [ ] Server-authoritative game state — rules and state enforced server-side to prevent cheating; client starts with UX-only logic (legal move indicators), with path to migrate more logic client-side later
- [ ] AI-powered local-first game creation tool — describe & generate workflow using source materials (rulebooks, assets, rulings, lore), outputting data + script hooks that plug into the engine
- [ ] Game creation tool supports: source material ingestion, codified spec generation, hot-reload iteration, game state manipulation for testing, release notes, tutorial/tooltip text refinement
- [ ] Each game is data + customized script function hooks on a shared engine foundation — consistent player experience across all games
- [ ] Azul as first game implementation to prove the engine works end-to-end
- [ ] Basic community features (game library, player profiles, match history)
- [ ] Premium subscription options to unlock features or games

### Out of Scope

- Native mobile apps — PWA-first, native later
- Licensing deals with publishers — deferred, TBD
- Community game submissions — v1 is team-created games only, open to community later
- Real-time voice/video chat — text chat sufficient for v1
- AI opponents — human multiplayer only for v1

## Context

- Board Game Arena is the primary competitor and reference point — strong on game library and player experience, weak on developer experience for game creation
- The AI game creation workflow is the key differentiator — LLM-heavy, local-first, git-based, rapid iteration
- Creator model is phased: team builds the initial game library, platform opens to community creators later
- Azul (tile drafting, pattern building, spatial layout, scoring) chosen as first game — medium complexity that exercises core engine primitives without overwhelming edge cases
- The user has strong backend experience (C#, jQuery-era frontend) but limited modern frontend framework experience
- Small operational budget — serverless and lightweight cloud services strongly preferred

## Constraints

- **Backend**: C# — non-negotiable, this is the API/BFF language
- **Game creation tool**: C# if local-first (preferred), web-based also acceptable
- **Frontend framework**: Svelte preferred (familiar mental model from jQuery), but open to React, Blazor, or whatever research recommends as best fit
- **Rendering**: Must be abstracted behind a clean interface — renderer is expected to change (start with one, potentially swap later)
- **Infrastructure**: Serverless / low-cost cloud — AWS preferred (CloudFront edge workers, Lambda, DynamoDB, S3)
- **Client architecture**: Start server-authoritative (anti-cheat), explore confident client-side state management to reduce server load — research needed
- **Mobile parity**: Desktop and mobile must feel consistent — zoom in/out as first-class feature
- **Quality level**: Polished MVP — not a prototype, not production-hardened, but good enough to show people

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AI-powered game creation over manual dev tooling | Key differentiator vs BGA; LLMs can dramatically speed up game digitization | — Pending |
| Local-first creation tool (not web-based editor) | Enables git workflows, fast iteration, avoids expensive API interfaces | — Pending |
| Games as data + script hooks (not standalone codebases) | Consistent player experience, shared engine handles hard problems | — Pending |
| Server-authoritative game state | Prevents cheating/manipulation; client-side optimization researched later | — Pending |
| Renderer abstraction layer | Rendering tech likely to change; isolate to enable swapping without rewrites | — Pending |
| Serverless infrastructure | Small budget; leverage AWS Lambda, DynamoDB, S3, CloudFront | — Pending |
| Azul as first game | Medium complexity, exercises core primitives, clear rules, good test case | — Pending |

---
*Last updated: 2026-02-28 after initialization*
