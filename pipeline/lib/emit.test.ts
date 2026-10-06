import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../../src/lib/types.ts';
import {
	SEARCH_TEXT_MAX,
	buildChunks,
	buildEvent,
	buildIndexMeta,
	decadeKeyOf,
	overviewLite,
	overviewSlice,
	searchDocs,
	sortEvents,
	truncateTitle,
	wikipediaUrl,
} from './emit.ts';

function ev(id: string, date: string, importance = 50): NewsEvent {
	return {
		id,
		date,
		precision: 'day',
		title: `t-${id}`,
		summary: `s-${id}`,
		category: 'society',
		region: 'japan',
		importance,
		sources: [],
	};
}

describe('wikipediaUrl', () => {
	it('encodes the title and turns spaces into underscores', () => {
		expect(wikipediaUrl('東京オリンピック')).toBe(
			`https://ja.wikipedia.org/wiki/${encodeURIComponent('東京オリンピック')}`,
		);
		expect(wikipediaUrl('A B')).toBe('https://ja.wikipedia.org/wiki/A_B');
	});
});

describe('truncateTitle', () => {
	it('drops the trailing full stop', () => {
		expect(truncateTitle('何かが起きた。')).toBe('何かが起きた');
	});

	it('truncates long text and appends an ellipsis', () => {
		const long = 'あ'.repeat(60);
		const t = truncateTitle(long);
		expect(t).toHaveLength(48);
		expect(t.endsWith('…')).toBe(true);
	});
});

describe('buildEvent', () => {
	const raw = {
		year: 1964,
		month: 10,
		day: 10,
		precision: 'day' as const,
		text: '東京オリンピック開幕。',
		links: [{ target: '1964年東京オリンピック', label: '東京オリンピック' }],
	};

	it('lists sources as article then year page', () => {
		const e = buildEvent({ raw, importance: 99.5, category: 'sports', region: 'japan' });
		expect(e.id).toMatch(/^1964-10-10-[0-9a-f]{8}$/);
		expect(e.title).toBe('東京オリンピック開幕');
		expect(e.summary).toBe('東京オリンピック開幕。');
		expect(e.sources).toEqual([
			{
				label: 'Wikipedia: 東京オリンピック',
				url: wikipediaUrl('1964年東京オリンピック'),
			},
			{ label: 'Wikipedia: 1964年', url: wikipediaUrl('1964年') },
		]);
		expect(e.image).toBeUndefined();
	});

	it('only the year page without links, includes the image when present', () => {
		const image = { src: 'https://upload.wikimedia.org/x.jpg', width: 640, height: 480, credit: 'c' };
		const e = buildEvent({
			raw: { ...raw, links: [] },
			importance: 10,
			category: 'society',
			region: 'japan',
			image,
		});
		expect(e.sources).toHaveLength(1);
		expect(e.image).toEqual(image);
	});
});

describe('sortEvents / chunkByDecade / overviewSlice / searchDocs', () => {
	const events = [ev('b', '1964-10-10', 99), ev('a', '1964-10-10', 40), ev('c', '1872-10-14', 96)];

	it('date ascending, same day by id', () => {
		expect(sortEvents(events).map((e) => e.id)).toEqual(['c', 'a', 'b']);
		expect(sortEvents([...events].reverse()).map((e) => e.id)).toEqual(['c', 'a', 'b']);
	});

	it('chunks by decade', () => {
		const chunks = buildChunks(events);
		expect(chunks.map((c) => c.meta)).toEqual([
			{ key: '1870s', fromYear: 1870, toYear: 1879, count: 1 },
			{ key: '1960s', fromYear: 1960, toYear: 1969, count: 2 },
		]);
		expect(chunks[1].events.map((e) => e.id)).toEqual(['a', 'b']);
	});

	it('splits a decade over the limit into 5-year chunks', () => {
		const many = [
			ev('x1', '2021-01-01'),
			ev('x2', '2023-01-01'),
			ev('x3', '2025-01-01'),
			ev('x4', '2026-01-01'),
		];
		const chunks = buildChunks(many, 3);
		expect(chunks.map((c) => c.meta.key)).toEqual(['2020h1', '2020h2']);
		expect(chunks[0].events.map((e) => e.id)).toEqual(['x1', 'x2']);
		expect(chunks[1].events.map((e) => e.id)).toEqual(['x3', 'x4']);
		expect(chunks[0].meta).toMatchObject({ fromYear: 2020, toYear: 2024, count: 2 });
		expect(chunks[1].meta).toMatchObject({ fromYear: 2025, toYear: 2029, count: 2 });
	});

	it('overviewSlice keeps only events at or above the threshold', () => {
		expect(overviewSlice(events).map((e) => e.id)).toEqual(['c', 'b']);
		expect(overviewSlice(events, 100)).toEqual([]);
	});

	it('overviewLite keeps only the fields a card and the LOD read', () => {
		const withSvg = { ...ev('s', '1964-10-10', 99), svg: 'torch' };
		const lite = overviewLite([withSvg, events[0]]);
		expect(lite[0]).toEqual({
			id: 's',
			date: '1964-10-10',
			precision: 'day',
			title: withSvg.title,
			category: withSvg.category,
			region: withSvg.region,
			importance: 99,
			svg: 'torch',
		});
		// No svg key at all when the event has none (keeps the JSON small)
		expect('svg' in lite[1]).toBe(false);
		expect(lite[1]).not.toHaveProperty('summary');
		expect(lite[1]).not.toHaveProperty('sources');
	});

	it('searchDocs is a light [id, date, summary] array (long text truncated)', () => {
		expect(searchDocs(events)[0]).toEqual(['c', '1872-10-14', 's-c']);
		const long = { ...ev('l', '2000-01-01'), summary: 'あ'.repeat(200) };
		const [, , text] = searchDocs([long])[0];
		expect(text).toHaveLength(SEARCH_TEXT_MAX);
	});
});

describe('decadeKeyOf', () => {
	it('builds a decade key from a year', () => {
		expect(decadeKeyOf(1868)).toBe('1860s');
		expect(decadeKeyOf(2026)).toBe('2020s');
	});
});

describe('buildIndexMeta', () => {
	it('returns range, count and chunk breakdown', () => {
		const meta = buildIndexMeta(
			[ev('a', '1964-10-10'), ev('b', '1872-10-14'), ev('c', '1964-11-01')],
			'2026-07-10T00:00:00Z',
		);
		expect(meta.minDate).toBe('1872-10-14');
		expect(meta.maxDate).toBe('1964-11-01');
		expect(meta.total).toBe(3);
		expect(meta.chunks).toEqual([
			{ key: '1870s', fromYear: 1870, toYear: 1879, count: 1 },
			{ key: '1960s', fromYear: 1960, toYear: 1969, count: 2 },
		]);
	});

	it('empty meta for an empty array', () => {
		const meta = buildIndexMeta([], 'now');
		expect(meta.total).toBe(0);
		expect(meta.chunks).toEqual([]);
	});
});
