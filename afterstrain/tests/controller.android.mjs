import { execFileSync } from 'node:child_process';
import { _android } from 'playwright';
import assert from 'node:assert/strict';
const adb = process.env.ADB || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const serial = process.env.ANDROID_SERIAL || 'emulator-5556';
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const pid = run('shell', 'pidof', 'com.rangefront.afterstrain');
assert.ok(pid, 'Launch the debug APK before running this test.');
const device = (await _android.devices()).find(device => device.serial() === serial);
assert.ok(device, 'Android emulator must be connected.');
const view = (await device.webViews()).find(view => view.pkg() === 'com.rangefront.afterstrain');
assert.ok(view, 'Debug WebView must be available.');
const page = await view.page();
let checks = 0;
const key = async code => { run('shell', 'input', 'keyevent', String(code)); await page.waitForTimeout(200); };
const focus = async action => page.locator(`[data-action="${action}"]`).first().focus();
const visible = async selector => { await page.waitForSelector(selector); checks++; };
const backup = await page.evaluate(() => localStorage.getItem('afterstrain-save-v1'));
try {
  await page.reload(); await visible('.landing');
  await focus('setup'); await key(23); await visible('.setup');
  await focus('start'); await key(96); await visible('canvas');
  await key(108); assert.match(await page.locator('.timeline strong').innerText(), /running/); checks++;
  await key(85); assert.equal(await page.locator('.timeline strong').innerText(), 'Paused'); checks++;
  const region = await page.locator('.country-select h2').innerText();
  await key(103); assert.notEqual(await page.locator('.country-select h2').innerText(), region); checks++;
  await key(102); assert.equal(await page.locator('.country-select h2').innerText(), region); checks++;
  for (const [code, action] of [[19, 'speed-0'], [20, 'tab-world'], [21, 'tab-lab'], [22, 'tab-world']]) {
    await focus(action);
    const before = await page.evaluate(() => document.activeElement.dataset.action);
    await key(code);
    assert.notEqual(await page.evaluate(() => document.activeElement.dataset.action), before); checks++;
  }
  await focus('tab-lab'); await key(23); await visible('.lab');
  await focus('evolve-reach-0'); await key(96);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('afterstrain-save-v1')).traits['reach-0']), 1); checks++;
  await key(97); await visible('canvas');
  await focus('tab-news'); await key(23); await visible('.dispatches');
  await key(4); await visible('canvas');
  await focus('tab-archive'); await key(23); await visible('.archive');
  await key(4); await visible('canvas');
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('controller-input'))); checks++;
  console.log(`${checks} Android native controller / remote checks passed.`);
} finally {
  await page.evaluate(backup => { if (backup === null) localStorage.removeItem('afterstrain-save-v1'); else localStorage.setItem('afterstrain-save-v1', backup); }, backup);
  await page.reload();
  await device.close();
}
