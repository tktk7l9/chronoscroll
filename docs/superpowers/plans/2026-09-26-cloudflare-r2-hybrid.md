# Cloudflare 移行（R2 ハイブリッド配信）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vercel 402 で止まっている chronoscroll を、`/e/*` の HTML だけ R2 から配信する Worker ＋ 静的アセット（94 ファイル）の構成で Cloudflare Workers 無料枠に移す。

**Architecture:** prerender・csr=false・月次 cron はそのまま。`worker/serve.ts` が `run_worker_first: ["/e/*"]` で受けた要求を R2 キー `e/<id>.html` に写して返し、それ以外は静的アセット。`scripts/r2-sync.mjs` が `build/e/*.html` の差分だけを S3 互換 API で R2 に同期する。セキュリティヘッダーは `config/security-headers.json` を正本に、`_headers`・Worker・e2e サーバの3箇所が読む。

**Tech Stack:** SvelteKit + adapter-static（既存）／Cloudflare Workers Static Assets + R2／wrangler 4.141／`@aws-sdk/client-s3` 3.x（同期スクリプトのみ）／vitest 5（lib 100% ゲート）

**Spec:** `docs/superpowers/specs/2026-09-26-cloudflare-r2-hybrid-design.md`

## Global Constraints

- Workers 無料枠：静的アセット **20,000 ファイル／1 ファイル 25 MiB**。`build/` から `e/` を除いた 94 ファイル・約 30MB だけをアセットにする（`build/e` は R2 へ）。
- 厳格 CSP を緩めない。変更は計測の差し替え分だけ：`script-src 'self' https://static.cloudflareinsights.com`／`connect-src 'self' https://cloudflareinsights.com`。`style-src-attr` のハッシュは現行のまま。
- `src/lib/*.ts`・`pipeline/lib/**/*.ts` は **カバレッジ 100%**（既存ゲート）。本計画で `worker/*.ts` と `scripts/lib/*.mjs` を同じゲートに加える。
- R2 の鍵は `.env.r2`（gitignore 済み）と Workers Builds の secret にだけ置く。**チャット・git・ログに出さない。**
- ホストは `https://chronoscroll.saitotakuya0719.workers.dev`（独自ドメインなし）。
- Web Analytics のトークン `cf62303813104660bbb08da280e9673d` は非秘密。行末に `gitleaks:allow` を付ける。SRI は付けない。
- 既存の実ブラウザスモーク 37 本（`e2e/smoke.mjs`）は無変更で green を保つ。
- コミットは 1 コミット＝1 つの完結した変更、テスト green の状態で。メッセージは日本語、末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- ブランチ `feat/cloudflare-r2-hybrid`（作成済み）。main へのマージは本人が行う。

## Review Focus

1. `/e/%2e%2e/x` のようにパーセントエンコードされたパス — 404 を返し、R2 のキーに `..` や `%` が届かないこと（Task 4 のテスト `パーセントエンコードは 404`）。
2. `HEAD /e/<id>` — 200 と同じヘッダー（ETag・Cache-Control・CSP）で本文なし（Task 4 のテスト `HEAD は本文なし`）。
3. `/e/<id>.html?k=anime` のようにクエリ付きの旧 URL — 301 先にクエリを残す（Task 4 のテスト `クエリを保ったまま 301`）。
4. R2 が例外を投げる（障害） — Cloudflare の 1101 エラーページでなく、セキュリティヘッダー付きの 503 を返す（Task 4 のテスト `R2 の例外は 503`）。
5. R2 の `manifest.json` が壊れている・配列である — 空扱いにして全件 PUT に倒れる（削除はしない）（Task 5 のテスト `壊れた manifest は空扱い`）。

---

### Task 1: セキュリティヘッダーの正本を `config/security-headers.json` に一本化する

**Files:**
- Create: `config/security-headers.json`
- Create: `scripts/lib/headers.mjs`
- Create: `scripts/lib/headers.test.mjs`
- Create: `scripts/write-headers.mjs`
- Create: `static/_headers`（生成物・コミットする）
- Modify: `e2e/serve.mjs:1-11, 41`
- Modify: `vitest.config.ts`
- Modify: `package.json`（`build` スクリプト）
- Delete: `vercel.json`

**Interfaces:**
- Produces: `renderHeadersFile(security: Record<string,string>): string`、`CACHE_RULES: [path, cacheControl][]`（`scripts/lib/headers.mjs`）。`config/security-headers.json` の形は `{ "<Header-Name>": "<value>", ... }`（6 キー）。Task 3 が CSP の値を変え、Task 4 の Worker が同じ JSON を import する。

- [x] **Step 1: JSON を作る（値は vercel.json からそのまま）**

`config/security-headers.json`:

```json
{
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='; img-src 'self' data: https://upload.wikimedia.org; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload"
}
```

- [x] **Step 2: vitest に `scripts/lib` を載せる**

`vitest.config.ts` を次のように変える（include に 2 パターン、coverage include と thresholds に 2 エントリを追加）:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: [
			"src/lib/**/*.test.ts",
			"pipeline/**/*.test.ts",
			"worker/**/*.test.ts",
			"scripts/lib/**/*.test.mjs",
		],
		coverage: {
			provider: "v8",
			include: ["src/lib/*.ts", "pipeline/lib/**/*.ts", "worker/*.ts", "scripts/lib/*.mjs"],
			exclude: ["**/*.test.ts", "**/*.test.mjs", "worker/index.ts"],
			reporter: ["text", "json-summary", "html"],
			// 純ロジック層（src/lib 直下 + pipeline/lib + worker + scripts/lib）は 100% を維持する
			// UIコンポーネント(src/lib/components)と IOスクリプト(pipeline/run, scripts/*.mjs 直下)は対象外
			thresholds: {
				"src/lib/*.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"pipeline/lib/**/*.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"worker/*.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"scripts/lib/*.mjs": { statements: 100, branches: 100, functions: 100, lines: 100 },
			},
		},
	},
});
```

- [x] **Step 3: 失敗するテストを書く**

`scripts/lib/headers.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CACHE_RULES, renderHeadersFile } from './headers.mjs';

const security = JSON.parse(readFileSync('config/security-headers.json', 'utf8'));

describe('renderHeadersFile', () => {
	it('全パスにセキュリティヘッダーを付ける', () => {
		const out = renderHeadersFile({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' });
		expect(out).toContain('/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n');
	});

	it('data と immutable アセットに Cache-Control を付ける', () => {
		const out = renderHeadersFile({});
		expect(CACHE_RULES).toEqual([
			['/data/*', 'public, max-age=3600, stale-while-revalidate=86400'],
			['/_app/immutable/*', 'public, max-age=31536000, immutable'],
		]);
		expect(out).toContain('\n/data/*\n  Cache-Control: public, max-age=3600, stale-while-revalidate=86400\n');
		expect(out).toContain('\n/_app/immutable/*\n  Cache-Control: public, max-age=31536000, immutable\n');
	});

	it('static/_headers は JSON から生成した内容と一致する（ドリフト検知）', () => {
		expect(readFileSync('static/_headers', 'utf8')).toBe(renderHeadersFile(security));
	});
});
```

- [x] **Step 4: 失敗を確認する**

Run: `npx vitest run scripts/lib/headers.test.mjs`
Expected: FAIL — `Failed to load ./headers.mjs`（モジュールが無い）

- [x] **Step 5: 実装する**

`scripts/lib/headers.mjs`:

```js
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
```

`scripts/write-headers.mjs`:

```js
// config/security-headers.json → static/_headers。npm run build の先頭で実行する。
import { readFileSync, writeFileSync } from 'node:fs';
import { renderHeadersFile } from './lib/headers.mjs';

const security = JSON.parse(readFileSync('config/security-headers.json', 'utf8'));
writeFileSync('static/_headers', renderHeadersFile(security));
console.log('static/_headers を生成');
```

Run: `node scripts/write-headers.mjs`（`static/_headers` ができる）

- [x] **Step 6: テストが通ることを確認する**

Run: `npx vitest run scripts/lib/headers.test.mjs`
Expected: PASS（3 件）

- [x] **Step 7: e2e/serve.mjs と build スクリプトを JSON に向ける・vercel.json を消す**

`e2e/serve.mjs` の 1〜11 行目を次に置き換える:

```js
// build/ を本番同等の条件で配信する検証用サーバ。
// - config/security-headers.json のセキュリティヘッダー（CSP含む）を適用 → CSP退行をCIで検知できる
// - cleanUrls 相当（拡張子なしパスに .html を解決）
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 5299);
const root = resolve('build');
const securityHeaders = JSON.parse(readFileSync('config/security-headers.json', 'utf8'));
```

41 行目 `for (const h of vercelHeaders) res.setHeader(h.key, h.value);` を:

```js
	for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
```

`package.json` の `build` を:

```json
"build": "node scripts/write-headers.mjs && vite build && node scripts/externalize-inline.mjs",
```

`git rm vercel.json`

- [x] **Step 8: 全体が green か確認する**

Run: `npm run coverage && npm run build && ls build/_headers`
Expected: 既存 287 件＋3 件 PASS・thresholds を満たす・`build/_headers` が存在

- [x] **Step 9: コミット**

```bash
git add config/security-headers.json scripts/lib/headers.mjs scripts/lib/headers.test.mjs scripts/write-headers.mjs static/_headers e2e/serve.mjs vitest.config.ts package.json vercel.json
git commit -m "build: セキュリティヘッダーの正本を config/security-headers.json に一本化

_headers（静的アセット用）を生成し、e2e/serve.mjs も同じ JSON を読む。vercel.json は削除。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: サイト URL を `SITE_ORIGIN` 1 定数に寄せる

**Files:**
- Create: `src/lib/site.ts`
- Create: `src/lib/site.test.ts`
- Modify: `src/routes/+page.svelte:121-122`
- Modify: `src/routes/c/+page.svelte:8, 25`
- Modify: `src/routes/c/[slug]/+page.svelte:13, 15`
- Modify: `src/routes/e/[id]/+page.svelte:16, 30`
- Modify: `src/routes/sitemap.xml/+server.ts:6`
- Modify: `static/robots.txt:4`

**Interfaces:**
- Produces: `SITE_ORIGIN: string`（末尾スラッシュなし）、`absoluteUrl(path: string): string`。

- [x] **Step 1: 失敗するテストを書く**

`src/lib/site.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SITE_ORIGIN, absoluteUrl } from './site';

describe('site', () => {
	it('SITE_ORIGIN は https で末尾スラッシュなし', () => {
		expect(SITE_ORIGIN).toBe('https://chronoscroll.saitotakuya0719.workers.dev');
		expect(SITE_ORIGIN.endsWith('/')).toBe(false);
	});

	it('absoluteUrl は先頭スラッシュの有無を吸収する', () => {
		expect(absoluteUrl('/e/2011-03-11-x')).toBe(`${SITE_ORIGIN}/e/2011-03-11-x`);
		expect(absoluteUrl('ogp.png')).toBe(`${SITE_ORIGIN}/ogp.png`);
		expect(absoluteUrl('/')).toBe(`${SITE_ORIGIN}/`);
	});
});
```

- [x] **Step 2: 失敗を確認する**

Run: `npx vitest run src/lib/site.test.ts`
Expected: FAIL — `Failed to resolve import "./site"`

- [x] **Step 3: 実装する**

`src/lib/site.ts`:

```ts
/**
 * 公開 URL の起点（末尾スラッシュなし）。canonical・OGP・sitemap が参照する。
 * static/robots.txt の Sitemap 行だけは静的ファイルなので同じ値を直接書いてある。
 */
export const SITE_ORIGIN = 'https://chronoscroll.saitotakuya0719.workers.dev';

export function absoluteUrl(path: string): string {
	return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
```

- [x] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/site.test.ts`
Expected: PASS（2 件）

- [x] **Step 5: 9 箇所の参照を置き換える**

`src/routes/+page.svelte`（`<script>` に `import { absoluteUrl } from '$lib/site';` を足し、121〜122 行目を）:

```svelte
	<meta property="og:url" content={absoluteUrl('/')} />
	<meta property="og:image" content={absoluteUrl('/ogp.png')} />
```

`src/routes/c/+page.svelte`（import を足し、8 行目と 25 行目を）:

```svelte
	const canonical = absoluteUrl('/c');
```
```svelte
	<meta property="og:image" content={absoluteUrl('/ogp.png')} />
```

`src/routes/c/[slug]/+page.svelte`（import を足し、13 行目と 15 行目を）:

```svelte
	const canonical = $derived(absoluteUrl(`/c/${c.slug}`));
	// 特集ごとのOGP画像（scripts/gen-ogp.mjs が実データから生成してコミットしてある）
	const ogImage = $derived(absoluteUrl(`/ogp/c-${c.slug}.png`));
```

`src/routes/e/[id]/+page.svelte`（import を足し、16 行目と 30 行目を）:

```svelte
	const canonical = $derived(absoluteUrl(`/e/${ev.id}`));
```
```svelte
	<meta property="og:image" content={absoluteUrl('/ogp.png')} />
```

`src/routes/sitemap.xml/+server.ts` の 6 行目:

```ts
import { SITE_ORIGIN as BASE } from '$lib/site';
```

`static/robots.txt` の 4 行目:

```
Sitemap: https://chronoscroll.saitotakuya0719.workers.dev/sitemap.xml
```

- [x] **Step 6: 旧 URL が残っていないことと型・ビルドを確認する**

Run: `grep -rn "chronoscroll.vercel.app" src static scripts e2e; npm run typecheck && npm run build && grep -c "workers.dev" build/sitemap.xml && grep -o 'rel="canonical" href="[^"]*"' build/e/$(ls build/e | head -1)`
Expected: grep は 0 件（終了コード 1）・typecheck OK・sitemap の URL が新ホスト・canonical が新ホスト

- [x] **Step 7: コミット**

```bash
git add src/lib/site.ts src/lib/site.test.ts src/routes static/robots.txt
git commit -m "feat: サイト URL を SITE_ORIGIN 1 定数に寄せ workers.dev へ切り替える

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 計測を Vercel Analytics から Cloudflare Web Analytics に差し替える

**Files:**
- Modify: `src/app.html`（`</head>` の直前）
- Modify: `src/routes/+layout.svelte:1-11`
- Modify: `config/security-headers.json`（CSP の値）
- Modify: `static/_headers`（再生成）
- Modify: `e2e/smoke.mjs:29-32`
- Modify: `package.json`・`package-lock.json`（`@vercel/analytics` 削除）

**Interfaces:**
- Consumes: Task 1 の `config/security-headers.json` と `node scripts/write-headers.mjs`。

- [x] **Step 1: ドリフト検知テストが先に落ちる状態を作る（CSP を変える）**

`config/security-headers.json` の `Content-Security-Policy` を:

```
default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; style-src-attr 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='; img-src 'self' data: https://upload.wikimedia.org; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

Run: `npx vitest run scripts/lib/headers.test.mjs`
Expected: FAIL — ドリフト検知（`static/_headers` が古い）

- [x] **Step 2: `_headers` を再生成して green に戻す**

Run: `node scripts/write-headers.mjs && npx vitest run scripts/lib/headers.test.mjs`
Expected: PASS

- [x] **Step 3: ビーコンを app.html に入れ、Vercel Analytics を外す**

`src/app.html` の `</head>` 直前に 1 行（`gitleaks:allow` は同じ行に置く。`type="module"` は Cloudflare の発行スニペットどおり）:

```html
		<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "cf62303813104660bbb08da280e9673d"}'></script><!-- Cloudflare Web Analytics（トークンは非秘密） gitleaks:allow -->
```

`src/routes/+layout.svelte` の `<script>` を:

```svelte
<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>
```

Run: `npm uninstall @vercel/analytics`

- [x] **Step 4: smoke のコンソール無視条件を差し替える**

`e2e/smoke.mjs` の 29〜32 行目を:

```js
	// Cloudflare Web Analytics のビーコンはローカル/CI のホスト名では拒否されるため除外
	if ((m.location()?.url ?? '').includes('cloudflareinsights.com')) return;
	if (m.text().includes('cloudflareinsights.com')) return;
```

- [x] **Step 5: 確認する**

Run: `grep -rn "vercel" src e2e package.json; npm run typecheck && npm run coverage && npm run build && grep -c "beacon.min.js" build/index.html build/e/$(ls build/e | head -1)`
Expected: grep は 0 件・typecheck/coverage OK・両 HTML に beacon が 1 回ずつ（externalize-inline.mjs は属性なし `<script>` しか動かさないので残る）

- [x] **Step 6: 実ブラウザスモークを回す**

Run: `(node e2e/serve.mjs 5299 & sleep 1; node e2e/smoke.mjs http://localhost:5299; kill %1)`
Expected: 37/37 PASS・CSP 違反のコンソールエラーなし

- [x] **Step 7: コミット**

```bash
git add src/app.html src/routes/+layout.svelte config/security-headers.json static/_headers e2e/smoke.mjs package.json package-lock.json
git commit -m "feat: 計測を Cloudflare Web Analytics に差し替える（CSP は script-src/connect-src の追加のみ）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `/e/*` を R2 から返す Worker

**Files:**
- Create: `worker/serve.ts`
- Create: `worker/serve.test.ts`
- Create: `worker/index.ts`
- Create: `worker/tsconfig.json`
- Create: `wrangler.jsonc`
- Modify: `package.json`（devDependencies に `wrangler`・`@cloudflare/workers-types`、`typecheck` スクリプト）

**Interfaces:**
- Consumes: `config/security-headers.json`（Task 1）。
- Produces: `resolve(pathname: string): Resolution`、`pageHeaders(etag: string | null, cacheable: boolean): Headers`、`handle(request: Request, env: Env): Promise<Response>`、`interface PagesBucket { get(key, options?) }`、`interface Env { PAGES: PagesBucket }`。R2 のキーは `e/<id>.html`（Task 5 の同期先と一致させる）。

- [x] **Step 1: 依存と tsconfig を入れる**

Run: `npm i -D wrangler@^4.141.0 @cloudflare/workers-types@^5.20260926.1`

`worker/tsconfig.json`:

```json
{
	"compilerOptions": {
		"target": "ES2023",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"strict": true,
		"noEmit": true,
		"skipLibCheck": true,
		"resolveJsonModule": true,
		"types": ["@cloudflare/workers-types"]
	},
	"include": ["**/*.ts"],
	"exclude": ["**/*.test.ts"]
}
```

`package.json` の `typecheck` を:

```json
"typecheck": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json && tsc --noEmit -p pipeline && tsc --noEmit -p worker",
```

- [x] **Step 2: 失敗するテストを書く**

`worker/serve.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handle, pageHeaders, resolve, type PagesBucket } from './serve';

const security = JSON.parse(readFileSync('config/security-headers.json', 'utf8')) as Record<string, string>;

/** R2 バインディングの最小フェイク。ETag は本文の長さ。If-None-Match が一致すれば本文なしで返す */
function bucket(pages: Record<string, string>, opts: { throws?: boolean } = {}): PagesBucket {
	return {
		async get(key, options) {
			if (opts.throws) throw new Error('r2 down');
			const html = pages[key];
			if (html === undefined) return null;
			const httpEtag = `"${html.length}"`;
			if (options?.onlyIf?.get('if-none-match') === httpEtag) return { httpEtag };
			return { httpEtag, body: new Response(html).body! };
		},
	};
}

const env = { PAGES: bucket({ 'e/2011-03-11-quake.html': '<h1>quake</h1>' }) };
const req = (path: string, init?: RequestInit) => new Request(`https://x.test${path}`, init);

describe('resolve', () => {
	it('/e/<id> は R2 キー e/<id>.html', () => {
		expect(resolve('/e/2011-03-11-quake')).toEqual({ kind: 'page', key: 'e/2011-03-11-quake.html' });
	});
	it('.html 付きと末尾スラッシュは素の URL へリダイレクト', () => {
		expect(resolve('/e/2011-03-11-quake.html')).toEqual({ kind: 'redirect', location: '/e/2011-03-11-quake' });
		expect(resolve('/e/2011-03-11-quake/')).toEqual({ kind: 'redirect', location: '/e/2011-03-11-quake' });
		expect(resolve('/e/2011-03-11-quake.html/')).toEqual({ kind: 'redirect', location: '/e/2011-03-11-quake' });
	});
	it('id の文字種に合わないものは 404', () => {
		for (const p of ['/e/', '/e/../x', '/e/.hidden', '/e/a/b', '/e/%2e%2e', '/e/x.html/y', '/e/.html', '/e//', '/other']) {
			expect(resolve(p), p).toEqual({ kind: 'notFound' });
		}
	});
});

describe('pageHeaders', () => {
	it('セキュリティヘッダー一式 + HTML + キャッシュ + ETag', () => {
		const h = pageHeaders('"abc"', true);
		for (const [k, v] of Object.entries(security)) expect(h.get(k)).toBe(v);
		expect(h.get('content-type')).toBe('text/html; charset=utf-8');
		expect(h.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=86400');
		expect(h.get('etag')).toBe('"abc"');
	});
	it('cacheable=false は no-store・ETag なし', () => {
		const h = pageHeaders(null, false);
		expect(h.get('cache-control')).toBe('no-store');
		expect(h.has('etag')).toBe(false);
	});
});

describe('handle', () => {
	it('存在するページは 200 で本文と ETag を返す', async () => {
		const res = await handle(req('/e/2011-03-11-quake'), env);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('<h1>quake</h1>');
		expect(res.headers.get('etag')).toBe('"14"');
		expect(res.headers.get('content-security-policy')).toBe(security['Content-Security-Policy']);
	});
	it('If-None-Match が一致すれば 304（本文なし・ETag あり）', async () => {
		const res = await handle(req('/e/2011-03-11-quake', { headers: { 'if-none-match': '"14"' } }), env);
		expect(res.status).toBe(304);
		expect(res.headers.get('etag')).toBe('"14"');
		expect(await res.text()).toBe('');
	});
	it('HEAD は本文なし', async () => {
		const res = await handle(req('/e/2011-03-11-quake', { method: 'HEAD' }), env);
		expect(res.status).toBe(200);
		expect(res.headers.get('etag')).toBe('"14"');
		expect(await res.text()).toBe('');
	});
	it('無いページは 404 HTML（no-store・セキュリティヘッダー付き）', async () => {
		const res = await handle(req('/e/1999-01-01-nothing'), env);
		expect(res.status).toBe(404);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
		expect(await res.text()).toContain('href="/"');
	});
	it('パーセントエンコードは 404', async () => {
		const res = await handle(req('/e/%2e%2e/manifest.json'), env);
		expect(res.status).toBe(404);
	});
	it('クエリを保ったまま 301', async () => {
		const res = await handle(req('/e/2011-03-11-quake.html?k=anime'), env);
		expect(res.status).toBe(301);
		expect(res.headers.get('location')).toBe('https://x.test/e/2011-03-11-quake?k=anime');
	});
	it('GET/HEAD 以外は 405', async () => {
		const res = await handle(req('/e/2011-03-11-quake', { method: 'POST' }), env);
		expect(res.status).toBe(405);
		expect(res.headers.get('allow')).toBe('GET, HEAD');
	});
	it('R2 の例外は 503', async () => {
		const res = await handle(req('/e/2011-03-11-quake'), { PAGES: bucket({}, { throws: true }) });
		expect(res.status).toBe(503);
		expect(res.headers.get('retry-after')).toBe('30');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
	});
});
```

- [x] **Step 3: 失敗を確認する**

Run: `npx vitest run worker/serve.test.ts`
Expected: FAIL — `Failed to resolve import "./serve"`

- [x] **Step 4: 実装する**

`worker/serve.ts`:

```ts
// /e/<id> を R2 から返す。静的アセットの無料枠（20,000 ファイル）に収めるため、
// 27,000 本超のイベント個別ページ（prerender 済み HTML）だけを R2 に置いている。
// それ以外のパスは wrangler.jsonc の assets が先に解決するのでここには来ない。
import securityHeaders from '../config/security-headers.json';

export type Resolution =
	| { kind: 'redirect'; location: string }
	| { kind: 'page'; key: string }
	| { kind: 'notFound' };

/** R2 の get が返すもののうち使う部分。R2Object（本文なし）と R2ObjectBody の両方を受ける */
export interface PageObject {
	httpEtag: string;
	body?: ReadableStream;
}

export interface PagesBucket {
	get(key: string, options?: { onlyIf?: Headers }): Promise<PageObject | null>;
}

export interface Env {
	PAGES: PagesBucket;
}

// イベント id は日付で始まり英数字・ドット・ハイフン・アンダースコアだけ（27,137 件で実測）。
// 先頭ドットを許さないので `..` は通らない。`%` や `/` も通らない。
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CACHE_PAGE = 'public, max-age=3600, stale-while-revalidate=86400';
const NOT_FOUND_HTML =
	'<!doctype html><html lang="ja"><meta charset="utf-8"><title>ページが見つかりません | chronoscroll</title>' +
	'<p>ページが見つかりません。<a href="/">年表へ戻る</a></p></html>';

export function resolve(pathname: string): Resolution {
	if (!pathname.startsWith('/e/')) return { kind: 'notFound' };
	let rest = pathname.slice('/e/'.length);
	let redirect = false;
	if (rest.endsWith('/')) {
		rest = rest.slice(0, -1);
		redirect = true;
	}
	if (rest.endsWith('.html')) {
		rest = rest.slice(0, -'.html'.length);
		redirect = true;
	}
	if (!ID.test(rest)) return { kind: 'notFound' };
	return redirect ? { kind: 'redirect', location: `/e/${rest}` } : { kind: 'page', key: `e/${rest}.html` };
}

export function pageHeaders(etag: string | null, cacheable: boolean): Headers {
	const h = new Headers(securityHeaders as Record<string, string>);
	h.set('Content-Type', 'text/html; charset=utf-8');
	h.set('Cache-Control', cacheable ? CACHE_PAGE : 'no-store');
	if (etag) h.set('ETag', etag);
	return h;
}

function notFound(): Response {
	return new Response(NOT_FOUND_HTML, { status: 404, headers: pageHeaders(null, false) });
}

export async function handle(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
	}
	const url = new URL(request.url);
	const r = resolve(url.pathname);
	if (r.kind === 'redirect') return Response.redirect(`${url.origin}${r.location}${url.search}`, 301);
	if (r.kind === 'notFound') return notFound();

	let obj: PageObject | null;
	try {
		// onlyIf に要求ヘッダーを渡すと If-None-Match 等を R2 が評価し、一致すれば本文なしで返る
		obj = await env.PAGES.get(r.key, { onlyIf: request.headers });
	} catch {
		const h = pageHeaders(null, false);
		h.set('Retry-After', '30');
		return new Response('Service Unavailable', { status: 503, headers: h });
	}
	if (obj === null) return notFound();
	const headers = pageHeaders(obj.httpEtag, true);
	if (obj.body === undefined) return new Response(null, { status: 304, headers });
	return new Response(request.method === 'HEAD' ? null : obj.body, { status: 200, headers });
}
```

`worker/index.ts`:

```ts
import { handle, type Env } from './serve';

export default {
	fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
```

`wrangler.jsonc`:

```jsonc
/**
 * chronoscroll — Cloudflare Workers（静的アセット + R2）
 * https://developers.cloudflare.com/workers/static-assets/
 *
 * build/ のうち /e/ 以外（94 ファイル）を静的アセットとして配信し、
 * /e/<id>（27,000 本超の prerender 済み HTML）だけ Worker が R2 から返す。
 * 無料枠の「20,000 ファイル/バージョン」に収めるための分担で、HTML は
 * scripts/r2-sync.mjs が build/e から R2 バケットへ差分同期する。
 * セキュリティヘッダーの正本は config/security-headers.json（_headers と Worker が読む）。
 */
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "chronoscroll",
	"main": "worker/index.ts",
	"compatibility_date": "2026-09-26",
	"assets": {
		"directory": "./build",
		"binding": "ASSETS",
		"not_found_handling": "404-page",
		// /e/* だけ Worker が先に受ける。他は静的アセットが先に解決される
		"run_worker_first": ["/e/*"],
	},
	"r2_buckets": [
		{
			"binding": "PAGES",
			"bucket_name": "chronoscroll-pages",
		},
	],
	"observability": {
		"enabled": true,
	},
}
```

- [x] **Step 5: テストと型が通ることを確認する**

Run: `npx vitest run worker/serve.test.ts && npm run typecheck`
Expected: PASS（15 件）・typecheck OK（`ExportedHandler` は workers-types から解決）

- [x] **Step 6: カバレッジ 100% を確認する**

Run: `npm run coverage`
Expected: `worker/serve.ts` が 100/100/100/100・thresholds を満たす（`worker/index.ts` は Task 1 で coverage の exclude 済み）

- [x] **Step 7: `wrangler deploy --dry-run` でアセット数を確認する**

Run: `npx wrangler deploy --dry-run --outdir /tmp/cs-dry 2>&1 | tail -20`
Expected: エラーなし・Worker サイズ表示（アセット数の確認は Task 5 で `build/e` を分離してから）

- [x] **Step 8: コミット**

```bash
git add worker wrangler.jsonc package.json package-lock.json
git commit -m "feat: /e/* を R2 から返す Worker と wrangler.jsonc

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `build/e` を R2 へ差分同期するスクリプト

**Files:**
- Create: `scripts/lib/r2-plan.mjs`
- Create: `scripts/lib/r2-plan.test.mjs`
- Create: `scripts/r2-sync.mjs`
- Create: `scripts/split-pages.mjs`
- Modify: `package.json`（devDependency `@aws-sdk/client-s3`、scripts `build`・`r2:sync`・`deploy:check`）
- Modify: `e2e/serve.mjs`（`/e/` は `build-e/` から解決）
- Modify: `.gitignore`（`/build-e` を追加。末尾の重複 `.env.r2` は削除＝`.env.*` で既に無視されている）

**Interfaces:**
- Consumes: Task 4 のキー規約 `e/<id>.html`。
- Produces: `planSync(local, remote): { put: string[]; del: string[]; skip: string[] }`、`sha256(buf: Buffer|string): string`、`parseManifest(text: string): Record<string,string>`。R2 の `manifest.json`（`{ "e/<id>.html": "<sha256 hex>" }`）。CLI: `node --env-file=.env.r2 scripts/r2-sync.mjs [--dry-run]`。`npm run build` の後は `build/`（アセット 94 ファイル）と `build-e/<id>.html`（27,137 ファイル）に分かれている＝`wrangler deploy` は `build/` を丸ごとアセットにするので、R2 配信分を先に外す。

- [x] **Step 1: 失敗するテストを書く**

`scripts/lib/r2-plan.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { parseManifest, planSync, sha256 } from './r2-plan.mjs';

describe('planSync', () => {
	it('新規・変更は put、無くなったものは del、同じものは skip（キー順）', () => {
		const local = { 'e/b.html': 'h2', 'e/a.html': 'h1', 'e/c.html': 'h3-new' };
		const remote = { 'e/a.html': 'h1', 'e/c.html': 'h3', 'e/z.html': 'gone' };
		expect(planSync(local, remote)).toEqual({
			put: ['e/b.html', 'e/c.html'],
			del: ['e/z.html'],
			skip: ['e/a.html'],
		});
	});
	it('remote が空なら全件 put', () => {
		expect(planSync({ 'e/a.html': 'h1' }, {})).toEqual({ put: ['e/a.html'], del: [], skip: [] });
	});
});

describe('sha256', () => {
	it('16進 64 桁', () => {
		expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
});

describe('parseManifest', () => {
	it('オブジェクトはそのまま', () => {
		expect(parseManifest('{"e/a.html":"h1"}')).toEqual({ 'e/a.html': 'h1' });
	});
	it('壊れた manifest は空扱い', () => {
		expect(parseManifest('{not json')).toEqual({});
		expect(parseManifest('[1,2]')).toEqual({});
		expect(parseManifest('null')).toEqual({});
	});
});
```

- [x] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/lib/r2-plan.test.mjs`
Expected: FAIL — `Failed to load ./r2-plan.mjs`

- [x] **Step 3: 純関数を実装する**

`scripts/lib/r2-plan.mjs`:

```js
// R2 同期の差分計算（純関数）。I/O は scripts/r2-sync.mjs が持つ。
import { createHash } from 'node:crypto';

/** @param {Buffer | string} data */
export function sha256(data) {
	return createHash('sha256').update(data).digest('hex');
}

/**
 * @param {Record<string, string>} local  キー → sha256（ビルド成果物）
 * @param {Record<string, string>} remote キー → sha256（R2 の manifest.json）
 */
export function planSync(local, remote) {
	const put = [];
	const skip = [];
	for (const [key, hash] of Object.entries(local)) (remote[key] === hash ? skip : put).push(key);
	const del = Object.keys(remote).filter((key) => !(key in local));
	return { put: put.sort(), del: del.sort(), skip: skip.sort() };
}

/** manifest が無い・壊れている・配列のときは空＝全件 PUT に倒す（削除はしない） */
export function parseManifest(text) {
	try {
		const v = JSON.parse(text);
		return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
}
```

- [x] **Step 4: テストが通ることを確認する**

Run: `npx vitest run scripts/lib/r2-plan.test.mjs`
Expected: PASS（6 件）

- [x] **Step 5: 同期スクリプトを書く**

Run: `npm i -D @aws-sdk/client-s3@^3.1141.0`

`scripts/r2-sync.mjs`:

```js
// build-e/*.html（scripts/split-pages.mjs が build/e から移したもの）を R2 バケットへ差分同期する（S3 互換 API）。
// 使い方: node --env-file=.env.r2 scripts/r2-sync.mjs [--dry-run]
// 環境変数: R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY（必須）、R2_BUCKET / R2_ACCOUNT_ID（任意）
// R2 の manifest.json（キー → sha256）と突き合わせ、変わったものだけ PUT・消えたものは DELETE。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	DeleteObjectsCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { parseManifest, planSync, sha256 } from './lib/r2-plan.mjs';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '17fd86bd10e0418c9c8e62644699c879';
const BUCKET = process.env.R2_BUCKET ?? 'chronoscroll-pages';
const MANIFEST_KEY = 'manifest.json';
const DIR = 'build-e';
const CONCURRENCY = 32;
const dryRun = process.argv.includes('--dry-run');

for (const name of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
	if (!process.env[name]) {
		console.error(`${name} が未設定（.env.r2 を node --env-file で読むか、環境変数で渡す）`);
		process.exit(1);
	}
}

const s3 = new S3Client({
	region: 'auto',
	endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: process.env.R2_ACCESS_KEY_ID,
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
	},
});

const local = {};
for (const f of readdirSync(DIR)) {
	if (f.endsWith('.html')) local[`e/${f}`] = sha256(readFileSync(join(DIR, f)));
}

let remote = {};
try {
	const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: MANIFEST_KEY }));
	remote = parseManifest(await res.Body.transformToString());
} catch (e) {
	if (e?.name !== 'NoSuchKey') throw e;
}

const plan = planSync(local, remote);
console.log(
	`local ${Object.keys(local).length} / remote ${Object.keys(remote).length} → ` +
		`put ${plan.put.length} / del ${plan.del.length} / skip ${plan.skip.length}${dryRun ? '（dry-run）' : ''}`,
);
if (dryRun) process.exit(0);

let next = 0;
let done = 0;
const failed = new Set();
async function uploader() {
	while (next < plan.put.length) {
		const key = plan.put[next++];
		try {
			await s3.send(
				new PutObjectCommand({
					Bucket: BUCKET,
					Key: key,
					Body: readFileSync(join(DIR, key.slice('e/'.length))),
					ContentType: 'text/html; charset=utf-8',
				}),
			);
		} catch (e) {
			failed.add(key);
			console.error(`PUT 失敗: ${key}: ${e.message}`);
		}
		if (++done % 1000 === 0) console.log(`put ${done}/${plan.put.length}`);
	}
}
await Promise.all(Array.from({ length: CONCURRENCY }, uploader));

for (let i = 0; i < plan.del.length; i += 1000) {
	await s3.send(
		new DeleteObjectsCommand({
			Bucket: BUCKET,
			Delete: { Objects: plan.del.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
		}),
	);
}

// 成功した分だけ manifest に反映する（失敗分は次回また put の対象になる）
const manifest = Object.fromEntries(Object.entries(local).filter(([key]) => !failed.has(key)));
await s3.send(
	new PutObjectCommand({
		Bucket: BUCKET,
		Key: MANIFEST_KEY,
		Body: JSON.stringify(manifest),
		ContentType: 'application/json',
	}),
);
console.log(`manifest 更新（${Object.keys(manifest).length} 件）`);
if (failed.size) {
	console.error(`${failed.size} 件失敗。再実行で再送される`);
	process.exit(1);
}
```

`scripts/split-pages.mjs`（`npm run build` の最後に走る）:

```js
// build/e（27,000 本超のイベント個別ページ）を build-e/ へ移す。
// wrangler deploy は build/ を丸ごと静的アセットにするため、無料枠（20,000 ファイル）を
// 超えないよう R2 で配信する分をアセットから外す。R2 への同期は scripts/r2-sync.mjs。
import { existsSync, renameSync, rmSync } from 'node:fs';

if (existsSync('build/e')) {
	rmSync('build-e', { recursive: true, force: true });
	renameSync('build/e', 'build-e');
	console.log('build/e → build-e/（R2 配信分をアセットから分離）');
}
```

`package.json` の scripts:

```json
"build": "node scripts/write-headers.mjs && vite build && node scripts/externalize-inline.mjs && node scripts/split-pages.mjs",
"r2:sync": "node --env-file=.env.r2 scripts/r2-sync.mjs",
"deploy:check": "echo assets: $(find build -type f | wc -l) / pages: $(ls build-e | wc -l)",
```

`e2e/serve.mjs` の `let file = resolve(join(root, path === '/' ? 'index.html' : path));` と続く `if (!file.startsWith(root)) {` を:

```js
	// /e/<id> は R2 配信分（build-e/）から。本番では Worker が R2 から返す経路に相当する
	const isPage = path.startsWith('/e/');
	const base = isPage ? resolve('build-e') : root;
	let file = resolve(join(base, isPage ? path.slice('/e'.length) : path === '/' ? 'index.html' : path));
	if (!file.startsWith(base)) {
```

`.gitignore`: `/build` の下に `/build-e` を追加し、末尾の `.env.r2` 行を削除（`.env.*` が既に無視している。`git check-ignore .env.r2` で確認）。

- [x] **Step 6: ビルドの分離と dry-run を確認する（鍵は表示しない）**

Run: `npm run build && npm run deploy:check && node --env-file=.env.r2 scripts/r2-sync.mjs --dry-run && (node e2e/serve.mjs 5299 & sleep 1; node e2e/smoke.mjs http://localhost:5299; kill %1)`
Expected: `assets: 94 前後 / pages: 27137`・`local 27137 / remote 0 → put 27137 / del 0 / skip 0（dry-run）`・スモーク 37/37（`/e/` を `build-e/` から返せている）

- [x] **Step 7: 全テスト・カバレッジ**

Run: `npm run coverage`
Expected: PASS・`scripts/lib/*.mjs` 100%

- [x] **Step 8: コミット**

```bash
git add scripts/lib/r2-plan.mjs scripts/lib/r2-plan.test.mjs scripts/r2-sync.mjs scripts/split-pages.mjs e2e/serve.mjs package.json package-lock.json .gitignore
git commit -m "feat: /e/ を build-e/ に分離し R2 へ差分同期する scripts/r2-sync.mjs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: ローカルで `/e/` の経路を通す（wrangler dev + ローカル R2）

**Files:** なし（検証のみ）

**Interfaces:**
- Consumes: Task 4 の Worker・wrangler.jsonc、Task 1 の `_headers`。

- [x] **Step 1: ローカル R2 に 2 ページ入れる**

```bash
ID1=$(ls build-e | head -1 | sed 's/\.html$//'); ID2=$(ls build-e | sed -n 2p | sed 's/\.html$//')
npx wrangler r2 object put "chronoscroll-pages/e/$ID1.html" --file "build-e/$ID1.html" --content-type "text/html; charset=utf-8" --local
npx wrangler r2 object put "chronoscroll-pages/e/$ID2.html" --file "build-e/$ID2.html" --content-type "text/html; charset=utf-8" --local
echo "$ID1 $ID2"
```

- [x] **Step 2: dev サーバを起動する（バックグラウンド・後で止める）**

Run: `npx wrangler dev --port 8788 > /tmp/cs-dev.log 2>&1 &` → `until grep -q "Ready on" /tmp/cs-dev.log; do sleep 1; done`

- [x] **Step 3: 経路を全部叩く**

```bash
B=http://localhost:8788
curl -s -o /dev/null -w "page %{http_code} etag=%header{etag} cc=%header{cache-control} csp=%header{content-security-policy}\n" "$B/e/$ID1"
ET=$(curl -s -o /dev/null -w "%header{etag}" "$B/e/$ID1")
curl -s -o /dev/null -w "304? %{http_code}\n" -H "If-None-Match: $ET" "$B/e/$ID1"
curl -s -o /dev/null -w "head %{http_code} len=%{size_download}\n" -I "$B/e/$ID1"
curl -s -o /dev/null -w "html→301 %{http_code} loc=%header{location}\n" "$B/e/$ID1.html?k=anime"
curl -s -o /dev/null -w "missing %{http_code} cc=%header{cache-control}\n" "$B/e/1800-01-01-nothing"
curl -s -o /dev/null -w "dotdot %{http_code}\n" "$B/e/%2e%2e/manifest.json"
curl -s -o /dev/null -w "post %{http_code} allow=%header{allow}\n" -X POST "$B/e/$ID1"
curl -s -o /dev/null -w "top %{http_code} csp=%header{content-security-policy}\n" "$B/"
curl -s -o /dev/null -w "c/anime %{http_code}\n" "$B/c/anime"
curl -s -o /dev/null -w "data %{http_code} cc=%header{cache-control}\n" "$B/data/index.json"
CH=$(ls build/data/chunks | head -1); curl -s -o /dev/null -w "chunk %{http_code} cc=%header{cache-control}\n" "$B/data/chunks/$CH"
curl -s -o /dev/null -w "immutable %{http_code} cc=%header{cache-control}\n" "$B$(grep -o '/_app/immutable/assets/[^"]*\.css' build/index.html | head -1)"
```

Expected:
- page 200・ETag あり・`cache-control: public, max-age=3600, stale-while-revalidate=86400`・CSP あり
- 304? 304
- head 200 len=0
- html→301 301 `loc=http://localhost:8788/e/<ID1>?k=anime`
- missing 404 `cc=no-store`
- dotdot 404
- post 405 `allow=GET, HEAD`
- top 200 CSP あり（`_headers` 経由）
- c/anime 200
- data 200 と chunk 200 とも `cc=public, max-age=3600, stale-while-revalidate=86400`（`/data/*` がネストにも効くことの確認。効いていなければ `CACHE_RULES` に `/data/chunks/*` を足して Task 1 のテストと `_headers` を更新）
- immutable 200 `cc=public, max-age=31536000, immutable`

- [x] **Step 4: 止める**

Run: `kill %1`（または `pkill -f "wrangler dev --port 8788"`）

---

### Task 7: 初回同期と本番デプロイ・検証

**Files:** なし（運用手順）

**Interfaces:**
- Consumes: Task 5 の `npm run r2:sync`、Task 4 の wrangler.jsonc。

- [x] **Step 1: クリーンビルドしてアセット数を確認する**

Run: `rm -rf build build-e && npm run build && npm run deploy:check`
Expected: `assets: 94 前後 / pages: 27137`（20,000 未満）

- [x] **Step 2: 初回同期（約 10 分・鍵は表示されない）**

Run: `npm run r2:sync 2>&1 | tail -5`
Expected: `put 27000/27137` … `manifest 更新（27137 件）`・失敗 0

Run: `npm run r2:sync`（2 回目）
Expected: `put 0 / del 0 / skip 27137`（冪等の確認）

- [x] **Step 3: デプロイする**

Run: `npx wrangler deploy 2>&1 | tail -15`
Expected: `Uploaded chronoscroll`・`https://chronoscroll.saitotakuya0719.workers.dev` が表示される・アップロードされたアセットが 100 未満（`build/e` は Task 5 の分離で含まれない）

- [x] **Step 4: 本番を sitemap の実 URL で検証する**

```bash
H=https://chronoscroll.saitotakuya0719.workers.dev
curl -s "$H/sitemap.xml" | grep -o "$H/e/[^<]*" | sed -n '1p;5000p;27000p' | while read u; do curl -s -o /dev/null -w "$u %{http_code} etag=%header{etag}\n" "$u"; done
curl -s -o /dev/null -w "top %{http_code} csp=%header{content-security-policy}\n" "$H/"
curl -s -o /dev/null -w "c %{http_code}\n" "$H/c"; curl -s -o /dev/null -w "c/anime %{http_code}\n" "$H/c/anime"
curl -s -o /dev/null -w "data %{http_code} cc=%header{cache-control}\n" "$H/data/index.json"
curl -s -o /dev/null -w "missing %{http_code}\n" "$H/e/1800-01-01-nothing"
curl -s -o /dev/null -w "html→301 %{http_code} loc=%header{location}\n" "$H/e/$(ls build-e | head -1)"
curl -s "$H/" | grep -c beacon.min.js
```

Expected: `/e/` 3 本とも 200・ETag あり／top 200 CSP あり／c・c/anime 200／data 200 + Cache-Control／missing 404／`.html` は 301／beacon 1

- [x] **Step 5: 実ブラウザスモークを本番で回す**

Run: `node e2e/smoke.mjs https://chronoscroll.saitotakuya0719.workers.dev`
Expected: 37/37 PASS（ビーコンの console は無視条件で落ちない）

- [x] **Step 6: 結果を記録する**

`docs/superpowers/specs/2026-09-26-cloudflare-r2-hybrid-design.md` の末尾に「## 2026-09-26 初回デプロイ結果」として、アセット数・同期件数・所要時間・検証結果を 5 行で追記してコミット:

```bash
git add docs/superpowers/specs/2026-09-26-cloudflare-r2-hybrid-design.md
git commit -m "docs: 初回デプロイの結果を設計メモに追記

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: ドキュメントと後始末

**Files:**
- Modify: `AGENTS.md:7-8, 47-55`
- Modify: `README.md`（「デプロイ」節を追加）
- Modify: `docs/superpowers/specs/2026-09-26-cloudflare-r2-hybrid-design.md`（3 節の `defer` → `type="module"`、2 節に `build-e/` 分離を追記）
- Modify: `docs/superpowers/plans/2026-09-26-cloudflare-r2-hybrid.md`（チェックボックスを埋める）

- [x] **Step 1: AGENTS.md を直す**

7〜8 行目の「SvelteKit + adapter-static（サーバーなし・全ページprerender）。Vercelにデプロイ。」を:

```
- **SvelteKit + adapter-static**（全ページprerender）。**Cloudflare Workers** にデプロイ（`wrangler.jsonc`）。
  `build/` のうち `/e/` 以外（約94ファイル）は静的アセット、`/e/<id>`（27,000本超）は `build-e/` → R2 バケット
  `chronoscroll-pages` に `scripts/r2-sync.mjs` で差分同期し、`worker/serve.ts` が R2 から返す
  （無料枠「20,000ファイル/バージョン」に収めるための分担）。R2 の鍵は `.env.r2`（gitignore）と
  Workers Builds の secret にだけ置く。ホストは https://chronoscroll.saitotakuya0719.workers.dev
```

47〜55 行目の CSP 節で `vercel.json` と書いてある箇所を `config/security-headers.json` に置き換え、次の 1 行を足す:

```
- セキュリティヘッダーの正本は `config/security-headers.json`。`static/_headers`（静的アセット用）は
  `scripts/write-headers.mjs` が生成する**生成物**で、手で編集しない（`scripts/lib/headers.test.mjs` がドリフトを止める）。
  Worker（`/e/*`）と `e2e/serve.mjs` も同じ JSON を読む。
```

51 行目「Vercel上では adapter-static の出力先が `.vercel/output/static` になる点に注意。」は削除。

- [x] **Step 2: README にデプロイ節を足す**

`README.md` の末尾:

```markdown
## デプロイ（Cloudflare Workers）

- 本番: https://chronoscroll.saitotakuya0719.workers.dev（main への push で Workers Builds が自動デプロイ）
- ビルド: `npm run build` → `build/`（静的アセット）と `build-e/`（`/e/` の HTML・R2 配信）
- R2 同期: `npm run r2:sync`（`.env.r2` に `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`。差分だけ上がる）
- Workers Builds のコマンド: build `npm run build && node scripts/r2-sync.mjs` / deploy `npx wrangler deploy`
- 月次データ更新（`data-refresh.yml`）は PR をマージするだけで上記が走る
```

- [x] **Step 3: spec を実装に合わせる**

3 節の `<script defer src=...>` を `<script type="module" src=...>` に、2 節の「入力: `build/e/*.html`」を「入力: `build-e/*.html`（`scripts/split-pages.mjs` が `npm run build` の最後に `build/e` を移す。`wrangler deploy` が `build/` を丸ごとアセットにするため）」に直す。

- [x] **Step 4: コミットして push・PR**

```bash
git add AGENTS.md README.md docs/superpowers/specs/2026-09-26-cloudflare-r2-hybrid-design.md
git commit -m "docs: Cloudflare Workers + R2 のデプロイ手順に更新

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/cloudflare-r2-hybrid
gh pr create --title "feat: Cloudflare Workers へ移行（/e/ は R2 配信のハイブリッド）" --body "…（spec と plan へのリンク・検証結果・本人が行う Workers Builds の接続手順）…

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

CI（GitHub Actions）が green になることを確認する（`npm run build` に `split-pages` が入っても `e2e/serve.mjs` が `build-e/` を読むのでスモークは通る）。

---

### Task 9: Workers Builds の接続（本人）とマージ後の確認

**Files:** なし

- [ ] **Step 1: 本人がダッシュボードで接続する**

Workers & Pages → `chronoscroll` → Settings → Builds → GitHub `tktk7l9/chronoscroll` を接続:
- Production branch: `main`
- Build command: `npm run build && node scripts/r2-sync.mjs`
- Deploy command: `npx wrangler deploy`
- Build variables and secrets: `R2_ACCESS_KEY_ID`（secret）・`R2_SECRET_ACCESS_KEY`（secret）・`NODE_VERSION=24`
- Branch control で Preview builds を無効化（非 production ブランチのビルドは走らせない）

- [ ] **Step 2: 本人が PR をマージする**

`gh pr merge <N> --squash --delete-branch -R tktk7l9/chronoscroll`（自動モードではレビュー無しマージが止まるので本人が `!` で実行）

- [ ] **Step 3: ビルドを builds MCP で確認する**

`workers_builds_list_builds`（workerId は `workers_list` から）→ 最新ビルドが `success`・ログに `put 0 / del 0 / skip 27137` と `Uploaded chronoscroll`。失敗していれば `workers_builds_get_build_logs` で原因を見る（Workers Builds は無音で止まるので必ず見る）。

- [ ] **Step 4: 本番を再検証する**

Task 7 Step 4 の curl を再実行。全項目 Expected どおり。

- [ ] **Step 5: 後始末（本人に確認してから）**

- my-apps-portal の chronoscroll の URL を `https://chronoscroll.saitotakuya0719.workers.dev` に差し替える（別リポジトリ・別 PR）
- Vercel プロジェクト `chronoscroll` を停止または削除（本人の判断を聞く。402 のまま残しても害はないが、ポートフォリオから古い URL が消えたら不要）
- Vault `claude-memory/project_chronoscroll.md` と索引を「Cloudflare 移行完了（R2 ハイブリッド）」に更新し、Vault 本体にも 1 行
