# Cloudflare 移行（R2 ハイブリッド配信）設計メモ

2026-09-26 設計。関連: `AGENTS.md`（運用ルール）/ `wrangler.jsonc` / `worker/` / `scripts/r2-sync.mjs` / `config/security-headers.json`

## なぜやるか

2026-08-11 の Vercel 無料枠超過（402）以来、`https://chronoscroll.vercel.app` はアクセス不能のまま。
他14本は Cloudflare Workers に移したが、本アプリだけ **静的アセットの無料枠 20,000 ファイル**に
ビルド成果物 27,231 ファイル（205MB）が収まらず保留していた。

内訳を見ると、超えているのは**ファイル数だけ**で、その 99.6% は `/e/<id>` のイベント個別ページ
（27,137 ファイル・217MB・csr=false の純静的 HTML）。残りは 94 ファイル・約 30MB。

## 中心の判断: `/e/` の HTML だけ R2 に置き、他は静的アセットのまま

prerender・csr=false・月次 cron・実ブラウザスモークを**すべて残す**。変えるのは配信経路だけ。

```
GET /e/<id>       → Worker（run_worker_first）→ R2 "e/<id>.html" → HTML
GET /e/<id>.html  → 301 → /e/<id>                （Vercel の cleanUrls と同じ）
GET それ以外       → 静的アセット（build/ から e/ を除いた 94 ファイル）
```

退けた案:

- **Workers 有料 $5/月**（上限 100,000 ファイル・コード変更ゼロ）— 本人が「無料枠で作り替える」を選択（2026-09-26）。
- **prerender を 2万件未満に絞る** — ロングテール約 7,000 ページ（26%）を捨て、データ増でまた当たる。
- **D1 に 27,051 行を入れて動的配信** — 静的 HTML の強み（JS ゼロ・LH 100）を捨ててデータ層から再設計。R2 で済むと分かった今は選ぶ理由がない。

ランニングコスト 0 円（R2 無料枠 = 保存 10GB・Class A 100万/月・Class B 1,000万/月。使うのは 175MB・初回 2.7万 PUT・読み取りは桁違いに小さい）。

## 1. 配信（Worker）

`wrangler.jsonc`:

```jsonc
{
  "name": "chronoscroll",
  "main": "worker/index.ts",
  "compatibility_date": "2026-09-26",
  "assets": {
    "directory": "./build",
    "binding": "ASSETS",
    "not_found_handling": "404-page",
    "run_worker_first": ["/e/*"]
  },
  "r2_buckets": [{ "binding": "PAGES", "bucket_name": "chronoscroll-pages" }],
  "observability": { "enabled": true }
}
```

- `assets.directory` は `./build`。`npm run build` の最後に `scripts/split-pages.mjs` が `build/e` を
  `build-e/` へ退避するため、デプロイ時点の `./build` に `e/` は含まれない（R2 配信分は静的アセットから完全に外れる）。
- ホストは `chronoscroll.saitotakuya0719.workers.dev`（他の移行済みアプリと同じ・独自ドメインは今回なし）。
- Worker は GET / HEAD だけ受ける。他のメソッドは 405（`Allow: GET, HEAD`）。
- `/e/` 配下のパス:
  - `/e/<id>.html` → 301 `/e/<id>`
  - `/e/<id>/` → 301 `/e/<id>`
  - `<id>` は `^[A-Za-z0-9._-]+$` に一致するものだけ R2 キー `e/<id>.html` にする。それ以外（`..`・`/`・空）は 404。実データ 27,137 件の id はすべてこの文字種に収まる（2026-09-26 実測）。
- R2 から返すヘッダー: `Content-Type: text/html; charset=utf-8`、`ETag`（`object.httpEtag`）、`Cache-Control: public, max-age=3600, stale-while-revalidate=86400`、セキュリティヘッダー一式（3節）。
- `If-None-Match` は `PAGES.get(key, { onlyIf: request.headers })` に渡し、本文なしで返ってきたら **304**（ETag 付き）。
- R2 に無ければ Worker 自前の小さな 404 HTML（同じヘッダー付き・`Cache-Control: no-store`）。
- エッジキャッシュ（Cache API）は入れない（YAGNI）。
- `/e/` 以外は `env.ASSETS` が先に解決するので Worker は呼ばれない。`run_worker_first` に載せた `/e/*` だけが Worker に来る。

## 2. 同期とデプロイ

### `scripts/r2-sync.mjs`

- `@aws-sdk/client-s3` を devDependency に追加し、S3 互換 API（`https://<account_id>.r2.cloudflarestorage.com`・region `auto`）で R2 を操作する。
- 入力: `build-e/*.html`（`scripts/split-pages.mjs` が `npm run build` の最後に `build/e` を移す。`wrangler deploy` が `build/` を丸ごとアセットにするため）。各ファイルの sha256 を計算し、R2 の `manifest.json`（`{ "e/<id>.html": "<sha256>" }`）と突き合わせる。
- 出力: 変わった／新しいキーだけ PUT（`Content-Type: text/html; charset=utf-8`・並列 32）、ローカルに無いキーは DELETE、最後に manifest を書き戻す。冪等。
- 差分計算は純関数 `planSync(local, remote) → { put: string[], del: string[] }`（`scripts/lib/r2-plan.mjs`）に分離してテストする。
- フラグ: `--dry-run`（計画だけ表示）。終了時に put/del/skip の件数を出す。manifest が無ければ全件 PUT（初回）。
- 認証: 環境変数 `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`、任意で `R2_BUCKET`（既定 `chronoscroll-pages`）/ `R2_ACCOUNT_ID`（既定はアカウント ID を定数で持つ）。ローカルは gitignore した `.env.r2` を `node --env-file=.env.r2` で読む。**鍵をチャットや git に出さない。**

### デプロイ

- 他アプリと同じ **Workers Builds**（GitHub の main への push で自動）。
  - ビルドコマンド: `npm run build && node scripts/r2-sync.mjs`
  - デプロイコマンド: `npx wrangler deploy`
  - 環境変数（secret）: `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
- 月次 cron（`data-refresh.yml` → PR → マージ）は無変更。マージで Workers Builds が走り、変わった `/e/` だけ R2 に上がる。
- ⚠️ 既知の窓: `/e/` の HTML はハッシュ付き CSS（`/_app/immutable/assets/*.css`）を参照する。スタイルが変わるデプロイでは、R2 同期完了〜アセット差し替えの間（1分程度）だけ `/e/` が存在しない CSS を参照して素の HTML で表示される。頻度が低いので受け入れる。逆順（デプロイ→同期）でも同じ窓ができるので順序で解決しない。

## 3. ヘッダーと計測

- セキュリティヘッダーの**正本を `config/security-headers.json` の1箇所**にする（`{ "Content-Security-Policy": "...", "X-Frame-Options": "DENY", ... }`）。読む側は3つ:
  1. `static/_headers`（静的アセット用）— `scripts/write-headers.mjs` が JSON から生成し、`npm run build` の先頭で実行。生成物はコミットする（ドリフト検知テストの対象）。
  2. Worker（`/e/` 用）— JSON を import して全レスポンスに付ける。
  3. `e2e/serve.mjs`（CI の本番同等配信）— vercel.json の代わりに JSON を読む。
- `_headers` には加えて `/data/*` に `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`、`/_app/immutable/*` に `Cache-Control: public, max-age=31536000, immutable`。
- CSP の変更は計測の差し替え分だけ: `script-src 'self' https://static.cloudflareinsights.com`、`connect-src 'self' https://cloudflareinsights.com`。他は現行のまま（`style-src-attr` のハッシュ含む）。
- `@vercel/analytics` を削除し、`+layout.svelte` の動的 import を **Cloudflare Web Analytics のビーコン**（`<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"<token>"}'>`）に差し替える。トークンは非秘密だが 32 桁 hex なので `gitleaks:allow` を付ける。**SRI は付けない**（バージョン無し URL を Cloudflare が差し替える運用のため）。
- `e2e/smoke.mjs` のコンソール無視条件 `_vercel/insights` を `cloudflareinsights.com` に変える。
- サイト URL は `src/lib/site.ts` の `SITE_ORIGIN = 'https://chronoscroll.saitotakuya0719.workers.dev'` 1定数に寄せ、canonical・`og:url`・`og:image`・sitemap の BASE・`static/robots.txt` の Sitemap 行（静的ファイルなので直接書き換え）から参照する。
- `vercel.json` は削除する。

## 4. テスト

- Worker のロジックは `worker/serve.ts` に純関数で分離:
  - `resolve(pathname) → { kind: 'redirect', location } | { kind: 'page', key } | { kind: 'notFound' }`
  - `pageHeaders(etag, cacheable) → Headers`
  - `handle(request, env)`（fetch ハンドラ本体・R2 バインディングは引数の型で受ける）
- `vitest.config.ts` の include に `worker/**/*.test.ts` と `scripts/**/*.test.mjs` を、coverage の include と 100% threshold に `worker/*.ts` と `scripts/lib/*.mjs` を追加。
- `handle` のテストは R2 バインディングの最小フェイク（`get(key, opts)` が `{ body, httpEtag, writeHttpMetadata }` または body なしオブジェクト／null を返す）で 200・304・404・405・301（`.html`・末尾スラッシュ）・HEAD を通す。
- ドリフト検知: `static/_headers` が `scripts/write-headers.mjs` の出力と一致することをテスト（`config/` と `static/_headers` のどちらかだけ直した状態を止める）。
- CI の実ブラウザスモーク 54 本は無変更（`e2e/serve.mjs` が build/ を配信するので R2 なしで動く）。
- ローカル動作確認: `wrangler dev` + `wrangler r2 object put chronoscroll-pages/e/<id>.html --file build/e/<id>.html --local` で 2〜3 ページ入れて `/e/` の経路（200/304/301/404）を通す。
- 本番検証: `sitemap.xml` から `/e/` の実 URL を数件拾って叩く（トップの 200 は保証にならない — [[feedback_opennext_ssg_incremental_cache]] の教訓）+ 既存の `node e2e/smoke.mjs <本番URL>` を1回。

## 5. 切替手順

1. Claude: R2 バケット `chronoscroll-pages` を作成（Cloudflare MCP）。
2. 本人: R2 API トークン（Object Read & Write・`chronoscroll-pages` 限定）を発行し、リポジトリ直下の `.env.r2` に `R2_ACCESS_KEY_ID=...` / `R2_SECRET_ACCESS_KEY=...` として保存（エディタで・チャット経由にしない）。Web Analytics にサイト（workers.dev のホスト名）を追加してトークンを取得。
3. Claude: 実装（TDD）→ ローカル検証 → 初回同期（約10分）→ `wrangler deploy` → 本番検証（4節）。
4. 本人: Workers Builds を GitHub リポジトリと接続し、ビルド／デプロイコマンドと R2 の鍵を設定。Claude: main へ push して自動デプロイを確認（Workers Builds は無音で止まるので builds MCP で確認）。
5. 後始末: my-apps-portal の URL 差し替え／Vercel プロジェクトの停止か削除（本人に確認）／`AGENTS.md`・`README.md` のデプロイ節／Vault とメモリの更新。

## 触らないもの

- `src/routes/e/[id]/+page.server.ts`（prerender の読み込みはビルド時のみ・現状維持）
- `pipeline/`・`content/`・`static/data/`・`data-refresh.yml`
- Svelte 側の UI・CSP の `style-src-attr` ハッシュ運用（AGENTS.md の3点セット）

## 2026-09-26 初回デプロイ結果

- アセット数: `build/` 93ファイル（うち `_headers` は設定扱いで除外・92ファイルが Workers Assets にアップロード）・`build-e/` 27,137 ページ。
- R2 初回同期: `put 27137 / del 0 / skip 0`（失敗0）・所要 5分51秒（00:00:36→00:06:27）。2回目は `put 0 / del 0 / skip 27137` で冪等性を確認。
- `wrangler deploy`: `https://chronoscroll.saitotakuya0719.workers.dev` を公開（Worker Startup Time 1ms・Version 30b401af-9d76-41ff-9cb1-a39167c262ef）。
- 本番検証（Step 4）: `/e/` 3本とも 200+ETag・top 200+CSP・`/c`・`/c/anime` 200・`/data/index.json` 200+Cache-Control・存在しない `/e/` は404・`.html` は301リダイレクト・beacon 1件、全項目 Expected 通り。
- 実ブラウザスモーク（Step 5）: 1回目 53/54（「検索: ジャンプ先がハイライトされる」が本番初回のコールドレイテンシで一過性に不合格）、2回目 54/54 で全通過・再現せず。
