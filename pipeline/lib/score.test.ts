import { describe, expect, it } from 'vitest';
import {
	GEO_WEIGHT,
	SITELINK_CAP,
	decadeOf,
	idfWeight,
	isGeoLikeTarget,
	linkScore,
	lowerBound,
	percentileByDecade,
	rawScore,
	upperBound,
} from './score.ts';

describe('isGeoLikeTarget', () => {
	it('matches the country and city list', () => {
		expect(isGeoLikeTarget('アメリカ')).toBe(true);
		expect(isGeoLikeTarget('スイス')).toBe(true);
		expect(isGeoLikeTarget('東京')).toBe(true);
	});

	it('matches suffix patterns (republic, prefecture, language, etc.)', () => {
		expect(isGeoLikeTarget('アイルランド自由国')).toBe(true);
		expect(isGeoLikeTarget('ワイマール共和国')).toBe(true);
		expect(isGeoLikeTarget('神奈川県')).toBe(true);
		expect(isGeoLikeTarget('チェコ語')).toBe(true);
	});

	it('does not treat event-specific articles as places', () => {
		expect(isGeoLikeTarget('関東大震災')).toBe(false);
		expect(isGeoLikeTarget('1964年東京オリンピック')).toBe(false);
		expect(isGeoLikeTarget('源氏物語')).toBe(false);
	});
});

describe('linkScore', () => {
	it('caps the sitelink count at CAP', () => {
		expect(linkScore('関東大震災', 400, 1)).toBe(SITELINK_CAP);
		expect(linkScore('関東大震災', 80, 1)).toBe(80);
	});

	it('dampens place-like links', () => {
		expect(linkScore('アメリカ', 100, 1)).toBeCloseTo(100 * GEO_WEIGHT);
	});

	it('dampens frequent links by IDF', () => {
		expect(linkScore('何かの記事', 100, 100)).toBeLessThan(linkScore('何かの記事', 100, 2));
	});

	it('page views complement sitelinks (counters the ja article-split bias)', () => {
		// Even with sitelinks=3, 1500 views/day lifts it up to the 150 equivalent (CAP)
		expect(linkScore('関東大震災', 3, 1, 1500)).toBe(SITELINK_CAP);
		// If both are low, it stays low
		expect(linkScore('マイナー記事', 3, 1, 20)).toBe(3);
	});
});

describe('idfWeight', () => {
	it('1 at df=1, lower the more frequent', () => {
		expect(idfWeight(1)).toBe(1);
		expect(idfWeight(100)).toBeLessThan(idfWeight(10));
		expect(idfWeight(1000)).toBeGreaterThan(0);
	});

	it('treats df=0 as 1 (guard)', () => {
		expect(idfWeight(0)).toBe(1);
	});
});

describe('rawScore', () => {
	it('0 without links', () => {
		expect(rawScore([])).toBe(0);
	});

	it('a single link gives only the max', () => {
		expect(rawScore([120])).toBe(120);
	});

	it('multiple links give max + 0.15 x runner-up', () => {
		expect(rawScore([100, 40, 10])).toBe(106);
		expect(rawScore([40, 100])).toBe(106);
	});
});

describe('decadeOf', () => {
	it('rounds to the decade', () => {
		expect(decadeOf(1964)).toBe(1960);
		expect(decadeOf(1870)).toBe(1870);
		expect(decadeOf(2026)).toBe(2020);
	});
});

describe('lowerBound / upperBound', () => {
	const arr = [1, 3, 3, 5, 9];
	it('lowerBound counts values below value', () => {
		expect(lowerBound(arr, 3)).toBe(1);
		expect(lowerBound(arr, 0)).toBe(0);
		expect(lowerBound(arr, 10)).toBe(5);
	});
	it('upperBound counts values at or below value', () => {
		expect(upperBound(arr, 3)).toBe(3);
		expect(upperBound(arr, 0)).toBe(0);
		expect(upperBound(arr, 9)).toBe(5);
	});
});

describe('percentileByDecade', () => {
	it('computes percentiles within each decade group', () => {
		const items = [
			{ id: 'a', year: 1960, raw: 10 },
			{ id: 'b', year: 1964, raw: 20 },
			{ id: 'c', year: 1969, raw: 30 },
			{ id: 'd', year: 1969, raw: 40 },
		];
		const m = percentileByDecade(items);
		expect(m.get('a')).toBe(12.5);
		expect(m.get('b')).toBe(37.5);
		expect(m.get('c')).toBe(62.5);
		expect(m.get('d')).toBe(87.5);
	});

	it('equal values get the same percentile', () => {
		const items = [
			{ id: 'a', year: 1900, raw: 5 },
			{ id: 'b', year: 1900, raw: 5 },
		];
		const m = percentileByDecade(items);
		expect(m.get('a')).toBe(50);
		expect(m.get('b')).toBe(50);
	});

	it('different decades do not affect each other', () => {
		const items = [
			{ id: 'old', year: 1870, raw: 1 },
			{ id: 'new1', year: 2020, raw: 100 },
			{ id: 'new2', year: 2020, raw: 200 },
		];
		const m = percentileByDecade(items);
		expect(m.get('old')).toBe(50);
		expect(m.get('new1')).toBe(25);
		expect(m.get('new2')).toBe(75);
	});
});
