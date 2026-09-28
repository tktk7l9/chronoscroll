// Generate OGP images from the real data in build/ and write them back to static/.
// Usage: run npm run build, then `node scripts/gen-ogp.mjs [port]`
//   - static/ogp.png            … site-wide (static/ogp-src.html)
//   - static/ogp/c-<slug>.png   … per collection (static/ogp-collection-src.html?slug=)
// The output is committed (it is not generated at serve time).
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 5399);
const root = resolve('build');
if (!existsSync(root)) {
	console.error('❌ build/ is missing. Run npm run build first');
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

// Serve the OGP templates without CSP (they render with an inline script)
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

// 1. Site-wide
await page.goto(`${base}/ogp-src.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: 'static/ogp.png' });
console.log('✅ static/ogp.png');

// 2. Per collection
for (const c of collections) {
	await page.goto(`${base}/ogp-collection-src.html?slug=${c.slug}`, { waitUntil: 'networkidle' });
	// The template sets data-ready when rendering is complete
	await page.waitForSelector('body[data-ready="1"]', { timeout: 5000 });
	await page.waitForTimeout(250);
	const out = `static/ogp/c-${c.slug}.png`;
	await page.screenshot({ path: out });
	console.log(`✅ ${out}  (${c.title})`);
}

await browser.close();
server.close();
console.log(`\nGenerated ${collections.length + 1} images`);
