import { describe, expect, it } from 'vitest';
import {
	collectionDetailPath,
	collectionPath,
	fitZoom,
	isCollectionSlug,
	TARGET_SPAN_PX,
	timelineHref,
} from './collections.ts';
import { MAX_PX_PER_DAY, MIN_PX_PER_DAY } from './timescale.ts';

describe('isCollectionSlug', () => {
	it('allows lowercase letters, digits and hyphens', () => {
		expect(isCollectionSlug('anime')).toBe(true);
		expect(isCollectionSlug('ai-tech')).toBe(true);
		expect(isCollectionSlug('b2')).toBe(true);
	});

	it('rejects empty, too long and invalid characters', () => {
		expect(isCollectionSlug('')).toBe(false);
		expect(isCollectionSlug('a'.repeat(65))).toBe(false);
		expect(isCollectionSlug('Anime')).toBe(false);
		expect(isCollectionSlug('a_b')).toBe(false);
		expect(isCollectionSlug('../etc')).toBe(false);
	});
});

describe('collectionDetailPath / collectionPath', () => {
	it('builds the data path and the page path', () => {
		expect(collectionDetailPath('anime')).toBe('/data/collections/anime.json');
		expect(collectionPath('anime')).toBe('/c/anime');
	});
});

describe('fitZoom', () => {
	it('returns the target height divided by the span', () => {
		// A period of exactly 1000 days
		const z = fitZoom('2000-01-01', '2002-09-27');
		expect(z).toBeCloseTo(TARGET_SPAN_PX / 1000, 6);
	});

	it('clamps too long spans to the minimum and too short spans to the maximum', () => {
		expect(fitZoom('1829-01-01', '2026-07-10')).toBe(MIN_PX_PER_DAY);
		expect(fitZoom('2024-08-09', '2024-08-10')).toBe(MAX_PX_PER_DAY);
	});

	it('does not break on a zero or reversed span', () => {
		expect(fitZoom('2000-01-01', '2000-01-01')).toBe(MAX_PX_PER_DAY);
		expect(fitZoom('2000-01-01', '1999-01-01')).toBe(MAX_PX_PER_DAY);
	});
});

describe('timelineHref', () => {
	it('builds a URL with the slug, the latest event date and the fit zoom', () => {
		expect(timelineHref('anime', '1917-06-30', '2020-12-28')).toBe(
			'/?k=anime&t=2020-12-28&z=0.0688',
		);
	});

	it('keeps a clamped zoom as is', () => {
		expect(timelineHref('houseplant', '1829-01-01', '2022-01-01')).toContain(`z=${MIN_PX_PER_DAY}`);
	});
});
