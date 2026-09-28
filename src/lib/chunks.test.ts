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
	it('returns chunks intersecting the range, newest first', () => {
		expect(chunkKeysInRange(chunks, dayOf('1975-06-01'), dayOf('1962-01-01'))).toEqual([
			'1970s',
			'1960s',
		]);
	});

	it('selects 5-year split chunks correctly', () => {
		expect(chunkKeysInRange(chunks, dayOf('2026-01-01'), dayOf('2024-06-01'))).toEqual([
			'2020h2',
			'2020h1',
		]);
		expect(chunkKeysInRange(chunks, dayOf('2023-01-01'), dayOf('2021-01-01'))).toEqual(['2020h1']);
	});

	it('returns empty out of range and handles fractional days (mid-zoom)', () => {
		expect(chunkKeysInRange(chunks, dayOf('1900-01-01'), dayOf('1890-01-01'))).toEqual([]);
		expect(
			chunkKeysInRange(chunks, dayOf('1970-01-01') + 0.7, dayOf('1970-01-01') - 0.3),
		).toEqual(['1970s', '1960s']);
	});
});

/** Decade chunk with exactly 1 event per day (1960-01-01 to 1970-01-01 is 3653 days) */
const dense: ChunkMeta[] = [
	{ key: '1960s', fromYear: 1960, toYear: 1969, count: 3653 },
	// 1970-01-01 to 1980-01-01 is 3652 days. Triple the density
	{ key: '1970s', fromYear: 1970, toYear: 1979, count: 3652 * 3 },
];

describe('eventsPerDayInRange', () => {
	it('returns the chunk density when viewing only inside one chunk', () => {
		expect(
			eventsPerDayInRange(dense, dayOf('1965-01-01'), dayOf('1963-01-01')),
		).toBeCloseTo(1, 5);
		expect(
			eventsPerDayInRange(dense, dayOf('1975-01-01'), dayOf('1973-01-01')),
		).toBeCloseTo(3, 5);
	});

	it('weights by overlapping days across chunks with different densities', () => {
		// 1969-01-01 to 1971-01-01 spans 365 days in the 1960s and 365 days in the 1970s → (1+3)/2
		expect(
			eventsPerDayInRange(dense, dayOf('1971-01-01'), dayOf('1969-01-01')),
		).toBeCloseTo(2, 2);
	});

	it('is not diluted when the range extends beyond the covered period', () => {
		// Of 1969-01-01 to 1975-01-01, data only covers the 365 days up to 1970-01-01
		expect(
			eventsPerDayInRange([dense[0]], dayOf('1975-01-01'), dayOf('1969-01-01')),
		).toBeCloseTo(1, 5);
	});

	it('returns 0 for a range with no data (no division by zero)', () => {
		expect(eventsPerDayInRange(dense, dayOf('1900-01-01'), dayOf('1890-01-01'))).toBe(0);
		expect(eventsPerDayInRange([], dayOf('1965-01-01'), dayOf('1963-01-01'))).toBe(0);
	});

	it('returns 0 for a zero-width or reversed range', () => {
		expect(eventsPerDayInRange(dense, dayOf('1965-01-01'), dayOf('1965-01-01'))).toBe(0);
		expect(eventsPerDayInRange(dense, dayOf('1963-01-01'), dayOf('1965-01-01'))).toBe(0);
	});

	it('handles fractional days (mid-zoom)', () => {
		expect(
			eventsPerDayInRange(dense, dayOf('1965-01-01') + 0.4, dayOf('1963-01-01') - 0.6),
		).toBeCloseTo(1, 5);
	});
});
