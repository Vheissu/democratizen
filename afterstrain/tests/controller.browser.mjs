import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const server = await createServer({ server: { port: 5199, strictPort: true, watch: { ignored: ['**/android/**', '**/ios/**', '**/build/**'] } } });
await server.listen();
const browser = await chromium.launch();
let checks = 0;
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1920, height: 1080 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.testPad = { buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [0, 0], connected: true, mapping: 'standard', index: 0 };
      navigator.getGamepads = () => window.testPad ? [window.testPad] : [];
    });
    await page.goto('http://localhost:5199');
    await page.waitForSelector('[data-action=setup]');
    const press = async index => {
      await page.evaluate(index => { window.testPad.buttons[index].pressed = true; }, index);
      await page.waitForTimeout(100);
      await page.evaluate(index => { window.testPad.buttons[index].pressed = false; }, index);
      await page.waitForTimeout(100);
    };
    const focus = async action => page.locator(`[data-action="${action}"]`).first().focus();
    const expectVisible = async selector => { assert.ok(await page.locator(selector).isVisible(), selector); checks++; };
    const reachable = async () => {
      const missing = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('button:not(:disabled),input:not([hidden])')].filter(node => node.getBoundingClientRect().width > 0);
        const seen = new Set([0]);
        const queue = [0];
        while (queue.length) {
          const index = queue.shift();
          for (const direction of ['up', 'down', 'left', 'right']) {
            nodes[index].focus();
            window.dispatchEvent(new CustomEvent('afterstrain-control', { detail: direction }));
            const destination = nodes.indexOf(document.activeElement);
            if (destination >= 0 && !seen.has(destination)) { seen.add(destination); queue.push(destination); }
          }
        }
        return nodes.filter((_, index) => !seen.has(index)).map(node => node.dataset.action || node.id);
      });
      assert.deepEqual(missing, [], 'Every control must be reachable using only directions'); checks++;
    };
    await focus('setup'); await press(0); await expectVisible('.setup');
    await reachable();
    await page.locator('#strain-name').focus(); await press(0);
    assert.notEqual(await page.evaluate(() => document.activeElement.id), 'strain-name'); checks++;
    await focus('start'); await press(0); await expectVisible('canvas');
    await reachable();
    await press(9); assert.match(await page.locator('.timeline strong').innerText(), /running/); checks++;
    await press(9); assert.equal(await page.locator('.timeline strong').innerText(), 'Paused'); checks++;
    const region = await page.locator('.country-select h2').innerText();
    await press(5); assert.notEqual(await page.locator('.country-select h2').innerText(), region); checks++;
    await press(4); assert.equal(await page.locator('.country-select h2').innerText(), region); checks++;
    await focus('tab-lab'); await press(0); await expectVisible('.lab');
    await reachable();
    await focus('evolve-reach-0'); await press(0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('afterstrain-save-v1')).traits['reach-0']), 1); checks++;
    await press(1); await expectVisible('canvas');
    for (const [button, direction] of [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']]) {
      await focus(direction === 'left' ? 'tab-lab' : direction === 'up' ? 'speed-0' : 'tab-world');
      const before = await page.evaluate(() => document.activeElement.dataset.action);
      await press(button);
      assert.notEqual(await page.evaluate(() => document.activeElement.dataset.action), before, direction); checks++;
    }
    await focus('tab-world');
    await page.evaluate(() => { window.moves = 0; document.addEventListener('focusin', () => window.moves++); window.testPad.axes[0] = 0.8; });
    await page.waitForTimeout(650);
    assert.ok(await page.evaluate(() => window.moves >= 2)); checks++;
    await page.evaluate(() => { window.testPad = null; });
    await page.waitForTimeout(100);
    const stopped = await page.evaluate(() => window.moves);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.moves), stopped); checks++;
    await page.evaluate(() => { window.testPad = { buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [0, 0] }; });
    await focus('tab-news'); await press(0); await expectVisible('.dispatches');
    await press(1); await expectVisible('canvas');
    await focus('tab-archive'); await press(0); await expectVisible('.archive');
    await press(1); await expectVisible('canvas');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('afterstrain-control', { detail: 'back' })));
    await expectVisible('.landing');
    await focus('continue'); await press(0); await expectVisible('canvas');
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('controller-input'))); checks++;
    assert.ok(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle === 'solid')); checks++;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); checks++;
    assert.deepEqual(errors, []); checks++;
    await page.close();
  }
  console.log(`${checks} browser controller checks passed (phone and TV layouts).`);
} finally {
  await browser.close();
  await server.close();
}
