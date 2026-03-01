/**
 * GameFSM tests — TDD RED phase
 *
 * Tests cover the hierarchical game FSM with parallel regions.
 * All tests are expected to FAIL until GameFSM.ts is implemented (GREEN phase).
 */
import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import type { GameState } from '@bga2/shared-types';
import { createGameFSM } from '../GameFSM.js';
import type { GameFSMConfig } from '../GameFSM.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'test-match-1',
    gameId: 'azul',
    version: 1,
    phase: 'draftingPhase',
    currentPlayerIndex: 0,
    players: [],
    zones: {},
    round: 1,
    finished: false,
    ...overrides,
  };
}

const defaultConfig: GameFSMConfig = {
  phases: [
    { id: 'draftingPhase', stages: [{ id: 'pick' }] },
    { id: 'tilingPhase', stages: [{ id: 'place' }] },
    { id: 'scoringPhase', stages: [{ id: 'score' }] },
  ],
  parallelTurns: false,
};

const parallelConfig: GameFSMConfig = {
  phases: [{ id: 'bidPhase', stages: [{ id: 'bid' }] }],
  parallelTurns: true,
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('GameFSM', () => {
  it('1. initializes in the correct starting state (playing.draftingPhase)', () => {
    const machine = createGameFSM(defaultConfig);
    const actor = createActor(machine, {
      input: { gameState: makeGameState(), round: 1, currentPlayerIndex: 0 },
    });
    actor.start();
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ playing: 'draftingPhase' })).toBe(true);
    actor.stop();
  });

  it('2. transitions from draftingPhase to tilingPhase on PHASE_END event', () => {
    const machine = createGameFSM(defaultConfig);
    const actor = createActor(machine, {
      input: { gameState: makeGameState(), round: 1, currentPlayerIndex: 0 },
    });
    actor.start();
    actor.send({ type: 'PHASE_END' });
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ playing: 'tilingPhase' })).toBe(true);
    actor.stop();
  });

  it('3. transitions from tilingPhase to scoringPhase on PHASE_END event', () => {
    const machine = createGameFSM(defaultConfig);
    const actor = createActor(machine, {
      input: { gameState: makeGameState(), round: 1, currentPlayerIndex: 0 },
    });
    actor.start();
    actor.send({ type: 'PHASE_END' }); // drafting -> tiling
    actor.send({ type: 'PHASE_END' }); // tiling -> scoring
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ playing: 'scoringPhase' })).toBe(true);
    actor.stop();
  });

  it('4. transitions to finished state on GAME_END event', () => {
    const machine = createGameFSM(defaultConfig);
    const actor = createActor(machine, {
      input: { gameState: makeGameState(), round: 1, currentPlayerIndex: 0 },
    });
    actor.start();
    actor.send({ type: 'GAME_END' });
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('finished')).toBe(true);
    actor.stop();
  });

  it('5. invalid event in wrong state does NOT change state', () => {
    const machine = createGameFSM(defaultConfig);
    const actor = createActor(machine, {
      input: { gameState: makeGameState(), round: 1, currentPlayerIndex: 0 },
    });
    actor.start();
    // ROUND_END should be ignored in draftingPhase (not a valid transition)
    actor.send({ type: 'ROUND_END' });
    const snapshot = actor.getSnapshot();
    // State should still be in draftingPhase, not advanced
    expect(snapshot.matches({ playing: 'draftingPhase' })).toBe(true);
    actor.stop();
  });

  it('6. parallel regions: onDone fires only after BOTH regions reach final state', () => {
    const machine = createGameFSM(parallelConfig);
    const actor = createActor(machine, {
      input: { gameState: makeGameState({ phase: 'bidPhase' }), round: 1, currentPlayerIndex: 0 },
    });

    let doneCallCount = 0;
    actor.subscribe((snapshot) => {
      if (snapshot.matches({ playing: 'bidPhase' }) === false && snapshot.matches('playing') === false) {
        // We've left the bidPhase — this means onDone fired (advanced to finished or next)
        doneCallCount++;
      }
    });

    actor.start();
    // Send both player submissions
    actor.send({ type: 'SUBMIT_P1' });
    actor.send({ type: 'SUBMIT_P2' });

    const snapshot = actor.getSnapshot();
    // After both submits, should have advanced past parallel turn
    expect(snapshot.matches({ playing: 'bidPhase' })).toBe(false);
    actor.stop();
  });

  it('7. parallel regions: sending only SUBMIT_P1 does NOT trigger onDone', () => {
    const machine = createGameFSM(parallelConfig);
    const actor = createActor(machine, {
      input: { gameState: makeGameState({ phase: 'bidPhase' }), round: 1, currentPlayerIndex: 0 },
    });
    actor.start();
    // Only one player submits
    actor.send({ type: 'SUBMIT_P1' });
    const snapshot = actor.getSnapshot();
    // Still in bidPhase — parallel turn not complete
    expect(snapshot.matches({ playing: 'bidPhase' })).toBe(true);
    actor.stop();
  });

  it('8. FSM context holds GameState and round; assign action updates round on ROUND_END from scoring', () => {
    const machine = createGameFSM(defaultConfig);
    const initialState = makeGameState({ round: 1 });
    const actor = createActor(machine, {
      input: { gameState: initialState, round: 1, currentPlayerIndex: 0 },
    });
    actor.start();
    // Advance to scoringPhase
    actor.send({ type: 'PHASE_END' }); // -> tilingPhase
    actor.send({ type: 'PHASE_END' }); // -> scoringPhase
    // Trigger round end
    actor.send({ type: 'ROUND_END' });
    const snapshot = actor.getSnapshot();
    // Context should have updated round
    expect(snapshot.context.round).toBe(2);
    actor.stop();
  });

  it('9. createGameFSM accepts dynamic config (custom phases/stages)', () => {
    const customConfig: GameFSMConfig = {
      phases: [
        { id: 'phaseA', stages: [{ id: 'stageA1' }, { id: 'stageA2' }] },
        { id: 'phaseB', stages: [{ id: 'stageB1' }] },
      ],
      parallelTurns: false,
    };
    const machine = createGameFSM(customConfig);
    const actor = createActor(machine, {
      input: { gameState: makeGameState({ phase: 'phaseA' }), round: 1, currentPlayerIndex: 0 },
    });
    actor.start();
    const snapshot = actor.getSnapshot();
    // Should start in the first phase from config
    expect(snapshot.matches({ playing: 'phaseA' })).toBe(true);
    actor.stop();
  });
});
