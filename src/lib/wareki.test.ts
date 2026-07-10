import { describe, expect, it } from 'vitest';
import { formatWareki, toWareki } from './wareki.ts';

describe('toWareki', () => {
	it('各元号の代表日を変換する', () => {
		expect(toWareki('1872-10-14')).toEqual({ era: '明治', year: 5 });
		expect(toWareki('1923-09-01')).toEqual({ era: '大正', year: 12 });
		expect(toWareki('1964-10-10')).toEqual({ era: '昭和', year: 39 });
		expect(toWareki('2011-03-11')).toEqual({ era: '平成', year: 23 });
		expect(toWareki('2026-07-10')).toEqual({ era: '令和', year: 8 });
	});

	it('元号の境界日を正しく判定する', () => {
		expect(toWareki('1912-07-29')).toEqual({ era: '明治', year: 45 });
		expect(toWareki('1912-07-30')).toEqual({ era: '大正', year: 1 });
		expect(toWareki('1926-12-24')).toEqual({ era: '大正', year: 15 });
		expect(toWareki('1926-12-25')).toEqual({ era: '昭和', year: 1 });
		expect(toWareki('1989-01-07')).toEqual({ era: '昭和', year: 64 });
		expect(toWareki('1989-01-08')).toEqual({ era: '平成', year: 1 });
		expect(toWareki('2019-04-30')).toEqual({ era: '平成', year: 31 });
		expect(toWareki('2019-05-01')).toEqual({ era: '令和', year: 1 });
	});

	it('明治より前は null', () => {
		expect(toWareki('1868-01-24')).toBeNull();
		expect(toWareki('1600-10-21')).toBeNull();
	});
});

describe('formatWareki', () => {
	it('通常年は数字で表記する', () => {
		expect(formatWareki('1964-10-10')).toBe('昭和39年');
	});

	it('1年目は元年と表記する', () => {
		expect(formatWareki('2019-05-01')).toBe('令和元年');
	});

	it('明治より前は null', () => {
		expect(formatWareki('1868-01-01')).toBeNull();
	});
});
