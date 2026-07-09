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

  // Reproduce the user's flow: SELECT the first keyframe (diamond), set red;
  // SELECT the last keyframe, set blue. Selecting must move the playhead.
  const selectScenario = await page.evaluate(() => {
    const obj = window.methodDraw.timeline.getObjects()[0];
    const colour = obj.childRows.find(r => r.propKey === 'colourFill');
    const tl = window.methodDraw.timeline.getInstance();
    // select first keyframe
    tl.select(colour.keyframes[0]);
    const afterFirstSelect = tl.getTime();
    window.methodDraw.canvas.selectOnly([document.getElementById('test_rect')]);
    window.methodDraw.canvas.setColor('fill', '#ff0000');
    // select last keyframe
    tl.select(colour.keyframes[1]);
    const afterLastSelect = tl.getTime();
    window.methodDraw.canvas.selectOnly([document.getElementById('test_rect')]);
    window.methodDraw.canvas.setColor('fill', '#0000ff');

    return {
      afterFirstSelect, afterLastSelect,
      keyframes: colour.keyframes.map(k => ({ val: k.val, value: k.value, easing: k.easing })),
      css: window.methodDraw.timeline.exportCSS()
    };
  });

  const result = selectScenario;
  const playback = await page.evaluate(() => {
    const tl = window.methodDraw.timeline.getInstance();
    const fills = {};
    [0, 500, 1000, 1500, 2000].forEach(t => {
      tl.setTime(t);
      fills[t] = document.getElementById('test_rect').getAttribute('fill');
    });
    return fills;
  });

  console.log('=== ERRORS ===');
  console.log(errors.length ? errors.join('\n') : '(none)');
  console.log('=== PLAYHEAD AFTER SELECT (should be 0 then 2000) ===');
  console.log('firstSelect=' + result.afterFirstSelect + '  lastSelect=' + result.afterLastSelect);
  console.log('=== ELEMENT FILL AT TIMES (proves interpolation/animation) ===');
  console.log(JSON.stringify(playback, null, 2));
  console.log('=== COLOUR TRACK KEYFRAMES ===');
  console.log(JSON.stringify(result.keyframes, null, 2));

  await browser.close();
  server.close();
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
