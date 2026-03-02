/**
 * Avatar rendering utility — maps avatar ID strings to emoji representations.
 * Phase 6 can replace emoji with real art assets without changing the ID scheme.
 *
 * Preset avatar IDs match ProfileService.PresetAvatars on the C# server.
 */

export const AVATAR_MAP: Record<string, string> = {
  knight: '🏇',
  wizard: '🧙',
  dragon: '🐉',
  phoenix: '🔥',
  castle: '🏰',
  crown: '👑',
  shield: '🛡️',
  sword: '⚔️',
  dice: '🎲',
  pawn: '♟️',
  rook: '♜',
  queen: '♛',
  joker: '🃏',
  crystal: '💎',
  scroll: '📜',
  compass: '🧭',
  default: '👤',
};

/**
 * Returns the emoji for an avatar ID. Falls back to '👤' for unknown IDs.
 */
export function getAvatarEmoji(avatarId: string): string {
  return AVATAR_MAP[avatarId] ?? AVATAR_MAP['default'];
}

/**
 * All preset avatar IDs in display order.
 */
export const PRESET_AVATAR_IDS = [
  'knight', 'wizard', 'dragon', 'phoenix',
  'castle', 'crown', 'shield', 'sword',
  'dice', 'pawn', 'rook', 'queen',
  'joker', 'crystal', 'scroll', 'compass',
] as const;

export type AvatarId = typeof PRESET_AVATAR_IDS[number] | 'default';
