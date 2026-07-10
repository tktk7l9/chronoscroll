// SvelteKit(adapter-static) が prerendered HTML に埋め込むインラインの起動スクリプトを
// 外部ファイルへ移す。厳格CSP（script-src 'self'・unsafe-inline なし）と両立させるため。
// paths.relative=false 前提（コード内の参照が絶対パスなので移設しても解決できる）。
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';

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

mkdirSync(join(BUILD, '_app'), { recursive: true });
let moved = 0;
for (const p of htmlFiles(BUILD)) {
	const html = readFileSync(p, 'utf8');
	const replaced = html.replace(/<script>([\s\S]*?)<\/script>/g, (_, code) => {
		const name = `_app/boot.${fnv1a(code)}.js`;
		writeFileSync(join(BUILD, name), code);
		moved++;
		return `<script src="/${name}"></script>`;
	});
	if (replaced !== html) writeFileSync(p, replaced);
}
console.log(`externalize-inline: ${moved}件のインラインスクリプトを外部化`);
if (moved === 0) console.warn('⚠️ インラインスクリプトが見つからなかった（SvelteKitの出力形式が変わった可能性）');
