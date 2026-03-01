import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://host.docker.internal:5173/game/test';
const outPath = '/screenshots/game.png';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

try {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
  // Wait a bit for PixiJS canvas to render
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`Screenshot saved to ${outPath}`);

  // Also grab console errors
  const logs = [];
  page.on('console', msg => logs.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => logs.push(`ERROR: ${err.message}`));

  // Re-navigate to capture console output
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  if (logs.length > 0) {
    console.log('\n--- Browser Console ---');
    logs.forEach(l => console.log(l));
  }
} catch (err) {
  console.error('Screenshot failed:', err.message);
  // Take screenshot anyway in case partial render
  await page.screenshot({ path: outPath, fullPage: false }).catch(() => {});
}

await browser.close();
