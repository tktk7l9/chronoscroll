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
	it('day降順（新しい順）・同日はid昇順', () => {
		expect(toPoints(events).map((p) => p.ev.id)).toEqual(['c', 'd', 'b', 'a']);
		expect(toPoints([ev('z2', '2000-01-01'), ev('z1', '2000-01-01')]).map((p) => p.ev.id)).toEqual([
			'z1',
			'z2',
		]);
	});
});

describe('firstIndexAtOrBelow', () => {
	const points = toPoints(events);
	it('fromDay以下の最初のindexを返す', () => {
		expect(firstIndexAtOrBelow(points, dayOf('2026-01-01'))).toBe(0);
		expect(firstIndexAtOrBelow(points, dayOf('2000-12-31'))).toBe(0);
		expect(firstIndexAtOrBelow(points, dayOf('1975-01-01'))).toBe(2);
		expect(firstIndexAtOrBelow(points, dayOf('1899-01-01'))).toBe(4);
	});
});

describe('queryVisible', () => {
	const points = toPoints(events);

	it('範囲内のイベントのみ返す', () => {
		const got = queryVisible(points, dayOf('1960-01-01'), dayOf('1940-01-01'), 0, EMPTY_FILTER);
		expect(got.map((p) => p.ev.id)).toEqual(['b']);
	});

	it('importance閾値で間引く', () => {
		const got = queryVisible(points, dayOf('2026-01-01'), dayOf('1899-01-01'), 60, EMPTY_FILTER);
		expect(got.map((p) => p.ev.id)).toEqual(['c', 'a']);
	});

	it('フィルタが適用される', () => {
		const pts = toPoints([ev('j', '2000-01-01', 50, 'japan'), ev('w', '2000-01-02', 50, 'world')]);
		const got = queryVisible(pts, dayOf('2001-01-01'), dayOf('1999-01-01'), 0, {
			regions: new Set(['world' as const]),
			categories: null,
		});
		expect(got.map((p) => p.ev.id)).toEqual(['w']);
	});

	it('範囲外で早期break（古い側の境界）', () => {
		const got = queryVisible(points, dayOf('2026-01-01'), dayOf('2000-01-01'), 0, EMPTY_FILTER);
		expect(got.map((p) => p.ev.id)).toEqual(['c', 'd']);
	});
});

describe('queryVisible (pinned)', () => {
	const points = toPoints(events);

	it('pinnedIdは閾値以下でもフィルタ外でも含まれる', () => {
		const got = queryVisible(
			points,
			dayOf('2026-01-01'),
			dayOf('1899-01-01'),
			60,
			{ regions: new Set(['world' as const]), categories: null },
			'd',
		);
		expect(got.map((p) => p.ev.id)).toContain('d');
	});
});

describe('capDensity', () => {
	it('pinnedIdは密集していても必ず残る', () => {
		const pts = toPoints([
			ev('low', '2000-01-01', 10),
			ev('high', '2000-01-02', 90),
			ev('mid', '2000-01-03', 50),
		]);
		const got = capDensity(pts, 1, 100, 1, 'low');
		expect(got.map((p) => p.ev.id)).toEqual(['low']);
	});

	it('同じ帯に密集したイベントは重要度上位のみ残す', () => {
		// 1px/日: 3日間に3件、minPx=100 → 帯あたり1件なら最重要のみ
		const pts = toPoints([
			ev('low', '2000-01-01', 10),
			ev('high', '2000-01-02', 90),
			ev('mid', '2000-01-03', 50),
		]);
		const got = capDensity(pts, 1, 100, 1);
		expect(got.map((p) => p.ev.id)).toEqual(['high']);
	});

	it('maxPerBand=2 なら上位2件まで', () => {
		const pts = toPoints([
			ev('low', '2000-01-01', 10),
			ev('high', '2000-01-02', 90),
			ev('mid', '2000-01-03', 50),
		]);
		const got = capDensity(pts, 1, 100, 2);
		expect(got.map((p) => p.ev.id).sort()).toEqual(['high', 'mid']);
	});

	it('十分に離れたイベントは全て残り、day降順が保たれる', () => {
		const pts = toPoints([
			ev('a', '2000-01-01', 10),
			ev('b', '2001-01-01', 90),
			ev('c', '2002-01-01', 50),
		]);
		const got = capDensity(pts, 1, 100, 1);
		expect(got.map((p) => p.ev.id)).toEqual(['c', 'b', 'a']);
	});

	it('空配列はそのまま', () => {
		expect(capDensity([], 1, 100, 2)).toEqual([]);
	});
});
