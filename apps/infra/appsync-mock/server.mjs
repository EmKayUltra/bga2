/**
 * AppSync Events mock server for local development.
 *
 * Implements the AppSync Events protocol:
 *   - HTTP POST /event   — publish events to a channel (called by C# server)
 *   - WebSocket /event/realtime — subscribe to channels (called by Amplify client)
 *
 * Subprotocol: aws-appsync-event-ws
 *
 * Port: 4006
 */

import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

const PORT = 4006;
const KEEPALIVE_INTERVAL_MS = 30_000;

const app = express();
app.use(express.json());

// CORS — allow browser clients on any origin (dev only)
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Map<WebSocket, Map<subscriptionId, channel>>
const subscriptions = new Map();

// ─── Health check ──────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─── HTTP publish endpoint ─────────────────────────────────────────────────

app.post('/event', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }

  const { channel, events: eventList } = req.body;

  if (!channel || !Array.isArray(eventList)) {
    return res.status(400).json({ error: 'Body must contain channel (string) and events (array)' });
  }

  let subscriberCount = 0;

  for (const [ws, subs] of subscriptions.entries()) {
    if (ws.readyState !== ws.OPEN) continue;

    for (const [subId, subChannel] of subs.entries()) {
      if (subChannel !== channel) continue;

      for (const eventStr of eventList) {
        const msg = JSON.stringify({
          type: 'data',
          id: subId,
          event: eventStr,
        });
        ws.send(msg);
      }
      subscriberCount++;
    }
  }

  console.log(`[publish] channel=${channel} events=${eventList.length} subscribers=${subscriberCount}`);
  return res.json({ success: true });
});

// ─── HTTP server ──────────────────────────────────────────────────────────

const server = http.createServer(app);

// ─── WebSocket server ─────────────────────────────────────────────────────

const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (_protocols) => 'aws-appsync-event-ws',
});

server.on('upgrade', (request, socket, head) => {
  const url = request.url;
  if (url !== '/event/realtime') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  subscriptions.set(ws, new Map());
  console.log(`[ws] client connected (total=${wss.clients.size})`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn('[ws] received non-JSON message');
      return;
    }

    const { type, id, channel } = msg;

    if (type === 'connection_init') {
      ws.send(JSON.stringify({
        type: 'connection_ack',
        connectionTimeoutMs: 300000,
      }));
      console.log('[ws] connection_init -> connection_ack');
      return;
    }

    if (type === 'subscribe') {
      if (!id || !channel) {
        console.warn('[ws] subscribe missing id or channel');
        return;
      }
      const subId = id || randomUUID();
      subscriptions.get(ws).set(subId, channel);
      ws.send(JSON.stringify({ type: 'subscribe_success', id: subId }));
      console.log(`[ws] subscribe id=${subId} channel=${channel}`);
      return;
    }

    if (type === 'unsubscribe') {
      if (!id) return;
      subscriptions.get(ws).delete(id);
      console.log(`[ws] unsubscribe id=${id}`);
      return;
    }

    console.warn(`[ws] unknown message type: ${type}`);
  });

  ws.on('close', () => {
    subscriptions.delete(ws);
    console.log(`[ws] client disconnected (total=${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.error('[ws] error:', err.message);
  });
});

// ─── Keep-alive ──────────────────────────────────────────────────────────

setInterval(() => {
  const kaMsg = JSON.stringify({ type: 'ka' });
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(kaMsg);
    }
  }
}, KEEPALIVE_INTERVAL_MS);

// ─── Start ───────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`AppSync Events mock listening on port ${PORT}`);
});
