# 特集（コレクション）機能 設計メモ

2026-07-30 実装。関連: `AGENTS.md`（運用ルール）/ `pipeline/lib/collections.ts` / `src/lib/collections.ts`

## なぜ作ったか

年表は1868〜現在を通しで眺めるのは得意だが、**あるテーマだけを追う導線が無かった**。
「アニメの歴史」のようにテーマを決めて年代順に読める入口を足す。

## 設計を決めた事実

着手時に既存27,014件をキーワードで実測した結果が、機能の性質を決めた。

| テーマ | ヒット | 実態 |
|---|---|---|
| アニメ | 88件 | 既存イベントで組める |
| 鉄道 / 宇宙 / 映画 | 1141 / 238 / 145 | 素材豊富 |
| ブレイクダンス | **0件** | ゼロ |
| 観葉植物 | 18件 | 実質ゼロ（全部「植物園開園」） |

Wikipedia年ページは「その年の主要な事件」を並べたものなので、**ニッチなテーマ史は構造的に載らない**。
つまり特集は「既存イベントを束ねる機能」ではなく「**テーマ史を書き起こす場所**」でもある必要がある。

前例はあった。`content/curated/ai-tech.yaml`（41件中40件が新規イベント）が事実上の未公開の特集で、
これを表に出す形に落ち着いた。

## 中心の判断: entries を CuratedEntry と同型にする

`content/collections/<slug>.yaml` の `entries` を既存の `CuratedEntry` と同じ形にし、
build.ts で curated 層と concat して**同じ経路に流す**。

```
content/curated/*.yaml      ┐
content/collections/*.yaml  ┴→ curatedEntries → protectedIds（重複除去からのid保護）
                                             → applyCurated（新規追加 / 部分上書き）
                                             → manualRelatedIds（relatedIds手動指定）
```

これで4つの機能が新規実装なしで手に入る:

1. 既存イベントの参照
2. 既存イベントの部分上書き（要約リライト・SVG割当）
3. **新規イベントの生成**（`date`+`title`+`summary` が揃うと `applyCurated` が作る）
4. 月次Wikipedia再生成での**id保護**と、外れたときの `⚠️` 検出

配信は books.yaml の前例（`NewsEvent`にマージせず独立経路）に倣って2系統:

- `static/data/collections.json` — 一覧メタ + イベントid→slug の逆引き（6KB）
- `static/data/collections/<slug>.json` — 収録イベント**本体つき**（18〜37KB）

本体を詰めたのが効いた。年表の `?k=<slug>` 絞り込みで**チャンクを1つも読まずに**特集全件を描ける。

## 見せ方

- `/c` 一覧、`/c/<slug>` 個別（どちらも `prerender` + `csr=false` の純静的HTML）
- 年表側は `?k=<slug>`。`FilterState.collectionIds` で絞り、URLには id列ではなく slug だけ乗せる
  （id集合は collections.json から解決するため `serializeFilter` の対象外）
- 「年表で通して見る」は**期間の中央ではなく最新のできごと**に着地させる。
  特集は年代が飛ぶので中央が空白帯になることがある（ブレイクダンスは1996〜2004が空）

## 落とし穴（実装中に踏んだもの）

### 1. 特集の絞り込み中はLODを外さないと1件も出ない

収録イベントは本編を汚さないよう `importance` を40〜60に振ってある。
一方 `importanceThreshold` は密度から閾値を出すので、フィルタ通過率で補正しても

```
selectivity = 18/725 = 0.0248 → adjustedEventsPerDay = 0.0093
threshold = 100 × (1 − 0.1396/(110×0.0093)) ≈ 86
```

となり、**全件が閾値に負けて消える**。`Timeline.svelte` の `threshold` は特集中は 0 にする。
件数は特集1本ぶん（数十件）に限られるので、間引きは `capDensity` だけで足りる。

> 教訓: 「フィルタで件数が減れば `filterSelectivity` が閾値を下げてくれる」は成り立たない。
> selectivity には下限0.005があるが、それに張り付く前に閾値が実用外の高さになる。

### 2. importance の既定値は 100

`applyCurated` は `importance` 省略時に 100 を入れる。新規イベントでは**必ず明示**する。
省略するとニッチな話題が概観ズームの先頭に並ぶ。

### 3. `e2e/serve.mjs` の cleanUrls 解決順

`/c` は `build/c.html` と `build/c/`（`/c/<slug>` 用）が同名で並ぶ。harnessが
ディレクトリを優先していたため `c/index.html` を探して404。**`.html` を先に見る**のが正しい。
Vercelは出力ファイルからルート表を作るので本番は無影響だったが、CIのスモークが落ちる。

### 4. 収録期間が伸びるとスモークが壊れる

初期ズームは `vh×6/(maxDay−minDay)` なので、収録期間が伸びると初期ズームが下がる。
「ズームアウトを2回押すと下限」という決め打ちが壊れた。**無効化されるまで押し切る**形にした。

### 5. 前史を入れると収録期間の表示が変わる

観葉植物の1829〜1855の6件を史実どおり入れたため、ヘッダーの収録期間が
`1868年〜` → `1829年〜` になった。値は `index.json` から焼き込むので表示は自動追従する。
1829〜1868は6件しかない疎な帯になる（ユーザー判断で受け入れ）。

## 新しい特集を足す手順

1. `content/collections/<slug>.yaml` を1本作る（`slug`/`title`/`lead`/`description`/`icon?`/`entries`）
2. 既存イベントを使うなら id を調べる:
   ```bash
   node -e "
   const fs=require('fs');let all=[];
   for(const f of fs.readdirSync('static/data/chunks'))all=all.concat(JSON.parse(fs.readFileSync('static/data/chunks/'+f,'utf8')));
   const re=/キーワード|別のキーワード/;
   for(const e of all.filter(e=>re.test(e.title)||re.test(e.summary)).sort((a,b)=>a.date<b.date?-1:1))
     console.log(e.id,'|',e.importance,'|',e.title.slice(0,60));
   "
   ```
3. 素材が無いテーマは新規執筆。**出典は実在記事のみ**。書く前にAPIで存在確認する:
   ```bash
   node -e "
   const t=['記事名A','記事名B'];
   fetch('https://ja.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles='+encodeURIComponent(t.join('|')),
     {headers:{'User-Agent':'chronoscroll-dev/1.0'}}).then(r=>r.json()).then(j=>{
     for(const p of Object.values(j.query.pages)) console.log(p.missing!==undefined?'❌':'✅',p.title);
   });"
   ```
   `importance` は 40〜60 で明示。ja版が無い題材は en版を出典にしてよい（ラベルに「(英語)」と付ける）
4. アイコンを描くなら `static/art/sprite.svg` に `viewBox="0 0 96 96"` の symbol を追加し、
   `/art-preview.html` で**64px相当の見え方を必ず確認する**（線が多いと小サイズで潰れる）
5. 再生成して確認:
   ```bash
   npx tsx pipeline/run/build.ts --offline   # ⚠️ が出ないこと・件数と期間を確認
   npm run typecheck && npm run coverage && npm run build
   node e2e/serve.mjs 5299 & node e2e/smoke.mjs http://localhost:5299
   ```
   スモークの特集シナリオは `collections.json` から件数を読むので、本数が増えても自動追従する

表示順はファイル名順（`readdirSync().sort()`）。順序を変えたければファイル名を変える。
