import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  headless: true, executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const logs = [];
page.on('console', msg => logs.push(`${msg.type()}: ${msg.text()}`));
page.on('pageerror', err => logs.push(`ERROR: ${err.message}`));
try {
  await page.goto('http://client:5173/dev/harness', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2000));
  // Select azul and click New Game
  await page.select('select', 'azul');
  await new Promise(r => setTimeout(r, 500));
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await b.evaluate(el => el.textContent);
    if (text.trim() === 'New Game') { await b.click(); break; }
  }
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/screenshots/harness-azul.png', fullPage: false });
  console.log('Screenshot: azul game');
} catch (err) {
  console.error('Error:', err.message);
  await page.screenshot({ path: '/screenshots/harness-azul-error.png' }).catch(() => {});
}
if (logs.length > 0) { console.log('\n--- Console ---'); logs.forEach(l => console.log(l)); }
await browser.close();
