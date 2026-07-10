// build/ を本番同等の条件で配信する検証用サーバ。
// - vercel.json のセキュリティヘッダー（CSP含む）を適用 → CSP退行をCIで検知できる
// - cleanUrls 相当（拡張子なしパスに .html を解決）
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 5299);
const root = resolve('build');
const vercelHeaders = JSON.parse(readFileSync('vercel.json', 'utf8')).headers[0].headers;

const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.xml': 'application/xml',
	'.txt': 'text/plain; charset=utf-8',
	'.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
	let file = resolve(join(root, path === '/' ? 'index.html' : path));
	if (!file.startsWith(root)) {
		res.writeHead(403);
		return res.end();
	}
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
	if (!existsSync(file)) {
		res.writeHead(404);
		return res.end('not found');
	}
	for (const h of vercelHeaders) res.setHeader(h.key, h.value);
	res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
	res.end(readFileSync(file));
}).listen(port, () => console.log(`serving build/ with CSP headers on http://localhost:${port}`));
