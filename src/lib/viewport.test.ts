import { describe, expect, it } from 'vitest';
import type { NewsEvent } from './types.ts';
import { EMPTY_FILTER } from './filters.ts';
import { dayOf } from './timescale.ts';
import { capDensity, firstIndexAtOrBelow, queryVisible, toPoints } from './viewport.ts';

function ev(id: string, date: string, importance = 50, region: NewsEvent['region'] = 'japan'): NewsEvent {
	return {
		id,
		date,
		precision: 'day',
		title: id,
		summary: id,
		category: 'society',
		region,
		importance,
		sources: [],
	};
}

const events = [
	ev('a', '1900-01-01', 90),
	ev('b', '1950-06-15', 50),
	ev('c', '2000-12-31', 99),
	ev('d', '2000-12-31', 10),
];

describe('toPoints', () => {
	it('day descending (newest first), same day by id ascending', () => {
		expect(toPoints(events).map((p) => p.ev.id)).toEqual(['c', 'd', 'b', 'a']);
		expect(toPoints([ev('z2', '2000-01-01'), ev('z1', '2000-01-01')]).map((p) => p.ev.id)).toEqual([
			'z1',
			'z2',
		]);
	});
});

describe('firstIndexAtOrBelow', () => {
	const points = toPoints(events);
	it('returns the first index at or below fromDay', () => {
		expect(firstIndexAtOrBelow(points, dayOf('2026-01-01'))).toBe(0);
		expect(firstIndexAtOrBelow(points, dayOf('2000-12-31'))).toBe(0);
		expect(firstIndexAtOrBelow(points, dayOf('1975-01-01'))).toBe(2);
		expect(firstIndexAtOrBelow(points, dayOf('1899-01-01'))).toBe(4);
	});
});

describe('queryVisible', () => {
	const points = toPoints(events);

	it('returns only events in range', () => {
		const got = queryVisible(points, dayOf('1960-01-01'), dayOf('1940-01-01'), 0, EMPTY_FILTER);
		expect(got.map((p) => p.ev.id)).toEqual(['b']);
	});

	it('thins out by the importance threshold', () => {
		const got = queryVisible(points, dayOf('2026-01-01'), dayOf('1899-01-01'), 60, EMPTY_FILTER);
		expect(got.map((p) => p.ev.id)).toEqual(['c', 'a']);
	});

	it('applies filters', () => {
		const pts = toPoints([ev('j', '2000-01-01', 50, 'japan'), ev('w', '2000-01-02', 50, 'world')]);
		const got = queryVisible(pts, dayOf('2001-01-01'), dayOf('1999-01-01'), 0, {
			regions: new Set(['world' as const]),
			categories: null,
			collectionIds: null,
		});
		expect(got.map((p) => p.ev.id)).toEqual(['w']);
	});

	it('breaks early out of range (older boundary)', () => {
		const got = queryVisible(points, dayOf('2026-01-01'), dayOf('2000-01-01'), 0, EMPTY_FILTER);
		expect(got.map((p) => p.ev.id)).toEqual(['c', 'd']);
	});
});

describe('queryVisible (pinned)', () => {
	const points = toPoints(events);

	it('includes pinnedId even below the threshold or outside the filter', () => {
		const got = queryVisible(
			points,
			dayOf('2026-01-01'),
			dayOf('1899-01-01'),
			60,
			{ regions: new Set(['world' as const]), categories: null, collectionIds: null },
			'd',
		);
		expect(got.map((p) => p.ev.id)).toContain('d');
	});
});

describe('capDensity', () => {
	it('always keeps pinnedId even when crowded', () => {
		const pts = toPoints([
			ev('low', '2000-01-01', 10),
			ev('high', '2000-01-02', 90),
			ev('mid', '2000-01-03', 50),
		]);
		const got = capDensity(pts, 1, 100, 1, 'low');
		expect(got.map((p) => p.ev.id)).toEqual(['low']);
	});

	it('keeps only the most important events crowded in the same band', () => {
		// 1px/day: 3 events in 3 days, minPx=100 → with 1 per band, only the most important
		const pts = toPoints([
			ev('low', '2000-01-01', 10),
			ev('high', '2000-01-02', 90),
			ev('mid', '2000-01-03', 50),
		]);
		const got = capDensity(pts, 1, 100, 1);
		expect(got.map((p) => p.ev.id)).toEqual(['high']);
	});

	it('keeps up to the top 2 with maxPerBand=2', () => {
		const pts = toPoints([
			ev('low', '2000-01-01', 10),
			ev('high', '2000-01-02', 90),
			ev('mid', '2000-01-03', 50),
		]);
		const got = capDensity(pts, 1, 100, 2);
		expect(got.map((p) => p.ev.id).sort()).toEqual(['high', 'mid']);
	});

	it('keeps all well-separated events in day-descending order', () => {
		const pts = toPoints([
			ev('a', '2000-01-01', 10),
			ev('b', '2001-01-01', 90),
			ev('c', '2002-01-01', 50),
		]);
		const got = capDensity(pts, 1, 100, 1);
		expect(got.map((p) => p.ev.id)).toEqual(['c', 'b', 'a']);
	});

	it('returns an empty array unchanged', () => {
		expect(capDensity([], 1, 100, 2)).toEqual([]);
	});
});
