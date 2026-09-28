// Move the inline boot script that SvelteKit (adapter-static) embeds in prerendered HTML
// into an external file, to stay compatible with the strict CSP (script-src 'self', no unsafe-inline).
// Assumes paths.relative=false (references in the code are absolute paths, so they still resolve after the move).
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

// Locally this is build/; on Vercel, adapter-static writes directly to .vercel/output/static
const CANDIDATES = ['build', '.vercel/output/static'];

function fnv1a(input) {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function* htmlFiles(dir) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) yield* htmlFiles(p);
		else if (p.endsWith('.html')) yield p;
	}
}

let moved = 0;
for (const dir of CANDIDATES.filter((d) => existsSync(d))) {
	mkdirSync(join(dir, '_app'), { recursive: true });
	for (const p of htmlFiles(dir)) {
		const html = readFileSync(p, 'utf8');
		const replaced = html.replace(/<script>([\s\S]*?)<\/script>/g, (_, code) => {
			const name = `_app/boot.${fnv1a(code)}.js`;
			writeFileSync(join(dir, name), code);
			moved++;
			return `<script src="/${name}"></script>`;
		});
		if (replaced !== html) writeFileSync(p, replaced);
	}
}
console.log(`externalize-inline: externalized ${moved} inline scripts`);
if (moved === 0) {
	console.error('❌ No inline script found (the SvelteKit output format may have changed)');
	process.exit(1);
}

// Routes with csr=false (/e/[id], /c, /c/[slug]) do not serve __data.json, so delete it.
// Navigations to them force a full reload via data-sveltekit-reload.
let removed = 0;
for (const dir of CANDIDATES.filter((d) => existsSync(d))) {
	for (const section of ['e', 'c']) {
		const base = join(dir, section);
		if (!existsSync(base)) continue;
		for (const name of readdirSync(base)) {
			const p = join(base, name);
			// [param] routes emit <section>/<param>/__data.json and index routes emit
			// <section>/__data.json, so check both the directories and the files directly inside
			if (statSync(p).isDirectory() || name === '__data.json') {
				rmSync(p, { recursive: true });
				removed++;
			}
		}
	}
}
console.log(`Removed __data.json: ${removed}`);
