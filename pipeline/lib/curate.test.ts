import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../../src/lib/types.ts';
import { applyCurated, crossYearDateOverrides, parseCuratedYaml, suppressedIds } from './curate.ts';

function ev(id: string): NewsEvent {
	return {
		id,
		date: '1964-10-10',
		precision: 'day',
		title: '元タイトル',
		summary: '元要約。',
		category: 'society',
		region: 'japan',
		importance: 50,
		sources: [{ label: 'x', url: 'https://example.com' }],
	};
}

describe('parseCuratedYaml', () => {
	it('parses an array', () => {
		const entries = parseCuratedYaml('- id: a\n  title: 新タイトル\n- id: b\n  importance: 100\n');
		expect(entries).toEqual([
			{ id: 'a', title: '新タイトル' },
			{ id: 'b', importance: 100 },
		]);
	});

	it('an empty file or null document yields an empty array', () => {
		expect(parseCuratedYaml('')).toEqual([]);
		expect(parseCuratedYaml('  \n')).toEqual([]);
		expect(parseCuratedYaml('~\n')).toEqual([]);
	});

	it('errors when not an array', () => {
		expect(() => parseCuratedYaml('id: a')).toThrow('must be an array');
	});

	it('errors without id', () => {
		expect(() => parseCuratedYaml('- title: x')).toThrow('id');
	});

	it('accepts a suppress entry that gives a reason and nothing else', () => {
		expect(parseCuratedYaml('- id: a\n  suppress: a list line from inside a <ref>\n')).toEqual([
			{ id: 'a', suppress: 'a list line from inside a <ref>' },
		]);
	});

	it('errors when suppress has no reason', () => {
		expect(() => parseCuratedYaml('- id: a\n  suppress: ""\n')).toThrow('suppress needs a reason');
		expect(() => parseCuratedYaml('- id: a\n  suppress: "  "\n')).toThrow('suppress needs a reason');
		expect(() => parseCuratedYaml('- id: a\n  suppress: true\n')).toThrow('suppress needs a reason');
		expect(() => parseCuratedYaml('- id: a\n  suppress:\n')).toThrow('suppress needs a reason');
	});

	it('errors when a suppressed entry also sets other fields', () => {
		expect(() => parseCuratedYaml('- id: a\n  suppress: junk\n  title: x\n  importance: 1\n')).toThrow(
			'a suppressed entry cannot set title, importance',
		);
	});
});

describe('applyCurated', () => {
	it('partially overrides an existing event', () => {
		const { events, updated, added, unmatched } = applyCurated(
			[ev('a')],
			[{ id: 'a', title: '新タイトル', importance: 99.9, svg: 'art-a' }],
		);
		expect(updated).toEqual(['a']);
		expect(added).toEqual([]);
		expect(unmatched).toEqual([]);
		const e = events[0];
		expect(e.title).toBe('新タイトル');
		expect(e.importance).toBe(99.9);
		expect(e.svg).toBe('art-a');
		expect(e.summary).toBe('元要約。');
	});

	it('overrides the date and precision of an existing event while keeping its id', () => {
		// A wrong day on the year page is corrected like this (top50: Hiroshima 1945-08-01-… → 1945-08-06)
		const { events, updated } = applyCurated(
			[ev('1964-10-10-abc')],
			[{ id: '1964-10-10-abc', date: '1964-10-12', precision: 'day' }],
		);
		expect(updated).toEqual(['1964-10-10-abc']);
		expect(events[0]).toMatchObject({ id: '1964-10-10-abc', date: '1964-10-12', precision: 'day', title: '元タイトル' });
	});

	it('does not override undefined fields', () => {
		const { events } = applyCurated([ev('a')], [{ id: 'a', title: undefined, summary: '新要約' }]);
		expect(events[0].title).toBe('元タイトル');
		expect(events[0].summary).toBe('新要約');
	});

	it('adds a new entry that has all required fields (fills defaults)', () => {
		const { events, added } = applyCurated(
			[],
			[{ id: 'new1', date: '2000-01-01', title: 'T', summary: 'S' }],
		);
		expect(added).toEqual(['new1']);
		expect(events[0]).toMatchObject({
			id: 'new1',
			precision: 'day',
			category: 'society',
			region: 'japan',
			importance: 100,
			sources: [],
		});
	});

	it('respects explicit fields and image/svg of a new entry', () => {
		const image = { src: 'https://upload.wikimedia.org/x.jpg', width: 1, height: 1, credit: 'c' };
		const { events } = applyCurated(
			[],
			[
				{
					id: 'new2',
					date: '2000-01-01',
					precision: 'month',
					title: 'T',
					summary: 'S',
					category: 'war',
					region: 'world',
					importance: 88,
					sources: [{ label: 'l', url: 'u' }],
					image,
					svg: 'art-x',
				},
			],
		);
		expect(events[0]).toMatchObject({
			precision: 'month',
			category: 'war',
			region: 'world',
			importance: 88,
			image,
			svg: 'art-x',
		});
	});

	it('reports unmatched for entries not existing and missing required fields', () => {
		const { unmatched, events } = applyCurated([ev('a')], [{ id: 'ghost', title: 'X' }]);
		expect(unmatched).toEqual(['ghost']);
		expect(events).toHaveLength(1);
	});

	it('does not copy relatedIds into NewsEvent (related.ts builds related)', () => {
		const { events } = applyCurated(
			[ev('a')],
			[{ id: 'a', title: '新タイトル', relatedIds: ['b', 'c'] }],
		);
		expect(events[0]).not.toHaveProperty('relatedIds');
		expect(events[0].title).toBe('新タイトル');
	});

	it('does not copy relatedIds of a new entry into NewsEvent either', () => {
		const { events } = applyCurated(
			[],
			[{ id: 'new1', date: '2000-01-01', title: 'T', summary: 'S', relatedIds: ['x'] }],
		);
		expect(events[0]).not.toHaveProperty('relatedIds');
	});

	it('removes a suppressed event and reports it', () => {
		const result = applyCurated([ev('a'), ev('b'), ev('c')], [{ id: 'b', suppress: 'not an event' }]);
		expect(result.events.map((e) => e.id)).toEqual(['a', 'c']);
		expect(result.suppressed).toEqual(['b']);
		expect(result.updated).toEqual([]);
		expect(result.unmatched).toEqual([]);
	});

	it('a suppress entry wins over other entries for the same id, before or after it', () => {
		const result = applyCurated(
			[ev('a'), ev('b')],
			[
				{ id: 'a', title: '先の上書き' },
				{ id: 'b', title: '先の上書き' },
				{ id: 'a', suppress: 'junk' },
				{ id: 'b', summary: '後の上書き' },
				{ id: 'b', suppress: 'junk' },
			],
		);
		expect(result.events).toEqual([]);
		expect(result.suppressed).toEqual(['a', 'b']);
		expect(result.updated).toEqual([]);
	});

	it('never adds a complete new entry whose id is suppressed', () => {
		const result = applyCurated(
			[],
			[
				{ id: 'new1', date: '2000-01-01', title: 'T', summary: 'S' },
				{ id: 'new1', suppress: 'junk' },
			],
		);
		expect(result.events).toEqual([]);
		expect(result.added).toEqual([]);
		expect(result.unmatched).toEqual(['new1']);
	});

	it('reports a suppress entry whose event no longer exists as unmatched', () => {
		const result = applyCurated([ev('a')], [{ id: 'gone', suppress: 'junk' }]);
		expect(result.events.map((e) => e.id)).toEqual(['a']);
		expect(result.suppressed).toEqual([]);
		expect(result.unmatched).toEqual(['gone']);
	});

	it('never writes the suppress reason into an event', () => {
		const { events } = applyCurated([ev('a'), ev('b')], [{ id: 'b', suppress: 'junk' }]);
		expect(events[0]).not.toHaveProperty('suppress');
	});
});

describe('suppressedIds', () => {
	it('collects the ids of suppress entries only', () => {
		expect([
			...suppressedIds([
				{ id: 'a', title: 'x' },
				{ id: 'b', suppress: 'junk' },
				{ id: 'c', suppress: 'junk' },
			]),
		]).toEqual(['b', 'c']);
		expect(suppressedIds([]).size).toBe(0);
	});
});

describe('crossYearDateOverrides', () => {
	it('lists entries whose date leaves the year of the id prefix', () => {
		expect(
			crossYearDateOverrides([
				{ id: '1936-09-11-11dc7ebf', date: '1936-05-01' },
				{ id: '1945-08-01-02e05b66', date: '1946-08-06' },
				{ id: '1950-10-01-ai-turing-test', date: '1951-10-01' },
				{ id: '1989-11-10-50619ea3', title: 'no date here' },
			]),
		).toEqual(['1945-08-01-02e05b66', '1950-10-01-ai-turing-test']);
	});

	it('skips ids without a year prefix', () => {
		expect(crossYearDateOverrides([{ id: 'custom', date: '2000-01-01' }])).toEqual([]);
	});
});
