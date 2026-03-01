/**
 * ZoneFactory — creates Zone instances from declarative ZoneDef objects.
 */

import type { ZoneDef } from '@bga2/shared-types';
import {
  GridZone,
  StackZone,
  HandZone,
  DeckZone,
  DiscardZone,
  type Zone,
} from './Zone.js';

export const ZoneFactory = {
  createZone(def: ZoneDef): Zone {
    switch (def.type) {
      case 'grid':
        return new GridZone(def);
      case 'stack':
        return new StackZone(def);
      case 'hand':
        return new HandZone(def);
      case 'deck':
        return new DeckZone(def);
      case 'discard':
        return new DiscardZone(def);
      default: {
        const _exhaustive: never = def.type;
        throw new Error(`ZoneFactory: unknown zone type "${String(_exhaustive)}"`);
      }
    }
  },
};
