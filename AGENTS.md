# このリポジトリについて（AI/Claude向け）

歴史ニュースを縦の無限スクロール年表で見る静的Webアプリ **chronoscroll**。
1829〜現在の国内外ニュースを、ズームレベルに応じた重要度LODで表示する
（自動生成の収集対象は1868（明治）〜。それ以前は特集の書き起こし分）。

## アーキテクチャ
- **SvelteKit + adapter-static**（サーバーなし・全ページprerender）。Vercelにデプロイ。
- データは**ビルド時パイプライン**（`pipeline/`）で ja.wikipedia 年ページから生成し、
  `static/data/` にJSONチャンクとして**コミットする**（デプロイ時にWikipediaを叩かない）。
- **LODの閾値は可視範囲の局所密度で決まる**（`chunks.ts` の `eventsPerDayInRange`）。実密度は
  十年ごとに0.14〜1.67件/日と12倍違うので、全期間平均を使うと明治期がスカスカ・2000年代以降は
  詰まりすぎになる。密度は `index.json` のチャンク件数から出すので追加データは要らない。
  なお `importanceThreshold` は密度を `MAX_PX_PER_DAY / MIN_PX_PER_EVENT` で頭打ちにする。
  これが無いと高密度時代では最大ズームでも閾値が0まで下がらず、下位の約半数が
  **どのズーム・スクロール位置でも表示されない**（密集区間の間引きは capDensity の担当）。
- `content/curated/*.yaml` がトップ層イベントを id で上書き（要約リライト・SVG割当・重要度補正）。
  自動生成データを直接編集しない。手直しは必ず curated 層で行う。
- `content/affiliate/books.yaml` はアフィリエイト書籍リンク（id→BookRef[]）。`NewsEvent`には一切
  マージせず、`static/data/books.json`として独立経路で配信する（CC BY-SA由来データを汚さないため）。
- `content/collections/<slug>.yaml` が**特集**（テーマ別の読み物）。1ファイル1本で、メタ情報＋
  `entries`（curated と同型）を持つ。entries は curated 層と同じ経路に流すので、既存イベントの
  参照・部分上書きだけでなく **新規イベントの書き起こしもここで行う**（`date`+`title`+`summary`が
  揃えば新規追加。`importance`は省略すると100になるので必ず明示し、本編を汚さないよう40〜60に振る）。
  出力は `static/data/collections.json`（一覧＋イベントid→slugの逆引き）と
  `static/data/collections/<slug>.json`（収録イベント本体つき）の2系統。
  年表側は `?k=<slug>` で絞り込む。**特集の絞り込み中はLODを効かせない**（低importanceに
  振ってある収録イベントが閾値に負けて1件も出なくなるため。Timeline.svelteの`threshold`参照）。
- OGP画像は**実データから生成してコミットする**（配信時に生成しない）。`npm run build` のあと
  `npm run ogp` で `static/ogp.png`（テンプレ: `static/ogp-src.html`）と特集ごとの
  `static/ogp/c-<slug>.png`（テンプレ: `static/ogp-collection-src.html`・collections.jsonから描画）を再生成。
  **特集を追加/改題したら必ず再生成する**（画像が無いとSNS共有時に404になる）。
- `src/lib/sponsor.ts`の`CURRENT_SPONSOR`が自前スポンサー枠の設定値（未契約時は`null`で非表示）。

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
- **当年・前年の年ページはキャッシュしてはいけない**（`pipeline/lib/cache-policy.ts` の `isVolatileYear`）。
  年ページは当年分が日々追記されるため、`.cache/years*/YYYY.wikitext` を使い回すと
  「取得した日以降のできごとが永久に載らない」状態になる。実際に2026-07-10のキャッシュのまま
  07-30にビルドされ、maxDateが07-10で止まっていた。data-refresh.yml はActionsキャッシュを
  復元するので、月次PRが当年について永久に「変更なし」を返し続ける形で表面化する。
  `--offline` 指定時のみキャッシュに従う。取得失敗（通信断もページ不在も null で返る）の際は
  既存キャッシュへフォールバックし、当年ぶんを丸ごと落とさない。
- 日付と本文の区切りは `-–—−‐` だけでなく**全角/半角コロン**もある（2001年や1953年の日本ページは
  1ページ丸ごと「M月D日：本文」表記）。`wikitext.ts` の `SEP` に集約してある。
  「8月25日～8月26日 - 本文」の期間表記は `collapseDateRange` で開始日に畳んでから解析する
  （畳まないと日付として解析されず月初に落ちる）。この2つの対応で誤日付が347件→151件になった。
  残りは「2月3日に○○が起きた」のように日付が文に溶けた形が中心で、誤爆リスクが高いので未対応。
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

## Cursor Cloud specific instructions
- 依存インストールは起動時の update script（`npm ci`）で自動実行済み。標準コマンドは
  README とルート `package.json` の `scripts` を参照（`npm run dev` / `test` / `coverage`
  / `typecheck` / `build`）。
- **データ生成やビルドにネットワークは不要**。`static/data/` に JSON が commit 済みで、
  `npm run dev` も `npm run build` もそれをそのまま配信する。`npm run data:build`（Wikipedia
  取得）は月次データ更新時のみで、通常の開発・検証では走らせない。
- e2e スモーク（`node e2e/smoke.mjs <baseUrl>`）は事前に `npm run build` で `build/` を作り、
  別プロセスで `node e2e/serve.mjs <port>`（本番同等CSPで配信）を起動してから実行する。
  ブラウザは `playwright`（`npm i --no-save playwright && npx playwright install --with-deps chromium`）
  かシステム Chrome（`playwright-core` の `channel: 'chrome'`）を使う。どちらも未導入だと
  スモークだけ失敗するが、`dev`/`test`/`build` には影響しない。
- GUI 確認は `npm run dev`（Vite・デフォルト5173）を起動してブラウザで開く。中身は
  `?t=/z=/s=/k=` の URL 状態で復元されるので、共有された URL をそのまま開けば同じ表示になる。
