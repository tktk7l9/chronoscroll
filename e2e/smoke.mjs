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
assert('initial view: cards are rendered', initialCards > 3, `cards=${initialCards}`);
assert(
	'initial view: overview level shown (zoom gauge)',
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
	'coverage: total count and range are shown',
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
assert('zoom gauge: minus is disabled at the minimum', await zoomOut.isDisabled());

// 2. Zoom in → z in the URL increases and the level label changes
await page.click('button[aria-label="ズームイン"]');
await page.click('button[aria-label="ズームイン"]');
await page.click('button[aria-label="ズームイン"]');
await page.waitForTimeout(800);
const zParam = new URLSearchParams(await page.evaluate(() => location.search)).get('z');
assert('zoom: z is reflected in the URL', zParam !== null && Number(zParam) > 0.2, `z=${zParam}`);

// 3. Click an event → detail dialog (with source links)
await page.locator('.card .hit').first().click();
await page.waitForTimeout(500);
assert('detail: the dialog opens', await page.evaluate(() => document.querySelector('dialog')?.open));
const sourceLinks = await page.locator('dialog footer a').count();
assert('detail: has source links', sourceLinks > 0, `links=${sourceLinks}`);
assert(
	'detail: e is reflected in the URL',
	(await page.evaluate(() => location.search)).includes('e='),
);

// While the modal is open, the background (timeline) must not move.
// ① wheel over the backdrop ② chaining from the end of scrolling inside the modal ③ ⌘+wheel zoom
const dlgBox = await page.evaluate(() => {
	const r = document.querySelector('dialog').getBoundingClientRect();
	return { x: r.x, y: r.y, w: r.width, h: r.height };
});
assert('detail: the modal is wide enough', dlgBox.w >= 780, `w=${dlgBox.w}`);

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
	'detail: the background does not scroll while open',
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
	'detail: cmd+wheel does not zoom the background while open',
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
	'detail: ctrl+wheel still calls preventDefault while open (blocks browser page zoom)',
	wheelStolen === true,
);

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
assert(
	'detail: Esc closes it and removes e from the URL',
	!(await page.evaluate(() => location.search)).includes('e='),
);
assert(
	'detail: the scroll position is kept after closing',
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
	'detail: the image box is reserved before load (text does not jump on arrival)',
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
assert('preload: does not fetch when just crossing', imageHits === 0, `hits=${imageHits}`);

await page.hover(cardSel);
await page.waitForTimeout(500);
assert('preload: fetches the image ahead when the hover lasts', imageHits === 1, `hits=${imageHits}`);

await page.click(cardSel);
await page.waitForTimeout(150);
assert(
	'preload: the image is there when opened',
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
	'filter: only disasters are shown',
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
	'search: the jump target is highlighted',
	(await page.locator('.card.highlighted').count()) === 1,
);

// 6. URL restore: a shared URL reproduces position, zoom, and filters
await page.goto(base + '/?t=1964-10-10&z=8&r=japan', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const eraYear = await page.locator('.era-chip .era-year').textContent();
assert('URL restore: the view position becomes 1964', eraYear === '1964', `era=${eraYear}`);
assert(
	'URL restore: the region filter chip is on',
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
assert('mobile: all cards in one column', singles.cards > 0 && singles.cards === singles.single);
assert('mobile: minimap hidden', !singles.minimapVisible);
assert('mobile: the coverage line is shown', singles.coverageVisible);
assert('mobile: the coverage line fits on one line', singles.coverageFits);

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
	'narrow 320px: header items do not overflow horizontally',
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
	'narrow 320px: search suggestions fit on screen',
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
assert('decade jump: moves to the 1900s', jumpedEra === '1905', `era=${jumpedEra}`);

// 8b. Escape closes the decade panel and returns focus to its button (SHIG 60)
await page.locator('.era-chip').click();
await page.locator('.jump-grid button').first().focus();
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
assert('decade jump: Escape closes the panel', (await page.locator('.jump-panel').count()) === 0);
assert(
	'decade jump: focus returns to the button after Escape',
	await page.evaluate(() => document.activeElement?.classList.contains('era-chip')),
);
// Escape pressed in the search box closes the panel but must not steal focus
await page.locator('.era-chip').click();
await page.locator('input[type=search]').focus();
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
assert(
	'decade jump: Escape in the search box does not steal focus',
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
assert('event page: the article is shown', !!h1 && h1.length > 3, `h1=${h1}`);
assert(
	'event page: has a link to the timeline',
	(await page.locator('a.timeline-link').count()) === 1,
);

// Opening the timeline from the detail page's CTA (?t=&z=&e=) opens the detail.
// With a deep link, selectedId is settled before the data arrives, so
// if data.byId() does not track version, it stays null forever (regression guard)
const ctaHref = await page.locator('a.timeline-link').getAttribute('href');
await page.goto(base + ctaHref, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
assert(
	'deep link: ?e= opens the detail dialog',
	await page.evaluate(() => document.querySelector('dialog')?.open ?? false),
	`href=${ctaHref}`,
);

// Opening an event included in a collection directly with ?e= also shows the collection chip in the dialog
// (collections.json arrives after the timeline's main data, so it must be re-evaluated after arrival)
await page.goto(`${base}/?t=1979-04-07&z=8&e=1979-04-07-a6ab5dff`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
assert(
	'detail dialog: shows chips for collections containing it',
	(await page.locator('dialog .collections a[href="/c/anime"]').count()) === 1,
);

// 10. Collections: listing page (prerendered, no JS)
const collectionsIndex = JSON.parse(readFileSync('static/data/collections.json', 'utf8'));
await page.goto(`${base}/c`, { waitUntil: 'networkidle' });
const cardCount = await page.locator('.cards .card').count();
assert(
	'collection list: all collections are shown as cards',
	cardCount === collectionsIndex.collections.length,
	`cards=${cardCount} expected=${collectionsIndex.collections.length}`,
);

// 10b. Collections: every collection has an OGP image (no 404 when shared on social media)
for (const c of collectionsIndex.collections) {
	const res = await page.request.get(`${base}/ogp/c-${c.slug}.png`);
	assert(
		`OGP: /ogp/c-${c.slug}.png is served`,
		res.status() === 200,
		`status=${res.status()}`,
	);
}

// 11. Collections: the detail page reads in chronological order
const anime = collectionsIndex.collections.find((c) => c.slug === 'anime');
await page.goto(`${base}/c/anime`, { waitUntil: 'networkidle' });
const cTitle = await page.locator('article h1').textContent();
assert('collection page: shows the heading', cTitle === anime.title, `h1=${cTitle}`);
assert(
	'collection page: og:image points to the per-collection image',
	(await page.locator('meta[property="og:image"]').getAttribute('content'))?.endsWith(
		'/ogp/c-anime.png',
	),
);
const itemCount = await page.locator('.items li').count();
assert(
	'collection page: lists as many items as the count',
	itemCount === anime.count,
	`items=${itemCount} expected=${anime.count}`,
);
const itemDates = await page.locator('.items li time').evaluateAll((els) =>
	els.map((e) => e.getAttribute('datetime')),
);
assert(
	'collection page: items are oldest first',
	itemDates.every((d, i) => i === 0 || itemDates[i - 1] <= d),
	`dates=${itemDates.slice(0, 4).join(',')}`,
);
assert(
	'collection page: each item links to its event page',
	(await page.locator('.items li h2 a[href^="/e/"]').count()) === anime.count,
);

// 12. Collections: back-links from detail pages to collections (internal link circulation)
const animeFirstId = await page.locator('.items li h2 a').first().getAttribute('href');
await page.goto(base + animeFirstId, { waitUntil: 'networkidle' });
assert(
	'event page: links to collections containing it',
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
	'timeline link: only collection events are rendered',
	shownIds.length > 0 && shownIds.every((id) => id === null || animeIds.has(id)),
	`shown=${shownIds.length} outside=${shownIds.filter((id) => id && !animeIds.has(id)).length}`,
);
assert(
	'timeline link: the collection banner is shown',
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
	'timeline link: low-importance collection events are not hidden by LOD',
	shownBreaking.length > 0 && shownBreaking.every((id) => id === null || breakingIds.has(id)),
	`shown=${shownBreaking.length}`,
);

// 14. Timeline integration: clearing via the banner removes k and returns to the normal view
await page.locator('.collection-banner .cb-clear').click();
await page.waitForTimeout(700);
assert(
	'timeline link: clearing removes k from the URL',
	!new URL(page.url()).searchParams.has('k'),
	`url=${page.url()}`,
);
assert('timeline link: the collection banner disappears after clearing', (await page.locator('.collection-banner').count()) === 0);

// 15. Header link to collections (does not overflow even at 320px)
await page.setViewportSize({ width: 320, height: 640 });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
assert('header: has a link to collections', (await page.locator('.nav-link[href="/c"]').count()) === 1);
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
	'narrow 320px: the header does not overflow after adding the collections link',
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
		`narrow 320px: the ${path} header fits on one row`,
		hdr.oneRow && hdr.brandH <= 32 && hdr.fits,
		JSON.stringify(hdr),
	);
	assert(`narrow 320px: ${path} nav links are at least 7mm`, hdr.minLink >= 26, JSON.stringify(hdr));
}

await browser.close();

let failed = 0;
for (const r of results) {
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
	if (!r.ok) failed++;
}
if (errors.length > 0) {
	console.log('\nConsole errors:');
	for (const e of errors.slice(0, 5)) console.log('  ', e);
	failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
