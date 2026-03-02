---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/server/Endpoints/DevEndpoints.cs
  - apps/server/Services/GameService.cs
  - apps/server/Program.cs
  - apps/client/src/lib/api/gameApi.ts
  - apps/client/src/lib/components/DevMenu.svelte
  - apps/client/src/routes/game/[id]/+page.svelte
autonomous: true
requirements: [QUICK-1]

must_haves:
  truths:
    - "Pressing backtick key toggles a dev menu panel on the game page"
    - "Clicking 'Trigger Round End' in the dev menu triggers server-side onRoundEnd and re-renders the board"
    - "Clicking 'Trigger Game End' in the dev menu sets game.finished=true and shows the score summary overlay"
    - "Dev menu shows current game state summary (round, phase, player index, finished)"
  artifacts:
    - path: "apps/server/Endpoints/DevEndpoints.cs"
      provides: "POST /dev/{sessionId}/trigger-round-end and /trigger-game-end endpoints"
    - path: "apps/client/src/lib/components/DevMenu.svelte"
      provides: "Toggleable dev panel UI with command buttons"
    - path: "apps/client/src/lib/api/gameApi.ts"
      provides: "devCommand() API function"
  key_links:
    - from: "apps/client/src/lib/components/DevMenu.svelte"
      to: "apps/client/src/lib/api/gameApi.ts"
      via: "devCommand() calls"
      pattern: "devCommand\\("
    - from: "apps/client/src/lib/api/gameApi.ts"
      to: "apps/server/Endpoints/DevEndpoints.cs"
      via: "fetch POST /dev/{sessionId}/{command}"
      pattern: "fetch.*dev/"
    - from: "apps/client/src/routes/game/[id]/+page.svelte"
      to: "apps/client/src/lib/components/DevMenu.svelte"
      via: "component import and keyboard listener"
      pattern: "DevMenu"
---

<objective>
Add a developer menu for real-time game state manipulation during development.

Purpose: Allow a game developer iterating on their game to trigger round-end, game-end, and inspect state without playing through full rounds manually. This accelerates development and testing of end-game scoring, round transitions, and edge cases.

Output: Server dev endpoints + client DevMenu component wired into the game page, toggled with backtick key.
</objective>

<execution_context>
@/home/emkayultra/.claude/get-shit-done/workflows/execute-plan.md
@/home/emkayultra/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/server/Endpoints/GameEndpoints.cs
@apps/server/Services/GameService.cs
@apps/server/Services/HookExecutor.cs
@apps/server/Models/GameModels.cs
@apps/server/Program.cs
@apps/client/src/lib/api/gameApi.ts
@apps/client/src/lib/engine/SceneManager.ts
@apps/client/src/routes/game/[id]/+page.svelte

<interfaces>
<!-- Server types the executor needs -->

From apps/server/Services/GameService.cs:
```csharp
// Key methods executor can reuse:
public async Task<GameStateResponse?> GetGameState(Guid sessionId)
internal static (string currentPlayer, int round) ExtractPlayerAndRound(string stateJson)
private static string ExtractPhase(string stateJson)
// GameSession loaded via: _db.GameSessions.FindAsync(sessionId)
```

From apps/server/Services/HookExecutor.cs:
```csharp
public string LoadHooks(string gameId, string? monorepoRoot = null)
public (string NewStateJson, List<string> Errors) OnRoundEnd(string hooksSource, string gameStateJson, string currentPlayer, int round)
```

From apps/server/Models/GameModels.cs:
```csharp
public record GameStateResponse(Guid SessionId, string GameId, string State, int Version, List<ValidMove>? ValidMoves);
```

From apps/client/src/lib/api/gameApi.ts:
```typescript
const API_BASE = 'http://localhost:8080';
export interface GameStateResponse { state: GameState; validMoves: ValidMove[]; }
export async function getGameState(sessionId: string): Promise<GameStateResponse>
```

From apps/client/src/lib/engine/SceneManager.ts:
```typescript
public state: SceneManagerState  // includes sessionId, gameState, currentPlayerIndex, etc.
public onStateChange: (() => void) | null
public onGameFinished: ((state: GameState) => void) | null
async refreshValidMoves(): Promise<void>  // re-fetches state from server, re-renders scene
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add server dev endpoints for state manipulation</name>
  <files>apps/server/Endpoints/DevEndpoints.cs, apps/server/Services/GameService.cs, apps/server/Program.cs</files>
  <action>
Create `apps/server/Endpoints/DevEndpoints.cs` with a new `DevEndpoints` static class using the same minimal API extension method pattern as GameEndpoints.

Register a route group at `/dev` with `.WithTags("Dev")`.

Endpoints to create:

1. **POST /dev/{sessionId:guid}/trigger-round-end** — Loads the GameSession from DB, loads hooks via HookExecutor, calls `OnRoundEnd(hooksSource, session.State, currentPlayer, round)`, saves the updated state back to the session (increment version, update timestamp), then returns the new GameStateResponse (same format as GET /games/{id}/state). If session not found, return 404.

2. **POST /dev/{sessionId:guid}/trigger-game-end** — Loads the GameSession from DB, parses the state JSON, sets `finished = true` and `winnerId` to the player with the highest score (read from `players` array). Use `System.Text.Json` to parse the state into a `JsonNode`, mutate the `finished` and `winnerId` properties, then re-serialize. Save updated state (increment version), return GameStateResponse. If session not found, return 404.

3. **POST /dev/{sessionId:guid}/set-state** — Accepts a JSON body with arbitrary state overrides (e.g., `{ "round": 5, "currentPlayerIndex": 1 }`). Loads session, parses state into `JsonNode`, merges the provided properties onto the root object (shallow merge — each key in the request body overwrites the same key in state), re-serializes, saves, returns GameStateResponse. This is a generic escape hatch for arbitrary state manipulation.

The DevEndpoints class needs `GameService` and `HookExecutor` injected. Since these are minimal API endpoints, inject them as parameters to each handler method (same pattern as GameEndpoints). For the HookExecutor and DB access, either inject `GameDbContext` + `HookExecutor` directly or add a helper method to `GameService`.

**In GameService**, add a public method:
```csharp
public async Task<GameSession?> LoadSession(Guid sessionId)
```
This is just `await _db.GameSessions.FindAsync(sessionId)` — extracted to avoid giving DevEndpoints direct DB access. Also add:
```csharp
public async Task SaveSession(GameSession session)
```
which increments version, sets UpdatedAt, and calls SaveChangesAsync.

**In Program.cs**, add `app.MapDevEndpoints();` right after `app.MapGameEndpoints();`.

Do NOT gate these endpoints behind any auth or environment check — they are dev-only and the server only runs locally in Docker during development.
  </action>
  <verify>
    <automated>docker compose -f apps/infra/docker-compose.yml exec server dotnet build --no-restore 2>&1 | tail -5</automated>
  </verify>
  <done>Server compiles clean. Three dev endpoints registered at /dev/{sessionId}/trigger-round-end, /dev/{sessionId}/trigger-game-end, /dev/{sessionId}/set-state. GameService has LoadSession and SaveSession helper methods.</done>
</task>

<task type="auto">
  <name>Task 2: Add client DevMenu component and wire into game page</name>
  <files>apps/client/src/lib/api/gameApi.ts, apps/client/src/lib/components/DevMenu.svelte, apps/client/src/routes/game/[id]/+page.svelte</files>
  <action>
**In gameApi.ts**, add three new API functions at the bottom:

```typescript
export async function devTriggerRoundEnd(sessionId: string): Promise<GameStateResponse> {
  const res = await fetch(`${API_BASE}/dev/${encodeURIComponent(sessionId)}/trigger-round-end`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Dev trigger-round-end failed: HTTP ${res.status}`);
  const raw = await res.json();
  return {
    state: typeof raw.state === 'string' ? JSON.parse(raw.state) : raw.state,
    validMoves: raw.validMoves ?? [],
  };
}

export async function devTriggerGameEnd(sessionId: string): Promise<GameStateResponse> {
  const res = await fetch(`${API_BASE}/dev/${encodeURIComponent(sessionId)}/trigger-game-end`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Dev trigger-game-end failed: HTTP ${res.status}`);
  const raw = await res.json();
  return {
    state: typeof raw.state === 'string' ? JSON.parse(raw.state) : raw.state,
    validMoves: raw.validMoves ?? [],
  };
}

export async function devSetState(sessionId: string, overrides: Record<string, unknown>): Promise<GameStateResponse> {
  const res = await fetch(`${API_BASE}/dev/${encodeURIComponent(sessionId)}/set-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides),
  });
  if (!res.ok) throw new Error(`Dev set-state failed: HTTP ${res.status}`);
  const raw = await res.json();
  return {
    state: typeof raw.state === 'string' ? JSON.parse(raw.state) : raw.state,
    validMoves: raw.validMoves ?? [],
  };
}
```

**Create `apps/client/src/lib/components/DevMenu.svelte`** (Svelte 5 with runes):

Props (using `$props()`):
- `sessionId: string | null` — current session ID (null = disabled)
- `gameState: SceneManagerState` — current game state for display
- `onStateUpdated: (response: GameStateResponse) => void` — callback after any dev command succeeds, so the parent can refresh SceneManager

State:
- `open: boolean = false` — whether the panel is visible
- `busy: boolean = false` — loading indicator during API calls
- `lastError: string | null = null` — error message from last failed command
- `stateJson: string = ''` — textarea content for set-state (raw JSON)

Keyboard handling: On mount, add a `keydown` listener on `window` for the backtick key (`` ` ``, event.key === '`'). Toggle `open`. Remove listener on destroy. Ignore the keydown if the active element is an input/textarea (to avoid triggering while typing in the JSON textarea).

Layout: Fixed-position panel, bottom-right corner, above the player info bar (bottom: 52px). Width ~320px. Semi-transparent dark background (same style family as the player info bar — `rgba(15, 23, 42, 0.95)`, backdrop-filter blur). Border-radius 12px. z-index 500 (above score overlay at 300).

Content when open:
1. **Header row**: "Dev Menu" title + close button (X)
2. **State summary section**: Display round, phase, currentPlayerIndex, finished status, player count — read from `gameState.gameState` prop. Use compact key:value layout.
3. **Actions section** with three buttons, styled like the existing settings-toggle but larger:
   - "Trigger Round End" — calls `devTriggerRoundEnd(sessionId)`, on success calls `onStateUpdated(response)`
   - "Trigger Game End" — calls `devTriggerGameEnd(sessionId)`, on success calls `onStateUpdated(response)`
   - "Set State" — shows a small textarea (3 rows) pre-filled with `stateJson`, and a "Apply" button. On click, `JSON.parse(stateJson)` then `devSetState(sessionId, parsed)`, on success calls `onStateUpdated(response)`. Show parse errors inline.
4. **Error display**: If `lastError` is set, show it in red text below the buttons. Clear on next successful command.

Each button should set `busy = true` during the API call and show a loading state (opacity 0.5, pointer-events none). Wrap each call in try/catch, setting `lastError` on failure.

**In +page.svelte**, wire the DevMenu:

1. Add import: `import DevMenu from '$lib/components/DevMenu.svelte';`
2. Add the DevMenu component at the bottom of the template (after the score overlay block), passing props:
   ```svelte
   <DevMenu
     sessionId={gameState.sessionId}
     gameState={gameState}
     onStateUpdated={handleDevStateUpdate}
   />
   ```
3. Add handler function `handleDevStateUpdate` in the script block:
   ```typescript
   function handleDevStateUpdate(response: GameStateResponse): void {
     if (!sceneManager) return;
     // The dev endpoint returns fresh state — push it through SceneManager
     sceneManager.state.gameState = response.state;
     sceneManager.state.validMoves = response.validMoves;
     sceneManager.state.currentPlayerIndex = response.state.currentPlayerIndex;
     sceneManager.state.playerNames = response.state.players.map((p: any) => p.name);
     sceneManager.state.playerScores = response.state.players.map((p: any) => p.score);
     // Trigger reactive update
     gameState = { ...sceneManager.state };
     // Re-render the scene with new state
     if ((sceneManager as any).scene) {
       (sceneManager as any).scene.updateFromState(response.state);
       (sceneManager as any).scene.setActivePlayer(response.state.currentPlayerIndex);
     }
     // Check for game end
     if (response.state.finished) {
       finishedGameState = response.state;
     }
   }
   ```
   Import `GameStateResponse` type from gameApi at the top of the script.

4. Add the `GameStateResponse` import to the existing imports:
   ```typescript
   import type { GameStateResponse } from '$lib/api/gameApi.js';
   ```
  </action>
  <verify>
    <automated>docker compose -f apps/infra/docker-compose.yml exec client npx nx run client:check 2>&1 | tail -10</automated>
  </verify>
  <done>DevMenu component renders when backtick is pressed on the game page. Trigger Round End and Trigger Game End buttons call the server dev endpoints and refresh the board. Set State textarea allows arbitrary JSON overrides. All type checks pass.</done>
</task>

</tasks>

<verification>
1. Start Docker services: `docker compose -f apps/infra/docker-compose.yml up -d`
2. Create a game session and open it in the browser
3. Press backtick (`) — dev menu panel should appear in bottom-right
4. Verify state summary shows round, phase, player index
5. Click "Trigger Round End" — board should re-render with round-end state (tiles moved to wall, scores updated, new round started)
6. Click "Trigger Game End" — score summary overlay should appear
7. Type `{"round": 3}` in the Set State textarea and click Apply — state summary should show round 3
8. Press backtick again — dev menu should close
</verification>

<success_criteria>
- Server builds clean with three new dev endpoints
- Client type-checks clean with DevMenu component
- Backtick key toggles the dev menu panel
- All three dev commands (trigger-round-end, trigger-game-end, set-state) call the server and re-render the board
- Dev menu shows current game state summary (round, phase, player, finished)
</success_criteria>

<output>
After completion, create `.planning/quick/1-developer-menu-for-real-time-game-state-/1-SUMMARY.md`
</output>
