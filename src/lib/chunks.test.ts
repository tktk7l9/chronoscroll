import { describe, expect, it } from 'vitest';
import { decadeKeyOfYear, decadeKeysInRange } from './chunks.ts';
import { dayOf } from './timescale.ts';

describe('decadeKeyOfYear', () => {
	it('十年キーを返す', () => {
		expect(decadeKeyOfYear(1868)).toBe('1860s');
		expect(decadeKeyOfYear(2026)).toBe('2020s');
	});
});

describe('decadeKeysInRange', () => {
	it('範囲に交差する十年を新しい順に返す', () => {
		expect(decadeKeysInRange(dayOf('1985-06-01'), dayOf('1962-01-01'))).toEqual([
			'1980s',
			'1970s',
			'1960s',
		]);
	});

	it('同一十年内は1つ', () => {
		expect(decadeKeysInRange(dayOf('1964-12-31'), dayOf('1960-01-01'))).toEqual(['1960s']);
	});

	it('available で実在チャンクに絞る', () => {
		const available = new Set(['1970s']);
		expect(decadeKeysInRange(dayOf('1985-06-01'), dayOf('1962-01-01'), available)).toEqual([
			'1970s',
		]);
	});

	it('小数のday（ズーム中の端数）も扱える', () => {
		expect(decadeKeysInRange(dayOf('1970-01-01') + 0.7, dayOf('1970-01-01') - 0.3)).toEqual([
			'1970s',
			'1960s',
		]);
	});
});
