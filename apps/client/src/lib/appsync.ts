/**
 * appsync — Amplify Events configuration and subscription helpers.
 *
 * Provides real-time game state synchronization and chat via AppSync Events WebSocket.
 * When AppSync is not configured (no env vars), all functions degrade gracefully:
 *   - configureAppSync() logs a warning and returns
 *   - subscribeToGame() returns null (no subscription)
 *   - subscribeToChatChannel() returns null (no chat subscription)
 *   - The game falls back to REST polling (page refresh to see opponent moves)
 *
 * IMPORTANT: All Amplify code MUST run ONLY in the browser — inside onMount or
 * guarded by `browser` from `$app/environment`. Node.js 20 does not have native
 * WebSocket, so Amplify will crash if imported during SSR.
 *
 * Lifecycle:
 *   1. configureAppSync() — call once on mount (idempotent via `configured` flag)
 *   2. subscribeToGame(sessionId, onStateUpdate) — returns a cleanup fn or null
 *   3. subscribeToChatChannel(channelId, onMessage) — returns a cleanup fn or null
 *   4. Call the cleanup fn in onDestroy to close the WebSocket channel
 */

import { Amplify } from 'aws-amplify';
import { events } from 'aws-amplify/data';

let configured = false;

/**
 * Configure Amplify with AppSync Events credentials from environment.
 * Safe to call multiple times — subsequent calls are no-ops.
 * Must be called from browser context only (onMount).
 */
export function configureAppSync(): void {
  if (configured) return;

  const endpoint = import.meta.env.VITE_APPSYNC_HTTP_ENDPOINT;
  const apiKey = import.meta.env.VITE_APPSYNC_API_KEY;

  if (!endpoint || !apiKey) {
    console.warn('[AppSync] Not configured — real-time disabled. Set VITE_APPSYNC_HTTP_ENDPOINT and VITE_APPSYNC_API_KEY.');
    return;
  }

  Amplify.configure({
    API: {
      Events: {
        endpoint,
        region: 'us-east-1',
        defaultAuthMode: 'apiKey',
        apiKey,
      },
    },
  });

  configured = true;
  console.info('[AppSync] Configured — real-time enabled');
}

/**
 * Subscribe to game state updates for a given session.
 *
 * The callback is called whenever the server publishes a new state via AppSync
 * Events after a successful move. Subscribers on both players' tabs receive the
 * update within ~1 second of the move being applied.
 *
 * @param sessionId - The game session UUID
 * @param onStateUpdate - Callback called with (stateJson, version) on each update
 * @returns Cleanup function to close the channel subscription, or null if AppSync
 *          is not configured (graceful degradation).
 */
export async function subscribeToGame(
  sessionId: string,
  onStateUpdate: (stateJson: string, version: number) => void,
): Promise<(() => void) | null> {
  if (!configured) {
    console.info('[AppSync] Skipping subscription — not configured');
    return null;
  }

  try {
    const channel = await events.connect(`/game/${sessionId}/state`);

    channel.subscribe({
      next: (data: Record<string, unknown>) => {
        // AppSync Events delivers payload in data.event — may be string or object
        try {
          const parsed = typeof data['event'] === 'string'
            ? (JSON.parse(data['event'] as string) as { state?: string; version?: number })
            : (data['event'] as { state?: string; version?: number } | undefined);

          if (parsed?.state !== undefined && parsed?.version !== undefined) {
            console.debug(`[AppSync] Received state update for session ${sessionId}, version ${parsed.version}`);
            onStateUpdate(parsed.state, parsed.version);
          } else {
            console.warn('[AppSync] Received malformed event payload:', data);
          }
        } catch (err) {
          console.error('[AppSync] Failed to parse event payload:', err, data);
        }
      },
      error: (err: unknown) => {
        console.error('[AppSync] Subscription error:', err);
      },
    });

    console.info(`[AppSync] Subscribed to /game/${sessionId}/state`);

    // Return cleanup function
    return () => {
      console.info(`[AppSync] Closing subscription for session ${sessionId}`);
      channel.close();
    };
  } catch (err) {
    console.error('[AppSync] Failed to subscribe:', err);
    return null;
  }
}

/**
 * Chat message payload received from AppSync Events /game/{channelId}/chat channel.
 * Published by the server after filtering the message for profanity.
 */
export interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  timestamp: string;
}

/**
 * Subscribe to the chat channel for a given session or table.
 *
 * The callback is called whenever the server publishes a new chat message to
 * the channel. The channelId is the sessionId (game) or tableId (waiting room).
 *
 * @param channelId - The session UUID or table UUID
 * @param onMessage - Callback called with each ChatMessage received
 * @returns Cleanup function to close the channel subscription, or null if AppSync
 *          is not configured (graceful degradation).
 */
export async function subscribeToChatChannel(
  channelId: string,
  onMessage: (msg: ChatMessage) => void,
): Promise<(() => void) | null> {
  if (!configured) {
    console.info('[AppSync] Skipping chat subscription — not configured');
    return null;
  }

  try {
    const channel = await events.connect(`/game/${channelId}/chat`);

    channel.subscribe({
      next: (data: Record<string, unknown>) => {
        try {
          const parsed = typeof data['event'] === 'string'
            ? (JSON.parse(data['event'] as string) as ChatMessage)
            : (data['event'] as ChatMessage | undefined);

          if (parsed?.userId !== undefined && parsed?.message !== undefined) {
            console.debug(`[AppSync] Chat message from ${parsed.username} on channel ${channelId}`);
            onMessage(parsed);
          } else {
            console.warn('[AppSync] Received malformed chat event payload:', data);
          }
        } catch (err) {
          console.error('[AppSync] Failed to parse chat event payload:', err, data);
        }
      },
      error: (err: unknown) => {
        console.error('[AppSync] Chat subscription error:', err);
      },
    });

    console.info(`[AppSync] Subscribed to /game/${channelId}/chat`);

    return () => {
      console.info(`[AppSync] Closing chat subscription for channel ${channelId}`);
      channel.close();
    };
  } catch (err) {
    console.error('[AppSync] Failed to subscribe to chat channel:', err);
    return null;
  }
}
