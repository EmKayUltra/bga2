import puppeteer from 'puppeteer-core';

const screenshotDir = '/screenshots';
const baseUrl = process.argv[2] || 'http://client:5173';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Sign in
  console.log('Signing in...');
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1000));
  await page.click('#username');
  await page.type('#username', 'phase4test');
  await page.click('#password');
  await page.type('#password', 'TestPass123!');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 3000));
  console.log(`URL after login: ${page.url()}`);

  // Go to lobby
  await page.goto(`${baseUrl}/lobby`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500));

  // Click Create Table
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim().includes('Create Table'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click the Async toggle button
  console.log('Clicking Async toggle...');
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const asyncBtn = btns.find(b => b.textContent.trim() === 'Async');
    if (asyncBtn) { asyncBtn.click(); return true; }
    return false;
  });
  console.log(`Async clicked: ${clicked}`);
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: `${screenshotDir}/phase4-05-create-table-async.png`, fullPage: true });
  console.log('Saved: phase4-05-create-table-async.png');

  const asyncAnalysis = await page.evaluate(() => {
    const t = document.body.textContent;
    return {
      hasTimerPreset: t.includes('Timer') || t.includes('timer'),
      hasFast: t.includes('Fast'),
      hasNormal: t.includes('Normal'),
      hasSlow: t.includes('Slow'),
      hasSkipThreshold: t.includes('Skip') || t.includes('skip') || t.includes('threshold'),
      allText: t.substring(0, 2000),
    };
  });
  console.log('Async create table:', JSON.stringify(asyncAnalysis, null, 2));

  console.log('\nDone.');
  await browser.close();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
