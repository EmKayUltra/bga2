---
phase: 05-ai-game-creation-toolkit
plan: "01a"
type: execute
wave: 1
depends_on: []
files_modified:
  - libs/shared-types/src/zones.ts
  - libs/engine/core/src/zones/Zone.ts
  - libs/engine/core/src/zones/ZoneFactory.ts
autonomous: true
requirements: [AIGC-06]

must_haves:
  truths:
    - "The engine supports a 'freeform' zone type where pieces carry their own coordinates in their data field"
    - "ZoneFactory creates FreeformZone instances without throwing 'unknown zone type'"
  artifacts:
    - path: "libs/shared-types/src/zones.ts"
      provides: "ZoneType extended with 'freeform' union member"
      contains: "freeform"
    - path: "libs/engine/core/src/zones/Zone.ts"
      provides: "FreeformZone class — pieces stored by coordinate key, no fixed grid"
      contains: "class FreeformZone"
    - path: "libs/engine/core/src/zones/ZoneFactory.ts"
      provides: "ZoneFactory handles 'freeform' type without exhaustive check failure"
      contains: "FreeformZone"
  key_links:
    - from: "libs/engine/core/src/zones/ZoneFactory.ts"
      to: "libs/engine/core/src/zones/Zone.ts"
      via: "ZoneFactory imports FreeformZone and creates instances for type 'freeform'"
      pattern: "FreeformZone"
---

<objective>
Extend the engine with freeform zone support for dynamic/growing boards like Hive.

Purpose: The current zone types (grid, stack, hand, deck, discard) do not support a freeform expanding board. Hive and future AI-generated games with spatial mechanics need a zone type where pieces carry their own coordinates. This is a prerequisite for the test harness (05-02) and Hive game package (05-03).

Output: FreeformZone class in the engine, 'freeform' added to ZoneType, ZoneFactory updated to create FreeformZone instances.
</objective>

<execution_context>
@/home/mkornher/.claude/get-shit-done/workflows/execute-plan.md
@/home/mkornher/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05-ai-game-creation-toolkit/05-CONTEXT.md
@.planning/phases/05-ai-game-creation-toolkit/05-RESEARCH.md

<interfaces>
<!-- Key types and contracts the executor needs from the existing codebase. -->

From libs/shared-types/src/zones.ts:
```typescript
export type ZoneType = 'grid' | 'stack' | 'hand' | 'deck' | 'discard';

export interface ZoneDef {
  id: string;
  type: ZoneType;
  capacity?: number;
  rows?: number;
  cols?: number;
  owner?: 'player' | 'shared';
  position?: { x: number; y: number };
  render?: ZoneRenderConfig;
}

export interface ZoneState {
  id: string;
  pieces: import('./pieces.js').PieceState[];
}
```

From libs/engine/core/src/zones/Zone.ts:
```typescript
export abstract class Zone {
  readonly id: string;
  readonly type: ZoneType;
  readonly owner: 'player' | 'shared';
  readonly capacity?: number;
  constructor(def: ZoneDef) { ... }
  abstract addPiece(piece: Piece, position?: unknown): void;
  abstract removePiece(pieceId: string): Piece | null;
  abstract getPieces(): Piece[];
  getPieceCount(): number { ... }
  isFull(): boolean { ... }
}
// Existing: GridZone, StackZone, HandZone, DeckZone, DiscardZone
```

From libs/engine/core/src/zones/ZoneFactory.ts:
```typescript
export const ZoneFactory = {
  createZone(def: ZoneDef): Zone {
    switch (def.type) {
      case 'grid': return new GridZone(def);
      case 'stack': return new StackZone(def);
      case 'hand': return new HandZone(def);
      case 'deck': return new DeckZone(def);
      case 'discard': return new DiscardZone(def);
      default: { const _exhaustive: never = def.type; throw new Error(...); }
    }
  },
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend engine with freeform zone type</name>
  <files>libs/shared-types/src/zones.ts, libs/engine/core/src/zones/Zone.ts, libs/engine/core/src/zones/ZoneFactory.ts</files>
  <action>
**1. Update ZoneType** in `libs/shared-types/src/zones.ts` — add `'freeform'` to the union:
```typescript
export type ZoneType = 'grid' | 'stack' | 'hand' | 'deck' | 'discard' | 'freeform';
```

**2. Create FreeformZone class** in `libs/engine/core/src/zones/Zone.ts` — add after the DiscardZone class:
```typescript
// ─── FreeformZone ──────────────────────────────────────────────────────────

/**
 * A zone where pieces have no fixed grid — they carry their own coordinates
 * in their data/state field. Used for games with dynamic/growing boards
 * like Hive where pieces define the board shape.
 *
 * Pieces are stored by ID. Position is tracked externally (in piece state or
 * game-specific data structures like HiveGameData.placedPieceCoords).
 * The renderer reads piece positions from game state to calculate pixel positions.
 */
export class FreeformZone extends Zone {
  private readonly pieces: Map<string, Piece> = new Map();

  addPiece(piece: Piece): void {
    this.pieces.set(piece.id, piece);
  }

  removePiece(pieceId: string): Piece | null {
    const piece = this.pieces.get(pieceId) ?? null;
    this.pieces.delete(pieceId);
    return piece;
  }

  getPieces(): Piece[] {
    return Array.from(this.pieces.values());
  }

  hasPiece(pieceId: string): boolean {
    return this.pieces.has(pieceId);
  }
}
```

Also add `FreeformZone` to the existing exports at the top of Zone.ts if there is a barrel export, or ensure it is importable from the module.

**3. Update ZoneFactory** in `libs/engine/core/src/zones/ZoneFactory.ts`:
- Add `FreeformZone` to the import statement alongside the other zone classes.
- Add a `case 'freeform':` branch to the switch statement BEFORE the default:
```typescript
case 'freeform':
  return new FreeformZone(def);
```

**4. Update the zones/index.ts barrel export** — ensure `FreeformZone` is exported from `libs/engine/core/src/zones/index.ts` alongside the other zone classes.

**5. Verify** — run `docker compose -f apps/infra/docker-compose.yml exec client npx tsc --noEmit` to confirm all TypeScript compiles cleanly. The ZoneFactory exhaustive switch should still work since the default branch catches `never`, and adding the new case before it is required.
  </action>
  <verify>
    <automated>docker compose -f apps/infra/docker-compose.yml exec client npx tsc --noEmit 2>&1 | tail -10</automated>
  </verify>
  <done>ZoneType includes 'freeform'. FreeformZone class exists in Zone.ts with addPiece/removePiece/getPieces/hasPiece. ZoneFactory creates FreeformZone for type 'freeform'. All TypeScript compiles cleanly (tsc --noEmit passes).</done>
</task>

</tasks>

<verification>
- `docker compose -f apps/infra/docker-compose.yml exec client npx tsc --noEmit` succeeds — freeform zone type is valid
- ZoneType in shared-types includes 'freeform'
- ZoneFactory.ts has a case for 'freeform' that creates FreeformZone
- FreeformZone class exists in Zone.ts with addPiece/removePiece/getPieces/hasPiece
</verification>

<success_criteria>
- Engine supports freeform zone type — ZoneFactory creates FreeformZone without error
- All TypeScript compiles cleanly with the new zone type
</success_criteria>

<output>
After completion, create `.planning/phases/05-ai-game-creation-toolkit/05-01a-SUMMARY.md`
</output>
