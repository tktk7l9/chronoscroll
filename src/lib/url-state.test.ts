import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER } from './filters.ts';
import { MAX_PX_PER_DAY } from './timescale.ts';
import {
	DEFAULT_URL_STATE,
	normalizeDateParam,
	parseUrlState,
	serializeUrlState,
} from './url-state.ts';

describe('normalizeDateParam', () => {
	it('年のみは年央、年月は月央に展開する', () => {
		expect(normalizeDateParam('1964')).toBe('1964-07-01');
		expect(normalizeDateParam('1964-10')).toBe('1964-10-15');
		expect(normalizeDateParam('1964-10-10')).toBe('1964-10-10');
	});

	it('不正な形式は null', () => {
		expect(normalizeDateParam('abc')).toBeNull();
		expect(normalizeDateParam('1964-10-10-10')).toBeNull();
	});
});

describe('parseUrlState', () => {
	it('全パラメータを読む', () => {
		const s = parseUrlState(
			new URLSearchParams('t=1964-10&z=2.5&r=japan&c=politics&q=五輪&e=abc'),
		);
		expect(s.centerDate).toBe('1964-10-15');
		expect(s.pxPerDay).toBe(2.5);
		expect(s.filter.regions).toEqual(new Set(['japan']));
		expect(s.filter.categories).toEqual(new Set(['politics']));
		expect(s.query).toBe('五輪');
		expect(s.selectedId).toBe('abc');
	});

	it('空のURLはデフォルト状態', () => {
		expect(parseUrlState(new URLSearchParams())).toEqual(DEFAULT_URL_STATE);
	});

	it('不正なzは無視、大きすぎるzはクランプ', () => {
		expect(parseUrlState(new URLSearchParams('z=abc')).pxPerDay).toBeNull();
		expect(parseUrlState(new URLSearchParams('z=-5')).pxPerDay).toBeNull();
		expect(parseUrlState(new URLSearchParams('z=99999')).pxPerDay).toBe(MAX_PX_PER_DAY);
	});
});

describe('serializeUrlState', () => {
	it('デフォルト値は省略する', () => {
		expect(serializeUrlState(DEFAULT_URL_STATE).toString()).toBe('');
	});

	it('往復できる', () => {
		const s = {
			centerDate: '1964-10-15',
			pxPerDay: 2.5,
			filter: {
				regions: new Set(['japan' as const]),
				categories: new Set(['politics' as const]),
			},
			query: '五輪',
			selectedId: 'abc',
		};
		const roundTrip = parseUrlState(serializeUrlState(s));
		expect(roundTrip).toEqual(s);
	});

	it('zは4桁に丸める', () => {
		const params = serializeUrlState({
			...DEFAULT_URL_STATE,
			filter: EMPTY_FILTER,
			pxPerDay: 0.123456789,
		});
		expect(params.get('z')).toBe('0.1235');
	});
});
