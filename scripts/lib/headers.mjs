// Generation logic (pure function) for `_headers` used by Cloudflare Workers static assets.
// The source of truth is config/security-headers.json. The Worker (/e/*) and e2e/serve.mjs read the same JSON.
// https://developers.cloudflare.com/workers/static-assets/headers/

/** Cache-Control per path. Same values as vercel.json from the Vercel days + immutable assets */
export const CACHE_RULES = [
	['/data/*', 'public, max-age=3600, stale-while-revalidate=86400'],
	['/_app/immutable/*', 'public, max-age=31536000, immutable'],
];

/** @param {Record<string, string>} security header name → value */
export function renderHeadersFile(security) {
	const lines = [
		'# 生成物: config/security-headers.json から scripts/write-headers.mjs が作る。手で編集しない。',
		'/*',
	];
	for (const [name, value] of Object.entries(security)) lines.push(`  ${name}: ${value}`);
	for (const [path, cacheControl] of CACHE_RULES) lines.push('', path, `  Cache-Control: ${cacheControl}`);
	return lines.join('\n') + '\n';
}
