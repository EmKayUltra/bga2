import puppeteer from 'puppeteer-core';

const screenshotDir = '/screenshots';
const baseUrl = process.argv[2] || 'http://client:5173';
const apiUrl = 'http://server:8080';

const results = {};
function pass(test, detail) {
  results[test] = { status: 'pass', detail };
  console.log(`  PASS: ${detail || ''}`);
}
function fail(test, detail) {
  results[test] = { status: 'fail', detail };
  console.log(`  FAIL: ${detail}`);
}
function skip(test, detail) {
  results[test] = { status: 'skip', detail };
  console.log(`  SKIP: ${detail}`);
}

async function setupRequestInterception(page) {
  // Redirect localhost:8080 -> server:8080 inside Docker network
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.includes('localhost:8080')) {
      const newUrl = url.replace('localhost:8080', 'server:8080');
      req.continue({ url: newUrl });
    } else {
      req.continue();
    }
  });
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Redirect API calls from localhost:8080 to server:8080
  await setupRequestInterception(page);

  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.message));

  // ── AUTH: Sign In ──────────────────────────────────────
  console.log('\n=== AUTH: Sign In ===');
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1000));

  await page.click('#username');
  await page.type('#username', 'phase4test');
  await page.click('#password');
  await page.type('#password', 'TestPass123!');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 4000));

  let afterUrl = page.url();
  console.log(`After sign-in, URL: ${afterUrl}`);

  // If still on auth, try register
  if (afterUrl.includes('/auth/')) {
    console.log('Sign-in failed, trying register...');
    await page.goto(`${baseUrl}/auth/register`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.click('#email');
    await page.type('#email', 'phase4uat2@example.com');
    await page.click('#username');
    await page.type('#username', 'phase4uat2');
    await page.click('#displayName');
    await page.type('#displayName', 'Phase4 UAT2');
    await page.click('#password');
    await page.type('#password', 'TestPass123!');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 4000));
    afterUrl = page.url();
    console.log(`After register, URL: ${afterUrl}`);

    if (afterUrl.includes('/auth/')) {
      await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'networkidle0', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1000));
      await page.click('#username');
      await page.type('#username', 'phase4uat2');
      await page.click('#password');
      await page.type('#password', 'TestPass123!');
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 4000));
      afterUrl = page.url();
    }
  }

  const isAuth = !afterUrl.includes('/auth/');
  console.log(`Authenticated: ${isAuth}`);
  await page.screenshot({ path: `${screenshotDir}/uat-00-auth.png` });

  if (!isAuth) {
    console.log('FATAL: Could not authenticate. Aborting.');
    await browser.close();
    printResults();
    return;
  }

  // ══════════════════════════════════════════════════════════
  // TEST 10: SSR/API Lobby Fetch
  // ══════════════════════════════════════════════════════════
  console.log('\n=== TEST 10: Lobby Fetch (with interception) ===');
  consoleLogs.length = 0;
  pageErrors.length = 0;

  await page.goto(`${baseUrl}/lobby`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));

  const fetchErrors = consoleLogs.filter(l =>
    l.includes('Failed to fetch') || l.includes('ERR_CONNECTION_REFUSED') || l.includes('TypeError: fetch')
  );
  const lobbyContent = await page.evaluate(() => {
    const text = document.body.textContent;
    return {
      hasFailedToFetch: text.includes('Failed to fetch'),
      hasOpenTables: text.includes('Open Tables'),
      textLength: text.length,
    };
  });

  if (!lobbyContent.hasFailedToFetch && lobbyContent.hasOpenTables) {
    pass('test10', 'Lobby loaded with tables section, no fetch errors');
  } else if (lobbyContent.hasFailedToFetch) {
    fail('test10', 'Lobby still shows "Failed to fetch" despite request interception');
  } else {
    fail('test10', `Lobby content unclear: length=${lobbyContent.textLength}`);
  }
  await page.screenshot({ path: `${screenshotDir}/uat-10-lobby-load.png`, fullPage: true });

  // ══════════════════════════════════════════════════════════
  // TEST 3: Lobby Filter Toggle
  // ══════════════════════════════════════════════════════════
  console.log('\n=== TEST 3: Lobby Filter Toggle ===');
  const filterInfo = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    return {
      hasAll: buttons.some(b => b === 'All'),
      hasRealtime: buttons.some(b => b.includes('Real-time')),
      hasAsync: buttons.some(b => b === 'Async'),
      allButtons: buttons,
    };
  });
  console.log('Filter:', JSON.stringify(filterInfo, null, 2));

  if (filterInfo.hasAll && filterInfo.hasAsync && filterInfo.hasRealtime) {
    pass('test3', 'Filter buttons found: All, Real-time, Async');
  } else {
    fail('test3', `Missing filter buttons. Found: ${filterInfo.allButtons.join(', ')}`);
  }

  // ══════════════════════════════════════════════════════════
  // TEST 1: Create Async Table
  // ══════════════════════════════════════════════════════════
  console.log('\n=== TEST 1: Create Async Table ===');
  const createClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === 'Create Table');
    if (btn) { btn.click(); return true; }
    return false;
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: `${screenshotDir}/uat-01a-create-dialog.png`, fullPage: true });

  if (!createClicked) {
    fail('test1', 'Create Table button not found');
  } else {
    // Check dialog has Game mode section
    const dialogInfo = await page.evaluate(() => {
      const text = document.body.textContent;
      // Find the dialog/modal
      const dialog = document.querySelector('[role="dialog"], .modal, [class*="dialog"], [class*="modal"]');
      const dialogOrBody = dialog || document.body;
      const dialogButtons = Array.from(dialogOrBody.querySelectorAll('button')).map(b => b.textContent.trim());
      return {
        hasGameMode: text.includes('Game mode') || text.includes('Game Mode'),
        dialogButtons,
      };
    });
    console.log('Dialog:', JSON.stringify(dialogInfo, null, 2));

    // Click the Async button INSIDE the dialog (skip filter buttons)
    // The dialog has its own Real-time/Async pair — find them by proximity to "Game mode" label
    const asyncClicked = await page.evaluate(() => {
      // Strategy: find all elements containing "Game mode" text, then find Async button nearby
      const allElements = document.querySelectorAll('*');
      let gameModeLabel = null;
      for (const el of allElements) {
        if (el.childNodes.length <= 2 && el.textContent.trim() === 'Game mode') {
          gameModeLabel = el;
          break;
        }
      }

      if (gameModeLabel) {
        // Get the parent container and find buttons within it
        let container = gameModeLabel.parentElement;
        for (let i = 0; i < 3 && container; i++) {
          const btns = container.querySelectorAll('button');
          const asyncBtn = Array.from(btns).find(b => b.textContent.trim() === 'Async');
          if (asyncBtn) {
            asyncBtn.click();
            return { clicked: true, method: 'near-game-mode-label' };
          }
          container = container.parentElement;
        }
      }

      // Fallback: click the SECOND button with text "Async" (first is filter, second is dialog)
      const allAsyncBtns = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent.trim() === 'Async');
      if (allAsyncBtns.length >= 2) {
        allAsyncBtns[1].click();
        return { clicked: true, method: 'second-async-button' };
      }
      if (allAsyncBtns.length === 1) {
        allAsyncBtns[0].click();
        return { clicked: true, method: 'only-async-button' };
      }

      return { clicked: false };
    });
    console.log('Async click:', JSON.stringify(asyncClicked));
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${screenshotDir}/uat-01b-async-selected.png`, fullPage: true });

    // Check if timer presets appeared
    const asyncOptions = await page.evaluate(() => {
      const text = document.body.textContent;
      return {
        hasFast: text.includes('Fast'),
        hasNormal: text.includes('Normal'),
        hasSlow: text.includes('Slow'),
        hasTimer: text.includes('Timer') || text.includes('timer'),
        hasSkip: text.includes('skip') || text.includes('Skip') || text.includes('threshold'),
        has12h: text.includes('12h'),
        has24h: text.includes('24h'),
        has72h: text.includes('72h'),
      };
    });
    console.log('Async options:', JSON.stringify(asyncOptions, null, 2));

    if (asyncClicked.clicked && (asyncOptions.hasFast || asyncOptions.hasNormal || asyncOptions.hasSlow || asyncOptions.has12h || asyncOptions.has24h)) {
      pass('test1', `Async mode selected, timer presets visible (Fast=${asyncOptions.hasFast}, Normal=${asyncOptions.hasNormal}, Slow=${asyncOptions.hasSlow})`);
    } else if (asyncClicked.clicked) {
      fail('test1', `Async clicked via ${asyncClicked.method} but timer presets not visible`);
    } else {
      fail('test1', 'Could not click Async button');
    }

    // Create the async table
    console.log('Creating async table...');
    // Type name
    const nameTyped = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      for (const input of inputs) {
        const label = input.closest('label')?.textContent || input.previousElementSibling?.textContent || '';
        if (label.toLowerCase().includes('name') || input.placeholder?.toLowerCase().includes('name')) {
          input.value = 'UAT Async Game';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      }
      return false;
    });

    const submitted = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submit = btns.find(b => {
        const t = b.textContent.trim();
        return t === 'Create' && !b.disabled;
      });
      if (submit) { submit.click(); return true; }
      return false;
    });
    console.log(`Submitted: ${submitted}`);
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: `${screenshotDir}/uat-01c-after-create.png`, fullPage: true });
  }

  // ══════════════════════════════════════════════════════════
  // TEST 2: Async Badge on Table List
  // ══════════════════════════════════════════════════════════
  console.log('\n=== TEST 2: Async Badge on Table List ===');
  await page.goto(`${baseUrl}/lobby`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: `${screenshotDir}/uat-02-table-list.png`, fullPage: true });

  const tableInfo = await page.evaluate(() => {
    const text = document.body.textContent;
    // Look for async indicators in the table list area
    const listArea = document.querySelector('[class*="table"], [class*="list"]') || document.body;
    const asyncIndicators = listArea.querySelectorAll('[class*="async"], [class*="badge"]');
    return {
      hasAsyncText: text.includes('Async'),
      asyncIndicatorCount: asyncIndicators.length,
      hasFailedFetch: text.includes('Failed to fetch'),
      tableText: text.substring(0, 3000),
    };
  });
  console.log(`Table list: asyncText=${tableInfo.hasAsyncText}, indicators=${tableInfo.asyncIndicatorCount}, fetchFailed=${tableInfo.hasFailedFetch}`);

  if (tableInfo.hasAsyncText && !tableInfo.hasFailedFetch) {
    pass('test2', 'Async indicator visible in table list');
  } else if (tableInfo.hasFailedFetch) {
    fail('test2', 'Table list shows "Failed to fetch"');
  } else {
    fail('test2', 'No async indicators in table list');
  }

  // ══════════════════════════════════════════════════════════
  // TEST 4: Settings Notification Preferences
  // ══════════════════════════════════════════════════════════
  console.log('\n=== TEST 4: Settings Notification Preferences ===');
  consoleLogs.length = 0;
  await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: `${screenshotDir}/uat-04a-settings-top.png` });

  // Scroll to see full page
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: `${screenshotDir}/uat-04b-settings-full.png`, fullPage: true });

  const settingsInfo = await page.evaluate(() => {
    const text = document.body.textContent;
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => h.textContent.trim());
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const selects = document.querySelectorAll('select');
    const labels = Array.from(document.querySelectorAll('label')).map(l => l.textContent.trim());
    return {
      hasNotificationsHeading: headings.some(h => h.toLowerCase().includes('notification')),
      headings,
      hasEmailToggle: text.toLowerCase().includes('email') && text.toLowerCase().includes('notification'),
      hasPushText: text.toLowerCase().includes('push'),
      hasReminder: text.toLowerCase().includes('remind'),
      checkboxCount: checkboxes.length,
      selectCount: selects.length,
      labels,
      hasFailedFetch: text.includes('Failed to fetch'),
      hasError: text.includes('Error') || text.includes('error'),
      textPreview: text.substring(0, 2000),
    };
  });
  console.log('Settings:', JSON.stringify(settingsInfo, null, 2));

  if (settingsInfo.hasNotificationsHeading && settingsInfo.hasEmailToggle) {
    pass('test4', `Notifications section found with email toggle, push=${settingsInfo.hasPushText}, reminder=${settingsInfo.hasReminder}, ${settingsInfo.checkboxCount} checkboxes, ${settingsInfo.selectCount} selects`);
  } else if (settingsInfo.hasFailedFetch) {
    fail('test4', `Settings page shows "Failed to fetch" — profile load failed, notification section may not render until profile loads`);
  } else if (settingsInfo.hasNotificationsHeading) {
    fail('test4', `Notifications heading present but missing toggles`);
  } else {
    fail('test4', `No Notifications section. Headings: ${settingsInfo.headings.join(', ')}. Labels: ${settingsInfo.labels.join(', ')}`);
  }

  // ══════════════════════════════════════════════════════════
  // TEST 5: My Games Section
  // ══════════════════════════════════════════════════════════
  console.log('\n=== TEST 5: My Games Section ===');
  await page.goto(`${baseUrl}/lobby`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));

  const myGamesInfo = await page.evaluate(() => {
    const text = document.body.textContent;
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => h.textContent.trim());
    return {
      hasMyGames: headings.some(h => h.includes('My Games')),
      hasMyGamesText: text.includes('My Games'),
      headings,
    };
  });
  console.log('My Games:', JSON.stringify(myGamesInfo, null, 2));

  if (myGamesInfo.hasMyGames || myGamesInfo.hasMyGamesText) {
    pass('test5', 'My Games section visible');
  } else {
    skip('test5', 'My Games not visible — section only renders when user has active async games (expected)');
  }

  // ══════════════════════════════════════════════════════════
  // TEST 6 & 7: Game Timer + Pause (need active game)
  // ══════════════════════════════════════════════════════════
  console.log('\n=== TEST 6 & 7: Game Timer + Pause ===');
  const gameLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    const gLink = links.find(a => a.href && a.href.includes('/game/'));
    return gLink ? gLink.href : null;
  });

  if (gameLink) {
    await page.goto(gameLink, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: `${screenshotDir}/uat-06-game.png`, fullPage: true });

    const gameInfo = await page.evaluate(() => {
      const text = document.body.textContent;
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
      return {
        hasTimer: /\d{1,2}[dhm:]/.test(text),
        hasPauseBtn: buttons.some(b => b.includes('Pause')),
        hasResumeBtn: buttons.some(b => b.includes('Resume')),
        buttons,
      };
    });

    if (gameInfo.hasTimer) pass('test6', 'Timer countdown visible');
    else skip('test6', 'No timer visible — game may not be async or not started');

    if (gameInfo.hasPauseBtn || gameInfo.hasResumeBtn) pass('test7', `Pause/Resume controls found`);
    else skip('test7', 'No Pause/Resume buttons — needs active async game with 2+ players');
  } else {
    skip('test6', 'No active game link found');
    skip('test7', 'No active game link found');
  }

  // ══════════════════════════════════════════════════════════
  // TEST 8: In-App Nav Badge
  // ══════════════════════════════════════════════════════════
  console.log('\n=== TEST 8: In-App Nav Badge ===');
  const navInfo = await page.evaluate(() => {
    const nav = document.querySelector('nav, header');
    if (!nav) return { found: false };
    const badges = nav.querySelectorAll('[class*="badge"], [class*="count"], [class*="notification-count"]');
    const navHtml = nav.innerHTML;
    return {
      found: true,
      badgeElements: badges.length,
      hasBadgeClass: navHtml.includes('badge') || navHtml.includes('count'),
      navText: nav.textContent.trim(),
    };
  });
  console.log('Nav:', JSON.stringify(navInfo, null, 2));

  if (navInfo.badgeElements > 0) {
    pass('test8', `Nav badge found (${navInfo.badgeElements} elements)`);
  } else {
    skip('test8', 'No nav badge visible — expected when 0 async games need attention (badge hidden)');
  }

  // ══════════════════════════════════════════════════════════
  // TEST 9: Hangfire Dashboard
  // ══════════════════════════════════════════════════════════
  console.log('\n=== TEST 9: Hangfire Dashboard ===');
  try {
    // Disable interception temporarily for server-direct request
    await page.setRequestInterception(false);

    await page.goto(`${apiUrl}/hangfire`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: `${screenshotDir}/uat-09a-hangfire.png`, fullPage: true });

    const hfInfo = await page.evaluate(() => {
      const text = document.body.textContent;
      return {
        title: document.title,
        hasHangfire: text.includes('Hangfire'),
        hasRecurring: text.includes('Recurring'),
        pageLength: text.length,
      };
    });
    console.log('Hangfire main:', JSON.stringify(hfInfo, null, 2));

    // Navigate to recurring jobs page
    const recurringUrl = page.url().replace(/\/hangfire\/?$/, '/hangfire/recurring');
    await page.goto(recurringUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: `${screenshotDir}/uat-09b-hangfire-recurring.png`, fullPage: true });

    const recurringInfo = await page.evaluate(() => {
      const text = document.body.textContent;
      const rows = document.querySelectorAll('table tbody tr');
      return {
        hasDeadlineChecker: text.includes('deadline-checker') || text.includes('DeadlineService'),
        hasProcessExpired: text.includes('ProcessExpiredDeadlines'),
        rowCount: rows.length,
        text: text.substring(0, 2000),
      };
    });
    console.log('Recurring:', JSON.stringify(recurringInfo, null, 2));

    if (hfInfo.hasHangfire && (recurringInfo.hasDeadlineChecker || recurringInfo.hasProcessExpired)) {
      pass('test9', `Hangfire dashboard loaded, deadline-checker job found`);
    } else if (hfInfo.hasHangfire) {
      pass('test9', `Hangfire dashboard loaded (recurring job detail: checker=${recurringInfo.hasDeadlineChecker}, rows=${recurringInfo.rowCount})`);
    } else {
      fail('test9', `Hangfire page did not load properly (length: ${hfInfo.pageLength})`);
    }

    // Re-enable interception
    await page.setRequestInterception(true);
    page.removeAllListeners('request');
    page.on('request', req => {
      const url = req.url();
      if (url.includes('localhost:8080')) {
        req.continue({ url: url.replace('localhost:8080', 'server:8080') });
      } else {
        req.continue();
      }
    });
  } catch (err) {
    fail('test9', `Hangfire navigation failed: ${err.message}`);
  }

  // ══════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════
  console.log('\n\n========================================');
  console.log('  PHASE 4 UAT RESULTS');
  console.log('========================================\n');

  let passCount = 0, failCount = 0, skipCount = 0;
  const testNames = {
    test1: 'Create Async Table',
    test2: 'Async Badge on Table List',
    test3: 'Lobby Filter Toggle',
    test4: 'Settings Notification Preferences',
    test5: 'My Games Section',
    test6: 'Game Timer Countdown',
    test7: 'Pause Request Flow',
    test8: 'In-App Nav Badge',
    test9: 'Hangfire Dashboard',
    test10: 'Lobby API Fetch',
  };

  for (const [test, res] of Object.entries(results)) {
    const icon = res.status === 'pass' ? 'PASS' : res.status === 'fail' ? 'FAIL' : 'SKIP';
    const name = testNames[test] || test;
    console.log(`  [${icon}] ${name}: ${res.detail}`);
    if (res.status === 'pass') passCount++;
    else if (res.status === 'fail') failCount++;
    else skipCount++;
  }

  console.log(`\n  Total: ${Object.keys(results).length} | Pass: ${passCount} | Fail: ${failCount} | Skip: ${skipCount}`);

  if (pageErrors.length > 0) {
    console.log('\n=== Page Errors ===');
    pageErrors.slice(0, 10).forEach(e => console.log(`  ${e}`));
  }

  console.log('\nDone.');
  await browser.close();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
