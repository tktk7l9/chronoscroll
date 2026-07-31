// OGP画像を build/ の実データから生成して static/ へ書き戻す。
// 使い方: npm run build してから `node scripts/gen-ogp.mjs [port]`
//   - static/ogp.png            … サイト共通（static/ogp-src.html）
//   - static/ogp/c-<slug>.png   … 特集ごと（static/ogp-collection-src.html?slug=）
// 生成物はコミットする（配信時に生成しないため）。
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 5399);
const root = resolve('build');
if (!existsSync(root)) {
	console.error('❌ build/ がありません。先に npm run build を実行してください');
	process.exit(1);
}

const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
};

// OGPテンプレはCSPを付けずに配信する（インラインscriptで描画するため）
const server = createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
	let file = resolve(join(root, path === '/' ? 'index.html' : path));
	if (!file.startsWith(root) || !existsSync(file)) {
		res.writeHead(404);
		return res.end('not found');
	}
	res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
	res.end(readFileSync(file));
}).listen(port);

async function launch() {
	try {
		const { chromium } = await import('playwright');
		return await chromium.launch({ headless: true });
	} catch {
		const { chromium } = await import('playwright-core');
		return await chromium.launch({ channel: 'chrome', headless: true });
	}
}

const base = `http://localhost:${port}`;
const { collections } = JSON.parse(readFileSync('static/data/collections.json', 'utf8'));
mkdirSync('static/ogp', { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

// 1. サイト共通
await page.goto(`${base}/ogp-src.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: 'static/ogp.png' });
console.log('✅ static/ogp.png');

// 2. 特集ごと
for (const c of collections) {
	await page.goto(`${base}/ogp-collection-src.html?slug=${c.slug}`, { waitUntil: 'networkidle' });
	// テンプレ側が描画完了で data-ready を立てる
	await page.waitForSelector('body[data-ready="1"]', { timeout: 5000 });
	await page.waitForTimeout(250);
	const out = `static/ogp/c-${c.slug}.png`;
	await page.screenshot({ path: out });
	console.log(`✅ ${out}  (${c.title})`);
}

await browser.close();
server.close();
console.log(`\n${collections.length + 1}枚を生成しました`);
