# About this repository (for AI/Claude)

**chronoscroll** is a static web app for browsing historical news on an infinitely scrolling vertical timeline.
It shows domestic and international news from 1829 to the present, with an importance-based LOD that depends on the zoom level
(automatic collection covers 1868 (Meiji) onward; earlier events are the ones written up for collections).

## Architecture
- **SvelteKit + adapter-static** (every page prerendered). Deployed to **Cloudflare Workers** (`wrangler.jsonc`).
  Everything in `build/` except `/e/` (about 94 files) is static assets; `/e/<id>` (27,000+ pages) goes to `build-e/` → R2 bucket
  `chronoscroll-pages`, diff-synced by `scripts/r2-sync.mjs`, and `worker/serve.ts` serves it from R2
  (the split keeps us within the free tier's "20,000 files per version"). The R2 keys live only in `.env.r2` (gitignored) and
  the Workers Builds secrets. Host: https://chronoscroll.saitotakuya0719.workers.dev
- Data is generated from the ja.wikipedia year pages by a **build-time pipeline** (`pipeline/`) and
  **committed** to `static/data/` as JSON chunks (deploys never hit Wikipedia).
- **First paint uses `overview-lite.json`** (card-only fields of overview.json, about 1/4 the size; it is the
  LCP critical path). `overview.json` is fetched right after it and swaps the previews for full events;
  `byId`/`loadById` never return a preview (the detail dialog needs the body). Both are written by the pipeline
  (`overviewLite` in `pipeline/lib/emit.ts`), so keep them in sync if you edit one by hand.
- **The LOD threshold is driven by the local density of the visible range** (`eventsPerDayInRange` in `chunks.ts`). The actual density
  varies 12x by decade, from 0.14 to 1.67 events/day, so the all-time average would make the Meiji era sparse and the 2000s onward
  overcrowded. The density comes from the chunk counts in `index.json`, so no extra data is needed.
  Note that `importanceThreshold` caps the density at `MAX_PX_PER_DAY / MIN_PX_PER_EVENT`.
  Without this, in high-density eras the threshold never drops to 0 even at max zoom, and roughly the lower half
  **is never shown at any zoom or scroll position** (thinning dense stretches is capDensity's job).
- `content/curated/*.yaml` overrides top-tier events by id (rewritten summaries, SVG assignment, importance adjustments).
  Never edit the auto-generated data directly. Always make manual fixes in the curated layer.
  `fixes.yaml` holds corrections of parser residue and wrong year-page lines, each verified against the topic article.
  **A `date:` override keeps the id** (id = date + hash of the original text), so the old date stays in the id and the
  `/e/` URL, and the correction **must stay within the same year** (`crossYearDateOverrides`: `loadById` loads the chunk
  of a `?e=<id>` deep link from the id prefix). A cross-year fix or a parser change that alters the text needs a
  redirect mechanism first (new id = new page, old page orphaned; collections and curated entries reference the id).
- **Markup residue** (an unclosed `<ref>{{Cite …}}` tail, 「9–13日 - 」 date fragments, 「…も参照」, a `{{仮リンク|…|label=…}}`
  rendered with its first argument such as 「暗殺事件される」) is detected by `pipeline/lib/residue.ts` and reported, not
  failed, by `build.ts` (⚠️ lines at the end of the stats) and `pipeline/content.test.ts`, so a new case on Wikipedia
  never blocks the monthly refresh. Hand-written text in `content/` must be clean (hard fail). Fix cases via `fixes.yaml`.
  The committed data must also stay at or below `RESIDUE_CEILING` in `content.test.ts` (count per class; 3 cases left
  after the 2026-10 pass). The data-refresh job only annotates an excess, then CI fails until the new cases are fixed:
  lower the ceiling together with fixes, never raise it. A multi-line `<ref>`/`{{efn}}` case is best fixed with the
  text the parser gives for the whole logical line (the line plus its continuation lines), which restores words that
  follow `</ref>`; a range such as 「[[2月8日]] - [[2月15日|15日]] - 本文」 keeps the start date, as the parser does.
- `content/affiliate/books.yaml` holds affiliate book links (id → BookRef[]). They are never
  merged into `NewsEvent`; they are served through a separate path as `static/data/books.json` (to keep the CC BY-SA-derived data clean).
- `content/collections/<slug>.yaml` is a **collection (特集)** (a themed reading list). One file per collection, with metadata +
  `entries` (same shape as curated). Entries flow through the same path as the curated layer, so besides
  referencing and partially overriding existing events, **new events are also written up here** (an entry with `date` + `title` + `summary`
  is added as new. `importance` defaults to 100 if omitted, so always set it explicitly, to 40-60 so it does not pollute the main timeline).
  Output goes two ways: `static/data/collections.json` (the listing + reverse lookup of event id → slug) and
  `static/data/collections/<slug>.json` (with the included event bodies).
  The timeline filters with `?k=<slug>`. **LOD is not applied while filtering by a collection** (otherwise the included events, which are given
  low importance, lose to the threshold and none appear; see `threshold` in Timeline.svelte).
- OGP images are **generated from real data and committed** (not generated at serve time). After `npm run build`,
  `npm run ogp` regenerates `static/ogp.png` (template: `static/ogp-src.html`) and the per-collection
  `static/ogp/c-<slug>.png` (template: `static/ogp-collection-src.html`, rendered from collections.json).
  **Always regenerate after adding or renaming a collection** (without the image, social shares hit a 404).
- `CURRENT_SPONSOR` in `src/lib/sponsor.ts` is the setting for the self-hosted sponsor slot (`null` hides it when there is no contract).
- Running `wrangler deploy` locally also serves the gitignored `static/art-preview.html` and `static/ogp-src.html`,
  so leave production deploys to Workers Builds (clean checkout).
- After `npm run build`, `build/e` moves to `build-e/`, so for local checks use `node e2e/serve.mjs <port>`
  instead of `vite preview`.
- If `wrangler deploy` fails after a successful R2 sync, rebuild (otherwise the window of CSS hash mismatch grows).

## Svelte 5 notes (newer than the training data)
- **Runes mode is enforced** (vite.config.ts). Use `$state` / `$derived` / `$effect` / `$props`.
  Do not use `export let` or `$:` reactive statements. Events are `onclick={...}` (not `on:click`).
- There is no svelte.config.js; the adapter etc. are consolidated in **the sveltekit() options in vite.config.ts**.
- Transitions are WAAPI-based and compatible with the strict CSP (do not inject style tags).

## Testing policy (lib 100%, UI gated)
- `src/lib/*.ts` (pure logic) and `pipeline/lib/**` (pure functions for parsing, scoring, etc.) are under a
  **100% coverage gate** (vitest.config.ts thresholds). It runs in CI.
- The UI layer (`src/lib/components/`, `src/lib/state/`, `src/lib/workers/`, `src/routes/`) has its own
  gate (lines 98 / statements 97 / functions 97 / branches 83; reached level minus 2). Its tests run in the
  `ui` Vitest project (jsdom + Testing Library): `*.svelte.test.ts` next to the component, plus
  `src/lib/workers/*.test.ts` and `src/routes/**/*.test.ts`. Test behaviour through roles, visible text and
  URL state, not internals. jsdom shims (dialog, matchMedia, scrollTo) live in `src/test/setup.ts`;
  `$app/*` is stubbed in `src/test/stubs/`. IO scripts (`pipeline/run/`) stay outside the gate.
- Isolate code that touches the network in `pipeline/run/`, and test the logic with fixtures.
- `pipeline/run/api.ts` and `build.ts` are written with **Effect 4** (`effect`, devDependency only; nothing ships to the browser).
  API failures are typed (`HttpError` / `ApiError` / `NetworkError`), retries are an Effect `Schedule` whose delays come from
  `retryDelayMs` in `pipeline/lib/throttle.ts` (change the backoff there, not in the schedule), and waits go through `Clock`.
  `pipeline/run/api.test.ts` checks the retry timing on `TestClock` with a stubbed `Fetch` reference, so no test waits in real time.

## Security / publishing
- Strict CSP (config/security-headers.json). Only images are allowed from upload.wikimedia.org. Do not loosen it later.
- The source of truth for security headers is `config/security-headers.json`. `static/_headers` (for static assets) is
  a **generated file** produced by `scripts/write-headers.mjs`; do not edit it by hand (`scripts/lib/headers.test.mjs` stops drift).
  The Worker (`/e/*`) and `e2e/serve.mjs` read the same JSON.
- **The SvelteKit × strict CSP trio** (missing any one leaves production blank):
  ① The inline boot script is externalized by `scripts/externalize-inline.mjs` (post-build).
  ② `paths.relative: false` (import() inside the externalized boot script resolves via absolute paths).
  ③ The `style-src-attr` hash is for the fixed style attribute of SvelteKit's route announcer
     (position:absolute;...). **Recompute it if this string changes after a kit version update**:
     compute the sha256 with `node -e "..."` and update config/security-headers.json (if it changes, CSP violations show up in the console).
- Do not emit style: attributes during SSR (inline style attributes violate the CSP; Timeline's height is added after ready).
- **Make it public only through the publish-check skill**. Private until then.
- No secrets or environment variables (only public APIs are used). Do not create `.env`.
  Exception = the R2 sync keys in `.env.r2` (gitignored; a secret on Workers Builds).

## Pipeline pitfalls (ones we hit while implementing)
- **Never cache the current or previous year's year pages** (`isVolatileYear` in `pipeline/lib/cache-policy.ts`).
  The current year's page gets new entries daily, so reusing `.cache/years*/YYYY.wikitext`
  leads to "events after the fetch date never show up". In practice a build on 07-30 used the
  2026-07-10 cache, and maxDate stayed at 07-10. data-refresh.yml restores the Actions cache,
  so it surfaces as the monthly PR returning "no changes" for the current year forever.
  The cache is followed only with `--offline`. On fetch failure (both network errors and missing pages return null),
  fall back to the existing cache so the current year is not dropped entirely.
- The separator between date and body is not only `-–—−‐` but also **full-width/half-width colons** (the 2001 page and the 1953 Japan page
  use 「M月D日：本文」 throughout). This is consolidated in `SEP` in `wikitext.ts`.
  Range notation like 「8月25日～8月26日 - 本文」 is collapsed to the start date by `collapseDateRange` before parsing
  (otherwise the date is not parsed and falls back to the start of the month). These two fixes cut wrong dates from 347 to 151.
  The rest are mostly dates melted into the sentence, like 「2月3日に○○が起きた」, which have a high false-positive risk, so they are not handled.
- `prop=pageviews` **does not return all pages in one response** even with batches of 50. Follow `continue`.
  Also, if a particular title fails with `pvi-cached-error-title`, the whole batch errors → exclude that title and retry.
- Because of how ja.wikipedia splits articles, ja Wikidata items **have too few sitelinks, especially for serious Japanese incidents** (関東大震災 = 3 language editions).
  This is why page views are used as well.
- The 「できごと」 section of a year page expresses multiple events on the same day as `* [[10月1日]]` (date-only parent) + `**` (children).
  Separators besides `-` include `–` `—` `−` `‐` (U+2010). Only 1995 uses the heading 「出来事・事柄」.
- SVG sprites are consolidated as `<symbol>`s in `static/art/sprite.svg` and referenced with `<use href="/art/sprite.svg#id">`.
  curated `svg:` maps 1:1 to these symbol ids.

## Data license
- Event summaries come from Wikipedia (**CC BY-SA 4.0**). Each event carries source links,
  and attribution is shown on the about page and in the README. static/data/ follows this license too.

## Commit granularity
- Small, per feature. Commit in a green state together with the tests.

## Cursor Cloud specific instructions
- Dependencies are installed automatically by the startup update script (`npm ci`). For standard commands see
  the README and `scripts` in the root `package.json` (`npm run dev` / `test` / `coverage`
  / `typecheck` / `build`).
- **Data generation and builds need no network**. The JSON is committed in `static/data/`, and
  both `npm run dev` and `npm run build` serve it as is. `npm run data:build` (fetching from Wikipedia)
  is only for the monthly data update; do not run it for normal development or verification.
- For the e2e smoke test (`node e2e/smoke.mjs <baseUrl>`), first create `build/` with `npm run build`,
  start `node e2e/serve.mjs <port>` (serves with production-equivalent CSP) in a separate process, then run it.
  For the browser use `playwright` (`npm i --no-save playwright && npx playwright install --with-deps chromium`)
  or the system Chrome (`channel: 'chrome'` in `playwright-core`). If neither is installed,
  only the smoke test fails; `dev`/`test`/`build` are unaffected.
- For GUI checks, start `npm run dev` (Vite, default 5173) and open it in a browser. The contents are
  restored from the `?t=/z=/s=/k=` URL state, so opening a shared URL as is gives the same view.
