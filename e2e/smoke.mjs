// chronoscroll 実ブラウザスモークテスト
// 使い方: node e2e/smoke.mjs [baseUrl]   （デフォルト http://localhost:5199）
// シナリオ: 初期表示 / ズーム / 詳細ダイアログ / フィルタ / 検索ジャンプ / URL復元 / モバイル
const base = process.argv[2] ?? 'http://localhost:5199';
const results = [];
const errors = [];

function assert(name, cond, detail = '') {
	results.push({ name, ok: !!cond, detail: cond ? '' : detail });
}

// ローカルはシステムChrome、CIは playwright パッケージ（chromiumバイナリ入り）を使う
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
	// Vercel Analyticsはローカル/CI環境に存在しないため除外
	if ((m.location()?.url ?? '').includes('_vercel/insights')) return;
	if (m.text().includes('_vercel/insights')) return;
	errors.push(`${m.text()} (${m.location()?.url ?? ''})`);
});

// 1. 初期表示（概観・注目ニュースのみ）
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const initialCards = await page.locator('.card').count();
assert('初期表示: カードが描画される', initialCards > 3, `cards=${initialCards}`);
assert(
	'初期表示: 概観レベル表示',
	(await page.locator('.zoomctl .level').textContent())?.includes('概観'),
);

// 2. ズームイン → URLのzが増え、レベル表示が変わる
await page.click('button[aria-label="ズームイン"]');
await page.click('button[aria-label="ズームイン"]');
await page.click('button[aria-label="ズームイン"]');
await page.waitForTimeout(800);
const zParam = new URLSearchParams(await page.evaluate(() => location.search)).get('z');
assert('ズーム: URLにzが反映される', zParam !== null && Number(zParam) > 0.2, `z=${zParam}`);

// 3. イベントクリック → 詳細ダイアログ（出典リンクあり）
await page.locator('.card .hit').first().click();
await page.waitForTimeout(500);
assert('詳細: ダイアログが開く', await page.evaluate(() => document.querySelector('dialog')?.open));
const sourceLinks = await page.locator('dialog footer a').count();
assert('詳細: 出典リンクがある', sourceLinks > 0, `links=${sourceLinks}`);
assert(
	'詳細: URLにeが反映される',
	(await page.evaluate(() => location.search)).includes('e='),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
assert(
	'詳細: Escで閉じてURLからeが消える',
	!(await page.evaluate(() => location.search)).includes('e='),
);

// 4. フィルタ: 災害のみ → 表示カードが全て災害カテゴリ
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

// 5. 検索 → ジャンプ → ハイライト
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.fill('input[type=search]', '東海道新幹線');
await page.waitForSelector('.results .hit', { timeout: 20000 });
await page.locator('.results .hit').first().dispatchEvent('mousedown');
await page.waitForTimeout(1200);
assert(
	'検索: ジャンプ先がハイライトされる',
	(await page.locator('.card.highlighted').count()) === 1,
);

// 6. URL復元: 共有URLで位置・ズーム・フィルタが再現される
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

// 7. モバイル: 1カラム + ミニマップ非表示
await page.setViewportSize({ width: 390, height: 720 });
await page.waitForTimeout(900);
const singles = await page.evaluate(() => ({
	cards: document.querySelectorAll('.card').length,
	single: document.querySelectorAll('.card.single').length,
	minimapVisible: (() => {
		const m = document.querySelector('.minimap');
		return m ? getComputedStyle(m).display !== 'none' : false;
	})(),
}));
assert('モバイル: 全カードが1カラム', singles.cards > 0 && singles.cards === singles.single);
assert('モバイル: ミニマップ非表示', !singles.minimapVisible);

// 8. 年代ジャンプ: era-chipタップ → 十年選択で移動
await page.locator('.era-chip').click();
await page.waitForTimeout(300);
const decadeBtn = page.locator('.jump-grid button', { hasText: '1900' }).first();
await decadeBtn.click();
await page.waitForTimeout(900);
const jumpedEra = await page.locator('.era-chip .era-year').textContent();
assert('年代ジャンプ: 1900年代へ移動', jumpedEra === '1905', `era=${jumpedEra}`);

// 9. イベント個別ページ: prerenderされたHTMLが直接表示できる
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
