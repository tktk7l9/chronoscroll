// chronoscroll real-browser smoke test
// Usage: node e2e/smoke.mjs [baseUrl]   (default http://localhost:5199)
// Scenarios: initial view / coverage row / zoom / detail dialog / filters / search jump / URL restore / mobile
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5199';
const results = [];
const errors = [];

function assert(name, cond, detail = '') {
	results.push({ name, ok: !!cond, detail: cond ? '' : detail });
}

// Locally use the system Chrome; CI uses the playwright package (which ships the chromium binary)
async function launchBrowser() {
	try {
		const { chromium } = await import('playwright');
		return await chromium.launch({ headless: true });
	} catch {
		const { chromium } = await import('playwright-core');
		return await chromium.launch({ channel: 'chrome', headless: true });
	}
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
	if (m.type() !== 'error') return;
	// The Cloudflare Web Analytics beacon is rejected on local/CI host names, so exclude it
	if ((m.location()?.url ?? '').includes('cloudflareinsights.com')) return;
	if (m.text().includes('cloudflareinsights.com')) return;
	errors.push(`${m.text()} (${m.location()?.url ?? ''})`);
});

// 1. Initial view (overview, prominent news only)
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const initialCards = await page.locator('.card').count();
assert('初期表示: カードが描画される', initialCards > 3, `cards=${initialCards}`);
assert(
	'初期表示: 概観レベル表示（ズームゲージ）',
	(await page.locator('.zoomctl .stop.active').textContent())?.includes('概観'),
);
// Coverage row: the real numbers from index.json are in the header (baked in at build time, so no waiting on fetch)
const meta = JSON.parse(readFileSync('static/data/index.json', 'utf8'));
const covText = (await page.locator('.coverage').textContent())?.replace(/\s+/g, ' ') ?? '';
const jp = (iso) => {
	const [y, m, d] = iso.split('-');
	return `${Number(y)}年${Number(m)}月${Number(d)}日`;
};
assert(
	'収録データ: 総件数と期間が表示される',
	covText.includes(`全${meta.total.toLocaleString('en-US')}件`) &&
		covText.includes(jp(meta.minDate)) &&
		covText.includes(jp(meta.maxDate)),
	`text=${covText}`,
);

// At the zoom-out limit the − button becomes disabled (making the range of motion visible).
// The initial zoom is derived from the covered period, so the number of clicks needed varies. Press through with a cap
const zoomOut = page.locator('button[aria-label="ズームアウト"]');
for (let i = 0; i < 8 && !(await zoomOut.isDisabled()); i++) {
	await zoomOut.click();
	await page.waitForTimeout(120);
}
await page.waitForTimeout(300);
assert('ズームゲージ: 下限で−がdisabledになる', await zoomOut.isDisabled());

// 2. Zoom in → z in the URL increases and the level label changes
await page.click('button[aria-label="ズームイン"]');
await page.click('button[aria-label="ズームイン"]');
await page.click('button[aria-label="ズームイン"]');
await page.waitForTimeout(800);
const zParam = new URLSearchParams(await page.evaluate(() => location.search)).get('z');
assert('ズーム: URLにzが反映される', zParam !== null && Number(zParam) > 0.2, `z=${zParam}`);

// 3. Click an event → detail dialog (with source links)
await page.locator('.card .hit').first().click();
await page.waitForTimeout(500);
assert('詳細: ダイアログが開く', await page.evaluate(() => document.querySelector('dialog')?.open));
const sourceLinks = await page.locator('dialog footer a').count();
assert('詳細: 出典リンクがある', sourceLinks > 0, `links=${sourceLinks}`);
assert(
	'詳細: URLにeが反映される',
	(await page.evaluate(() => location.search)).includes('e='),
);

// While the modal is open, the background (timeline) must not move.
// ① wheel over the backdrop ② chaining from the end of scrolling inside the modal ③ ⌘+wheel zoom
const dlgBox = await page.evaluate(() => {
	const r = document.querySelector('dialog').getBoundingClientRect();
	return { x: r.x, y: r.y, w: r.width, h: r.height };
});
assert('詳細: モーダルが十分に広い', dlgBox.w >= 780, `w=${dlgBox.w}`);

const scrollBefore = await page.evaluate(() => window.scrollY);
await page.mouse.move(60, 400);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(300);
await page.mouse.move(Math.round(dlgBox.x + dlgBox.w / 2), Math.round(dlgBox.y + dlgBox.h / 2));
for (let i = 0; i < 2; i++) {
	await page.mouse.wheel(0, 3000);
	await page.waitForTimeout(300);
}
const scrollAfter = await page.evaluate(() => window.scrollY);
assert(
	'詳細: 表示中は背景がスクロールしない',
	scrollAfter === scrollBefore,
	`${scrollBefore} -> ${scrollAfter}`,
);

const zoomHBefore = await page.evaluate(
	() => document.querySelector('.timeline').getBoundingClientRect().height,
);
await page.keyboard.down('Meta');
await page.mouse.wheel(0, -300);
await page.keyboard.up('Meta');
await page.waitForTimeout(400);
const zoomHAfter = await page.evaluate(
	() => document.querySelector('.timeline').getBoundingClientRect().height,
);
assert(
	'詳細: 表示中は⌘+ホイールで背景がズームしない',
	zoomHAfter === zoomHBefore,
	`${zoomHBefore} -> ${zoomHAfter}`,
);
const wheelStolen = await page.evaluate(() => {
	const e = new WheelEvent('wheel', {
		deltaY: -300,
		ctrlKey: true,
		bubbles: true,
		cancelable: true,
	});
	window.dispatchEvent(e);
	return e.defaultPrevented;
});
assert(
	'詳細: 表示中もctrl+ホイールは preventDefault する（ブラウザのページズームを止める）',
	wheelStolen === true,
);

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
assert(
	'詳細: Escで閉じてURLからeが消える',
	!(await page.evaluate(() => location.search)).includes('e='),
);
assert(
	'詳細: 閉じた後もスクロール位置が保たれる',
	(await page.evaluate(() => window.scrollY)) === scrollBefore,
	`${scrollBefore} -> ${await page.evaluate(() => window.scrollY)}`,
);

// 3b. Whether the image box is reserved before loading.
// With width:auto-style CSS on img, both dimensions are undetermined and the box collapses to 0px,
// so the text jumps down all at once when the image arrives (jank). Measure while holding the image back so it has not arrived
const imageEvent = await page.evaluate(async () => {
	const evs = await (await fetch('/data/overview.json')).json();
	const e = (evs.events ?? evs).find((x) => x.image && x.image.width >= 400 && x.image.height >= 300);
	return { id: e?.id, date: e?.date };
});
await page.route('**upload.wikimedia.org**', async (route) => {
	await new Promise((r) => setTimeout(r, 8000));
	// After measuring we unroute / navigate away, so requests held at that point can be dropped
	await route.abort().catch(() => {});
});
await page.goto(base + `/?e=${imageEvent.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
const reserved = await page.evaluate(() => {
	const img = document.querySelector('dialog img');
	if (!img) return null;
	const r = img.getBoundingClientRect();
	return { w: Math.round(r.width), h: Math.round(r.height), loaded: img.complete };
});
assert(
	'詳細: 画像の枠を読み込み前に確保する（到着で本文が飛ばない）',
	reserved && !reserved.loaded && reserved.w > 100 && reserved.h > 100,
	`id=${imageEvent.id} ${JSON.stringify(reserved)}`,
);
await page.unroute('**upload.wikimedia.org**');

// 3c. Hover prefetch: fetch the image before the detail opens (removes the blank wait right after opening).
// Measured on a real 1.6 Mbps-equivalent line: click → display went from 1726ms → 174ms (with a 1.5s hover).
// To avoid depending on real external traffic, images return a 1px PNG and we only count requests
const PNG_1PX = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);
let imageHits = 0;
await page.route('**upload.wikimedia.org**', async (route) => {
	imageHits++;
	await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }).catch(() => {});
});
await page.goto(base + `/?t=${imageEvent.date}&z=8`, { waitUntil: 'networkidle' });
const cardSel = `[data-id="${imageEvent.id}"] .hit`;
await page.waitForSelector(cardSel, { timeout: 20000 });
await page.waitForTimeout(500);

// Fetching for cards the pointer merely crosses on the timeline wastes traffic, so nothing happens until it dwells
imageHits = 0;
await page.hover(cardSel);
await page.waitForTimeout(60);
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
assert('先読み: 横切っただけでは取りに行かない', imageHits === 0, `hits=${imageHits}`);

await page.hover(cardSel);
await page.waitForTimeout(500);
assert('先読み: ホバーが続くと画像を先に取りに行く', imageHits === 1, `hits=${imageHits}`);

await page.click(cardSel);
await page.waitForTimeout(150);
assert(
	'先読み: 開いた時には画像が載っている',
	await page.evaluate(() => {
		const img = document.querySelector('dialog img');
		return !!img && img.complete && img.naturalWidth > 0;
	}),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.unroute('**upload.wikimedia.org**');

// 4. Filter: disaster only → every visible card is in the disaster category
await page.goto(base + '/?t=1923-09&z=2&c=disaster', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const cats = await page.evaluate(() =>
	[...document.querySelectorAll('.card')].map((c) => c.getAttribute('data-cat')),
);
assert(
	'フィルタ: 災害のみ表示される',
	cats.length > 0 && cats.every((c) => c === 'disaster'),
	`cats=${JSON.stringify([...new Set(cats)])} n=${cats.length}`,
);

// 5. Search → jump → highlight
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.fill('input[type=search]', '東海道新幹線');
await page.waitForSelector('.results .hit', { timeout: 20000 });
await page.locator('.results .hit').first().dispatchEvent('mousedown');
await page.waitForTimeout(1200);
assert(
	'検索: ジャンプ先がハイライトされる',
	(await page.locator('.card.highlighted').count()) === 1,
);

// 6. URL restore: a shared URL reproduces position, zoom, and filters
await page.goto(base + '/?t=1964-10-10&z=8&r=japan', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const eraYear = await page.locator('.era-chip .era-year').textContent();
assert('URL復元: 表示位置が1964年になる', eraYear === '1964', `era=${eraYear}`);
assert(
	'URL復元: 地域フィルタチップがON',
	await page.evaluate(
		() => document.querySelector('.filterbar .chip[aria-pressed="true"]')?.textContent?.trim() === '日本',
	),
);

// 7. Mobile: one column + minimap hidden
await page.setViewportSize({ width: 390, height: 720 });
await page.waitForTimeout(900);
const singles = await page.evaluate(() => ({
	cards: document.querySelectorAll('.card').length,
	single: document.querySelectorAll('.card.single').length,
	minimapVisible: (() => {
		const m = document.querySelector('.minimap');
		return m ? getComputedStyle(m).display !== 'none' : false;
	})(),
	// The coverage row is always shown on mobile too, without horizontal overflow
	coverageVisible: (() => {
		const c = document.querySelector('.coverage');
		return c ? getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 0 : false;
	})(),
	coverageFits: (() => {
		const c = document.querySelector('.coverage');
		if (!c) return false;
		const r = document.createRange();
		r.selectNodeContents(c);
		return r.getBoundingClientRect().width <= c.getBoundingClientRect().width;
	})(),
}));
assert('モバイル: 全カードが1カラム', singles.cards > 0 && singles.cards === singles.single);
assert('モバイル: ミニマップ非表示', !singles.minimapVisible);
assert('モバイル: 収録データ行が表示される', singles.coverageVisible);
assert('モバイル: 収録データ行が1行に収まる', singles.coverageFits);

// 7b. Narrow width (320px): every header element fits within the content box
await page.setViewportSize({ width: 320, height: 640 });
await page.waitForTimeout(500);
const narrow = await page.evaluate(() => {
	const header = document.querySelector('.site-header');
	const cs = getComputedStyle(header);
	const box = header.getBoundingClientRect();
	const left = box.left + parseFloat(cs.paddingLeft);
	const right = box.right - parseFloat(cs.paddingRight);
	const over = [];
	for (const sel of ['.brand', '.tools', '.tools input', '.tools button', '.coverage']) {
		const el = document.querySelector(sel);
		if (!el) continue;
		const r = el.getBoundingClientRect();
		// 0.5px tolerance for subpixel rounding
		if (r.right > right + 0.5 || r.left < left - 0.5) {
			over.push(`${sel} [${Math.round(r.left)},${Math.round(r.right)}]`);
		}
	}
	return { over, bound: [Math.round(left), Math.round(right)] };
});
assert(
	'狭幅320px: ヘッダー要素が横にはみ出さない',
	narrow.over.length === 0,
	`overflow=${narrow.over.join(' ')} bound=${narrow.bound.join('..')}`,
);

// 7c. At narrow widths, search suggestions do not overflow the left edge (the first digits of dates are not cut off)
await page.fill('input[type=search]', '新幹線');
await page.waitForSelector('.results .hit', { timeout: 25000 });
const dropdown = await page.evaluate(() => {
	const r = document.querySelector('.results').getBoundingClientRect();
	return { left: Math.round(r.left), date: document.querySelector('.results .hit .date')?.textContent };
});
assert(
	'狭幅320px: 検索候補が画面内に収まる',
	dropdown.left >= 4 && /^\d{4}\./.test(dropdown.date ?? ''),
	`left=${dropdown.left} date=${dropdown.date}`,
);
await page.fill('input[type=search]', '');

// The following scenarios continue at the usual mobile size
await page.setViewportSize({ width: 390, height: 720 });
await page.waitForTimeout(500);

// 8. Era jump: tap era-chip → move by choosing a decade
await page.locator('.era-chip').click();
await page.waitForTimeout(300);
const decadeBtn = page.locator('.jump-grid button', { hasText: '1900' }).first();
await decadeBtn.click();
await page.waitForTimeout(900);
const jumpedEra = await page.locator('.era-chip .era-year').textContent();
assert('年代ジャンプ: 1900年代へ移動', jumpedEra === '1905', `era=${jumpedEra}`);

// 8b. Escape closes the decade panel and returns focus to its button (SHIG 60)
await page.locator('.era-chip').click();
await page.locator('.jump-grid button').first().focus();
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
assert('年代ジャンプ: Escapeでパネルが閉じる', (await page.locator('.jump-panel').count()) === 0);
assert(
	'年代ジャンプ: Escape後はボタンにフォーカスが戻る',
	await page.evaluate(() => document.activeElement?.classList.contains('era-chip')),
);
// Escape pressed in the search box closes the panel but must not steal focus
await page.locator('.era-chip').click();
await page.locator('input[type=search]').focus();
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
assert(
	'年代ジャンプ: 検索欄のEscapeでフォーカスを奪わない',
	(await page.locator('.jump-panel').count()) === 0 &&
		!(await page.evaluate(() => document.activeElement?.classList.contains('era-chip'))),
);

// 9. Event detail page: the prerendered HTML can be shown directly
const firstId = await page.evaluate(async () => {
	const overview = await (await fetch('/data/overview.json')).json();
	return overview.find((e) => e.svg)?.id ?? overview[0].id;
});
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${base}/e/${firstId}`, { waitUntil: 'networkidle' });
const h1 = await page.locator('article h1').textContent().catch(() => null);
assert('個別ページ: 記事が表示される', !!h1 && h1.length > 3, `h1=${h1}`);
assert(
	'個別ページ: 年表への導線がある',
	(await page.locator('a.timeline-link').count()) === 1,
);

// Opening the timeline from the detail page's CTA (?t=&z=&e=) opens the detail.
// With a deep link, selectedId is settled before the data arrives, so
// if data.byId() does not track version, it stays null forever (regression guard)
const ctaHref = await page.locator('a.timeline-link').getAttribute('href');
await page.goto(base + ctaHref, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
assert(
	'ディープリンク: ?e=で詳細ダイアログが開く',
	await page.evaluate(() => document.querySelector('dialog')?.open ?? false),
	`href=${ctaHref}`,
);

// Opening an event included in a collection directly with ?e= also shows the collection chip in the dialog
// (collections.json arrives after the timeline's main data, so it must be re-evaluated after arrival)
await page.goto(`${base}/?t=1979-04-07&z=8&e=1979-04-07-a6ab5dff`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
assert(
	'詳細ダイアログ: 収録されている特集チップが出る',
	(await page.locator('dialog .collections a[href="/c/anime"]').count()) === 1,
);

// 10. Collections: listing page (prerendered, no JS)
const collectionsIndex = JSON.parse(readFileSync('static/data/collections.json', 'utf8'));
await page.goto(`${base}/c`, { waitUntil: 'networkidle' });
const cardCount = await page.locator('.cards .card').count();
assert(
	'特集一覧: 全特集がカードで並ぶ',
	cardCount === collectionsIndex.collections.length,
	`cards=${cardCount} expected=${collectionsIndex.collections.length}`,
);

// 10b. Collections: every collection has an OGP image (no 404 when shared on social media)
for (const c of collectionsIndex.collections) {
	const res = await page.request.get(`${base}/ogp/c-${c.slug}.png`);
	assert(
		`OGP: /ogp/c-${c.slug}.png が配信される`,
		res.status() === 200,
		`status=${res.status()}`,
	);
}

// 11. Collections: the detail page reads in chronological order
const anime = collectionsIndex.collections.find((c) => c.slug === 'anime');
await page.goto(`${base}/c/anime`, { waitUntil: 'networkidle' });
const cTitle = await page.locator('article h1').textContent();
assert('特集ページ: 見出しが出る', cTitle === anime.title, `h1=${cTitle}`);
assert(
	'特集ページ: og:imageが特集ごとの画像を指す',
	(await page.locator('meta[property="og:image"]').getAttribute('content'))?.endsWith(
		'/ogp/c-anime.png',
	),
);
const itemCount = await page.locator('.items li').count();
assert(
	'特集ページ: 収録件数どおりの項目が並ぶ',
	itemCount === anime.count,
	`items=${itemCount} expected=${anime.count}`,
);
const itemDates = await page.locator('.items li time').evaluateAll((els) =>
	els.map((e) => e.getAttribute('datetime')),
);
assert(
	'特集ページ: 項目が古い順に並ぶ',
	itemDates.every((d, i) => i === 0 || itemDates[i - 1] <= d),
	`dates=${itemDates.slice(0, 4).join(',')}`,
);
assert(
	'特集ページ: 各項目が個別ページへリンクする',
	(await page.locator('.items li h2 a[href^="/e/"]').count()) === anime.count,
);

// 12. Collections: back-links from detail pages to collections (internal link circulation)
const animeFirstId = await page.locator('.items li h2 a').first().getAttribute('href');
await page.goto(base + animeFirstId, { waitUntil: 'networkidle' });
assert(
	'個別ページ: 収録されている特集へのリンクがある',
	(await page.locator('.collections a[href="/c/anime"]').count()) === 1,
);

// 13. Timeline integration: ?k=<slug> shows only the collection's events
const animeIds = new Set(
	JSON.parse(readFileSync('static/data/collections/anime.json', 'utf8')).events.map((e) => e.id),
);
await page.goto(`${base}/?k=anime&t=${anime.toDate}&z=0.0688`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
const shownIds = await page.locator('.card').evaluateAll((els) =>
	els.map((e) => e.getAttribute('data-id')),
);
assert(
	'年表連動: 特集のイベントだけが描画される',
	shownIds.length > 0 && shownIds.every((id) => id === null || animeIds.has(id)),
	`shown=${shownIds.length} 外部=${shownIds.filter((id) => id && !animeIds.has(id)).length}`,
);
assert(
	'年表連動: 特集バナーが出る',
	(await page.locator('.collection-banner .cb-title').textContent()) === anime.title,
);

// Collection events are given low importance, so none appear unless LOD is turned off.
// Verify that every collection event within the visible range is actually drawn (including the low-importance ones)
const breaking = JSON.parse(readFileSync('static/data/collections/breaking.json', 'utf8'));
await page.goto(`${base}/?k=breaking&t=${breaking.toDate}&z=0.1396`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const shownBreaking = await page.locator('.card').evaluateAll((els) =>
	els.map((e) => e.getAttribute('data-id')),
);
const breakingIds = new Set(breaking.events.map((e) => e.id));
assert(
	'年表連動: importanceの低い収録イベントもLODで消えない',
	shownBreaking.length > 0 && shownBreaking.every((id) => id === null || breakingIds.has(id)),
	`shown=${shownBreaking.length}`,
);

// 14. Timeline integration: clearing via the banner removes k and returns to the normal view
await page.locator('.collection-banner .cb-clear').click();
await page.waitForTimeout(700);
assert(
	'年表連動: 解除でURLからkが消える',
	!new URL(page.url()).searchParams.has('k'),
	`url=${page.url()}`,
);
assert('年表連動: 解除後は特集バナーが消える', (await page.locator('.collection-banner').count()) === 0);

// 15. Header link to collections (does not overflow even at 320px)
await page.setViewportSize({ width: 320, height: 640 });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
assert('ヘッダー: 特集へのリンクがある', (await page.locator('.nav-link[href="/c"]').count()) === 1);
const narrowOverflow = await page.evaluate(() => {
	const header = document.querySelector('.site-header');
	const box = header.getBoundingClientRect();
	const pad = parseFloat(getComputedStyle(header).paddingRight);
	const bad = [];
	for (const el of header.querySelectorAll('.brand, .nav-link, .tools, .coverage')) {
		const r = el.getBoundingClientRect();
		if (r.right > box.right - pad + 1) bad.push(`${el.className}:${Math.round(r.right)}`);
	}
	return bad;
});
assert(
	'狭幅320px: 特集リンク追加後もヘッダーが溢れない',
	narrowOverflow.length === 0,
	narrowOverflow.join(' '),
);

// 16. Static pages at 320px: the header (brand + 年表/特集 nav) stays on one row
for (const path of ['/c', '/c/anime']) {
	await page.goto(base + path, { waitUntil: 'networkidle' });
	const hdr = await page.evaluate(() => {
		const brand = document.querySelector('.page-header .brand').getBoundingClientRect();
		const nav = document.querySelector('.page-header .page-nav').getBoundingClientRect();
		const links = [...document.querySelectorAll('.page-header .page-nav a')].map(
			(a) => a.getBoundingClientRect().height,
		);
		return {
			oneRow: Math.abs(brand.top + brand.height / 2 - (nav.top + nav.height / 2)) < 8,
			brandH: Math.round(brand.height),
			fits: nav.right <= innerWidth,
			minLink: Math.min(...links),
		};
	});
	assert(
		`狭幅320px: ${path} のヘッダーが1行に収まる`,
		hdr.oneRow && hdr.brandH <= 32 && hdr.fits,
		JSON.stringify(hdr),
	);
	assert(`狭幅320px: ${path} の導線リンクが7mm以上`, hdr.minLink >= 26, JSON.stringify(hdr));
}

await browser.close();

let failed = 0;
for (const r of results) {
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
	if (!r.ok) failed++;
}
if (errors.length > 0) {
	console.log('\nコンソールエラー:');
	for (const e of errors.slice(0, 5)) console.log('  ', e);
	failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
