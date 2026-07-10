// chronoscroll 実ブラウザスモーク: アクション実行+スクリーンショット+コンソールエラー収集
// 使い方: node e2e/shot.mjs <url> <out.png> "<actions>"
// actions: カンマ区切り。 scroll:600 / zoomin:400 / click:<selector> / type:<selector>:<text>
//          press:<key> / wait:800 / mobile / eval:<js>
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5199/';
const out = process.argv[3] ?? 'shot.png';
const actions = process.argv[4] ?? '';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

for (const act of actions.split(',').filter(Boolean)) {
	const [name, ...args] = act.split(':');
	try {
		if (name === 'scroll') await page.mouse.wheel(0, Number(args[0]));
		else if (name === 'zoomin') {
			await page.keyboard.down('Meta');
			await page.mouse.move(640, 400);
			await page.mouse.wheel(0, -Number(args[0] ?? 400));
			await page.keyboard.up('Meta');
		} else if (name === 'click') await page.click(args.join(':'), { timeout: 4000 });
		else if (name === 'type') {
			const text = args.pop();
			await page.fill(args.join(':'), text, { timeout: 4000 });
		} else if (name === 'press') await page.keyboard.press(args[0]);
		else if (name === 'wait') await page.waitForTimeout(Number(args[0]));
		else if (name === 'mobile') await page.setViewportSize({ width: 390, height: 720 });
		else if (name === 'eval') await page.evaluate(args.join(':'));
	} catch (e) {
		errors.push(`${name} failed: ${e.message.split('\n')[0]}`);
	}
	await page.waitForTimeout(250);
}
await page.waitForTimeout(600);

await page.screenshot({ path: out });
const info = await page.evaluate(() => ({
	cards: document.querySelectorAll('.card').length,
	dialogOpen: document.querySelector('dialog')?.open ?? false,
	url: location.search,
	scrollY: Math.round(scrollY),
}));
console.log(JSON.stringify({ ...info, errors: errors.slice(0, 6) }, null, 1));
await browser.close();
