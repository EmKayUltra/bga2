/**
 * GameLoader — parses a GameConfig into a RuntimeGameModel.
 *
 * The loader is the bridge between the declarative game.json and the live
 * runtime objects that the FSM can operate on and the renderer can display.
 *
 * Responsibilities:
 * - Validate GameConfig (required fields, unique ids)
 * - Create Zone instances via ZoneFactory
 * - Create Piece instances via PieceFactory
 * - Return a RuntimeGameModel with indexed lookups
 *
 * Not responsible for:
 * - Loading or executing hooks (that's the server's job)
 * - Network or I/O (caller supplies the parsed GameConfig object)
 */

import type { GameConfig, PieceDef } from '@bga2/shared-types';
import { ZoneFactory } from '../zones/ZoneFactory.js';
import { PieceFactory } from '../pieces/PieceFactory.js';
import type { Zone } from '../zones/Zone.js';
import type { Piece } from '../pieces/Piece.js';

// ─── Runtime model ────────────────────────────────────────────────────────────

export interface RuntimeGameModel {
  /** The original parsed config. */
  config: GameConfig;

  /** All zone instances, keyed by zone id. */
  zones: Map<string, Zone>;

  /** All piece definitions, keyed by def id. */
  pieceDefs: Map<string, PieceDef>;

  /** All piece runtime instances (flat array). */
  pieces: Piece[];

  /** Look up a zone by id (throws if not found). */
  getZone(id: string): Zone;

  /** Look up a piece instance by id (throws if not found). */
  getPiece(id: string): Piece;
}

// ─── GameLoader ───────────────────────────────────────────────────────────────

export const GameLoader = {
  /**
   * Parse a GameConfig and return a fully-instantiated RuntimeGameModel.
   *
   * @throws Error if the config is invalid (missing fields, duplicate ids)
   */
  load(config: GameConfig): RuntimeGameModel {
    // ── Validate ──────────────────────────────────────────────────────────────
    validateConfig(config);

    // ── Build zones ───────────────────────────────────────────────────────────
    const zones = new Map<string, Zone>();
    for (const def of config.zones) {
      zones.set(def.id, ZoneFactory.createZone(def));
    }

    // ── Build piece defs ──────────────────────────────────────────────────────
    const pieceDefs = new Map<string, PieceDef>();
    for (const def of config.pieces) {
      pieceDefs.set(def.id, def);
    }

    // ── Build piece instances ─────────────────────────────────────────────────
    // Default count = 1 per def. Game-specific quantities would come from
    // a `counts` field in GameConfig (future extension).
    const pieces = PieceFactory.createPieces(config.pieces);

    // ── Build piece lookup ────────────────────────────────────────────────────
    const pieceIndex = new Map<string, Piece>();
    for (const piece of pieces) {
      pieceIndex.set(piece.id, piece);
    }

    // ── Assemble model ────────────────────────────────────────────────────────
    return {
      config,
      zones,
      pieceDefs,
      pieces,
      getZone(id: string): Zone {
        const zone = zones.get(id);
        if (!zone) throw new Error(`RuntimeGameModel: zone "${id}" not found`);
        return zone;
      },
      getPiece(id: string): Piece {
        const piece = pieceIndex.get(id);
        if (!piece) throw new Error(`RuntimeGameModel: piece "${id}" not found`);
        return piece;
      },
    };
  },
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateConfig(config: GameConfig): void {
  // Required top-level fields
  if (!config.id) throw new Error('GameConfig: missing required field "id"');
  if (!config.version) throw new Error('GameConfig: missing required field "version"');
  if (!config.title) throw new Error('GameConfig: missing required field "title"');

  // Unique zone ids
  const zoneIds = new Set<string>();
  for (const zone of config.zones) {
    if (zoneIds.has(zone.id)) {
      throw new Error(`GameConfig: duplicate zone id "${zone.id}"`);
    }
    zoneIds.add(zone.id);
  }

  // Unique piece def ids
  const pieceIds = new Set<string>();
  for (const piece of config.pieces) {
    if (pieceIds.has(piece.id)) {
      throw new Error(`GameConfig: duplicate piece id "${piece.id}"`);
    }
    pieceIds.add(piece.id);
  }
}
