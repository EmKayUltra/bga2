import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const logs = [];
page.on('console', msg => logs.push(`${msg.type()}: ${msg.text()}`));
page.on('pageerror', err => logs.push(`ERROR: ${err.message}`));

try {
  // Load harness page
  console.log('Loading /dev/harness...');
  await page.goto('http://client:5173/dev/harness', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '/screenshots/harness-01-initial.png', fullPage: false });
  console.log('Screenshot 1: initial load');

  // Select Hive from dropdown
  await page.select('select', 'hive');
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: '/screenshots/harness-02-hive-selected.png', fullPage: false });
  console.log('Screenshot 2: hive selected');

  // Click New Game
  const btn = await page.$('button');
  if (btn) {
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await b.evaluate(el => el.textContent);
      if (text.trim() === 'New Game') {
        await b.click();
        break;
      }
    }
  }
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/screenshots/harness-03-hive-game.png', fullPage: true });
  console.log('Screenshot 3: hive game created');

} catch (err) {
  console.error('Error:', err.message);
  await page.screenshot({ path: '/screenshots/harness-error.png', fullPage: false }).catch(() => {});
}

if (logs.length > 0) {
  console.log('\n--- Browser Console ---');
  logs.forEach(l => console.log(l));
}

await browser.close();
