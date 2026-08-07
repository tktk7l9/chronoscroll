import { describe, expect, it } from 'vitest';
import { chunkKeysInRange, eventsPerDayInRange } from './chunks.ts';
import { dayOf } from './timescale.ts';
import type { ChunkMeta } from './types.ts';

const chunks: ChunkMeta[] = [
	{ key: '1960s', fromYear: 1960, toYear: 1969, count: 900 },
	{ key: '1970s', fromYear: 1970, toYear: 1979, count: 500 },
	{ key: '2020h1', fromYear: 2020, toYear: 2024, count: 1100 },
	{ key: '2020h2', fromYear: 2025, toYear: 2029, count: 700 },
];

describe('chunkKeysInRange', () => {
	it('範囲に交差するチャンクを新しい順に返す', () => {
		expect(chunkKeysInRange(chunks, dayOf('1975-06-01'), dayOf('1962-01-01'))).toEqual([
			'1970s',
			'1960s',
		]);
	});

	it('5年分割チャンクも正しく選ばれる', () => {
		expect(chunkKeysInRange(chunks, dayOf('2026-01-01'), dayOf('2024-06-01'))).toEqual([
			'2020h2',
			'2020h1',
		]);
		expect(chunkKeysInRange(chunks, dayOf('2023-01-01'), dayOf('2021-01-01'))).toEqual(['2020h1']);
	});

	it('範囲外は空、小数day（ズーム中の端数）も扱える', () => {
		expect(chunkKeysInRange(chunks, dayOf('1900-01-01'), dayOf('1890-01-01'))).toEqual([]);
		expect(
			chunkKeysInRange(chunks, dayOf('1970-01-01') + 0.7, dayOf('1970-01-01') - 0.3),
		).toEqual(['1970s', '1960s']);
	});
});

/** 1日1件ちょうどの十年チャンク（1960-01-01〜1970-01-01 は3653日） */
const dense: ChunkMeta[] = [
	{ key: '1960s', fromYear: 1960, toYear: 1969, count: 3653 },
	// 1970-01-01〜1980-01-01 は3652日。3倍の密度にする
	{ key: '1970s', fromYear: 1970, toYear: 1979, count: 3652 * 3 },
];

describe('eventsPerDayInRange', () => {
	it('チャンクの内側だけを見ているときはそのチャンクの密度を返す', () => {
		expect(
			eventsPerDayInRange(dense, dayOf('1965-01-01'), dayOf('1963-01-01')),
		).toBeCloseTo(1, 5);
		expect(
			eventsPerDayInRange(dense, dayOf('1975-01-01'), dayOf('1973-01-01')),
		).toBeCloseTo(3, 5);
	});

	it('密度の違うチャンクにまたがると重なり日数で加重平均する', () => {
		// 1969-01-01〜1971-01-01 は 1960s に365日・1970s に365日かかる → (1+3)/2
		expect(
			eventsPerDayInRange(dense, dayOf('1971-01-01'), dayOf('1969-01-01')),
		).toBeCloseTo(2, 2);
	});

	it('収録範囲の外へはみ出してもデータのある部分の密度で薄まらない', () => {
		// 1969-01-01〜1975-01-01 のうちデータは1970-01-01までの365日しかない
		expect(
			eventsPerDayInRange([dense[0]], dayOf('1975-01-01'), dayOf('1969-01-01')),
		).toBeCloseTo(1, 5);
	});

	it('データが1件も無い範囲は0を返す（0除算しない）', () => {
		expect(eventsPerDayInRange(dense, dayOf('1900-01-01'), dayOf('1890-01-01'))).toBe(0);
		expect(eventsPerDayInRange([], dayOf('1965-01-01'), dayOf('1963-01-01'))).toBe(0);
	});

	it('幅ゼロ・逆転した範囲でも0を返す', () => {
		expect(eventsPerDayInRange(dense, dayOf('1965-01-01'), dayOf('1965-01-01'))).toBe(0);
		expect(eventsPerDayInRange(dense, dayOf('1963-01-01'), dayOf('1965-01-01'))).toBe(0);
	});

	it('小数day（ズーム中の端数）も扱える', () => {
		expect(
			eventsPerDayInRange(dense, dayOf('1965-01-01') + 0.4, dayOf('1963-01-01') - 0.6),
		).toBeCloseTo(1, 5);
	});
});
