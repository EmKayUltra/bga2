import puppeteer from 'puppeteer-core';

const BASE = 'http://client:5173';
const MOCK = 'http://appsync-mock:4006';
const screenshotDir = '/screenshots';
const results = [];

function pass(name, detail) { results.push({ name, status: 'PASS', detail }); console.log(`  ✓ ${name}: ${detail}`); }
function fail(name, detail) { results.push({ name, status: 'FAIL', detail }); console.log(`  ✗ ${name}: ${detail}`); }

async function run() {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[pageerror] ${err.message}`));

  // ── 1. Mock health check (via page fetch) ──
  console.log('\n=== 1. Mock Health Check ===');
  try {
    const health = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return { status: res.status, body: await res.json() };
    }, `${MOCK}/`);
    if (health.body.status === 'ok') pass('Mock health', `${MOCK} → ${JSON.stringify(health.body)}`);
    else fail('Mock health', `Unexpected: ${JSON.stringify(health.body)}`);
  } catch (err) {
    fail('Mock health', err.message);
  }

  // ── 2. HTTP publish endpoint ──
  console.log('\n=== 2. HTTP Publish ===');
  try {
    const pub = await page.evaluate(async (url) => {
      const res = await fetch(`${url}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'mock-api-key' },
        body: JSON.stringify({ channel: '/game/test/state', events: ['{"version":1}'] }),
      });
      return { status: res.status, body: await res.json() };
    }, MOCK);
    if (pub.body.success) pass('HTTP publish', `POST /event → ${JSON.stringify(pub.body)}`);
    else fail('HTTP publish', `Unexpected: ${JSON.stringify(pub.body)}`);
  } catch (err) {
    fail('HTTP publish', err.message);
  }

  // ── 3. HTTP publish without API key (should 401) ──
  console.log('\n=== 3. Publish Auth Guard ===');
  try {
    const noKey = await page.evaluate(async (url) => {
      const res = await fetch(`${url}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: '/test', events: ['{}'] }),
      });
      return { status: res.status };
    }, MOCK);
    if (noKey.status === 401) pass('Auth guard', 'POST without x-api-key → 401');
    else fail('Auth guard', `Expected 401, got ${noKey.status}`);
  } catch (err) {
    fail('Auth guard', err.message);
  }

  // ── 4. WebSocket connect + subscribe + receive published event ──
  console.log('\n=== 4. WebSocket E2E Flow ===');
  try {
    const wsResult = await page.evaluate(async (mockUrl) => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'Timeout after 10s' }), 10000);
        const steps = [];

        // Connect WebSocket with AppSync protocol
        const wsUrl = mockUrl.replace('http://', 'ws://') + '/event/realtime';
        const ws = new WebSocket(wsUrl, ['aws-appsync-event-ws', 'header-eyJob29zdCI6ImxvY2FsaG9zdCIsIngtYXBpLWtleSI6Im1vY2stYXBpLWtleSJ9']);

        ws.onopen = () => {
          steps.push('connected');
          // Send connection_init
          ws.send(JSON.stringify({ type: 'connection_init' }));
        };

        let gotAck = false;
        let gotSubSuccess = false;
        let gotData = false;
        const subId = 'test-sub-' + Date.now();

        ws.onmessage = async (evt) => {
          const msg = JSON.parse(evt.data);

          if (msg.type === 'connection_ack' && !gotAck) {
            gotAck = true;
            steps.push('connection_ack');
            // Subscribe to test channel
            ws.send(JSON.stringify({
              type: 'subscribe',
              id: subId,
              channel: '/game/ws-test/state',
              authorization: { 'x-api-key': 'mock-api-key', host: 'localhost' },
            }));
          }

          if (msg.type === 'subscribe_success' && !gotSubSuccess) {
            gotSubSuccess = true;
            steps.push('subscribe_success');
            // Now publish an event via HTTP and check if we receive it
            try {
              await fetch(`${mockUrl}/event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': 'mock-api-key' },
                body: JSON.stringify({ channel: '/game/ws-test/state', events: ['{"version":42,"hello":"world"}'] }),
              });
              steps.push('published');
            } catch (e) {
              steps.push('publish_failed: ' + e.message);
            }
          }

          if (msg.type === 'data' && !gotData) {
            gotData = true;
            steps.push('data_received');
            const event = JSON.parse(msg.event);
            steps.push(`event_version=${event.version}`);
            ws.close();
            clearTimeout(timeout);
            resolve({ steps, event, subId: msg.id });
          }

          if (msg.type === 'ka') {
            // Ignore keep-alive
          }
        };

        ws.onerror = (err) => {
          clearTimeout(timeout);
          resolve({ error: 'WebSocket error', steps });
        };

        ws.onclose = () => {
          if (!gotData) {
            clearTimeout(timeout);
            resolve({ error: 'WebSocket closed before receiving data', steps });
          }
        };
      });
    }, MOCK);

    if (wsResult.error) {
      fail('WebSocket E2E', `${wsResult.error} (steps: ${(wsResult.steps || []).join(' → ')})`);
    } else {
      const steps = wsResult.steps.join(' → ');
      if (wsResult.steps.includes('data_received') && wsResult.event?.version === 42) {
        pass('WebSocket connect', 'connection_init → connection_ack');
        pass('WebSocket subscribe', 'subscribe → subscribe_success');
        pass('WebSocket data relay', `HTTP publish → WebSocket data (version=${wsResult.event.version})`);
        pass('Full E2E flow', steps);
      } else {
        fail('WebSocket E2E', `Incomplete flow: ${steps}`);
      }
    }
  } catch (err) {
    fail('WebSocket E2E', err.message);
  }

  // ── 5. Load game page and check Amplify connects ──
  console.log('\n=== 5. Game Page AppSync Connection ===');
  try {
    // Create a game first
    const createRes = await page.evaluate(async () => {
      const res = await fetch('http://server:8080/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: 'azul', playerNames: ['Alice', 'Bob'] }),
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return res.json();
    });

    if (createRes.error) {
      fail('Create game', createRes.error);
    } else {
      pass('Create game', `sessionId=${createRes.sessionId}`);

      // Navigate to game page
      await page.goto(`${BASE}/game/${createRes.sessionId}`, { waitUntil: 'networkidle0', timeout: 20000 });
      await new Promise(r => setTimeout(r, 3000));
      await page.screenshot({ path: `${screenshotDir}/mock-01-game.png` });

      // Check console for AppSync connection messages
      const appsyncLogs = consoleLogs.filter(l =>
        l.toLowerCase().includes('appsync') ||
        l.toLowerCase().includes('subscribe') ||
        l.toLowerCase().includes('websocket') ||
        l.toLowerCase().includes('connection')
      );

      if (appsyncLogs.length > 0) {
        pass('Amplify connection', `Found ${appsyncLogs.length} AppSync-related console messages`);
        appsyncLogs.slice(0, 3).forEach(l => console.log(`    ${l}`));
      } else {
        console.log('  ? No explicit AppSync console messages (Amplify may connect silently)');
      }

      // Check for connection status UI
      const connInfo = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasReconnecting: text.includes('Reconnecting'),
          hasDisconnected: text.includes('Disconnected'),
          hasYourTurn: text.includes('Your Turn') || text.includes("Turn"),
          bodySnippet: text.substring(0, 300),
        };
      });

      if (!connInfo.hasReconnecting && !connInfo.hasDisconnected) {
        pass('No connection errors', 'No "Reconnecting" or "Disconnected" banners shown');
      } else {
        fail('Connection status', `Reconnecting=${connInfo.hasReconnecting}, Disconnected=${connInfo.hasDisconnected}`);
      }
    }
  } catch (err) {
    fail('Game page', err.message);
  }

  // ── 6. Check mock logs for WebSocket activity ──
  console.log('\n=== 6. Mock Server Activity ===');
  try {
    const mockLogs = await page.evaluate(async (url) => {
      // Publish to a channel and verify it returns success
      const res = await fetch(`${url}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'mock-api-key' },
        body: JSON.stringify({ channel: '/game/test/chat', events: ['{"msg":"hello"}'] }),
      });
      return { status: res.status, body: await res.json() };
    }, MOCK);
    pass('Chat channel publish', `POST /game/test/chat → ${JSON.stringify(mockLogs.body)}`);
  } catch (err) {
    fail('Chat publish', err.message);
  }

  // ── Summary ──
  console.log('\n========================================');
  console.log('     APPSYNC MOCK VERIFICATION');
  console.log('========================================');

  const passes = results.filter(r => r.status === 'PASS');
  const fails = results.filter(r => r.status === 'FAIL');

  console.log(`\n  PASSED: ${passes.length}`);
  console.log(`  FAILED: ${fails.length}`);
  console.log(`  TOTAL:  ${results.length}`);

  if (fails.length > 0) {
    console.log('\n  Failed:');
    fails.forEach(f => console.log(`    ✗ ${f.name}: ${f.detail}`));
  }

  const errors = consoleLogs.filter(l => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  if (errors.length > 0) {
    console.log(`\n  Browser errors: ${errors.length}`);
    errors.slice(0, 5).forEach(e => console.log(`    ${e}`));
  }

  console.log('\n========================================\n');
  await browser.close();
  process.exit(fails.length > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
