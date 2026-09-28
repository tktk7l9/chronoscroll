// Verification server that serves build/ under production-equivalent conditions.
// - Applies the security headers (including CSP) from config/security-headers.json → CI catches CSP regressions
// - Equivalent to cleanUrls (resolves extensionless paths to .html)
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 5299);
const root = resolve('build');
const securityHeaders = JSON.parse(readFileSync('config/security-headers.json', 'utf8'));

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
	// /e/<id> comes from the R2-served part (build-e/). In production this corresponds to the Worker returning it from R2
	const isPage = path.startsWith('/e/');
	const base = isPage ? resolve('build-e') : root;
	let file = resolve(join(base, isPage ? path.slice('/e'.length) : path === '/' ? 'index.html' : path));
	if (!file.startsWith(base)) {
		res.writeHead(403);
		return res.end();
	}
	// Equivalent to cleanUrls. When a same-named .html and a directory sit side by side, as with `/c` (the directory is for /c/anime),
	// prefer the .html like Vercel does (Vercel builds its route table from the output files, so they do not collide)
	if (!existsSync(file) || statSync(file).isDirectory()) {
		if (existsSync(`${file}.html`)) file = `${file}.html`;
		else if (existsSync(join(file, 'index.html'))) file = join(file, 'index.html');
	}
	if (!existsSync(file)) {
		res.writeHead(404);
		return res.end('not found');
	}
	for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
	res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
	res.end(readFileSync(file));
}).listen(port, () => console.log(`serving build/ with CSP headers on http://localhost:${port}`));
