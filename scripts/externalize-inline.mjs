// SvelteKit(adapter-static) が prerendered HTML に埋め込むインラインの起動スクリプトを
// 外部ファイルへ移す。厳格CSP（script-src 'self'・unsafe-inline なし）と両立させるため。
// paths.relative=false 前提（コード内の参照が絶対パスなので移設しても解決できる）。
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

// ローカルは build/、Vercel上では adapter-static が .vercel/output/static に直接出力する
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
console.log(`externalize-inline: ${moved}件のインラインスクリプトを外部化`);
if (moved === 0) {
	console.error('❌ インラインスクリプトが見つからなかった（SvelteKitの出力形式が変わった可能性）');
	process.exit(1);
}

let removed = 0;
for (const dir of CANDIDATES.filter((d) => existsSync(join(d, 'e')))) {
	for (const name of readdirSync(join(dir, 'e'))) {
		const p = join(dir, 'e', name);
		if (statSync(p).isDirectory()) {
			rmSync(p, { recursive: true });
			removed++;
		}
	}
}
console.log(`__data.json削除: ${removed}件`);
