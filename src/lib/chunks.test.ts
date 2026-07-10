import { describe, expect, it } from 'vitest';
import { chunkKeysInRange } from './chunks.ts';
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
