import { describe, expect, it } from 'vitest';
import type { NewsEvent } from './types.ts';
import {
	EMPTY_FILTER,
	isFiltering,
	matchesFilter,
	parseFilter,
	serializeFilter,
	toggleIn,
	withCollection,
} from './filters.ts';

function ev(region: NewsEvent['region'], category: NewsEvent['category'], id = 'x'): NewsEvent {
	return {
		id,
		date: '2000-01-01',
		precision: 'day',
		title: 't',
		summary: 's',
		category,
		region,
		importance: 50,
		sources: [],
	};
}

describe('matchesFilter', () => {
	it('an empty filter matches everything', () => {
		expect(matchesFilter(ev('japan', 'politics'), EMPTY_FILTER)).toBe(true);
	});

	it('region filter: both matches any selection', () => {
		const japanOnly = { regions: new Set(['japan' as const]), categories: null, collectionIds: null };
		expect(matchesFilter(ev('japan', 'politics'), japanOnly)).toBe(true);
		expect(matchesFilter(ev('world', 'politics'), japanOnly)).toBe(false);
		expect(matchesFilter(ev('both', 'politics'), japanOnly)).toBe(true);
	});

	it('category filter', () => {
		const f = { regions: null, categories: new Set(['culture' as const]), collectionIds: null };
		expect(matchesFilter(ev('japan', 'culture'), f)).toBe(true);
		expect(matchesFilter(ev('japan', 'politics'), f)).toBe(false);
	});

	it('region x category combined', () => {
		const f = {
			regions: new Set(['world' as const]),
			categories: new Set(['war' as const]),
			collectionIds: null,
		};
		expect(matchesFilter(ev('world', 'war'), f)).toBe(true);
		expect(matchesFilter(ev('world', 'politics'), f)).toBe(false);
		expect(matchesFilter(ev('japan', 'war'), f)).toBe(false);
	});
});

describe('collection filter', () => {
	const inAnime = withCollection(EMPTY_FILTER, new Set(['a', 'b']));

	it('matches only ids in the collection', () => {
		expect(matchesFilter(ev('japan', 'culture', 'a'), inAnime)).toBe(true);
		expect(matchesFilter(ev('japan', 'culture', 'zzz'), inAnime)).toBe(false);
	});

	it('combines with region and category selections', () => {
		const f = withCollection(
			{ regions: null, categories: new Set(['culture' as const]), collectionIds: null },
			new Set(['a']),
		);
		expect(matchesFilter(ev('japan', 'culture', 'a'), f)).toBe(true);
		expect(matchesFilter(ev('japan', 'politics', 'a'), f)).toBe(false);
		expect(matchesFilter(ev('japan', 'culture', 'b'), f)).toBe(false);
	});

	it('withCollection clears with null and keeps other selections', () => {
		const withRegion = { ...inAnime, regions: new Set(['japan' as const]) };
		const cleared = withCollection(withRegion, null);
		expect(cleared.collectionIds).toBeNull();
		expect(cleared.regions).toEqual(new Set(['japan']));
	});
});

describe('isFiltering', () => {
	it('true when either is non-null', () => {
		expect(isFiltering(EMPTY_FILTER)).toBe(false);
		expect(isFiltering({ regions: new Set(['japan']), categories: null, collectionIds: null })).toBe(
			true,
		);
		expect(isFiltering({ regions: null, categories: new Set(['war']), collectionIds: null })).toBe(
			true,
		);
		expect(isFiltering(withCollection(EMPTY_FILTER, new Set(['a'])))).toBe(true);
	});
});

describe('serializeFilter / parseFilter', () => {
	it('round-trips', () => {
		const f = {
			regions: new Set(['japan' as const]),
			categories: new Set(['politics' as const, 'culture' as const]),
			collectionIds: null,
		};
		const { r, c } = serializeFilter(f);
		expect(r).toBe('japan');
		expect(c).toBe('culture,politics');
		const parsed = parseFilter(r, c);
		expect(parsed.regions).toEqual(new Set(['japan']));
		expect(parsed.categories).toEqual(new Set(['culture', 'politics']));
	});

	it('null becomes an empty string and an empty string becomes null', () => {
		expect(serializeFilter(EMPTY_FILTER)).toEqual({ r: '', c: '' });
		expect(parseFilter('', '')).toEqual(EMPTY_FILTER);
	});

	it('ignores invalid values', () => {
		expect(parseFilter('mars,japan', 'nonsense')).toEqual({
			regions: new Set(['japan']),
			categories: null,
			collectionIds: null,
		});
	});
});

describe('toggleIn', () => {
	it('selects one from null (all)', () => {
		expect(toggleIn(null, 'japan')).toEqual(new Set(['japan']));
	});

	it('adds and removes', () => {
		expect(toggleIn(new Set(['japan']), 'world')).toEqual(new Set(['japan', 'world']));
		expect(toggleIn(new Set(['japan', 'world']), 'japan')).toEqual(new Set(['world']));
	});

	it('removing the last one goes back to null (all)', () => {
		expect(toggleIn(new Set(['japan']), 'japan')).toBeNull();
	});
});
