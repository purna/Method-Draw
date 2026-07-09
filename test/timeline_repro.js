const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/nigelmorris/Documents/GitHub/Method-Draw/node_modules/playwright-core');

const ROOT = '/Users/nigelmorris/Documents/GitHub/Method-Draw/src';
const PORT = 8123;

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8123/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.methodDraw && window.methodDraw.timeline && window.methodDraw.timeline.getInstance && window.methodDraw.timeline.getInstance(), { timeout: 15000 });

  // Inject a rectangle and select it
  await page.evaluate(() => {
    const svgcontent = document.getElementById('svgcontent');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('id', 'test_rect');
    rect.setAttribute('x', 100); rect.setAttribute('y', 100);
    rect.setAttribute('width', 80); rect.setAttribute('height', 80);
    rect.setAttribute('fill', '#000000');
    svgcontent.appendChild(rect);
    window.methodDraw.canvas.selectOnly([rect]);
  });

  // Add to timeline (creates parent object only)
  await page.evaluate(() => window.methodDraw.timeline.addToTimeline(document.getElementById('test_rect')));

  // Add a Colour property track via the sidebar popover
  await page.click('[data-action="add-property"]');
  await page.waitForSelector('.property-item');
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.property-item'));
    const colour = items.find(i => i.textContent.trim() === 'Colour');
    colour.click();
  });

  // Scrub to first keyframe, set red; scrub to last keyframe, set blue
  await page.evaluate(() => {
    const tl = window.methodDraw.timeline.getInstance();
    window.methodDraw.canvas.selectOnly([document.getElementById('test_rect')]);
    tl.setTime(0);
    window.methodDraw.canvas.setColor('fill', '#ff0000');
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const tl = window.methodDraw.timeline.getInstance();
    window.methodDraw.canvas.selectOnly([document.getElementById('test_rect')]);
    tl.setTime(2000);
    window.methodDraw.canvas.setColor('fill', '#0000ff');
  });
  await page.waitForTimeout(100);

  const result = await page.evaluate(() => {
    const obj = window.methodDraw.timeline.getObjects()[0];
    const colour = obj.childRows.find(r => r.propKey === 'colourFill');
    return {
      keyframes: colour.keyframes.map(k => ({ val: k.val, value: k.value, easing: k.easing })),
      css: window.methodDraw.timeline.exportCSS()
    };
  });

  console.log('=== ERRORS ===');
  console.log(errors.length ? errors.join('\n') : '(none)');
  console.log('=== COLOUR TRACK KEYFRAMES ===');
  console.log(JSON.stringify(result.keyframes, null, 2));
  console.log('=== EXPORTED CSS (colour part) ===');
  console.log(result.css.split('\n').filter(l => l.includes('fill') || l.includes('@keyframes') || l.includes('animation:')).join('\n'));

  await browser.close();
  server.close();
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
