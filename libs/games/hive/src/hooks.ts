/**
 * Hive game hook implementations.
 *
 * Implements getValidMoves, onMove, and onRoundEnd for complete standard Hive
 * rules supporting exactly 2 players.
 *
 * CRITICAL: All hook functions mutate ctx.state in place — never reassign ctx.state.
 * This is required by HookExecutor.cs which reads ctx.state back via JSON.stringify.
 *
 * JINT COMPATIBILITY: This file is self-contained — hex utilities are inlined here
 * because Jint does not support ES module imports. TypeScript type annotations are
 * stripped by HookExecutor.StripTypeScriptAnnotations before Jint execution.
 *
 * Move shapes:
 *   Place: { action: "place", source: "player-{i}-hand", target: "board", pieceId: "p0-queen-0", data: { q: 1, r: -1 } }
 *   Move:  { action: "move", source: "board", target: "board", pieceId: "p0-ant-0", data: { q: 3, r: -2 } }
 */
import type { HookContext, ValidMove, Move } from '@bga2/shared-types';

// ---------------------------------------------------------------------------
// Inlined hex utilities (must be self-contained for Jint — no imports allowed)
// ---------------------------------------------------------------------------

var HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function hexKey(q: number, r: number): string {
  return q + ',' + r;
}

function parseHexKey(key: string): { q: number; r: number } {
  var parts = key.split(',');
  return { q: parseInt(parts[0], 10), r: parseInt(parts[1], 10) };
}

function hexNeighbors(q: number, r: number): Array<{ q: number; r: number }> {
  return HEX_DIRECTIONS.map(function (d: { q: number; r: number }) {
    return { q: q + d.q, r: r + d.r };
  });
}

/**
 * Check if all occupied hexes remain connected after removing the given key.
 * Uses BFS. Returns true if the hive stays connected (or has 0-1 pieces left).
 */
function isConnectedWithout(occupiedKeys: { [key: string]: boolean }, excludeKey: string): boolean {
  var keys: string[] = [];
  for (var k in occupiedKeys) {
    if (occupiedKeys.hasOwnProperty(k) && k !== excludeKey) {
      keys.push(k);
    }
  }

  if (keys.length <= 1) return true;

  var visited: { [key: string]: boolean } = {};
  var queue: string[] = [keys[0]];
  visited[keys[0]] = true;
  var visitedCount = 1;

  while (queue.length > 0) {
    var current = queue.shift() as string;
    var coord = parseHexKey(current);
    var neighbors = hexNeighbors(coord.q, coord.r);

    for (var i = 0; i < neighbors.length; i++) {
      var nk = hexKey(neighbors[i].q, neighbors[i].r);
      if (!visited[nk] && occupiedKeys[nk] && nk !== excludeKey) {
        visited[nk] = true;
        visitedCount++;
        queue.push(nk);
      }
    }
  }

  return visitedCount === keys.length;
}

/**
 * Check if a piece can physically slide from (fromQ, fromR) to adjacent (toQ, toR).
 * Freedom-to-Move rule: both common neighbors must not simultaneously be occupied.
 * occupiedKeys does NOT include the moving piece's current position.
 */
function canSlide(
  occupiedKeys: { [key: string]: boolean },
  fromQ: number,
  fromR: number,
  toQ: number,
  toR: number
): boolean {
  var fromNeighbors = hexNeighbors(fromQ, fromR);
  var toNeighbors = hexNeighbors(toQ, toR);

  var commonNeighbors: Array<{ q: number; r: number }> = [];
  for (var i = 0; i < fromNeighbors.length; i++) {
    for (var j = 0; j < toNeighbors.length; j++) {
      if (fromNeighbors[i].q === toNeighbors[j].q && fromNeighbors[i].r === toNeighbors[j].r) {
        // Exclude from and to themselves
        if (!(fromNeighbors[i].q === fromQ && fromNeighbors[i].r === fromR) &&
            !(fromNeighbors[i].q === toQ && fromNeighbors[i].r === toR)) {
          commonNeighbors.push(fromNeighbors[i]);
        }
      }
    }
  }

  if (commonNeighbors.length === 2) {
    var key1 = hexKey(commonNeighbors[0].q, commonNeighbors[0].r);
    var key2 = hexKey(commonNeighbors[1].q, commonNeighbors[1].r);
    if (occupiedKeys[key1] && occupiedKeys[key2]) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Hive piece type constants
// ---------------------------------------------------------------------------

var PIECE_TYPES = {
  QUEEN: 'queen-bee',
  BEETLE: 'beetle',
  GRASSHOPPER: 'grasshopper',
  SPIDER: 'spider',
  ANT: 'soldier-ant',
};

// ---------------------------------------------------------------------------
// Board state helpers
// ---------------------------------------------------------------------------

/**
 * Build a top-of-stack occupancy map from board pieces.
 * Returns { hexKey: piece } where piece is the topmost piece at that hex.
 * For stacked beetles, the highest stackLevel piece wins.
 */
function buildOccupancyMap(boardPieces: any[]): { [key: string]: any } {
  var map: { [key: string]: any } = {};
  for (var i = 0; i < boardPieces.length; i++) {
    var p = boardPieces[i];
    var k = hexKey(p.state.q, p.state.r);
    if (!map[k] || p.state.stackLevel > map[k].state.stackLevel) {
      map[k] = p;
    }
  }
  return map;
}

/**
 * Build a plain occupied set (all hexes with any piece, including under-stack pieces).
 * Used for One Hive Rule checks.
 */
function buildFullOccupiedSet(boardPieces: any[]): { [key: string]: boolean } {
  var set: { [key: string]: boolean } = {};
  for (var i = 0; i < boardPieces.length; i++) {
    var p = boardPieces[i];
    set[hexKey(p.state.q, p.state.r)] = true;
  }
  return set;
}

/**
 * Count how many pieces are at a given hex (for beetle stacking).
 */
function stackCountAt(boardPieces: any[], q: number, r: number): number {
  var k = hexKey(q, r);
  var count = 0;
  for (var i = 0; i < boardPieces.length; i++) {
    if (hexKey(boardPieces[i].state.q, boardPieces[i].state.r) === k) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a hex is adjacent to any piece in the given occupancy map (or set).
 */
function isAdjacentToOccupied(occupiedSet: { [key: string]: boolean }, q: number, r: number): boolean {
  var neighbors = hexNeighbors(q, r);
  for (var i = 0; i < neighbors.length; i++) {
    if (occupiedSet[hexKey(neighbors[i].q, neighbors[i].r)]) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a hex is adjacent to any piece owned by a given player (using top-of-stack).
 */
function isAdjacentToFriendly(
  occupancyMap: { [key: string]: any },
  q: number,
  r: number,
  ownerIndex: number
): boolean {
  var neighbors = hexNeighbors(q, r);
  for (var i = 0; i < neighbors.length; i++) {
    var piece = occupancyMap[hexKey(neighbors[i].q, neighbors[i].r)];
    if (piece && piece.state.owner === ownerIndex) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a hex is adjacent to any piece owned by an enemy (not ownerIndex).
 */
function isAdjacentToEnemy(
  occupancyMap: { [key: string]: any },
  q: number,
  r: number,
  ownerIndex: number
): boolean {
  var neighbors = hexNeighbors(q, r);
  for (var i = 0; i < neighbors.length; i++) {
    var piece = occupancyMap[hexKey(neighbors[i].q, neighbors[i].r)];
    if (piece && piece.state.owner !== ownerIndex) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Movement algorithms
// ---------------------------------------------------------------------------

/**
 * Queen Bee movement: slides exactly 1 hex along the hive perimeter.
 * - Must remain adjacent to at least 1 other piece after moving (stays connected to hive)
 * - Sliding constraint (Freedom-to-Move) applies
 * - Target must be empty (no stacking)
 */
function queenMoves(
  piece: any,
  occupancyMap: { [key: string]: any },
  occupiedWithoutPiece: { [key: string]: boolean }
): Array<{ q: number; r: number }> {
  var fromQ = piece.state.q;
  var fromR = piece.state.r;
  var targets: Array<{ q: number; r: number }> = [];

  var neighbors = hexNeighbors(fromQ, fromR);
  for (var i = 0; i < neighbors.length; i++) {
    var toQ = neighbors[i].q;
    var toR = neighbors[i].r;
    var toKey = hexKey(toQ, toR);

    // Must be empty (queens cannot stack)
    if (occupancyMap[toKey]) continue;

    // Must be able to slide (Freedom-to-Move)
    if (!canSlide(occupiedWithoutPiece, fromQ, fromR, toQ, toR)) continue;

    // Must remain adjacent to the hive after moving
    // Create a temporary set: occupiedWithoutPiece + toKey to simulate new position
    var tempSet: { [key: string]: boolean } = {};
    for (var k in occupiedWithoutPiece) {
      if (occupiedWithoutPiece.hasOwnProperty(k)) tempSet[k] = true;
    }
    tempSet[toKey] = true;

    if (!isAdjacentToOccupied(tempSet, toQ, toR)) continue;

    targets.push({ q: toQ, r: toR });
  }

  return targets;
}

/**
 * Beetle movement: moves exactly 1 hex.
 * - Can move to empty adjacent hexes (sliding constraint applies at ground level)
 * - Can climb on top of adjacent occupied hexes (no sliding constraint when climbing/descending)
 * - When on top of another piece, can move to any adjacent hex (occupied or not)
 * - Must remain adjacent to hive after moving
 */
function beetleMoves(
  piece: any,
  boardPieces: any[],
  occupancyMap: { [key: string]: any },
  occupiedWithoutPiece: { [key: string]: boolean }
): Array<{ q: number; r: number }> {
  var fromQ = piece.state.q;
  var fromR = piece.state.r;
  var fromKey = hexKey(fromQ, fromR);
  var isOnTop = piece.state.stackLevel > 0;
  var targets: Array<{ q: number; r: number }> = [];

  var neighbors = hexNeighbors(fromQ, fromR);
  for (var i = 0; i < neighbors.length; i++) {
    var toQ = neighbors[i].q;
    var toR = neighbors[i].r;
    var toKey = hexKey(toQ, toR);
    var toOccupied = occupancyMap[toKey] !== undefined;

    if (isOnTop) {
      // Beetle on stack: can move anywhere adjacent (no sliding constraint needed)
      // Must still remain adjacent to hive after moving
      var tempSet2: { [key: string]: boolean } = {};
      for (var k2 in occupiedWithoutPiece) {
        if (occupiedWithoutPiece.hasOwnProperty(k2)) tempSet2[k2] = true;
      }
      if (!toOccupied) tempSet2[toKey] = true;

      // Check if target is adjacent to hive (or is directly on hive)
      if (!toOccupied && !isAdjacentToOccupied(tempSet2, toQ, toR)) continue;

      targets.push({ q: toQ, r: toR });
    } else {
      // Beetle at ground level
      if (toOccupied) {
        // Climbing onto a piece: no sliding constraint, always allowed
        targets.push({ q: toQ, r: toR });
      } else {
        // Sliding to empty hex: apply Freedom-to-Move constraint
        if (!canSlide(occupiedWithoutPiece, fromQ, fromR, toQ, toR)) continue;

        // Must remain adjacent to hive after moving
        var tempSet3: { [key: string]: boolean } = {};
        for (var k3 in occupiedWithoutPiece) {
          if (occupiedWithoutPiece.hasOwnProperty(k3)) tempSet3[k3] = true;
        }
        tempSet3[toKey] = true;
        if (!isAdjacentToOccupied(tempSet3, toQ, toR)) continue;

        targets.push({ q: toQ, r: toR });
      }
    }
  }

  return targets;
}

/**
 * Grasshopper movement: jumps in a straight line over 1+ occupied hexes.
 * - Must jump over at least 1 piece (cannot move to adjacent empty hex)
 * - Lands on first empty hex in the jump direction
 * - Can jump in any of the 6 directions where the adjacent hex is occupied
 */
function grasshopperMoves(
  piece: any,
  occupancyMap: { [key: string]: any }
): Array<{ q: number; r: number }> {
  var fromQ = piece.state.q;
  var fromR = piece.state.r;
  var targets: Array<{ q: number; r: number }> = [];

  for (var d = 0; d < HEX_DIRECTIONS.length; d++) {
    var dq = HEX_DIRECTIONS[d].q;
    var dr = HEX_DIRECTIONS[d].r;

    // First step in direction must be occupied
    var firstQ = fromQ + dq;
    var firstR = fromR + dr;
    if (!occupancyMap[hexKey(firstQ, firstR)]) continue;

    // Continue in direction until empty hex found
    var curQ = firstQ + dq;
    var curR = firstR + dr;
    var maxSteps = 100; // safety limit
    var steps = 0;
    while (occupancyMap[hexKey(curQ, curR)] && steps < maxSteps) {
      curQ += dq;
      curR += dr;
      steps++;
    }

    // curQ, curR is now the first empty hex in this direction
    targets.push({ q: curQ, r: curR });
  }

  return targets;
}

/**
 * Spider movement: moves exactly 3 steps along the hive perimeter.
 * - Each step must be a sliding move (Freedom-to-Move applies)
 * - Must remain adjacent to hive at each step
 * - Cannot revisit a hex in the same path
 * - Uses DFS to depth exactly 3; collects all unique destinations at depth 3
 */
function spiderMoves(
  piece: any,
  occupancyMap: { [key: string]: any },
  occupiedWithoutPiece: { [key: string]: boolean }
): Array<{ q: number; r: number }> {
  var fromQ = piece.state.q;
  var fromR = piece.state.r;
  var destinations: { [key: string]: boolean } = {};

  // DFS with path tracking
  function dfs(curQ: number, curR: number, depth: number, visited: { [key: string]: boolean }): void {
    if (depth === 3) {
      var destKey = hexKey(curQ, curR);
      // Must not be the starting hex (cannot loop back to start)
      if (destKey !== hexKey(fromQ, fromR)) {
        destinations[destKey] = true;
      }
      return;
    }

    var neighbors = hexNeighbors(curQ, curR);
    for (var i = 0; i < neighbors.length; i++) {
      var toQ = neighbors[i].q;
      var toR = neighbors[i].r;
      var toKey = hexKey(toQ, toR);

      // Must be empty
      if (occupancyMap[toKey]) continue;
      // Cannot revisit
      if (visited[toKey]) continue;

      // Must be able to slide (Freedom-to-Move)
      if (!canSlide(occupiedWithoutPiece, curQ, curR, toQ, toR)) continue;

      // Must remain adjacent to hive after moving
      var tempSet: { [key: string]: boolean } = {};
      for (var k in occupiedWithoutPiece) {
        if (occupiedWithoutPiece.hasOwnProperty(k)) tempSet[k] = true;
      }
      tempSet[toKey] = true;
      if (!isAdjacentToOccupied(tempSet, toQ, toR)) continue;

      var newVisited: { [key: string]: boolean } = {};
      for (var vk in visited) {
        if (visited.hasOwnProperty(vk)) newVisited[vk] = true;
      }
      newVisited[toKey] = true;

      dfs(toQ, toR, depth + 1, newVisited);
    }
  }

  var startVisited: { [key: string]: boolean } = {};
  startVisited[hexKey(fromQ, fromR)] = true;
  dfs(fromQ, fromR, 0, startVisited);

  var targets: Array<{ q: number; r: number }> = [];
  for (var k in destinations) {
    if (destinations.hasOwnProperty(k)) {
      targets.push(parseHexKey(k));
    }
  }
  return targets;
}

/**
 * Soldier Ant movement: can move to any reachable empty hex along the hive perimeter.
 * - BFS of unlimited depth
 * - Each step must be a sliding move (Freedom-to-Move applies)
 * - Must remain adjacent to hive at each step
 * - Cannot return to the starting hex
 */
function soldierAntMoves(
  piece: any,
  occupancyMap: { [key: string]: any },
  occupiedWithoutPiece: { [key: string]: boolean }
): Array<{ q: number; r: number }> {
  var fromQ = piece.state.q;
  var fromR = piece.state.r;
  var fromKey = hexKey(fromQ, fromR);
  var reachable: { [key: string]: boolean } = {};
  var queue: Array<{ q: number; r: number }> = [{ q: fromQ, r: fromR }];
  var inQueue: { [key: string]: boolean } = {};
  inQueue[fromKey] = true;

  while (queue.length > 0) {
    var cur = queue.shift() as { q: number; r: number };
    var neighbors = hexNeighbors(cur.q, cur.r);

    for (var i = 0; i < neighbors.length; i++) {
      var toQ = neighbors[i].q;
      var toR = neighbors[i].r;
      var toKey = hexKey(toQ, toR);

      // Must be empty
      if (occupancyMap[toKey]) continue;
      // Already visited
      if (inQueue[toKey]) continue;

      // Must be able to slide
      if (!canSlide(occupiedWithoutPiece, cur.q, cur.r, toQ, toR)) continue;

      // Must remain adjacent to hive after moving
      var tempSet: { [key: string]: boolean } = {};
      for (var k in occupiedWithoutPiece) {
        if (occupiedWithoutPiece.hasOwnProperty(k)) tempSet[k] = true;
      }
      tempSet[toKey] = true;
      if (!isAdjacentToOccupied(tempSet, toQ, toR)) continue;

      inQueue[toKey] = true;
      // Not the starting position
      if (toKey !== fromKey) {
        reachable[toKey] = true;
      }
      queue.push({ q: toQ, r: toR });
    }
  }

  var targets: Array<{ q: number; r: number }> = [];
  for (var k in reachable) {
    if (reachable.hasOwnProperty(k)) {
      targets.push(parseHexKey(k));
    }
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Win condition check
// ---------------------------------------------------------------------------

/**
 * Check if a queen is completely surrounded (all 6 neighbors occupied).
 * Returns true if surrounded.
 */
function isQueenSurrounded(queenPiece: any, fullOccupiedSet: { [key: string]: boolean }): boolean {
  if (!queenPiece) return false;
  var neighbors = hexNeighbors(queenPiece.state.q, queenPiece.state.r);
  for (var i = 0; i < neighbors.length; i++) {
    if (!fullOccupiedSet[hexKey(neighbors[i].q, neighbors[i].r)]) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main hook: getValidMoves
// ---------------------------------------------------------------------------

export function getValidMoves(ctx: HookContext): ValidMove[] {
  var state = ctx.state;
  if (state.finished) return [];
  var playerIndex = state.currentPlayerIndex;
  var player = state.players[playerIndex];
  var playerData = player.data as any;
  var turnNumber = (playerData.turnNumber as number) || 0;
  var queenPlaced = (playerData.queenPlaced as boolean) || false;

  var handZoneId = 'player-' + playerIndex + '-hand';
  var handZone = state.zones[handZoneId];
  var boardZone = state.zones['board'];
  var boardPieces: any[] = boardZone ? (boardZone.pieces as any[]) : [];
  var handPieces: any[] = handZone ? (handZone.pieces as any[]) : [];

  // Build board state
  var occupancyMap = buildOccupancyMap(boardPieces);
  var fullOccupiedSet = buildFullOccupiedSet(boardPieces);
  var validMoves: ValidMove[] = [];

  // -------------------------------------------------------------------------
  // PLACEMENT MOVES
  // -------------------------------------------------------------------------
  var pieceTypesInHand: { [defId: string]: any } = {};
  for (var hi = 0; hi < handPieces.length; hi++) {
    var hp = handPieces[hi];
    if (!pieceTypesInHand[hp.defId]) {
      pieceTypesInHand[hp.defId] = hp;
    }
  }

  // If queen is not placed and turn >= 4 (0-indexed: turn 3 is the 4th turn),
  // forced queen placement — only queen placements allowed
  var forceQueen = !queenPlaced && turnNumber >= 3;
  if (forceQueen) {
    // Remove all non-queen piece types from candidates
    for (var defId in pieceTypesInHand) {
      if (defId !== PIECE_TYPES.QUEEN) {
        delete pieceTypesInHand[defId];
      }
    }
  }

  if (Object.keys(pieceTypesInHand).length > 0) {
    // Determine valid placement hexes
    var placementHexes: Array<{ q: number; r: number }> = [];

    if (boardPieces.length === 0) {
      // First piece: only (0, 0)
      placementHexes.push({ q: 0, r: 0 });
    } else if (boardPieces.length === 1) {
      // Second piece (first move of second player): must be adjacent to the only piece
      var onlyPiece = boardPieces[0];
      var adjToFirst = hexNeighbors(onlyPiece.state.q, onlyPiece.state.r);
      for (var ai = 0; ai < adjToFirst.length; ai++) {
        placementHexes.push({ q: adjToFirst[ai].q, r: adjToFirst[ai].r });
      }
    } else {
      // General case: find all empty hexes adjacent to a friendly piece
      // that are NOT adjacent to any enemy piece
      var checkedHexes: { [key: string]: boolean } = {};

      for (var bi = 0; bi < boardPieces.length; bi++) {
        var bp = boardPieces[bi];
        // Only check pieces owned by the current player (top-of-stack)
        var bpKey = hexKey(bp.state.q, bp.state.r);
        if (occupancyMap[bpKey] !== bp) continue; // not top of stack
        if (bp.state.owner !== playerIndex) continue;

        var adjHexes = hexNeighbors(bp.state.q, bp.state.r);
        for (var aj = 0; aj < adjHexes.length; aj++) {
          var adjKey = hexKey(adjHexes[aj].q, adjHexes[aj].r);
          if (checkedHexes[adjKey]) continue;
          checkedHexes[adjKey] = true;

          // Must be empty
          if (occupancyMap[adjKey]) continue;

          // Must not be adjacent to any enemy piece
          if (isAdjacentToEnemy(occupancyMap, adjHexes[aj].q, adjHexes[aj].r, playerIndex)) continue;

          placementHexes.push({ q: adjHexes[aj].q, r: adjHexes[aj].r });
        }
      }
    }

    // Generate placement moves for each piece type in hand at each valid hex.
    // Each valid move includes data: { q, r } so the client and server can use the
    // coordinate directly without encoding it separately.
    for (var pi = 0; pi < placementHexes.length; pi++) {
      var ph = placementHexes[pi];
      for (var defId2 in pieceTypesInHand) {
        if (!pieceTypesInHand.hasOwnProperty(defId2)) continue;
        // Find one representative piece ID of this type in hand
        for (var hj = 0; hj < handPieces.length; hj++) {
          if (handPieces[hj].defId === defId2) {
            validMoves.push({
              action: 'place',
              source: handZoneId,
              target: 'board',
              pieceId: handPieces[hj].id,
              description: 'Place ' + defId2 + ' at (' + ph.q + ',' + ph.r + ')',
              data: { q: ph.q, r: ph.r },
            } as any);
            break; // one representative per type per hex is enough for validation
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // MOVEMENT MOVES (only when queen is placed)
  // -------------------------------------------------------------------------
  if (queenPlaced && boardPieces.length >= 2) {
    for (var mi = 0; mi < boardPieces.length; mi++) {
      var mp = boardPieces[mi];

      // Only move current player's pieces
      if (mp.state.owner !== playerIndex) continue;

      // Only move top-of-stack pieces (beetles under another piece cannot move)
      var mpKey = hexKey(mp.state.q, mp.state.r);
      if (occupancyMap[mpKey] !== mp) continue;

      // One Hive Rule: removing this piece must not disconnect the hive
      // Exception: beetle on top of stack does not disconnect (underlying piece stays)
      var pieceDisconnects = false;
      if (mp.state.stackLevel === 0) {
        // Ground-level piece — check connectivity without this piece
        if (!isConnectedWithout(fullOccupiedSet, mpKey)) {
          pieceDisconnects = true;
        }
      }
      if (pieceDisconnects) continue;

      // Build occupancy without this piece (for sliding constraint checks)
      var occupiedWithout: { [key: string]: boolean } = {};
      if (mp.state.stackLevel > 0) {
        // Beetle on stack: use full occupied set (piece below remains)
        for (var ok in fullOccupiedSet) {
          if (fullOccupiedSet.hasOwnProperty(ok)) occupiedWithout[ok] = true;
        }
        // But remove the beetle's own presence at this hex from the "sliding obstacle" perspective
        // Actually for a beetle on stack, the hex is still occupied by the piece below
        // so we keep fullOccupiedSet as-is but remove the beetle piece from occupancyMap for target checks
      } else {
        // Ground piece: remove this piece's hex
        for (var ok2 in fullOccupiedSet) {
          if (fullOccupiedSet.hasOwnProperty(ok2) && ok2 !== mpKey) {
            occupiedWithout[ok2] = true;
          }
        }
      }

      // Build occupancy map without this piece (for movement target checks)
      var occMapWithout: { [key: string]: any } = {};
      for (var omk in occupancyMap) {
        if (occupancyMap.hasOwnProperty(omk) && omk !== mpKey) {
          occMapWithout[omk] = occupancyMap[omk];
        }
      }
      // For beetle on stack: the hex below is still occupied by the underlying piece
      if (mp.state.stackLevel > 0) {
        // Find the piece below this beetle
        var maxBelow = -1;
        var pieceBelow: any = null;
        for (var pbi = 0; pbi < boardPieces.length; pbi++) {
          var pb = boardPieces[pbi];
          if (hexKey(pb.state.q, pb.state.r) === mpKey && pb.id !== mp.id) {
            if (pb.state.stackLevel > maxBelow) {
              maxBelow = pb.state.stackLevel;
              pieceBelow = pb;
            }
          }
        }
        if (pieceBelow) {
          occMapWithout[mpKey] = pieceBelow;
        }
      }

      var targets2: Array<{ q: number; r: number }> = [];

      if (mp.defId === PIECE_TYPES.QUEEN) {
        targets2 = queenMoves(mp, occMapWithout, occupiedWithout);
      } else if (mp.defId === PIECE_TYPES.BEETLE) {
        targets2 = beetleMoves(mp, boardPieces, occMapWithout, occupiedWithout);
      } else if (mp.defId === PIECE_TYPES.GRASSHOPPER) {
        targets2 = grasshopperMoves(mp, occMapWithout);
      } else if (mp.defId === PIECE_TYPES.SPIDER) {
        targets2 = spiderMoves(mp, occMapWithout, occupiedWithout);
      } else if (mp.defId === PIECE_TYPES.ANT) {
        targets2 = soldierAntMoves(mp, occMapWithout, occupiedWithout);
      }

      for (var ti = 0; ti < targets2.length; ti++) {
        validMoves.push({
          action: 'move',
          source: 'board',
          target: 'board',
          pieceId: mp.id,
          description: 'Move ' + mp.defId + ' to (' + targets2[ti].q + ',' + targets2[ti].r + ')',
          data: { q: targets2[ti].q, r: targets2[ti].r },
        } as any);
      }
    }
  }

  return validMoves;
}

// ---------------------------------------------------------------------------
// Main hook: onMove
// ---------------------------------------------------------------------------

export function onMove(ctx: HookContext, move: Move): void {
  var state = ctx.state;
  var playerIndex = state.currentPlayerIndex;
  var action = move.action;
  var moveData = (move as any).data as any;

  var boardZone = state.zones['board'];
  if (!boardZone) {
    state.zones['board'] = { id: 'board', pieces: [] } as any;
    boardZone = state.zones['board'];
  }
  var boardPieces: any[] = boardZone.pieces as any[];

  if (action === 'place') {
    var handZoneId = 'player-' + playerIndex + '-hand';
    var handZone = state.zones[handZoneId];
    if (!handZone) return;
    var handPieces: any[] = handZone.pieces as any[];

    // Find the piece in hand
    var pieceIndex = -1;
    for (var i = 0; i < handPieces.length; i++) {
      if (handPieces[i].id === move.pieceId) {
        pieceIndex = i;
        break;
      }
    }
    if (pieceIndex === -1) return;

    var piece = handPieces[pieceIndex];

    // Remove from hand
    handPieces.splice(pieceIndex, 1);

    // Add to board with coordinates from move.data
    var targetQ = moveData ? moveData.q : 0;
    var targetR = moveData ? moveData.r : 0;
    piece.zoneId = 'board';
    piece.state = { q: targetQ, r: targetR, stackLevel: 0, owner: playerIndex };
    boardPieces.push(piece);

    // Update player data
    var playerData = state.players[playerIndex].data as any;
    playerData.turnNumber = ((playerData.turnNumber as number) || 0) + 1;
    if (piece.defId === PIECE_TYPES.QUEEN) {
      playerData.queenPlaced = true;
    }
  } else if (action === 'move') {
    // Find the piece on the board
    var movingPiece: any = null;
    for (var j = 0; j < boardPieces.length; j++) {
      if (boardPieces[j].id === move.pieceId) {
        movingPiece = boardPieces[j];
        break;
      }
    }
    if (!movingPiece) return;

    var targetQ2 = moveData ? moveData.q : 0;
    var targetR2 = moveData ? moveData.r : 0;
    var targetKey = hexKey(targetQ2, targetR2);

    // Beetle stacking: check if target hex is occupied
    var occupancyMap2 = buildOccupancyMap(boardPieces);
    var targetPiece = occupancyMap2[targetKey];

    if (targetPiece && movingPiece.defId === PIECE_TYPES.BEETLE) {
      // Climbing: stack level = top piece's stack level + 1
      movingPiece.state.q = targetQ2;
      movingPiece.state.r = targetR2;
      movingPiece.state.stackLevel = targetPiece.state.stackLevel + 1;
    } else {
      // Regular ground-level move
      movingPiece.state.q = targetQ2;
      movingPiece.state.r = targetR2;
      movingPiece.state.stackLevel = 0;
    }

    // Update player turn number
    var playerData2 = state.players[playerIndex].data as any;
    playerData2.turnNumber = ((playerData2.turnNumber as number) || 0) + 1;
  }

  // -------------------------------------------------------------------------
  // Win condition check: is any queen completely surrounded?
  // -------------------------------------------------------------------------
  var fullOccupied2 = buildFullOccupiedSet(boardPieces);

  // Find both queens
  var queens: any[] = [];
  for (var qi = 0; qi < boardPieces.length; qi++) {
    if (boardPieces[qi].defId === PIECE_TYPES.QUEEN) {
      queens.push(boardPieces[qi]);
    }
  }

  var player0QueenSurrounded = false;
  var player1QueenSurrounded = false;

  for (var qj = 0; qj < queens.length; qj++) {
    var q = queens[qj];
    if (isQueenSurrounded(q, fullOccupied2)) {
      if (q.state.owner === 0) {
        player0QueenSurrounded = true;
      } else {
        player1QueenSurrounded = true;
      }
    }
  }

  if (player0QueenSurrounded || player1QueenSurrounded) {
    state.finished = true;
    if (player0QueenSurrounded && player1QueenSurrounded) {
      // Draw: both queens surrounded simultaneously (last mover's queen surrounded = they lose)
      // By convention: the player who moved last caused their own queen to be surrounded
      // This is an edge case; we declare the current player (who just moved) as the loser
      state.winnerId = 'player-' + (1 - playerIndex);
    } else if (player0QueenSurrounded) {
      state.winnerId = 'player-1';
    } else {
      state.winnerId = 'player-0';
    }
    // Update scores
    if (state.winnerId) {
      var winnerIdx = state.winnerId === 'player-0' ? 0 : 1;
      state.players[winnerIdx].score = 1;
    }
  }

  // -------------------------------------------------------------------------
  // Advance turn (only if game is not over)
  // -------------------------------------------------------------------------
  if (!state.finished) {
    state.currentPlayerIndex = 1 - playerIndex;
  }
}

// ---------------------------------------------------------------------------
// Main hook: onRoundEnd
// ---------------------------------------------------------------------------

export function onRoundEnd(ctx: HookContext): void {
  // Hive does not have discrete rounds — game ends via win condition in onMove.
  // This is a no-op.
}
