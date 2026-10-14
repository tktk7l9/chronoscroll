/**
 * The data-scale numbers that README.md quotes, derived from the shipped data so that they cannot drift.
 * pipeline/content.test.ts fails while a number is stale; `npx tsx pipeline/run/readme-stats.ts --write` rewrites
 * them, and the monthly data refresh runs it before the tests. The per-collection list of the データ規模 section is
 * only checked (its names and order are written by hand).
 */
import type { NewsEvent } from '../../src/lib/types.ts';

export interface ReadmeStats {
	/** Events on the timeline (static/data/chunks) */
	total: number;
	/** Events that carry an image */
	withImage: number;
	/** Events with at least one related link */
	withRelated: number;
	/** Entries in content/curated/*.yaml */
	curated: number;
	/** Entry count of each collection (static/data/collections.json) */
	collectionCounts: number[];
	/** Collection entries that write up a new event (date + title + summary) */
	newlyWritten: number;
}

export interface ReadmeStatsInput {
	events: Iterable<Pick<NewsEvent, 'image' | 'related'>>;
	curated: number;
	collectionCounts: readonly number[];
	newlyWritten: number;
}

export function computeReadmeStats(input: ReadmeStatsInput): ReadmeStats {
	let total = 0;
	let withImage = 0;
	let withRelated = 0;
	for (const e of input.events) {
		total++;
		if (e.image) withImage++;
		if (e.related && e.related.length > 0) withRelated++;
	}
	return {
		total,
		withImage,
		withRelated,
		curated: input.curated,
		collectionCounts: [...input.collectionCounts],
		newlyWritten: input.newlyWritten,
	};
}

/** 27440 → "27,440" (the README writes event counts with thousands separators; collection entries go without) */
export function formatCount(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * A number (or numbers) quoted in README.md: `pattern` captures each one, in the order of `values`.
 * Every pattern must match exactly once, so rewording a line fails the check instead of silently skipping it.
 */
export interface ReadmeField {
	name: string;
	pattern: RegExp;
	values: (s: ReadmeStats) => string[];
}

export const README_FIELDS: readonly ReadmeField[] = [
	{ name: 'features: collections', pattern: /の\*\*(\d+)本([\d,]+)件\*\*を年代順に/, values: (s) => [String(s.collectionCounts.length), String(sum(s.collectionCounts))] },
	{ name: 'features: event pages', pattern: /全([\d,]+)件をJSなしの静的HTML/, values: (s) => [formatCount(s.total)] },
	{ name: 'features: header count', pattern: /`全([\d,]+)件 · /, values: (s) => [formatCount(s.total)] },
	{
		name: 'tech: curation',
		pattern: /手動キュレーション([\d,]+)件（[^）]*）\+ `content\/collections\/` の特集(\d+)本([\d,]+)件（うち(\d+)件は/,
		values: (s) => [
			formatCount(s.curated),
			String(s.collectionCounts.length),
			String(sum(s.collectionCounts)),
			String(s.newlyWritten),
		],
	},
	{ name: 'scale: events', pattern: /収録イベント: \*\*([\d,]+)件\*\*/, values: (s) => [formatCount(s.total)] },
	{
		name: 'scale: collections',
		pattern: /特集: \*\*(\d+)本 \/ ([\d,]+)件\*\*/,
		values: (s) => [String(s.collectionCounts.length), String(sum(s.collectionCounts))],
	},
	{ name: 'scale: newly written', pattern: /。うち(\d+)件は新規執筆/, values: (s) => [String(s.newlyWritten)] },
	{ name: 'scale: curated', pattern: /手動キュレーション: ([\d,]+)件/, values: (s) => [formatCount(s.curated)] },
	{ name: 'scale: images', pattern: /画像付きイベント: ([\d,]+)件/, values: (s) => [formatCount(s.withImage)] },
	{
		name: 'scale: related',
		pattern: /関連リンク付きイベント: ([\d,]+)件（全体の約(\d+)%/,
		values: (s) => [formatCount(s.withRelated), String(Math.round((s.withRelated / s.total) * 100))],
	},
];

export interface ReadmeMismatch {
	field: string;
	found: string;
	expected: string;
}

export interface ReadmeSync {
	/** The README with every quoted number set to the data */
	text: string;
	mismatches: ReadmeMismatch[];
	/** Fields whose pattern does not match exactly once */
	missing: string[];
	/** Problems in the hand-written per-collection list (only reported) */
	listProblems: string[];
}

/** Numbers of the per-collection list in the データ規模 section (「第二次世界大戦44・…・写真とカメラ17。うち…」) */
export function collectionListCounts(text: string): number[] | null {
	const m = /特集: \*\*\d+本 \/ [\d,]+件\*\*（([^。\n]*)。/.exec(text);
	if (!m) return null;
	return m[1].split('・').flatMap((item) => {
		const n = /(\d+)$/.exec(item);
		return n ? [Number(n[1])] : [];
	});
}

export function syncReadme(text: string, stats: ReadmeStats, fields: readonly ReadmeField[] = README_FIELDS): ReadmeSync {
	const mismatches: ReadmeMismatch[] = [];
	const missing: string[] = [];
	let out = text;
	for (const field of fields) {
		// `d` gives the exact span of each capture group, so only the numbers are replaced
		const global = new RegExp(field.pattern.source, 'gd');
		const matches = [...out.matchAll(global)];
		if (matches.length !== 1) {
			missing.push(field.name);
			continue;
		}
		const spans = matches[0].indices!.slice(1) as [number, number][];
		const expected = field.values(stats);
		const fieldMismatches: ReadmeMismatch[] = [];
		// Replace from the last group backwards so the earlier spans stay valid
		for (let i = spans.length - 1; i >= 0; i--) {
			const [start, end] = spans[i];
			const found = out.slice(start, end);
			if (found !== expected[i]) fieldMismatches.unshift({ field: field.name, found, expected: expected[i] });
			out = out.slice(0, start) + expected[i] + out.slice(end);
		}
		mismatches.push(...fieldMismatches);
	}
	const listProblems: string[] = [];
	const listed = collectionListCounts(out);
	if (listed === null) {
		listProblems.push('the per-collection list was not found');
	} else {
		const want = [...stats.collectionCounts].sort((a, b) => b - a);
		if (listed.join(',') !== want.join(',')) {
			listProblems.push(`the per-collection list has ${listed.join(',')} (want the counts ${want.join(',')}, largest first)`);
		}
	}
	return { text: out, mismatches, missing, listProblems };
}
