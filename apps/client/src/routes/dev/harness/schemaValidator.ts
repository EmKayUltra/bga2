/**
 * Schema Validator — validates game.json content against the expected GameConfig shape.
 * Runs on each game load/reload before bot validation.
 */

interface SchemaError {
  field: string;
  message: string;
}

/**
 * Validates a game.json object against the expected GameConfig shape.
 * Returns a list of errors. Empty list = valid.
 */
export function validateGameConfig(config: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  if (!config || typeof config !== 'object') {
    errors.push({ field: 'root', message: 'game.json must be a JSON object' });
    return errors;
  }
  const c = config as Record<string, unknown>;

  // Required string fields
  for (const field of ['id', 'version', 'title']) {
    if (typeof c[field] !== 'string') {
      errors.push({ field, message: `"${field}" must be a string` });
    }
  }

  // players
  if (!c.players || typeof c.players !== 'object') {
    errors.push({ field: 'players', message: '"players" must be an object with min/max' });
  } else {
    const p = c.players as Record<string, unknown>;
    if (typeof p.min !== 'number') errors.push({ field: 'players.min', message: '"players.min" must be a number' });
    if (typeof p.max !== 'number') errors.push({ field: 'players.max', message: '"players.max" must be a number' });
  }

  // zones
  if (!Array.isArray(c.zones)) {
    errors.push({ field: 'zones', message: '"zones" must be an array' });
  } else {
    const validTypes = ['grid', 'stack', 'hand', 'deck', 'discard', 'freeform'];
    (c.zones as unknown[]).forEach((z, i) => {
      const zone = z as Record<string, unknown>;
      if (typeof zone.id !== 'string') errors.push({ field: `zones[${i}].id`, message: 'zone id must be a string' });
      if (!validTypes.includes(zone.type as string)) errors.push({ field: `zones[${i}].type`, message: `zone type "${zone.type}" not in ${validTypes.join(', ')}` });
    });
  }

  // pieces
  if (!Array.isArray(c.pieces)) {
    errors.push({ field: 'pieces', message: '"pieces" must be an array' });
  } else {
    (c.pieces as unknown[]).forEach((p, i) => {
      const piece = p as Record<string, unknown>;
      if (typeof piece.id !== 'string') errors.push({ field: `pieces[${i}].id`, message: 'piece id must be a string' });
      if (typeof piece.type !== 'string') errors.push({ field: `pieces[${i}].type`, message: 'piece type must be a string' });
    });
  }

  // turnOrder
  const validTurnOrders = ['sequential', 'simultaneous', 'hook-controlled'];
  if (!validTurnOrders.includes(c.turnOrder as string)) {
    errors.push({ field: 'turnOrder', message: `"turnOrder" must be one of: ${validTurnOrders.join(', ')}` });
  }

  // hooks
  if (!c.hooks || typeof c.hooks !== 'object') {
    errors.push({ field: 'hooks', message: '"hooks" must be an object with file and events' });
  } else {
    const h = c.hooks as Record<string, unknown>;
    if (typeof h.file !== 'string') errors.push({ field: 'hooks.file', message: '"hooks.file" must be a string' });
    if (!Array.isArray(h.events)) errors.push({ field: 'hooks.events', message: '"hooks.events" must be an array' });
  }

  return errors;
}
