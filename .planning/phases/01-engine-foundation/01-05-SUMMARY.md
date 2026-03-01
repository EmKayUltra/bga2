---
phase: 01-engine-foundation
plan: "05"
subsystem: renderer
tags: [typescript, pixi.js, renderer, adapter, testing, viewport, glow-filter, animation]

# Dependency graph
requires:
  - phase: 01-engine-foundation
    plan: "02"
    provides: IRenderer interface in libs/shared-types (13 methods)
provides:
  - PixiAdapter: PixiJS v8 WebGL implementation of IRenderer
  - StubRenderer: no-op test renderer with tracking helpers
  - Viewport: drag/pinch/wheel/decelerate via pixi-viewport
  - GlowFilter support for selection feedback (pixi-filters)
  - easeOutBack animation for snappy overshoot piece movement
  - 44px minimum hitArea touch targets on all interactive sprites
affects: [02-game-engine, 05-ai-toolkit]

# Tech tracking
tech-stack:
  added:
    - pixi.js@8.16.0 (WebGL rendering engine behind IRenderer)
    - pixi-filters@6.1.5 (GlowFilter for selection feedback)
    - pixi-viewport@6.0.3 (zoom/pan/pinch camera)
    - "@mszu/pixi-ssr-shim" (SvelteKit SSR compatibility for PixiJS)
  patterns:
    - SSR-safe import order: @mszu/pixi-ssr-shim is always the first import in PixiAdapter
    - Renderer abstraction: game logic uses IRenderer only, never PixiJS directly
    - Handle pattern: ISpriteHandle/IContainerHandle are opaque IDs; internal Maps look up PixiJS objects
    - pixi-viewport v6 requires events: app.renderer.events (not old interaction plugin)
    - easeOutBack easing (c1=1.70158, c3=c1+1) for snappy overshoot animations
    - Minimum 44px hitArea enforced on all createSprite calls (ENG-09)
    - StubRenderer test helpers: getStageObjects(), triggerPointerDown(), getGlowState()

key-files:
  created:
    - libs/engine/core/src/renderer/StubRenderer.ts
    - libs/engine/core/src/renderer/PixiAdapter.ts
    - libs/engine/core/src/renderer/index.ts
    - libs/engine/core/src/renderer/__tests__/StubRenderer.test.ts
  modified:
    - libs/engine/core/src/index.ts (added renderer barrel exports)
    - libs/engine/core/package.json (added pixi deps)
    - package.json (updated by npm install)

key-decisions:
  - "PixiAdapter uses @mszu/pixi-ssr-shim as first import — patches self/window/document globals for SvelteKit SSR safety; dynamic import at onMount is the second line of defense"
  - "All game objects live inside the pixi-viewport rather than app.stage directly — enables zoom/pan to apply to all game content uniformly"
  - "Viewport passes events: app.renderer.events (pixi-viewport v6 requirement) — must be set after await app.init() completes"
  - "StubRenderer test helpers (getStageObjects, triggerPointerDown, getGlowState) added as typed methods — enables test assertions without casting to any"
  - "animateTo closure assigns obj to typed const target before closure — satisfies TypeScript strict null checks inside nested rAF function"

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 01 Plan 05: PixiJS Renderer Adapter and Stub Renderer Summary

**PixiAdapter wrapping PixiJS v8 behind IRenderer (viewport, GlowFilter, easeOutBack animation, 44px touch targets) plus StubRenderer for headless testing — both satisfying the same IRenderer interface**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T05:59:40Z
- **Completed:** 2026-03-01T06:04:57Z
- **Tasks:** 1 of 1 (TDD: RED + GREEN phases)
- **Files created/modified:** 7

## Accomplishments

- **StubRenderer** (188 lines): Full IRenderer implementation as no-ops with internal state tracking. All 13 IRenderer methods implemented. Three test helpers added — `getStageObjects()`, `triggerPointerDown(handleId)`, `getGlowState(handleId)` — for asserting renderer behavior without mocking. `animateTo` resolves immediately (no 500ms delay in tests).

- **PixiAdapter** (288 lines): Full PixiJS v8 IRenderer implementation. SSR-safe via `@mszu/pixi-ssr-shim` as first import. Light+clean background `0xfafaf8`. Creates sprites from texture cache or Graphics placeholder fallback. Enforces 44px minimum hitArea on all interactive sprites (ENG-09). `applyGlow`/`removeGlow` via GlowFilter. `animateTo` uses easeOutBack curve for snappy overshoot animations. `enableViewport` configures pixi-viewport with drag/pinch/wheel/decelerate and correct `events: app.renderer.events` (pixi-viewport v6 requirement).

- **12 StubRenderer tests** passing: init, createSprite, createContainer, addToStage/removeFromStage tracking, applyGlow/removeGlow no-ops, animateTo immediate resolve, setInteractive/onPointerDown, full IRenderer interface method coverage, triggerPointerDown helper, getGlowState helper, enableViewport, destroy.

- **PixiJS packages installed**: pixi.js@8.16.0, pixi-filters@6.1.5, pixi-viewport@6.0.3, @mszu/pixi-ssr-shim

## Task Commits

1. **Task 1 RED: Failing StubRenderer tests** - `ad27514` (test)
2. **Task 1 GREEN: StubRenderer + PixiAdapter implementation** - `e013bf1` (feat)

## Files Created/Modified

- `libs/engine/core/src/renderer/StubRenderer.ts` — no-op IRenderer for headless testing with getStageObjects/triggerPointerDown/getGlowState helpers
- `libs/engine/core/src/renderer/PixiAdapter.ts` — PixiJS v8 IRenderer implementation with viewport, GlowFilter, easeOutBack animation
- `libs/engine/core/src/renderer/index.ts` — barrel export of PixiAdapter and StubRenderer
- `libs/engine/core/src/renderer/__tests__/StubRenderer.test.ts` — 12 tests covering full IRenderer contract
- `libs/engine/core/src/index.ts` — added renderer module exports
- `libs/engine/core/package.json` — added pixi.js, pixi-filters, pixi-viewport, @mszu/pixi-ssr-shim dependencies
- `package.json` — updated by npm install (pixi packages added to root node_modules)

## Decisions Made

- `@mszu/pixi-ssr-shim` first import in PixiAdapter prevents SvelteKit SSR crash ("self is not defined") at the module level, before any PixiJS code runs.
- All game objects go into `viewport.addChild()` rather than `app.stage.addChild()` — ensures zoom/pan applies uniformly to all game content.
- `events: this.app.renderer.events` passed to pixi-viewport Viewport constructor — this is required in pixi-viewport v6 (replaces old interaction plugin). Without it, drag/pinch/wheel silently do nothing.
- StubRenderer test helpers typed as instance methods (not cast-to-any tricks) — cleaner test code, full TypeScript support in test files.
- `animateTo` assigns `obj` to `const target: Container` before closure — TypeScript's control-flow narrowing does not propagate through nested function declarations; the const assignment satisfies strict null checks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict null check in animateTo closure**
- **Found during:** Task 1 (GREEN phase, tsc compile check)
- **Issue:** TypeScript strict mode (TS18048) reports `obj` is possibly `undefined` inside the nested `tick()` function even after an `if (!obj) return` guard. TypeScript's control-flow narrowing does not hold across nested function declarations.
- **Fix:** Added `const target: Container = obj;` after the null guard. The closure captures `target` which TypeScript knows is non-null.
- **Files modified:** `libs/engine/core/src/renderer/PixiAdapter.ts`
- **Commit:** `e013bf1`

No other deviations — plan executed as written.

## Issues Encountered

None beyond the auto-fixed tsc strict-null closure issue.

## User Setup Required

None — all packages installed via npm install. No external services, credentials, or environment variables required for the renderer implementations. PixiAdapter requires a browser/WebGL context for actual rendering (use StubRenderer for all testing).

## Next Phase Readiness

- Plan 06: Can import StubRenderer for FSM + game loader integration tests
- Plan 07: Can mount PixiAdapter in a SvelteKit route via `onMount` dynamic import
- All IRenderer methods implemented — game logic can start using the renderer abstraction immediately

## Self-Check: PASSED

Files verified:
- libs/engine/core/src/renderer/StubRenderer.ts — present (188 lines, min 40 required)
- libs/engine/core/src/renderer/PixiAdapter.ts — present (288 lines, min 120 required)
- libs/engine/core/src/renderer/index.ts — present
- libs/engine/core/src/renderer/__tests__/StubRenderer.test.ts — present (12 tests passing)

Commits verified:
- ad27514 (RED test) — in git log
- e013bf1 (GREEN implementation) — in git log

Key requirements verified:
- @mszu/pixi-ssr-shim first import — line 20 of PixiAdapter.ts
- events: app.renderer.events — line 274 of PixiAdapter.ts
- drag().pinch().wheel().decelerate() — present in enableViewport()
- 44px minimum hitArea — MIN_HIT_AREA_PX = 44 constant enforced in createSprite()
- easeOutBack easing — easeOutBack function at line ~76 of PixiAdapter.ts
- GlowFilter from pixi-filters — present in applyGlow()
- PixiAdapter exports: PixiAdapter named export in renderer/index.ts
- StubRenderer exports: StubRenderer named export in renderer/index.ts

---
*Phase: 01-engine-foundation*
*Completed: 2026-03-01*
