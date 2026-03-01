import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://client:5173/game/test';
const screenshotDir = '/screenshots';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Capture console messages and errors
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.message));

  console.log(`Navigating to ${url}...`);

  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  } catch (err) {
    console.error(`Navigation failed: ${err.message}`);
    await page.screenshot({ path: `${screenshotDir}/error.png` });
    await browser.close();
    process.exit(1);
  }

  // Wait for PixiJS canvas to initialize
  console.log('Waiting for canvas render...');
  await new Promise(r => setTimeout(r, 3000));

  // === Screenshot 1: Initial state ===
  await page.screenshot({ path: `${screenshotDir}/01-initial.png` });
  console.log('Saved: 01-initial.png');

  // === DOM analysis ===
  const domInfo = await page.evaluate(() => {
    const container = document.querySelector('.game-container');
    const canvas = container?.querySelector('canvas');
    const toolbar = document.querySelector('.dev-toolbar');
    const loading = document.querySelector('.loading-overlay');
    const error = document.querySelector('.error-overlay');

    return {
      containerSize: container ? { w: container.clientWidth, h: container.clientHeight } : null,
      canvasSize: canvas ? { w: canvas.width, h: canvas.height } : null,
      canvasStyle: canvas ? { w: canvas.style.width, h: canvas.style.height } : null,
      hasScrollbars: container ? (container.scrollWidth > container.clientWidth || container.scrollHeight > container.clientHeight) : null,
      bodyScrollable: document.body.scrollWidth > window.innerWidth || document.body.scrollHeight > window.innerHeight,
      toolbarVisible: toolbar ? toolbar.offsetParent !== null : false,
      toolbarText: toolbar?.textContent?.trim().substring(0, 200) || '',
      loadingVisible: loading ? loading.offsetParent !== null : false,
      errorVisible: error ? error.offsetParent !== null : false,
      errorText: error?.textContent?.trim() || '',
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });

  console.log('\n=== DOM Analysis ===');
  console.log(`Viewport: ${domInfo.viewport.w}x${domInfo.viewport.h}`);
  console.log(`Container: ${JSON.stringify(domInfo.containerSize)}`);
  console.log(`Canvas element: ${JSON.stringify(domInfo.canvasSize)}`);
  console.log(`Canvas style: ${JSON.stringify(domInfo.canvasStyle)}`);
  console.log(`Has scrollbars: ${domInfo.hasScrollbars}`);
  console.log(`Body scrollable: ${domInfo.bodyScrollable}`);
  console.log(`Loading overlay: ${domInfo.loadingVisible}`);
  console.log(`Error overlay: ${domInfo.errorVisible}${domInfo.errorText ? ` — ${domInfo.errorText}` : ''}`);
  console.log(`Dev toolbar: ${domInfo.toolbarVisible} — ${domInfo.toolbarText}`);

  // === PixiJS canvas analysis ===
  const pixiInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { exists: false };

    // Sample pixels to check if anything is actually rendered with color
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { exists: true, canGetContext: false };

    const pixels = [];
    const samplePoints = [
      { label: 'top-left', x: 100, y: 80 },
      { label: 'center', x: 640, y: 400 },
      { label: 'factory-area', x: 200, y: 100 },
      { label: 'player-area', x: 200, y: 500 },
      { label: 'bottom-right', x: 1000, y: 700 },
    ];

    for (const pt of samplePoints) {
      try {
        const data = ctx.getImageData(pt.x, pt.y, 1, 1).data;
        pixels.push({ ...pt, r: data[0], g: data[1], b: data[2], a: data[3] });
      } catch {
        pixels.push({ ...pt, error: 'cross-origin or WebGL' });
      }
    }

    return { exists: true, canGetContext: true, pixels };
  });

  console.log('\n=== Canvas Analysis ===');
  console.log(`Canvas exists: ${pixiInfo.exists}`);
  if (pixiInfo.canGetContext === false) {
    console.log('Cannot get 2D context (WebGL canvas — pixel sampling not available)');
  }
  if (pixiInfo.pixels) {
    for (const p of pixiInfo.pixels) {
      if (p.error) {
        console.log(`  ${p.label} (${p.x},${p.y}): ${p.error}`);
      } else {
        console.log(`  ${p.label} (${p.x},${p.y}): rgba(${p.r},${p.g},${p.b},${p.a})`);
      }
    }
  }

  // === Console output ===
  if (consoleLogs.length > 0) {
    console.log('\n=== Browser Console ===');
    consoleLogs.forEach(l => console.log(`  ${l}`));
  }
  if (pageErrors.length > 0) {
    console.log('\n=== Page Errors ===');
    pageErrors.forEach(e => console.log(`  ${e}`));
  }

  // === Full page screenshot (to see overflow) ===
  await page.screenshot({ path: `${screenshotDir}/02-fullpage.png`, fullPage: true });
  console.log('\nSaved: 02-fullpage.png');

  console.log('\nDone.');
  await browser.close();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
