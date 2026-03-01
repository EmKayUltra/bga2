/**
 * test-game.mjs — Interactive puppeteer test that navigates to a game,
 * programmatically makes moves via window.__sm, takes screenshots,
 * and reports success/failure.
 *
 * Usage (inside Docker):
 *   node test-game.mjs "http://client:5173/game/test"
 */

import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://client:5173/game/test';
const screenshotDir = '/screenshots';
const MAX_MOVES = 4;
const MOVE_WAIT_MS = 2000;

async function run() {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Rewrite localhost:8080 → server:8080 so browser API calls reach the server container
  await page.setRequestInterception(true);
  page.on('request', req => {
    const reqUrl = req.url();
    if (reqUrl.includes('localhost:8080')) {
      const newUrl = reqUrl.replace('localhost:8080', 'server:8080');
      req.continue({ url: newUrl });
    } else {
      req.continue();
    }
  });

  // Capture all browser console output
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.message));

  const summary = { movesAttempted: 0, movesSucceeded: 0, errors: [] };

  console.log(`\n=== test-game.mjs ===`);
  console.log(`Navigating to ${url}...`);

  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  } catch (err) {
    console.error(`Navigation failed: ${err.message}`);
    await page.screenshot({ path: `${screenshotDir}/error-nav.png` });
    await browser.close();
    process.exit(1);
  }

  // Step 1: Wait for SceneManager init (poll window.__sm?.state?.sessionId)
  console.log('Waiting for SceneManager init...');
  let initOk = false;
  for (let i = 0; i < 30; i++) {
    const sessionId = await page.evaluate(() => window.__sm?.state?.sessionId);
    if (sessionId) {
      console.log(`SceneManager ready — sessionId: ${sessionId}`);
      initOk = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!initOk) {
    console.error('SceneManager did not initialize within 15s');
    await page.screenshot({ path: `${screenshotDir}/error-init.png` });
    await browser.close();
    process.exit(1);
  }

  // Step 2: Screenshot initial board
  await page.screenshot({ path: `${screenshotDir}/01-board.png` });
  console.log('Saved: 01-board.png');

  // Step 3: Read initial state
  const initState = await page.evaluate(() => ({
    sessionId: window.__sm.state.sessionId,
    currentPlayer: window.__sm.state.currentPlayerIndex,
    playerNames: window.__sm.state.playerNames,
    validMoves: window.__sm.state.validMoves.length,
    phase: window.__sm.state.gameState?.phase,
  }));
  console.log(`Initial state: player=${initState.currentPlayer} (${initState.playerNames[initState.currentPlayer]}), validMoves=${initState.validMoves}, phase=${initState.phase}`);

  // Step 4-9: Make moves
  for (let moveNum = 0; moveNum < MAX_MOVES; moveNum++) {
    console.log(`\n--- Move ${moveNum + 1}/${MAX_MOVES} ---`);

    // Read valid moves
    const moveData = await page.evaluate(() => {
      const moves = window.__sm.state.validMoves;
      if (!moves || moves.length === 0) return null;
      const first = moves[0];
      return {
        count: moves.length,
        source: first.source,
        pieceId: first.pieceId,
        target: first.target,
      };
    });

    if (!moveData) {
      console.log('No valid moves available — stopping');
      summary.errors.push(`Move ${moveNum + 1}: no valid moves`);
      break;
    }

    console.log(`Valid moves: ${moveData.count} — picking source:'${moveData.source}', pieceId:'${moveData.pieceId}', target:'${moveData.target}'`);
    summary.movesAttempted++;

    // Step 1: Select source
    try {
      await page.evaluate((source, pieceId) => {
        window.__sm.handleSourceClick(source, pieceId);
      }, moveData.source, moveData.pieceId);
    } catch (err) {
      console.error(`handleSourceClick failed: ${err.message}`);
      summary.errors.push(`Move ${moveNum + 1} source: ${err.message}`);
      continue;
    }

    await page.screenshot({ path: `${screenshotDir}/0${moveNum + 2}-source-selected.png` });
    console.log(`Saved: 0${moveNum + 2}-source-selected.png`);

    // Step 2: Select destination
    try {
      await page.evaluate((target) => {
        window.__sm.handleDestinationClick(target);
      }, moveData.target);
    } catch (err) {
      console.error(`handleDestinationClick failed: ${err.message}`);
      summary.errors.push(`Move ${moveNum + 1} dest: ${err.message}`);
      continue;
    }

    // Wait for server round-trip
    await new Promise(r => setTimeout(r, MOVE_WAIT_MS));

    await page.screenshot({ path: `${screenshotDir}/0${moveNum + 2}-after-move.png` });
    console.log(`Saved: 0${moveNum + 2}-after-move.png`);

    // Read updated state
    const postState = await page.evaluate(() => ({
      currentPlayer: window.__sm.state.currentPlayerIndex,
      playerNames: window.__sm.state.playerNames,
      validMoves: window.__sm.state.validMoves.length,
      lastMoveValid: window.__sm.state.lastMoveResult?.valid,
      lastMoveErrors: window.__sm.state.lastMoveResult?.errors,
      finished: window.__sm.state.gameState?.finished,
    }));

    if (postState.lastMoveValid) {
      summary.movesSucceeded++;
      console.log(`Move result: valid — newPlayer=${postState.currentPlayer} (${postState.playerNames[postState.currentPlayer]}), validMoves=${postState.validMoves}`);
    } else {
      const errStr = postState.lastMoveErrors?.join(', ') ?? 'unknown';
      console.log(`Move result: INVALID — ${errStr}`);
      summary.errors.push(`Move ${moveNum + 1}: rejected — ${errStr}`);
    }

    if (postState.finished) {
      console.log('Game finished!');
      break;
    }
  }

  // Step 10: Print summary
  console.log('\n=== Summary ===');
  console.log(`Moves attempted: ${summary.movesAttempted}`);
  console.log(`Moves succeeded: ${summary.movesSucceeded}`);
  console.log(`Errors: ${summary.errors.length}`);
  if (summary.errors.length > 0) {
    summary.errors.forEach(e => console.log(`  - ${e}`));
  }

  // Final state
  const finalState = await page.evaluate(() => ({
    currentPlayer: window.__sm.state.currentPlayerIndex,
    playerNames: window.__sm.state.playerNames,
    playerScores: window.__sm.state.playerScores,
    validMoves: window.__sm.state.validMoves.length,
    finished: window.__sm.state.gameState?.finished,
    round: window.__sm.state.gameState?.round,
  }));
  console.log(`\nFinal state: player=${finalState.currentPlayer}, scores=${JSON.stringify(finalState.playerScores)}, validMoves=${finalState.validMoves}, round=${finalState.round}, finished=${finalState.finished}`);

  // Print browser console
  if (consoleLogs.length > 0) {
    console.log('\n=== Browser Console ===');
    consoleLogs.forEach(l => console.log(`  ${l}`));
  }
  if (pageErrors.length > 0) {
    console.log('\n=== Page Errors ===');
    pageErrors.forEach(e => console.log(`  ${e}`));
  }

  await browser.close();

  // Exit code: 0 if all attempted moves succeeded, 1 otherwise
  const success = summary.movesAttempted > 0 && summary.movesSucceeded === summary.movesAttempted && pageErrors.length === 0;
  console.log(`\nResult: ${success ? 'PASS' : 'FAIL'}`);
  process.exit(success ? 0 : 1);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
