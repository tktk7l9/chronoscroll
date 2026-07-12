/**
 * データビルドのオーケストレーター（IO層・カバレッジゲート対象外）。
 *
 *   npx tsx pipeline/run/build.ts [--from 1868] [--to 2026] [--offline]
 *
 * 1. 年ページ wikitext 取得（キャッシュ: pipeline/.cache/years/）
 * 2. パース → RawEvent[]
 * 3. リンク先の Qid / sitelink数 取得（キャッシュ）→ 十年内パーセンタイルで importance
 * 4. 上位イベントの代表画像取得（キャッシュ）
 * 5. ルールベース分類 + sidecar 上書き
 * 6. curated YAML 適用
 * 7. static/data/ へ JSON チャンク出力 + 統計レポート
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERVIEW_MIN_IMPORTANCE } from '../../src/lib/lod.ts';
import type { EventImage, NewsEvent } from '../../src/lib/types.ts';
import { classify, type ClassifySidecar } from '../lib/classify.ts';
import { applyCurated, parseCuratedYaml, type CuratedEntry } from '../lib/curate.ts';
import {
	buildChunks,
	buildEvent,
	buildIndexMeta,
	overviewSlice,
	searchDocs,
	sortEvents,
} from '../lib/emit.ts';
import { linkScore, percentileByDecade, rawScore } from '../lib/score.ts';
import { eventDateAndId, parseYearPage, type RawEvent } from '../lib/wikitext.ts';
import { duplicateIds } from '../lib/dedupe.ts';
import {
	fetchPageImages,
	fetchPageviews,
	fetchPageWikitext,
	fetchQids,
	fetchSitelinkCounts,
} from './api.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = join(ROOT, 'pipeline', '.cache');
const OUT = join(ROOT, 'static', 'data');
const CURATED_DIR = join(ROOT, 'content', 'curated');
const SIDECAR_PATH = join(ROOT, 'pipeline', 'sidecar', 'classify.json');

/** 画像を取得・格納する importance 下限 */
const IMAGE_MIN_IMPORTANCE = 60;
// overview.json に入れる importance 下限は src/lib/lod.ts の OVERVIEW_MIN_IMPORTANCE を使う
// （フロント側のチャンク先読み抑制ロジックと一致させる必要があるため一元管理）

interface Args {
	from: number;
	to: number;
	offline: boolean;
}

function parseArgs(): Args {
	const argv = process.argv.slice(2);
	const get = (name: string, fallback: number) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? Number(argv[i + 1]) : fallback;
	};
	// 年ページは当年分も随時更新されるため、デフォルトの終端は実行時の年
	return {
		from: get('from', 1868),
		to: get('to', new Date().getFullYear()),
		offline: argv.includes('--offline'),
	};
}

function loadJsonCache<T>(file: string, fallback: T): T {
	const p = join(CACHE, file);
	return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback;
}

function saveJsonCache(file: string, data: unknown): void {
	const p = join(CACHE, file);
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, JSON.stringify(data));
}

/**
 * 年ページのシリーズ（「YYYY年」「YYYY年の日本」）を取得する。
 * 存在しない年は .missing マーカーを置いて次回以降のAPI呼び出しを省く。
 */
async function loadSeries(
	args: Args,
	suffix: string,
	cacheDir: string,
): Promise<Map<number, string>> {
	const texts = new Map<number, string>();
	mkdirSync(join(CACHE, cacheDir), { recursive: true });
	for (let y = args.from; y <= args.to; y++) {
		const p = join(CACHE, cacheDir, `${y}.wikitext`);
		const missing = join(CACHE, cacheDir, `${y}.missing`);
		if (existsSync(p)) {
			texts.set(y, readFileSync(p, 'utf8'));
			continue;
		}
		if (existsSync(missing) || args.offline) continue;
		process.stdout.write(`fetch ${y}${suffix} ...\r`);
		const wt = await fetchPageWikitext(`${y}${suffix}`);
		if (wt !== null) {
			writeFileSync(p, wt);
			texts.set(y, wt);
		} else {
			writeFileSync(missing, '');
		}
	}
	console.log(`${suffix}ページ: ${texts.size}件`);
	return texts;
}

async function resolveSitelinks(
	targets: readonly string[],
	offline: boolean,
): Promise<Map<string, number>> {
	const qidCache = loadJsonCache<Record<string, string | null>>('qids.json', {});
	const slCache = loadJsonCache<Record<string, number>>('sitelinks.json', {});

	const unknownTitles = targets.filter((t) => !(t in qidCache));
	if (unknownTitles.length > 0 && !offline) {
		console.log(`Qid解決: ${unknownTitles.length}件`);
		let done = 0;
		for (let i = 0; i < unknownTitles.length; i += 500) {
			const part = unknownTitles.slice(i, i + 500);
			const got = await fetchQids(part);
			for (const [t, q] of got) qidCache[t] = q;
			done += part.length;
			saveJsonCache('qids.json', qidCache);
			process.stdout.write(`  ${done}/${unknownTitles.length}\r`);
		}
	}

	const qids = [...new Set(Object.values(qidCache).filter((q): q is string => q !== null))];
	const unknownQids = qids.filter((q) => !(q in slCache));
	if (unknownQids.length > 0 && !offline) {
		console.log(`sitelink数取得: ${unknownQids.length}件`);
		let done = 0;
		for (let i = 0; i < unknownQids.length; i += 500) {
			const part = unknownQids.slice(i, i + 500);
			const got = await fetchSitelinkCounts(part);
			for (const [q, n] of got) slCache[q] = n;
			done += part.length;
			saveJsonCache('sitelinks.json', slCache);
			process.stdout.write(`  ${done}/${unknownQids.length}\r`);
		}
	}

	const counts = new Map<string, number>();
	for (const t of targets) {
		const q = qidCache[t];
		counts.set(t, q != null ? (slCache[q] ?? 0) : 0);
	}
	return counts;
}

async function resolvePageviews(
	targets: readonly string[],
	offline: boolean,
): Promise<Map<string, number>> {
	const cache = loadJsonCache<Record<string, number>>('pageviews.json', {});
	const unknown = targets.filter((t) => !(t in cache));
	if (unknown.length > 0 && !offline) {
		console.log(`ページビュー取得: ${unknown.length}件`);
		let done = 0;
		for (let i = 0; i < unknown.length; i += 500) {
			const part = unknown.slice(i, i + 500);
			const got = await fetchPageviews(part);
			for (const [t, v] of got) cache[t] = Math.round(v * 10) / 10;
			done += part.length;
			saveJsonCache('pageviews.json', cache);
			process.stdout.write(`  ${done}/${unknown.length}\r`);
		}
	}
	return new Map(targets.map((t) => [t, cache[t] ?? 0]));
}

async function resolveImages(
	titles: readonly string[],
	offline: boolean,
): Promise<Map<string, EventImage | null>> {
	const cache = loadJsonCache<
		Record<string, { src: string; width: number; height: number; name: string } | null>
	>('images.json', {});
	const unknown = titles.filter((t) => !(t in cache));
	if (unknown.length > 0 && !offline) {
		console.log(`画像取得: ${unknown.length}件`);
		let done = 0;
		for (let i = 0; i < unknown.length; i += 500) {
			const part = unknown.slice(i, i + 500);
			const got = await fetchPageImages(part);
			for (const [t, img] of got) cache[t] = img;
			done += part.length;
			saveJsonCache('images.json', cache);
			process.stdout.write(`  ${done}/${unknown.length}\r`);
		}
	}
	const result = new Map<string, EventImage | null>();
	for (const t of titles) {
		const img = cache[t];
		result.set(
			t,
			img
				? {
						src: img.src,
						width: img.width,
						height: img.height,
						credit: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.name.replace(/ /g, '_'))}`,
					}
				: null,
		);
	}
	return result;
}

function loadCurated(): CuratedEntry[] {
	if (!existsSync(CURATED_DIR)) return [];
	const entries: CuratedEntry[] = [];
	for (const f of readdirSync(CURATED_DIR).filter((f) => /\.ya?ml$/.test(f)).sort()) {
		entries.push(...parseCuratedYaml(readFileSync(join(CURATED_DIR, f), 'utf8')));
	}
	return entries;
}

function percent(n: number, total: number): string {
	return `${((n / total) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
	const args = parseArgs();
	const today = new Date().toISOString().slice(0, 10);

	// 1-2. 取得 + パース（「YYYY年」+「YYYY年の日本」の2シリーズ）
	const texts = await loadSeries(args, '年', 'years');
	const textsJp = await loadSeries(args, '年の日本', 'years-jp');
	const raws: RawEvent[] = [];
	for (const [year, wt] of texts) {
		raws.push(...parseYearPage(wt, year));
	}
	for (const [year, wt] of textsJp) {
		// 日本の年ページ由来は地域ヒントを japan に（タグ明示があればそちらを尊重）
		raws.push(
			...parseYearPage(wt, year).map((r) => ({ ...r, regionHint: r.regionHint ?? ('japan' as const) })),
		);
	}
	// 未来の予定イベントは除外
	const rawEvents = raws.filter((r) => eventDateAndId(r).date <= today);
	console.log(`パース: ${rawEvents.length}件のイベント`);

	// 3. スコアリング（max(sitelinks, pageviews換算) × IDF減衰 × 地名減衰）
	const targets = [...new Set(rawEvents.flatMap((r) => r.links.map((l) => l.target)))];
	const sitelinks = await resolveSitelinks(targets, args.offline);
	const pageviews = await resolvePageviews(targets, args.offline);
	const df = new Map<string, number>();
	for (const r of rawEvents) {
		for (const t of new Set(r.links.map((l) => l.target))) df.set(t, (df.get(t) ?? 0) + 1);
	}
	const scored = rawEvents.map((r) => {
		const { id } = eventDateAndId(r);
		return {
			raw: r,
			id,
			rawScore: rawScore(
				r.links.map((l) =>
					linkScore(
						l.target,
						sitelinks.get(l.target) ?? 0,
						df.get(l.target) ?? 1,
						pageviews.get(l.target) ?? 0,
					),
				),
			),
		};
	});
	// 同一idの重複（同日同文）は除去
	const seen = new Set<string>();
	const unique = scored.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));

	// 近似重複（同日+本文の文字bigram類似度が高いもの。2シリーズに同じできごとが
	// 別文面で載るケースを吸収する。先頭リンクが揃うとは限らないため文面で判定する）を集約。
	// curatedが参照するidは必ず残す
	const curatedForDedupe = loadCurated();
	const protectedIds = new Set(curatedForDedupe.map((e) => e.id));
	const dropIds = duplicateIds(
		unique.map((s) => ({
			id: s.id,
			date: eventDateAndId(s.raw).date,
			text: s.raw.text,
			textLength: s.raw.text.length,
			score: s.rawScore,
			links: s.raw.links.map((l) => l.target),
		})),
		protectedIds,
	);
	const deduped = unique.filter((s) => !dropIds.has(s.id));
	console.log(`近似重複の集約: ${dropIds.size}件を除去 → ${deduped.length}件`);

	const importance = percentileByDecade(
		deduped.map((s) => ({ id: s.id, year: s.raw.year, raw: s.rawScore })),
	);

	// 4. 画像
	const imageTitles = [
		...new Set(
			deduped
				.filter((s) => (importance.get(s.id) ?? 0) >= IMAGE_MIN_IMPORTANCE && s.raw.links.length > 0)
				.map((s) => s.raw.links[0].target),
		),
	];
	const images = await resolveImages(imageTitles, args.offline);

	// 5. 分類 + 6. 組み立て
	const sidecar = existsSync(SIDECAR_PATH)
		? (JSON.parse(readFileSync(SIDECAR_PATH, 'utf8')) as ClassifySidecar)
		: {};
	let events: NewsEvent[] = deduped.map((s) => {
		const imp = importance.get(s.id) ?? 0;
		const cls = classify(s.id, s.raw.text, sidecar, s.raw.regionHint);
		const image =
			imp >= IMAGE_MIN_IMPORTANCE && s.raw.links.length > 0
				? (images.get(s.raw.links[0].target) ?? undefined)
				: undefined;
		return buildEvent({
			raw: s.raw,
			importance: imp,
			category: cls.category,
			region: cls.region,
			image: image ?? undefined,
		});
	});

	// 6. curated 適用
	const curateResult = applyCurated(events, curatedForDedupe);
	events = sortEvents(curateResult.events);
	if (curateResult.unmatched.length > 0) {
		console.warn(`⚠️ curatedでidが一致しない: ${curateResult.unmatched.join(', ')}`);
	}

	// 7. 出力
	rmSync(join(OUT, 'decades'), { recursive: true, force: true });
	rmSync(join(OUT, 'chunks'), { recursive: true, force: true });
	mkdirSync(join(OUT, 'chunks'), { recursive: true });
	const meta = buildIndexMeta(events, new Date().toISOString());
	writeFileSync(join(OUT, 'index.json'), JSON.stringify(meta));
	writeFileSync(
		join(OUT, 'overview.json'),
		JSON.stringify(overviewSlice(events, OVERVIEW_MIN_IMPORTANCE)),
	);
	for (const chunk of buildChunks(events)) {
		writeFileSync(join(OUT, 'chunks', `${chunk.meta.key}.json`), JSON.stringify(chunk.events));
	}
	writeFileSync(join(OUT, 'search.json'), JSON.stringify(searchDocs(events)));

	// レポート
	console.log('\n=== 統計 ===');
	console.log(`総件数: ${events.length} (期間 ${meta.minDate} 〜 ${meta.maxDate})`);
	console.log(`overview(≥${OVERVIEW_MIN_IMPORTANCE}): ${overviewSlice(events, OVERVIEW_MIN_IMPORTANCE).length}件`);
	console.log(`画像付き: ${events.filter((e) => e.image).length}件`);
	console.log(`curated: 上書き${curateResult.updated.length} / 追加${curateResult.added.length}`);
	console.log('\nチャンク別件数:');
	for (const c of meta.chunks) console.log(`  ${c.key} (${c.fromYear}-${c.toYear}): ${c.count}`);
	const catCount = new Map<string, number>();
	const regCount = new Map<string, number>();
	for (const e of events) {
		catCount.set(e.category, (catCount.get(e.category) ?? 0) + 1);
		regCount.set(e.region, (regCount.get(e.region) ?? 0) + 1);
	}
	console.log('\nカテゴリ分布:');
	for (const [c, n] of [...catCount].sort((a, b) => b[1] - a[1]))
		console.log(`  ${c}: ${n} (${percent(n, events.length)})`);
	console.log('\n地域分布:');
	for (const [r, n] of [...regCount].sort((a, b) => b[1] - a[1]))
		console.log(`  ${r}: ${n} (${percent(n, events.length)})`);
	console.log('\nimportance上位20:');
	for (const e of [...events].sort((a, b) => b.importance - a.importance).slice(0, 20))
		console.log(`  [${e.importance}] ${e.date} ${e.title} (${e.category}/${e.region})`);
}

await main();
