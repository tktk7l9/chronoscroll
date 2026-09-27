// Cloudflare Workers 静的アセット用 `_headers` の生成ロジック（純関数）。
// 正本は config/security-headers.json。Worker（/e/*）と e2e/serve.mjs も同じ JSON を読む。
// https://developers.cloudflare.com/workers/static-assets/headers/

/** パス別の Cache-Control。Vercel 時代の vercel.json と同じ値 + immutable アセット */
export const CACHE_RULES = [
	['/data/*', 'public, max-age=3600, stale-while-revalidate=86400'],
	['/_app/immutable/*', 'public, max-age=31536000, immutable'],
];

/** @param {Record<string, string>} security ヘッダー名 → 値 */
export function renderHeadersFile(security) {
	const lines = [
		'# 生成物: config/security-headers.json から scripts/write-headers.mjs が作る。手で編集しない。',
		'/*',
	];
	for (const [name, value] of Object.entries(security)) lines.push(`  ${name}: ${value}`);
	for (const [path, cacheControl] of CACHE_RULES) lines.push('', path, `  Cache-Control: ${cacheControl}`);
	return lines.join('\n') + '\n';
}
