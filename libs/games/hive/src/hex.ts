/**
 * Axial hex coordinate utilities for Hive.
 * Source: https://www.redblobgames.com/grids/hexagons/
 *
 * Uses axial coordinates (q, r) where the third coordinate s = -q - r.
 * Pointy-top orientation.
 *
 * NOTE: This file is used for unit testing and type-checked development.
 * The hooks.ts file must inline these utilities because Jint does not support imports.
 */

/** All 6 neighbor direction offsets (pointy-top hexes). */
export const HEX_DIRECTIONS: Array<{ q: number; r: number }> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Create a string key from hex coordinates for use as Map/object keys. */
export function hexKey(q: number, r: number): string {
  return q + ',' + r;
}

/** Parse a hex key back to coordinates. */
export function parseHexKey(key: string): { q: number; r: number } {
  const parts = key.split(',');
  return { q: parseInt(parts[0], 10), r: parseInt(parts[1], 10) };
}

/** Get all 6 neighbor coordinates of a hex. */
export function hexNeighbors(q: number, r: number): Array<{ q: number; r: number }> {
  return HEX_DIRECTIONS.map(function (d) {
    return { q: q + d.q, r: r + d.r };
  });
}

/** Manhattan distance between two axial hex coordinates. */
export function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs((-a.q - a.r) - (-b.q - b.r));
  return Math.max(dq, dr, ds);
}

/**
 * Convert axial hex coordinate to pixel position (pointy-top orientation).
 * @param size Half the hex width (distance from center to corner).
 */
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r),
    y: size * (3 / 2 * r),
  };
}

/**
 * Check if all pieces in the occupied set remain connected after removing one hex.
 * Uses BFS from any remaining piece. Returns true if connected (or <= 1 piece left).
 *
 * @param occupiedKeys Set of hex key strings that are occupied (e.g., "0,0", "1,-1")
 * @param excludeKey The hex key to exclude (simulating removal of that piece)
 */
export function isConnectedWithout(occupiedKeys: Set<string>, excludeKey: string): boolean {
  const remaining: string[] = [];
  occupiedKeys.forEach(function (key) {
    if (key !== excludeKey) remaining.push(key);
  });

  if (remaining.length === 0) return true;
  if (remaining.length === 1) return true;

  const visited = new Set<string>();
  const queue: string[] = [remaining[0]];
  visited.add(remaining[0]);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const coord = parseHexKey(current);
    const neighbors = hexNeighbors(coord.q, coord.r);

    for (let i = 0; i < neighbors.length; i++) {
      const nk = hexKey(neighbors[i].q, neighbors[i].r);
      if (!visited.has(nk) && occupiedKeys.has(nk) && nk !== excludeKey) {
        visited.add(nk);
        queue.push(nk);
      }
    }
  }

  return visited.size === remaining.length;
}

/**
 * Check if a piece can physically slide from one hex to an adjacent hex.
 * Freedom-to-Move rule: there must not be two pieces on both sides of the gap
 * (a "gate" blocking the sliding path).
 *
 * For a piece at (fromQ, fromR) sliding to neighbor (toQ, toR):
 * The two hexes adjacent to BOTH from and to must not BOTH be occupied.
 *
 * @param occupiedKeys Set of occupied hex keys (NOT including the moving piece's current position)
 * @param fromQ Source Q coordinate
 * @param fromR Source R coordinate
 * @param toQ Target Q coordinate
 * @param toR Target R coordinate
 */
export function canSlide(
  occupiedKeys: Set<string>,
  fromQ: number,
  fromR: number,
  toQ: number,
  toR: number
): boolean {
  // Find the two common neighbors of from and to
  // These are the hexes that share edges with both from and to
  const fromNeighbors = hexNeighbors(fromQ, fromR);
  const toNeighbors = hexNeighbors(toQ, toR);

  const commonNeighbors: Array<{ q: number; r: number }> = [];
  for (let i = 0; i < fromNeighbors.length; i++) {
    for (let j = 0; j < toNeighbors.length; j++) {
      if (fromNeighbors[i].q === toNeighbors[j].q && fromNeighbors[i].r === toNeighbors[j].r) {
        // Exclude from and to themselves
        if (!(fromNeighbors[i].q === fromQ && fromNeighbors[i].r === fromR) &&
            !(fromNeighbors[i].q === toQ && fromNeighbors[i].r === toR)) {
          commonNeighbors.push(fromNeighbors[i]);
        }
      }
    }
  }

  // If both common neighbors are occupied, the piece cannot slide through (gate blocked)
  if (commonNeighbors.length === 2) {
    const key1 = hexKey(commonNeighbors[0].q, commonNeighbors[0].r);
    const key2 = hexKey(commonNeighbors[1].q, commonNeighbors[1].r);
    if (occupiedKeys.has(key1) && occupiedKeys.has(key2)) {
      return false;
    }
  }

  return true;
}
