import { describe, expect, it } from 'vitest';
import type { NewsEvent } from './types.ts';
import {
	EMPTY_FILTER,
	isFiltering,
	matchesFilter,
	parseFilter,
	serializeFilter,
	toggleIn,
} from './filters.ts';

function ev(region: NewsEvent['region'], category: NewsEvent['category']): NewsEvent {
	return {
		id: 'x',
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
	it('空フィルタは全て合致', () => {
		expect(matchesFilter(ev('japan', 'politics'), EMPTY_FILTER)).toBe(true);
	});

	it('地域フィルタ: both はどの選択にも合致する', () => {
		const japanOnly = { regions: new Set(['japan' as const]), categories: null };
		expect(matchesFilter(ev('japan', 'politics'), japanOnly)).toBe(true);
		expect(matchesFilter(ev('world', 'politics'), japanOnly)).toBe(false);
		expect(matchesFilter(ev('both', 'politics'), japanOnly)).toBe(true);
	});

	it('カテゴリフィルタ', () => {
		const f = { regions: null, categories: new Set(['culture' as const]) };
		expect(matchesFilter(ev('japan', 'culture'), f)).toBe(true);
		expect(matchesFilter(ev('japan', 'politics'), f)).toBe(false);
	});

	it('地域×カテゴリの複合', () => {
		const f = {
			regions: new Set(['world' as const]),
			categories: new Set(['war' as const]),
		};
		expect(matchesFilter(ev('world', 'war'), f)).toBe(true);
		expect(matchesFilter(ev('world', 'politics'), f)).toBe(false);
		expect(matchesFilter(ev('japan', 'war'), f)).toBe(false);
	});
});

describe('isFiltering', () => {
	it('どちらかが非nullならtrue', () => {
		expect(isFiltering(EMPTY_FILTER)).toBe(false);
		expect(isFiltering({ regions: new Set(['japan']), categories: null })).toBe(true);
		expect(isFiltering({ regions: null, categories: new Set(['war']) })).toBe(true);
	});
});

describe('serializeFilter / parseFilter', () => {
	it('往復できる', () => {
		const f = {
			regions: new Set(['japan' as const]),
			categories: new Set(['politics' as const, 'culture' as const]),
		};
		const { r, c } = serializeFilter(f);
		expect(r).toBe('japan');
		expect(c).toBe('culture,politics');
		const parsed = parseFilter(r, c);
		expect(parsed.regions).toEqual(new Set(['japan']));
		expect(parsed.categories).toEqual(new Set(['culture', 'politics']));
	});

	it('nullは空文字に、空文字はnullに', () => {
		expect(serializeFilter(EMPTY_FILTER)).toEqual({ r: '', c: '' });
		expect(parseFilter('', '')).toEqual(EMPTY_FILTER);
	});

	it('不正な値は無視する', () => {
		expect(parseFilter('mars,japan', 'nonsense')).toEqual({
			regions: new Set(['japan']),
			categories: null,
		});
	});
});

describe('toggleIn', () => {
	it('null（全て）から1つ選択', () => {
		expect(toggleIn(null, 'japan')).toEqual(new Set(['japan']));
	});

	it('追加と削除', () => {
		expect(toggleIn(new Set(['japan']), 'world')).toEqual(new Set(['japan', 'world']));
		expect(toggleIn(new Set(['japan', 'world']), 'japan')).toEqual(new Set(['world']));
	});

	it('最後の1つを外すと null（全て）に戻る', () => {
		expect(toggleIn(new Set(['japan']), 'japan')).toBeNull();
	});
});
