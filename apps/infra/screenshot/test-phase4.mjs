import puppeteer from 'puppeteer-core';

const screenshotDir = '/screenshots';
const baseUrl = process.argv[2] || 'http://client:5173';
const apiUrl = 'http://server:8080';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.message));

  // Step 1: Register + sign in via the UI form using keyboard submit
  console.log('=== Step 1: Register via UI ===');
  await page.goto(`${baseUrl}/auth/register`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1000));

  // Type into each field by ID
  await page.click('#email');
  await page.type('#email', 'phase4test@example.com');
  await page.click('#username');
  await page.type('#username', 'phase4test');
  await page.click('#displayName');
  await page.type('#displayName', 'Phase4 Tester');
  await page.click('#password');
  await page.type('#password', 'TestPass123!');

  // Press Enter to submit (works with form submit handlers)
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 4000));

  let afterUrl = page.url();
  console.log(`After register, URL: ${afterUrl}`);
  await page.screenshot({ path: `${screenshotDir}/phase4-01-after-register.png` });

  // If still on auth page, try sign in
  if (afterUrl.includes('/auth/')) {
    console.log('Trying sign-in...');
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));

    await page.click('#username');
    await page.type('#username', 'phase4test');
    await page.click('#password');
    await page.type('#password', 'TestPass123!');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 4000));

    afterUrl = page.url();
    console.log(`After sign-in, URL: ${afterUrl}`);
    await page.screenshot({ path: `${screenshotDir}/phase4-01-after-signin.png` });
  }

  const isAuth = !afterUrl.includes('/auth/');
  console.log(`Authenticated: ${isAuth}`);

  // ── LOBBY ──────────────────────────────────────────────
  console.log('\n=== Step 2: Lobby ===');
  await page.goto(`${baseUrl}/lobby`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: `${screenshotDir}/phase4-02-lobby.png`, fullPage: true });

  const lobbyInfo = await page.evaluate(() => {
    const t = document.body.textContent;
    return {
      filterBar: t.includes('All') && t.includes('Real-time') && t.includes('Async'),
      createBtn: t.includes('Create Table'),
      myGames: t.includes('My Games'),
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()),
      headings: Array.from(document.querySelectorAll('h1,h2,h3')).map(h => h.textContent.trim()),
    };
  });
  console.log('Lobby:', JSON.stringify(lobbyInfo, null, 2));

  // ── CREATE TABLE (if auth) ─────────────────────────────
  if (isAuth) {
    console.log('\n=== Step 3: Create Table dialog ===');
    // Click the Create Table button
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim().includes('Create Table'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clicked) {
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: `${screenshotDir}/phase4-03-create-table.png`, fullPage: true });
      const ct = await page.evaluate(() => {
        const t = document.body.textContent;
        return {
          gameMode: t.includes('Game Mode'),
          asyncOption: t.includes('Async'),
          realtimeOption: t.includes('Real-time'),
          timerPreset: t.includes('Fast') || t.includes('Normal') || t.includes('Slow'),
          skipThreshold: t.includes('skip') || t.includes('Skip'),
        };
      });
      console.log('Create table:', JSON.stringify(ct, null, 2));
    } else {
      console.log('No Create Table button found');
    }
  }

  // ── SETTINGS ───────────────────────────────────────────
  console.log('\n=== Step 4: Settings ===');
  await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: `${screenshotDir}/phase4-04-settings.png`, fullPage: true });

  const settingsInfo = await page.evaluate(() => {
    const t = document.body.textContent;
    return {
      url: window.location.href,
      title: document.querySelector('h1,h2')?.textContent?.trim(),
      notifications: t.includes('Notification'),
      email: t.includes('Email'),
      push: t.includes('Push'),
      reminder: t.includes('Reminder') || t.includes('reminder'),
      saveNotif: t.includes('Save Notification'),
      sections: Array.from(document.querySelectorAll('h2,h3')).map(h => h.textContent.trim()),
      toggles: document.querySelectorAll('input[type="checkbox"]').length,
      selects: document.querySelectorAll('select').length,
    };
  });
  console.log('Settings:', JSON.stringify(settingsInfo, null, 2));

  // ── NAV BAR ────────────────────────────────────────────
  console.log('\n=== Step 5: Nav ===');
  const navInfo = await page.evaluate(() => {
    return {
      links: Array.from(document.querySelectorAll('nav a, header a')).map(a => ({
        text: a.textContent.trim(), href: a.getAttribute('href')
      })),
      badge: !!document.querySelector('[class*="badge"]'),
    };
  });
  console.log('Nav:', JSON.stringify(navInfo, null, 2));

  if (pageErrors.length > 0) {
    console.log('\n=== Page Errors ===');
    pageErrors.forEach(e => console.log(`  ${e}`));
  }

  console.log('\nDone.');
  await browser.close();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
