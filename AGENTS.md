# このリポジトリについて（AI/Claude向け）

歴史ニュースを縦の無限スクロール年表で見る静的Webアプリ **chronoscroll**。
1868（明治）〜現在の国内外ニュースを、ズームレベルに応じた重要度LODで表示する。

## アーキテクチャ
- **SvelteKit + adapter-static**（サーバーなし・全ページprerender）。Vercelにデプロイ。
- データは**ビルド時パイプライン**（`pipeline/`）で ja.wikipedia 年ページから生成し、
  `static/data/` にJSONチャンクとして**コミットする**（デプロイ時にWikipediaを叩かない）。
- `content/curated/*.yaml` がトップ層イベントを id で上書き（要約リライト・SVG割当・重要度補正）。
  自動生成データを直接編集しない。手直しは必ず curated 層で行う。

## Svelte 5 の注意（訓練データより新しい）
- **runesモード強制**（vite.config.ts）。`$state` / `$derived` / `$effect` / `$props` を使う。
  `export let` や `$:` リアクティブ文は使わない。イベントは `onclick={...}`（`on:click` ではない）。
- svelte.config.js は存在せず、adapter等は **vite.config.ts の sveltekit() オプション**に集約。
- トランジションは WAAPI ベースで厳格CSPと両立する（styleタグ注入をしないこと）。

## テスト方針（lib 100%）
- `src/lib/*.ts`（純ロジック）と `pipeline/lib/**`（パース・スコアリング等の純関数）は
  **カバレッジ100%ゲート**（vitest.config.ts thresholds）。CIで作動する。
- UIコンポーネント（`src/lib/components/`）とIOスクリプト（`pipeline/run/`）はゲート対象外。
- ネットワークを触るコードは `pipeline/run/` に隔離し、ロジックは fixture でテストする。

## セキュリティ / 公開
- 厳格CSP（vercel.json）。画像のみ upload.wikimedia.org を許可。後から緩めない。
- **SvelteKit×厳格CSPの3点セット**（どれか欠けると本番で真っ白になる）:
  ① 起動インラインスクリプトは `scripts/externalize-inline.mjs`（post-build）で外部化。
     Vercel上では adapter-static の出力先が `.vercel/output/static` になる点に注意。
  ② `paths.relative: false`（外部化した起動スクリプト内の import() を絶対パスで解決）。
  ③ `style-src-attr` のハッシュはSvelteKitルートアナウンサーの固定style属性
     （position:absolute;...）のもの。**kitのバージョン更新でこの文字列が変わったら再計算**:
     `node -e "..."` でsha256を出し vercel.json を更新（変わると console にCSP違反が出る）。
- SSRでstyle:属性を出力しない（インラインstyle属性はCSP違反。Timelineのheightはready後に付与）。
- **public化は publish-check スキル経由のみ**。それまで private。
- 秘密情報・環境変数なし（公開APIのみ使用）。`.env` を作らない。

## パイプラインの落とし穴（実装時に踏んだもの）
- `prop=pageviews` は50件バッチでも**1レスポンスに全ページ分は入らない**。`continue` を辿ること。
  さらに特定タイトルが `pvi-cached-error-title` で失敗するとバッチ全体がエラーになる → 当該タイトルを除外してリトライ。
- ja版Wikidata項目は記事分割の粒度により**日本の重大事件ほど sitelinks が過小**（関東大震災=3言語版）。
  ページビューを併用する理由がこれ。
- 年ページの「できごと」は `* [[10月1日]]` （日付のみ親）+ `**`（子）で同日複数イベントを表す。
  区切りは `-` 以外に `–` `—` `−` `‐`(U+2010) がある。1995年だけ見出しが「出来事・事柄」。
- SVGスプライトは `static/art/sprite.svg` に `<symbol>` 集約、`<use href="/art/sprite.svg#id">` 参照。
  curated の `svg:` はこの symbol id と1:1で対応させる。

## データのライセンス
- イベント要約は Wikipedia 由来（**CC BY-SA 4.0**）。各イベントに出典リンクを持ち、
  aboutページとREADMEで帰属表示する。static/data/ もこのライセンスに従う。

## コミット粒度
- 機能単位で小さく。テストとセットで green の状態でコミットする。
