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
	it('expands year-only to mid-year and year-month to mid-month', () => {
		expect(normalizeDateParam('1964')).toBe('1964-07-01');
		expect(normalizeDateParam('1964-10')).toBe('1964-10-15');
		expect(normalizeDateParam('1964-10-10')).toBe('1964-10-10');
	});

	it('returns null for an invalid format', () => {
		expect(normalizeDateParam('abc')).toBeNull();
		expect(normalizeDateParam('1964-10-10-10')).toBeNull();
	});
});

describe('parseUrlState', () => {
	it('reads all parameters', () => {
		const s = parseUrlState(
			new URLSearchParams('t=1964-10&z=2.5&r=japan&c=politics&q=五輪&e=abc&k=anime'),
		);
		expect(s.centerDate).toBe('1964-10-15');
		expect(s.pxPerDay).toBe(2.5);
		expect(s.filter.regions).toEqual(new Set(['japan']));
		expect(s.filter.categories).toEqual(new Set(['politics']));
		expect(s.query).toBe('五輪');
		expect(s.selectedId).toBe('abc');
		expect(s.collection).toBe('anime');
	});

	it('ignores k when it is not a valid slug', () => {
		expect(parseUrlState(new URLSearchParams('k=../secret')).collection).toBeNull();
		expect(parseUrlState(new URLSearchParams('k=')).collection).toBeNull();
		expect(parseUrlState(new URLSearchParams('k=Anime')).collection).toBeNull();
	});

	it('an empty URL yields the default state', () => {
		expect(parseUrlState(new URLSearchParams())).toEqual(DEFAULT_URL_STATE);
	});

	it('ignores an invalid z and clamps a too large z', () => {
		expect(parseUrlState(new URLSearchParams('z=abc')).pxPerDay).toBeNull();
		expect(parseUrlState(new URLSearchParams('z=-5')).pxPerDay).toBeNull();
		expect(parseUrlState(new URLSearchParams('z=99999')).pxPerDay).toBe(MAX_PX_PER_DAY);
	});
});

describe('serializeUrlState', () => {
	it('omits default values', () => {
		expect(serializeUrlState(DEFAULT_URL_STATE).toString()).toBe('');
	});

	it('round-trips', () => {
		const s = {
			centerDate: '1964-10-15',
			pxPerDay: 2.5,
			filter: {
				regions: new Set(['japan' as const]),
				categories: new Set(['politics' as const]),
				collectionIds: null,
			},
			query: '五輪',
			selectedId: 'abc',
			collection: 'anime',
		};
		const roundTrip = parseUrlState(serializeUrlState(s));
		expect(roundTrip).toEqual(s);
	});

	it('rounds z to 4 digits', () => {
		const params = serializeUrlState({
			...DEFAULT_URL_STATE,
			filter: EMPTY_FILTER,
			pxPerDay: 0.123456789,
		});
		expect(params.get('z')).toBe('0.1235');
	});
});
