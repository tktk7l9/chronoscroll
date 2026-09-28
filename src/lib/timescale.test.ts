import { describe, expect, it } from 'vitest';
import {
	MAX_PX_PER_DAY,
	MIN_PX_PER_DAY,
	clampPxPerDay,
	dayOf,
	dayToY,
	isoOf,
	totalHeight,
	visibleDayRange,
	yToDay,
	zoomAt,
	type TimeScale,
} from './timescale.ts';

const scale: TimeScale = {
	minDay: dayOf('1868-01-01'),
	maxDay: dayOf('2026-07-10'),
	pxPerDay: 1,
	padTop: 100,
	padBottom: 200,
};

describe('dayOf / isoOf', () => {
	it('round-trips', () => {
		expect(isoOf(dayOf('1964-10-10'))).toBe('1964-10-10');
		expect(isoOf(dayOf('1868-01-01'))).toBe('1868-01-01');
	});

	it('computes the day difference correctly', () => {
		expect(dayOf('1970-01-02') - dayOf('1970-01-01')).toBe(1);
		expect(dayOf('1970-01-01')).toBe(0);
		expect(dayOf('1969-12-31')).toBe(-1);
	});
});

describe('clampPxPerDay', () => {
	it('keeps in-range values and clamps the rest', () => {
		expect(clampPxPerDay(1)).toBe(1);
		expect(clampPxPerDay(0)).toBe(MIN_PX_PER_DAY);
		expect(clampPxPerDay(1e9)).toBe(MAX_PX_PER_DAY);
	});
});

describe('dayToY / yToDay', () => {
	it('the latest day sits at padTop and older days go lower', () => {
		expect(dayToY(scale, scale.maxDay)).toBe(100);
		expect(dayToY(scale, scale.maxDay - 10)).toBe(110);
	});

	it('round-trips', () => {
		const y = dayToY(scale, dayOf('1964-10-10'));
		expect(yToDay(scale, y)).toBeCloseTo(dayOf('1964-10-10'));
	});
});

describe('totalHeight', () => {
	it('range x zoom + padding', () => {
		expect(totalHeight(scale)).toBe(100 + (scale.maxDay - scale.minDay) + 200);
	});
});

describe('zoomAt', () => {
	it('keeps the date at the anchor position', () => {
		const scrollTop = 5000;
		const anchorY = 300;
		const dayAtAnchor = yToDay(scale, scrollTop + anchorY);
		const { scale: next, scrollTop: nextTop } = zoomAt(scale, scrollTop, anchorY, 2);
		expect(next.pxPerDay).toBe(2);
		expect(yToDay(next, nextTop + anchorY)).toBeCloseTo(dayAtAnchor);
	});

	it('clamps the zoom and never makes scrollTop negative', () => {
		const { scale: next, scrollTop } = zoomAt(scale, 0, 0, 1e9);
		expect(next.pxPerDay).toBe(MAX_PX_PER_DAY);
		expect(scrollTop).toBeGreaterThanOrEqual(0);
	});
});

describe('visibleDayRange', () => {
	it('fromDay is the newer side and toDay the older side', () => {
		const { fromDay, toDay } = visibleDayRange(scale, 100, 500);
		expect(fromDay).toBe(scale.maxDay);
		expect(toDay).toBe(scale.maxDay - 500);
		expect(fromDay).toBeGreaterThan(toDay);
	});
});
