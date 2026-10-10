/**
 * Orchestrator for the data build (IO layer, excluded from the coverage gate).
 *
 *   npx tsx pipeline/run/build.ts [--from 1868] [--to 2026] [--offline]
 *
 * 1. Fetch year-page wikitext (cache: pipeline/.cache/years/)
 * 2. Parse → RawEvent[]
 * 3. Fetch Qids / sitelink counts of linked articles (cached) → importance as a within-decade percentile
 * 4. Fetch representative images for top events (cached)
 * 5. Rule-based classification + sidecar overrides
 * 6. Apply curated YAML + collection YAML
 * 7. Compute related events (link events that share the same source)
 * 8. Emit JSON chunks to static/data/ + stats report
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { OVERVIEW_MIN_IMPORTANCE } from '../../src/lib/lod.ts';
import type { EventImage, NewsEvent } from '../../src/lib/types.ts';
import { buildBooksIndex, parseBooksYaml, unmatchedBookIds } from '../lib/books.ts';
import { isVolatileYear } from '../lib/cache-policy.ts';
import { classify, type ClassifySidecar } from '../lib/classify.ts';
import {
	buildCollectionDetail,
	collectionCuratedEntries,
	eventCollectionIndex,
	parseCollectionYaml,
	toCollectionMeta,
	unmatchedCollectionIds,
	type CollectionSource,
} from '../lib/collections.ts';
import {
	applyCurated,
	crossYearDateOverrides,
	parseCuratedYaml,
	type CuratedEntry,
} from '../lib/curate.ts';
import {
	buildChunks,
	buildEvent,
	buildIndexMeta,
	overviewLite,
	overviewSlice,
	searchDocs,
	sortEvents,
} from '../lib/emit.ts';
import { computeRelated, MAX_RELATED } from '../lib/related.ts';
import { formatResidueReport, residueSummary } from '../lib/residue.ts';
import { linkScore, percentileByDecade, rawScore } from '../lib/score.ts';
import { eventDateAndId, parseYearPage, type RawEvent } from '../lib/wikitext.ts';
import { duplicateIds } from '../lib/dedupe.ts';
import {
	fetchPageImages,
	fetchPageviews,
	fetchPageWikitext,
	fetchQids,
	fetchSitelinkCounts,
	type PageImage,
	type WikiError,
} from './api.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = join(ROOT, 'pipeline', '.cache');
const OUT = join(ROOT, 'static', 'data');
const CURATED_DIR = join(ROOT, 'content', 'curated');
const COLLECTIONS_DIR = join(ROOT, 'content', 'collections');
const BOOKS_PATH = join(ROOT, 'content', 'affiliate', 'books.yaml');
const SIDECAR_PATH = join(ROOT, 'pipeline', 'sidecar', 'classify.json');

/** Minimum importance for fetching and storing an image */
const IMAGE_MIN_IMPORTANCE = 60;
// The minimum importance for overview.json uses OVERVIEW_MIN_IMPORTANCE in src/lib/lod.ts
// (managed in one place because it must match the front end's chunk-prefetch suppression logic)

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
	// Year pages keep being updated for the current year too, so the default end is the year at run time
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
 * Fetch a series of year pages ("YYYY年" / "YYYY年の日本").
 * Years that do not exist get a .missing marker so later runs skip the API call.
 *
 * However, the current and previous year (isVolatileYear) ignore both the cache and .missing and are always refetched.
 * Events are appended to the current year's page daily, so using the cache would mean anything after
 * the fetch date never shows up (the monthly refresh kept returning "no changes").
 */
const loadSeries = (
	args: Args,
	suffix: string,
	cacheDir: string,
	today: string,
): Effect.Effect<Map<number, string>> =>
	Effect.gen(function* () {
		const texts = new Map<number, string>();
		mkdirSync(join(CACHE, cacheDir), { recursive: true });
		let refreshed = 0;
		for (let y = args.from; y <= args.to; y++) {
			const p = join(CACHE, cacheDir, `${y}.wikitext`);
			const missing = join(CACHE, cacheDir, `${y}.missing`);
			// --offline means no network at all, so follow the cache even for volatile years
			const volatile = isVolatileYear(y, today) && !args.offline;
			if (!volatile) {
				if (existsSync(p)) {
					texts.set(y, readFileSync(p, 'utf8'));
					continue;
				}
				if (existsSync(missing) || args.offline) continue;
			}
			process.stdout.write(`fetch ${y}${suffix} ...\r`);
			const wt = yield* fetchPageWikitext(`${y}${suffix}`);
			if (wt !== null) {
				writeFileSync(p, wt);
				texts.set(y, wt);
				if (volatile) refreshed++;
			} else if (existsSync(p)) {
				// Both a network failure and a missing page return null, so keep the existing cache if there is one
				// (do not drop the whole current year's events because of a transient failure)
				console.warn(`  ${y}${suffix}: refetch failed, using the cache`);
				texts.set(y, readFileSync(p, 'utf8'));
			} else {
				writeFileSync(missing, '');
			}
		}
		console.log(`${suffix} pages: ${texts.size} (${refreshed} refetched as current/previous year)`);
		return texts;
	});

/**
 * Fetch the keys missing from a JSON cache in parts of 500, saving the cache after each part
 * so an interrupted run resumes where it stopped. Shared by every resolve* step.
 */
const fillCache = <V, F, E>(opts: {
	label: string;
	cache: Record<string, V>;
	file: string;
	keys: readonly string[];
	offline: boolean;
	fetch: (part: readonly string[]) => Effect.Effect<Map<string, F>, E>;
	toCached: (fetched: F) => V;
}): Effect.Effect<void, E> =>
	Effect.gen(function* () {
		const unknown = opts.keys.filter((k) => !(k in opts.cache));
		if (unknown.length === 0 || opts.offline) return;
		console.log(`${opts.label}: ${unknown.length}`);
		let done = 0;
		for (let i = 0; i < unknown.length; i += 500) {
			const part = unknown.slice(i, i + 500);
			const got = yield* opts.fetch(part);
			for (const [k, v] of got) opts.cache[k] = opts.toCached(v);
			done += part.length;
			saveJsonCache(opts.file, opts.cache);
			process.stdout.write(`  ${done}/${unknown.length}\r`);
		}
	});

const resolveSitelinks = (
	targets: readonly string[],
	offline: boolean,
): Effect.Effect<Map<string, number>, WikiError> =>
	Effect.gen(function* () {
		const qidCache = loadJsonCache<Record<string, string | null>>('qids.json', {});
		const slCache = loadJsonCache<Record<string, number>>('sitelinks.json', {});
		yield* fillCache({
			label: 'Resolving Qids',
			cache: qidCache,
			file: 'qids.json',
			keys: targets,
			offline,
			fetch: fetchQids,
			toCached: (q) => q,
		});
		const qids = [...new Set(Object.values(qidCache).filter((q): q is string => q !== null))];
		yield* fillCache({
			label: 'Fetching sitelink counts',
			cache: slCache,
			file: 'sitelinks.json',
			keys: qids,
			offline,
			fetch: fetchSitelinkCounts,
			toCached: (n) => n,
		});
		const counts = new Map<string, number>();
		for (const t of targets) {
			const q = qidCache[t];
			counts.set(t, q != null ? (slCache[q] ?? 0) : 0);
		}
		return counts;
	});

const resolvePageviews = (
	targets: readonly string[],
	offline: boolean,
): Effect.Effect<Map<string, number>> =>
	Effect.gen(function* () {
		const cache = loadJsonCache<Record<string, number>>('pageviews.json', {});
		yield* fillCache({
			label: 'Fetching page views',
			cache,
			file: 'pageviews.json',
			keys: targets,
			offline,
			fetch: fetchPageviews,
			toCached: (v) => Math.round(v * 10) / 10,
		});
		return new Map(targets.map((t) => [t, cache[t] ?? 0]));
	});

const resolveImages = (
	titles: readonly string[],
	offline: boolean,
): Effect.Effect<Map<string, EventImage | null>, WikiError> =>
	Effect.gen(function* () {
		const cache = loadJsonCache<Record<string, PageImage | null>>('images.json', {});
		yield* fillCache({
			label: 'Fetching images',
			cache,
			file: 'images.json',
			keys: titles,
			offline,
			fetch: fetchPageImages,
			toCached: (img) => img,
		});
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
	});

function loadCurated(): CuratedEntry[] {
	if (!existsSync(CURATED_DIR)) return [];
	const entries: CuratedEntry[] = [];
	for (const f of readdirSync(CURATED_DIR).filter((f) => /\.ya?ml$/.test(f)).sort()) {
		entries.push(...parseCuratedYaml(readFileSync(join(CURATED_DIR, f), 'utf8')));
	}
	return entries;
}

/** Read collections (themed reading lists), one per file. Display order is file-name order */
function loadCollections(): CollectionSource[] {
	if (!existsSync(COLLECTIONS_DIR)) return [];
	return readdirSync(COLLECTIONS_DIR)
		.filter((f) => /\.ya?ml$/.test(f))
		.sort()
		.map((f) => parseCollectionYaml(readFileSync(join(COLLECTIONS_DIR, f), 'utf8')));
}

function percent(n: number, total: number): string {
	return `${((n / total) * 100).toFixed(1)}%`;
}

const main = Effect.gen(function* () {
	const args = parseArgs();
	const today = new Date().toISOString().slice(0, 10);

	// 1-2. Fetch + parse (two series: "YYYY年" + "YYYY年の日本")
	const texts = yield* loadSeries(args, '年', 'years', today);
	const textsJp = yield* loadSeries(args, '年の日本', 'years-jp', today);
	const raws: RawEvent[] = [];
	for (const [year, wt] of texts) {
		raws.push(...parseYearPage(wt, year));
	}
	for (const [year, wt] of textsJp) {
		// Events from the Japan year pages get the region hint japan (an explicit tag takes precedence)
		raws.push(
			...parseYearPage(wt, year).map((r) => ({ ...r, regionHint: r.regionHint ?? ('japan' as const) })),
		);
	}
	// Exclude future scheduled events
	const rawEvents = raws.filter((r) => eventDateAndId(r).date <= today);
	console.log(`Parsed: ${rawEvents.length} events`);

	// 3. Scoring (max(sitelinks, pageviews-equivalent) × IDF decay × place-name decay)
	const targets = [...new Set(rawEvents.flatMap((r) => r.links.map((l) => l.target)))];
	const sitelinks = yield* resolveSitelinks(targets, args.offline);
	const pageviews = yield* resolvePageviews(targets, args.offline);
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
	// Remove exact duplicates with the same id (same date, same text)
	const seen = new Set<string>();
	const unique = scored.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));

	// Merge near-duplicates (same date + high character-bigram similarity of the text. This absorbs cases where the
	// same event appears in both series with different wording. Judged by text because the leading links do not always match).
	// Ids referenced by curated are always kept
	// Collection entries have the same shape as CuratedEntry, so they flow through the same path as the curated layer.
	// That way creating new events, partial overrides, id protection from dedupe, and manual relatedIds
	// all work for collections as-is (collections come last, so for the same id the collection wins)
	const collectionSources = loadCollections();
	const curatedEntries = [...loadCurated(), ...collectionCuratedEntries(collectionSources)];
	const protectedIds = new Set(curatedEntries.map((e) => e.id));
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
	console.log(`Near-duplicate merge: removed ${dropIds.size} -> ${deduped.length}`);

	const importance = percentileByDecade(
		deduped.map((s) => ({ id: s.id, year: s.raw.year, raw: s.rawScore })),
	);

	// 4. Images
	const imageTitles = [
		...new Set(
			deduped
				.filter((s) => (importance.get(s.id) ?? 0) >= IMAGE_MIN_IMPORTANCE && s.raw.links.length > 0)
				.map((s) => s.raw.links[0].target),
		),
	];
	const images = yield* resolveImages(imageTitles, args.offline);

	// 5. Classification + 6. Assembly
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

	// 6. Apply curated
	const curateResult = applyCurated(events, curatedEntries);
	events = sortEvents(curateResult.events);
	if (curateResult.unmatched.length > 0) {
		console.warn(`⚠️ curated ids with no match: ${curateResult.unmatched.join(', ')}`);
	}
	const crossYear = crossYearDateOverrides(curatedEntries);
	if (crossYear.length > 0) {
		console.warn(
			`⚠️ curated date override leaves the year of the id (deep links load the chunk from the id prefix): ${crossYear.join(', ')}`,
		);
	}

	// 7. Compute related events (link events whose sources point to the same Wikipedia entity).
	// curated relatedIds (manual) take precedence; the automatically computed ones fill the rest.
	const eventsById = new Map(events.map((e) => [e.id, e]));
	const manualRelatedIds = new Map(
		curatedEntries
			.filter((e) => e.relatedIds && e.relatedIds.length > 0)
			.map((e) => [e.id, e.relatedIds!]),
	);
	const algoRelated = computeRelated(events);
	let relatedCount = 0;
	events = events.map((ev) => {
		const manual = (manualRelatedIds.get(ev.id) ?? [])
			.map((id) => eventsById.get(id))
			.filter((e): e is NewsEvent => e !== undefined && e.id !== ev.id)
			.map((e) => ({ id: e.id, date: e.date, title: e.title }));
		const seen = new Set(manual.map((r) => r.id));
		const algo = (algoRelated.get(ev.id) ?? []).filter((r) => !seen.has(r.id));
		const related = [...manual, ...algo].slice(0, MAX_RELATED);
		if (related.length === 0) return ev;
		relatedCount++;
		return { ...ev, related };
	});

	// Affiliate book links (not merged into NewsEvent; emitted through a separate path)
	const bookEntries = existsSync(BOOKS_PATH) ? parseBooksYaml(readFileSync(BOOKS_PATH, 'utf8')) : [];
	const booksIndex = buildBooksIndex(bookEntries);
	const unmatchedBooks = unmatchedBookIds(bookEntries, new Set(events.map((e) => e.id)));
	if (unmatchedBooks.length > 0) {
		console.warn(`⚠️ books.yaml ids with no match: ${unmatchedBooks.join(', ')}`);
	}

	// Collections (look up the regenerated NewsEvent bodies and serve them through a separate path)
	const finalById = new Map(events.map((e) => [e.id, e]));
	const unmatchedCollections = unmatchedCollectionIds(collectionSources, new Set(finalById.keys()));
	for (const { slug, ids } of unmatchedCollections) {
		console.warn(`⚠️ collection (${slug}) ids with no match: ${ids.join(', ')}`);
	}
	const collectionDetails = collectionSources.map((s) => buildCollectionDetail(s, finalById));

	// 8. Output
	rmSync(join(OUT, 'decades'), { recursive: true, force: true });
	rmSync(join(OUT, 'chunks'), { recursive: true, force: true });
	rmSync(join(OUT, 'collections'), { recursive: true, force: true });
	mkdirSync(join(OUT, 'chunks'), { recursive: true });
	mkdirSync(join(OUT, 'collections'), { recursive: true });
	const meta = buildIndexMeta(events, new Date().toISOString());
	writeFileSync(join(OUT, 'index.json'), JSON.stringify(meta));
	const overview = overviewSlice(events, OVERVIEW_MIN_IMPORTANCE);
	writeFileSync(join(OUT, 'overview.json'), JSON.stringify(overview));
	writeFileSync(join(OUT, 'overview-lite.json'), JSON.stringify(overviewLite(overview)));
	for (const chunk of buildChunks(events)) {
		writeFileSync(join(OUT, 'chunks', `${chunk.meta.key}.json`), JSON.stringify(chunk.events));
	}
	writeFileSync(join(OUT, 'search.json'), JSON.stringify(searchDocs(events)));
	writeFileSync(join(OUT, 'books.json'), JSON.stringify(booksIndex));
	writeFileSync(
		join(OUT, 'collections.json'),
		JSON.stringify({
			collections: collectionDetails.map(toCollectionMeta),
			byEvent: eventCollectionIndex(collectionDetails),
		}),
	);
	for (const detail of collectionDetails) {
		writeFileSync(join(OUT, 'collections', `${detail.slug}.json`), JSON.stringify(detail));
	}

	// Report
	console.log('\n=== Stats ===');
	console.log(`Total: ${events.length} (range ${meta.minDate} to ${meta.maxDate})`);
	console.log(`overview(>=${OVERVIEW_MIN_IMPORTANCE}): ${overviewSlice(events, OVERVIEW_MIN_IMPORTANCE).length}`);
	console.log(`With image: ${events.filter((e) => e.image).length}`);
	console.log(`curated: updated ${curateResult.updated.length} / added ${curateResult.added.length}`);
	console.log(`With related events: ${relatedCount} (manual relations set on ${manualRelatedIds.size} events)`);
	console.log(`Collections: ${collectionDetails.length}`);
	for (const d of collectionDetails) {
		console.log(`  ${d.slug}: ${d.count} (${d.fromDate} to ${d.toDate}) ${d.title}`);
	}
	console.log('\nCount per chunk:');
	for (const c of meta.chunks) console.log(`  ${c.key} (${c.fromYear}-${c.toYear}): ${c.count}`);
	const catCount = new Map<string, number>();
	const regCount = new Map<string, number>();
	for (const e of events) {
		catCount.set(e.category, (catCount.get(e.category) ?? 0) + 1);
		regCount.set(e.region, (regCount.get(e.region) ?? 0) + 1);
	}
	console.log('\nCategory distribution:');
	for (const [c, n] of [...catCount].sort((a, b) => b[1] - a[1]))
		console.log(`  ${c}: ${n} (${percent(n, events.length)})`);
	console.log('\nRegion distribution:');
	for (const [r, n] of [...regCount].sort((a, b) => b[1] - a[1]))
		console.log(`  ${r}: ${n} (${percent(n, events.length)})`);
	console.log('\nTop 20 by importance:');
	for (const e of [...events].sort((a, b) => b.importance - a.importance).slice(0, 20))
		console.log(`  [${e.importance}] ${e.date} ${e.title} (${e.category}/${e.region})`);

	// Markup residue left by the parser (fixed through content/curated/, never by editing the data).
	// Reported, not failed: a new case on Wikipedia must not block the monthly refresh.
	const residue = residueSummary(events);
	if (residue.flagged > 0) console.warn(`\n${formatResidueReport(residue, events.length)}`);
	const curatedSummaryIds = new Set(curatedEntries.filter((e) => e.summary !== undefined).map((e) => e.id));
	const lostLabel = deduped.filter((s) => s.raw.lostLabel && !curatedSummaryIds.has(s.id)).map((s) => s.id);
	if (lostLabel.length > 0) {
		console.warn(
			`⚠️ 仮リンク label dropped (first argument shown) and no curated summary yet: ${lostLabel.length}: ${lostLabel.join(', ')}`,
		);
	}
});

await Effect.runPromise(main);
