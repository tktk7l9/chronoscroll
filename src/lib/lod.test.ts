import { describe, expect, it } from 'vitest';
import {
	OVERVIEW_MIN_IMPORTANCE,
	ZOOM_STOPS,
	importanceThreshold,
	needsChunkData,
	tToZoom,
	tickStepYears,
	zoomLevelLabel,
	zoomToT,
} from './lod.ts';
import { MAX_PX_PER_DAY, MIN_PX_PER_DAY } from './timescale.ts';

describe('zoomToT / tToZoom', () => {
	it('maps the endpoints to 0 and 1', () => {
		expect(zoomToT(MIN_PX_PER_DAY)).toBe(0);
		expect(zoomToT(MAX_PX_PER_DAY)).toBe(1);
		expect(tToZoom(0)).toBeCloseTo(MIN_PX_PER_DAY);
		expect(tToZoom(1)).toBeCloseTo(MAX_PX_PER_DAY);
	});

	it('round-trips (log scale)', () => {
		for (const px of [0.1, 1, 8, 50]) {
			expect(tToZoom(zoomToT(px))).toBeCloseTo(px);
		}
	});

	it('clamps out-of-range values', () => {
		expect(zoomToT(0.001)).toBe(0);
		expect(zoomToT(1000)).toBe(1);
		expect(tToZoom(-1)).toBeCloseTo(MIN_PX_PER_DAY);
		expect(tToZoom(2)).toBeCloseTo(MAX_PX_PER_DAY);
	});
});

describe('ZOOM_STOPS', () => {
	it('each stop value belongs to its level band', () => {
		for (const s of ZOOM_STOPS) {
			expect(zoomLevelLabel(s.pxPerDay)).toBe(s.label);
		}
	});

	it('stops increase monotonically toward zoom-in', () => {
		for (let i = 1; i < ZOOM_STOPS.length; i++) {
			expect(ZOOM_STOPS[i].pxPerDay).toBeGreaterThan(ZOOM_STOPS[i - 1].pxPerDay);
		}
	});
});

describe('importanceThreshold', () => {
	// Equivalent to real data: about 15,000 events / 158 years ≈ 0.26 events/day
	const eventsPerDay = 0.26;

	it('overview zoom shows almost only the top events', () => {
		const t = importanceThreshold(0.05, eventsPerDay);
		expect(t).toBeGreaterThan(99);
		expect(t).toBeLessThanOrEqual(100);
	});

	it('the threshold drops as you zoom in', () => {
		const t1 = importanceThreshold(0.05, eventsPerDay);
		const t2 = importanceThreshold(1, eventsPerDay);
		const t3 = importanceThreshold(10, eventsPerDay);
		expect(t2).toBeLessThan(t1);
		expect(t3).toBeLessThan(t2);
	});

	it('max zoom shows everything (0)', () => {
		expect(importanceThreshold(96, eventsPerDay)).toBe(0);
	});

	it('max zoom shows everything even in dense eras (no event stays hidden forever)', () => {
		// The actual density of the 2020s is about 1.67 events/day. Using the local density as is, even at max zoom
		// the threshold only drops to about 48, and roughly the lower half is never shown at any zoom
		expect(importanceThreshold(MAX_PX_PER_DAY, 1.67)).toBe(0);
		expect(importanceThreshold(MAX_PX_PER_DAY, 100)).toBe(0);
	});

	it('clamping density keeps monotonicity toward zoom-out', () => {
		expect(importanceThreshold(3.1, 1.67)).toBeGreaterThan(importanceThreshold(17.9, 1.67));
		expect(importanceThreshold(17.9, 1.67)).toBeGreaterThan(importanceThreshold(62, 1.67));
	});

	it('guards eventsPerDay=0', () => {
		expect(importanceThreshold(1, 0)).toBe(0);
	});
});

describe('zoomLevelLabel', () => {
	it('the label changes by px/day band', () => {
		expect(zoomLevelLabel(0.05)).toBe('概観');
		expect(zoomLevelLabel(0.5)).toBe('十年');
		expect(zoomLevelLabel(3)).toBe('年');
		expect(zoomLevelLabel(20)).toBe('月');
		expect(zoomLevelLabel(96)).toBe('日');
	});
});

describe('tickStepYears', () => {
	it('ticks get finer with zoom', () => {
		expect(tickStepYears(0.04)).toBe(50);
		expect(tickStepYears(0.06)).toBe(10);
		expect(tickStepYears(0.15)).toBe(5);
		expect(tickStepYears(1)).toBe(1);
	});
});

describe('needsChunkData', () => {
	// Equivalent to real data: 27,014 events / 158 years ≈ 0.467 events/day
	const eventsPerDay = 0.467;

	it('not needed at overview to decade zoom because the threshold exceeds the overview.json cutoff', () => {
		expect(needsChunkData(0.077, eventsPerDay)).toBe(false); // overview
		expect(needsChunkData(0.42, eventsPerDay)).toBe(false); // decade
	});

	it('needed from year zoom on because the threshold falls below the cutoff', () => {
		expect(needsChunkData(3.1, eventsPerDay)).toBe(true); // year
		expect(needsChunkData(17.9, eventsPerDay)).toBe(true); // month
		expect(needsChunkData(62, eventsPerDay)).toBe(true); // day
	});

	it('boundary: not needed when importanceThreshold equals the cutoff (needed only below)', () => {
		expect(needsChunkData(1, eventsPerDay, importanceThreshold(1, eventsPerDay))).toBe(false);
	});

	it('accepts a custom overviewMinImportance', () => {
		// The higher the cutoff, the wider the range of zooms where "the threshold drops below it", so it is more likely judged necessary
		expect(needsChunkData(0.42, eventsPerDay, 99.5)).toBe(true);
		// Conversely, lowering the cutoff keeps it unnecessary at the same zoom
		expect(needsChunkData(0.42, eventsPerDay, 50)).toBe(false);
	});

	it('OVERVIEW_MIN_IMPORTANCE matches the default', () => {
		expect(needsChunkData(3.1, eventsPerDay)).toBe(
			importanceThreshold(3.1, eventsPerDay) < OVERVIEW_MIN_IMPORTANCE,
		);
	});
});
