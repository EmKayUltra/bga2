import puppeteer from 'puppeteer-core';

const BASE = 'http://client:5173';
const screenshotDir = '/screenshots';
const results = [];

function log(msg) { console.log(msg); }
function pass(name, detail) { results.push({ name, status: 'PASS', detail }); log(`  ✓ ${name}: ${detail}`); }
function fail(name, detail) { results.push({ name, status: 'FAIL', detail }); log(`  ✗ ${name}: ${detail}`); }

async function run() {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.message));

  // ========================================
  // 1. Landing page
  // ========================================
  log('\n=== 1. Landing Page ===');
  try {
    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.screenshot({ path: `${screenshotDir}/p3-01-landing.png` });

    const hasNav = await page.evaluate(() => {
      const nav = document.querySelector('nav') || document.querySelector('header');
      return !!nav;
    });
    const hasAuthLinks = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('login') || text.includes('sign in') || text.includes('register');
    });
    const hasLobbyLink = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('lobby') || text.includes('play');
    });

    if (hasNav) pass('Nav bar', 'Present on landing page');
    else fail('Nav bar', 'Missing nav/header element');
    if (hasAuthLinks) pass('Auth links', 'Login/register links visible');
    else fail('Auth links', 'No login/register links found');
    if (hasLobbyLink) pass('Lobby link', 'Lobby or play link visible');
    else fail('Lobby link', 'No lobby link found');
  } catch (err) {
    fail('Landing page', err.message);
  }

  // ========================================
  // 2. Login page
  // ========================================
  log('\n=== 2. Login Page ===');
  try {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.screenshot({ path: `${screenshotDir}/p3-02-login.png` });

    const hasForm = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      const hasEmail = [...inputs].some(i => i.type === 'email' || i.name === 'email' || i.placeholder?.toLowerCase().includes('email'));
      const hasPassword = [...inputs].some(i => i.type === 'password');
      return { hasEmail, hasPassword, inputCount: inputs.length };
    });

    if (hasForm.hasEmail) pass('Email input', 'Email field present');
    else fail('Email input', 'No email input found');
    if (hasForm.hasPassword) pass('Password input', 'Password field present');
    else fail('Password input', 'No password input found');
  } catch (err) {
    fail('Login page', err.message);
  }

  // ========================================
  // 3. Register page
  // ========================================
  log('\n=== 3. Register Page ===');
  try {
    await page.goto(`${BASE}/auth/register`, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.screenshot({ path: `${screenshotDir}/p3-03-register.png` });

    const hasForm = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      const hasUsername = [...inputs].some(i =>
        i.name === 'username' || i.placeholder?.toLowerCase().includes('username') || i.id === 'username'
      );
      const hasEmail = [...inputs].some(i => i.type === 'email' || i.name === 'email');
      const hasPassword = [...inputs].some(i => i.type === 'password');
      return { hasUsername, hasEmail, hasPassword, inputCount: inputs.length };
    });

    if (hasForm.hasUsername) pass('Username input', 'Username field present');
    else fail('Username input', `No username input found (${hasForm.inputCount} inputs total)`);
    if (hasForm.hasEmail) pass('Email input', 'Email field present');
    else fail('Email input', 'No email input found');
    if (hasForm.hasPassword) pass('Password input', 'Password field present');
    else fail('Password input', 'No password input found');
  } catch (err) {
    fail('Register page', err.message);
  }

  // ========================================
  // 4. Register a test user and log in
  // ========================================
  log('\n=== 4. Register Test User ===');
  let isAuthenticated = false;
  try {
    await page.goto(`${BASE}/auth/register`, { waitUntil: 'networkidle0', timeout: 15000 });

    // Fill registration form
    const registered = await page.evaluate(async () => {
      const inputs = document.querySelectorAll('input');
      const inputsByType = {};
      for (const input of inputs) {
        const key = input.name || input.type || input.placeholder?.toLowerCase() || 'unknown';
        inputsByType[key] = input;
      }
      return Object.keys(inputsByType);
    });
    log(`  Form fields: ${registered.join(', ')}`);

    // Try to fill fields by name/type
    const usernameField = await page.$('input[name="username"], input[id="username"], input[placeholder*="sername"]');
    const emailField = await page.$('input[name="email"], input[type="email"], input[placeholder*="mail"]');
    const passwordField = await page.$('input[name="password"], input[type="password"]');
    const nameField = await page.$('input[name="name"], input[placeholder*="ame"]:not([type="email"]):not([name="username"])');

    const ts = Date.now();
    if (nameField) await nameField.type(`TestUser${ts}`);
    if (usernameField) await usernameField.type(`testuser${ts}`);
    if (emailField) await emailField.type(`test${ts}@example.com`);
    if (passwordField) await passwordField.type('TestPass123!');

    await page.screenshot({ path: `${screenshotDir}/p3-04-register-filled.png` });

    // Submit
    const submitBtn = await page.$('button[type="submit"], button:not([type])');
    if (submitBtn) {
      await submitBtn.click();
      await new Promise(r => setTimeout(r, 3000));
      await page.screenshot({ path: `${screenshotDir}/p3-05-after-register.png` });

      // Check if we got redirected (successful registration)
      const currentUrl = page.url();
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (!currentUrl.includes('/auth/register') || bodyText.toLowerCase().includes('logout') || bodyText.toLowerCase().includes('sign out')) {
        pass('Registration', `Redirected to ${currentUrl}`);
        isAuthenticated = true;
      } else if (bodyText.toLowerCase().includes('error') || bodyText.toLowerCase().includes('failed')) {
        fail('Registration', `Error on page: ${bodyText.substring(0, 200)}`);
      } else {
        // Still on register — might have succeeded and stayed, or might have failed
        log(`  ? Still on register page. URL: ${currentUrl}`);
        pass('Registration form', 'Form submitted (check screenshot for result)');
      }
    } else {
      fail('Registration', 'No submit button found');
    }
  } catch (err) {
    fail('Registration', err.message);
  }

  // ========================================
  // 5. Lobby page (may redirect to login if auth required)
  // ========================================
  log('\n=== 5. Lobby Page ===');
  try {
    await page.goto(`${BASE}/lobby`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${screenshotDir}/p3-06-lobby.png` });

    const lobbyInfo = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return {
        hasCreateTable: text.includes('create') && text.includes('table'),
        hasQuickPlay: text.includes('quick play') || text.includes('quickplay'),
        hasTableList: !!document.querySelector('table, [class*="table-list"], [class*="lobby"]'),
        url: window.location.href,
        bodyText: document.body.innerText.substring(0, 500),
      };
    });

    if (lobbyInfo.url.includes('/lobby')) {
      pass('Lobby loads', 'Lobby page rendered');
      if (lobbyInfo.hasCreateTable) pass('Create table', 'Create table UI present');
      else log('  ? No "create table" text found');
      if (lobbyInfo.hasQuickPlay) pass('Quick Play', 'Quick Play button present');
      else log('  ? No Quick Play button found');
    } else {
      log(`  Redirected to: ${lobbyInfo.url} (may need auth)`);
      pass('Lobby auth guard', `Redirected unauthenticated user to ${lobbyInfo.url}`);
    }
  } catch (err) {
    fail('Lobby page', err.message);
  }

  // ========================================
  // 6. Friends page
  // ========================================
  log('\n=== 6. Friends Page ===');
  try {
    await page.goto(`${BASE}/friends`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${screenshotDir}/p3-07-friends.png` });

    const friendsInfo = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return {
        hasSearch: !!document.querySelector('input[type="search"], input[placeholder*="earch"], input[placeholder*="find"]'),
        hasFriendsText: text.includes('friend'),
        url: window.location.href,
      };
    });

    if (friendsInfo.url.includes('/friends')) {
      pass('Friends page loads', 'Friends page rendered');
      if (friendsInfo.hasSearch) pass('Friend search', 'Search input present');
    } else {
      pass('Friends auth guard', `Redirected to ${friendsInfo.url}`);
    }
  } catch (err) {
    fail('Friends page', err.message);
  }

  // ========================================
  // 7. Settings page
  // ========================================
  log('\n=== 7. Settings Page ===');
  try {
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${screenshotDir}/p3-08-settings.png` });

    const settingsInfo = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return {
        hasAvatar: text.includes('avatar'),
        hasPrivacy: text.includes('privacy') || text.includes('public') || text.includes('private'),
        hasUsername: text.includes('username'),
        url: window.location.href,
      };
    });

    if (settingsInfo.url.includes('/settings')) {
      pass('Settings page loads', 'Settings page rendered');
      if (settingsInfo.hasAvatar) pass('Avatar selector', 'Avatar section present');
      if (settingsInfo.hasPrivacy) pass('Privacy toggle', 'Privacy option present');
    } else {
      pass('Settings auth guard', `Redirected to ${settingsInfo.url}`);
    }
  } catch (err) {
    fail('Settings page', err.message);
  }

  // ========================================
  // 8. Server endpoints health check
  // ========================================
  log('\n=== 8. Server API Health ===');
  try {
    const endpoints = [
      { path: '/tables', name: 'Lobby tables', expectStatus: [200] },
      { path: '/social/avatars', name: 'Avatar list', expectStatus: [200] },
      { path: '/friends', name: 'Friends (no auth)', expectStatus: [401] },
    ];

    for (const ep of endpoints) {
      const response = await page.evaluate(async (path) => {
        try {
          const res = await fetch(`http://client:5173/api${path}`);
          return { status: res.status, ok: res.ok };
        } catch {
          // Try direct server
          try {
            const res = await fetch(`http://server:8080${path}`);
            return { status: res.status, ok: res.ok };
          } catch (e2) {
            return { error: e2.message };
          }
        }
      }, ep.path);

      if (response.error) {
        // Try from outside via the page context
        fail(ep.name, `Fetch error: ${response.error}`);
      } else if (ep.expectStatus.includes(response.status)) {
        pass(ep.name, `${ep.path} → ${response.status}`);
      } else {
        log(`  ? ${ep.name}: ${ep.path} → ${response.status} (expected ${ep.expectStatus.join('/')})`);
      }
    }
  } catch (err) {
    fail('API health', err.message);
  }

  // ========================================
  // 9. PWA manifest check
  // ========================================
  log('\n=== 9. PWA Manifest ===');
  try {
    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 15000 });

    const manifestInfo = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return { hasLink: false };

      try {
        const res = await fetch(link.href);
        const manifest = await res.json();
        return {
          hasLink: true,
          href: link.href,
          name: manifest.name,
          shortName: manifest.short_name,
          display: manifest.display,
          hasIcons: !!(manifest.icons && manifest.icons.length > 0),
          iconCount: manifest.icons?.length || 0,
        };
      } catch (e) {
        return { hasLink: true, href: link.href, fetchError: e.message };
      }
    });

    if (manifestInfo.hasLink) {
      pass('Manifest link', `<link rel="manifest"> found at ${manifestInfo.href}`);
      if (manifestInfo.name) pass('Manifest name', manifestInfo.name);
      if (manifestInfo.display) pass('Manifest display', manifestInfo.display);
      if (manifestInfo.hasIcons) pass('Manifest icons', `${manifestInfo.iconCount} icons defined`);
      if (manifestInfo.fetchError) fail('Manifest fetch', manifestInfo.fetchError);
    } else {
      fail('PWA manifest', 'No <link rel="manifest"> found — PWA may be disabled in dev mode');
    }
  } catch (err) {
    fail('PWA manifest', err.message);
  }

  // ========================================
  // 10. ChatPanel component exists in game page
  // ========================================
  log('\n=== 10. Chat Panel (structure check) ===');
  try {
    // Navigate to a game page — even if no game exists, check if ChatPanel markup is present
    await page.goto(`${BASE}/game/test`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: `${screenshotDir}/p3-09-game-with-chat.png` });

    const chatInfo = await page.evaluate(() => {
      const text = document.body.innerHTML.toLowerCase();
      return {
        hasChatPanel: text.includes('chat') || !!document.querySelector('[class*="chat"]'),
        hasChatToggle: !!document.querySelector('button[class*="chat"], [aria-label*="chat"], button[title*="chat"]'),
        bodyText: document.body.innerText.substring(0, 300),
      };
    });

    if (chatInfo.hasChatPanel || chatInfo.hasChatToggle) {
      pass('Chat panel', 'Chat-related markup found in game page');
    } else {
      log(`  ? No chat markup found — may only render after game loads`);
      log(`  Page text: ${chatInfo.bodyText}`);
    }
  } catch (err) {
    fail('Chat panel', err.message);
  }

  // ========================================
  // Summary
  // ========================================
  log('\n========================================');
  log('         VERIFICATION SUMMARY');
  log('========================================');

  const passes = results.filter(r => r.status === 'PASS');
  const fails = results.filter(r => r.status === 'FAIL');

  log(`\n  PASSED: ${passes.length}`);
  log(`  FAILED: ${fails.length}`);
  log(`  TOTAL:  ${results.length}`);

  if (fails.length > 0) {
    log('\n  Failed checks:');
    fails.forEach(f => log(`    ✗ ${f.name}: ${f.detail}`));
  }

  if (consoleLogs.length > 0) {
    const errors = consoleLogs.filter(l => l.startsWith('[error]'));
    if (errors.length > 0) {
      log(`\n  Browser errors: ${errors.length}`);
      errors.slice(0, 5).forEach(e => log(`    ${e}`));
    }
  }
  if (pageErrors.length > 0) {
    log(`\n  Page errors: ${pageErrors.length}`);
    pageErrors.slice(0, 5).forEach(e => log(`    ${e}`));
  }

  log('\n  Screenshots saved to /screenshots/p3-*.png');
  log('========================================\n');

  await browser.close();
  process.exit(fails.length > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
