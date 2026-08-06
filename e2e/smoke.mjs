// chronoscroll 実ブラウザスモークテスト
// 使い方: node e2e/smoke.mjs [baseUrl]   （デフォルト http://localhost:5199）
// シナリオ: 初期表示 / 収録データ行 / ズーム / 詳細ダイアログ / フィルタ / 検索ジャンプ / URL復元 / モバイル
import { readFileSync } from 'node:fs';

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
	'初期表示: 概観レベル表示（ズームゲージ）',
	(await page.locator('.zoomctl .stop.active').textContent())?.includes('概観'),
);
// 収録データ行: index.json の実数がヘッダーに出ている（ビルド時に焼き込まれるのでfetch待ちなし）
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

// ズームアウトの下限に達すると−ボタンがdisabledになる（可動域の可視化）。
// 初期ズームは収録期間から算出されるため必要なクリック数は変わる。上限つきで押し切る
const zoomOut = page.locator('button[aria-label="ズームアウト"]');
for (let i = 0; i < 8 && !(await zoomOut.isDisabled()); i++) {
	await zoomOut.click();
	await page.waitForTimeout(120);
}
await page.waitForTimeout(300);
assert('ズームゲージ: 下限で−がdisabledになる', await zoomOut.isDisabled());

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

// モーダル表示中は背景（年表）が動かないこと。
// ①バックドロップ上のホイール ②モーダル内スクロールの末端からの連鎖 ③⌘+ホイールのズーム
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

// 3b. 画像の枠を読み込み前に確保しているか。
// imgのCSSを width:auto 系にすると縦横とも不定になり箱が0pxに潰れ、
// 画像の到着で本文が一気に下へ飛ぶ（ガタつく）。画像を握って未到着の状態で測る
const imageEvent = await page.evaluate(async () => {
	const evs = await (await fetch('/data/overview.json')).json();
	const e = (evs.events ?? evs).find((x) => x.image && x.image.width >= 400 && x.image.height >= 300);
	return { id: e?.id, date: e?.date };
});
await page.route('**upload.wikimedia.org**', async (route) => {
	await new Promise((r) => setTimeout(r, 8000));
	// 計測後に unroute / 画面遷移するので、その時点で握っていたリクエストは捨てて良い
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

// 3c. ホバー先読み: 詳細を開く前に画像を取っておく（開いた直後の空白待ちを消す）。
// 実回線1.6Mbps相当での実測はクリック→表示 1726ms → 174ms(1.5秒ホバー時)。
// 外部への実通信に依存しないよう、画像は1pxのPNGを返して回数だけ数える
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

// 年表を横切っただけのカードまで取ると通信の無駄なので、留まるまでは動かない
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
	// 収録データ行はモバイルでも常時表示し、かつ横あふれを起こさない
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

// 7b. 狭幅（320px）: ヘッダーの全要素がコンテンツ box 内に収まる
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
		// 0.5px はサブピクセル丸めの許容
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

// 7c. 狭幅の検索候補が画面左にはみ出さない（日付の先頭桁が欠けない）
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

// 以降のシナリオは従来のモバイル寸法で続ける
await page.setViewportSize({ width: 390, height: 720 });
await page.waitForTimeout(500);

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

// 個別ページのCTA（?t=&z=&e=）で年表を開くと詳細が開く。
// ディープリンクではデータ到着前に selectedId が確定するため、
// data.byId() が version を追跡していないと永久にnullのままになる（退行の再発防止）
const ctaHref = await page.locator('a.timeline-link').getAttribute('href');
await page.goto(base + ctaHref, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
assert(
	'ディープリンク: ?e=で詳細ダイアログが開く',
	await page.evaluate(() => document.querySelector('dialog')?.open ?? false),
	`href=${ctaHref}`,
);

// 特集に収録されたイベントを?e=で直接開くと、ダイアログにも特集チップが出る
// （collections.json は年表の主データより後に届くので、到着後に再評価される必要がある）
await page.goto(`${base}/?t=1979-04-07&z=8&e=1979-04-07-a6ab5dff`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
assert(
	'詳細ダイアログ: 収録されている特集チップが出る',
	(await page.locator('dialog .collections a[href="/c/anime"]').count()) === 1,
);

// 10. 特集: 一覧ページ（prerender・JSなし）
const collectionsIndex = JSON.parse(readFileSync('static/data/collections.json', 'utf8'));
await page.goto(`${base}/c`, { waitUntil: 'networkidle' });
const cardCount = await page.locator('.cards .card').count();
assert(
	'特集一覧: 全特集がカードで並ぶ',
	cardCount === collectionsIndex.collections.length,
	`cards=${cardCount} expected=${collectionsIndex.collections.length}`,
);

// 10b. 特集: 全特集にOGP画像が存在する（SNS共有時に404にならない）
for (const c of collectionsIndex.collections) {
	const res = await page.request.get(`${base}/ogp/c-${c.slug}.png`);
	assert(
		`OGP: /ogp/c-${c.slug}.png が配信される`,
		res.status() === 200,
		`status=${res.status()}`,
	);
}

// 11. 特集: 個別ページが年代順の読み物になっている
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

// 12. 特集: 個別ページから特集への逆リンク（内部リンクの回遊）
const animeFirstId = await page.locator('.items li h2 a').first().getAttribute('href');
await page.goto(base + animeFirstId, { waitUntil: 'networkidle' });
assert(
	'個別ページ: 収録されている特集へのリンクがある',
	(await page.locator('.collections a[href="/c/anime"]').count()) === 1,
);

// 13. 年表連動: ?k=<slug> で特集の収録イベントだけが並ぶ
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

// 特集の収録イベントはimportanceを低く振ってあるため、LODを外さないと1件も出ない。
// 可視範囲に入る収録イベントが実際に全部描かれることを確かめる（低importance分も含めて）
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

// 14. 年表連動: バナーの解除でkが消え通常表示に戻る
await page.locator('.collection-banner .cb-clear').click();
await page.waitForTimeout(700);
assert(
	'年表連動: 解除でURLからkが消える',
	!new URL(page.url()).searchParams.has('k'),
	`url=${page.url()}`,
);
assert('年表連動: 解除後は特集バナーが消える', (await page.locator('.collection-banner').count()) === 0);

// 15. ヘッダーの特集導線（320pxでも溢れない）
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
