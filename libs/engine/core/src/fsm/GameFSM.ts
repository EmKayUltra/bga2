/**
 * Hierarchical game FSM factory using XState v5.
 *
 * createGameFSM builds an XState machine from a GameFSMConfig. The machine
 * models the full game lifecycle:
 *
 *   Game (initial: playing)
 *     └── playing (initial: first phase from config)
 *           └── Phase (per-config)
 *                 └── turn (sequential or parallel)
 *                       └── Stage (per-config)
 *   finished (final)
 *
 * Parallel turns use `type: 'parallel'` with per-player regions, each following
 * waiting -> active -> done (final). onDone on the parallel turn fires only when
 * ALL regions complete.
 */
import { createMachine, assign } from 'xstate';
import type { FSMContext, GameFSMConfig } from './types.js';

// Re-export config type so tests can import from GameFSM.js directly
export type { GameFSMConfig } from './types.js';

// ─── Helper: build parallel turn state ────────────────────────────────────────

/**
 * Builds the parallel turn state used when config.parallelTurns is true.
 * Two regions (player1 and player2), each with:
 *   waiting -> active -> done (final)
 * onDone on the parent fires when ALL regions complete.
 */
function buildParallelTurnState() {
  return {
    type: 'parallel' as const,
    states: {
      player1: {
        initial: 'waiting' as const,
        states: {
          waiting: {
            on: {
              SUBMIT_P1: { target: 'done' },
            },
          },
          done: {
            type: 'final' as const,
          },
        },
      },
      player2: {
        initial: 'waiting' as const,
        states: {
          waiting: {
            on: {
              SUBMIT_P2: { target: 'done' },
            },
          },
          done: {
            type: 'final' as const,
          },
        },
      },
    },
  };
}

// ─── Helper: build sequential turn state ─────────────────────────────────────

/**
 * Builds the sequential (non-parallel) turn state.
 * A single active sub-state that accepts SUBMIT_MOVE to complete.
 */
function buildSequentialTurnState() {
  return {
    initial: 'active' as const,
    states: {
      active: {
        on: {
          SUBMIT_MOVE: { target: 'done' },
        },
      },
      done: {
        type: 'final' as const,
      },
    },
  };
}

// ─── Helper: build phase state ────────────────────────────────────────────────

/**
 * Builds the state node for a single phase.
 * Each phase has a 'turn' sub-state (parallel or sequential).
 * onDone on the phase (turn completed) is handled by the parent playing state.
 */
function buildPhaseState(config: GameFSMConfig) {
  const turnState = config.parallelTurns
    ? buildParallelTurnState()
    : buildSequentialTurnState();

  return {
    initial: 'turn' as const,
    states: {
      turn: {
        ...turnState,
        onDone: {
          // When turn completes, phase itself completes (signals parent via onDone)
          target: 'complete',
        },
      },
      complete: {
        type: 'final' as const,
      },
    },
  };
}

// ─── Helper: build playing state ─────────────────────────────────────────────

/**
 * Builds the 'playing' compound state containing all phases.
 *
 * Phase advancement has two modes:
 *   - Sequential turns (parallelTurns: false): explicit PHASE_END event required
 *   - Parallel turns (parallelTurns: true): onDone auto-advances when all regions complete
 *
 * After the last phase:
 *   - ROUND_END event increments the round counter and restarts from the first phase
 *   - Or onDone auto-advances (parallel) — triggers GAME_END transition in last phase
 *
 * GAME_END transitions to the top-level finished state from any phase.
 */
function buildPlayingState(config: GameFSMConfig): Record<string, unknown> {
  if (config.phases.length === 0) {
    throw new Error('GameFSMConfig must have at least one phase');
  }

  const firstPhaseId = config.phases[0].id;
  const phaseState = buildPhaseState(config);

  // Build states for each phase
  const phaseStates: Record<string, unknown> = {};
  for (let i = 0; i < config.phases.length; i++) {
    const phase = config.phases[i];
    const nextPhase = config.phases[i + 1];

    // Event-driven transitions available in every phase
    const onForPhase: Record<string, unknown> = {
      GAME_END: { target: '#gameFSM.finished' },
    };

    // onDone fires automatically when the phase's final state is reached
    // (i.e., when turn.onDone -> complete, phase reaches its own final sub-state)
    let onDoneForPhase: unknown;

    if (nextPhase) {
      // Not the last phase:
      // - Event path: PHASE_END advances to next phase (sequential turns)
      // - Auto path: onDone fires when turn completes (parallel turns)
      onForPhase['PHASE_END'] = { target: nextPhase.id };
      onDoneForPhase = { target: nextPhase.id };
    } else {
      // Last phase:
      // - Event path: ROUND_END increments round and restarts (sequential turns)
      // - Auto path: onDone -> GAME_END (parallel turns — game ends when last phase turn completes)
      onForPhase['ROUND_END'] = {
        target: firstPhaseId,
        actions: assign({
          round: ({ context }: { context: FSMContext }) => context.round + 1,
        }),
      };
      // When parallel last phase auto-completes, transition to finished
      onDoneForPhase = { target: '#gameFSM.finished' };
    }

    phaseStates[phase.id] = {
      ...phaseState,
      on: onForPhase,
      onDone: onDoneForPhase,
    };
  }

  return {
    initial: firstPhaseId,
    states: phaseStates,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an XState v5 machine from a GameFSMConfig.
 *
 * Usage:
 * ```ts
 * const machine = createGameFSM(config);
 * const actor = createActor(machine, { input: { gameState, round: 1, currentPlayerIndex: 0 } });
 * actor.start();
 * actor.send({ type: 'PHASE_END' });
 * ```
 *
 * @param config - Describes phases, stages, and turn mode
 * @returns An XState v5 StateMachine
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createGameFSM(config: GameFSMConfig) {
  const playingState = buildPlayingState(config);

  return createMachine(
    {
      id: 'gameFSM',
      initial: 'playing',
      // Input is mapped to context on machine start
      context: ({ input }: { input: FSMContext }) => ({
        gameState: input.gameState,
        round: input.round,
        currentPlayerIndex: input.currentPlayerIndex,
      }),
      states: {
        playing: {
          ...playingState,
          on: {
            // GAME_END available from any state within playing
            GAME_END: { target: 'finished' },
          },
        },
        finished: {
          type: 'final' as const,
        },
      },
    },
  );
}
