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
	it('英小文字・数字・ハイフンを許す', () => {
		expect(isCollectionSlug('anime')).toBe(true);
		expect(isCollectionSlug('ai-tech')).toBe(true);
		expect(isCollectionSlug('b2')).toBe(true);
	});

	it('空・長すぎ・使えない文字を弾く', () => {
		expect(isCollectionSlug('')).toBe(false);
		expect(isCollectionSlug('a'.repeat(65))).toBe(false);
		expect(isCollectionSlug('Anime')).toBe(false);
		expect(isCollectionSlug('a_b')).toBe(false);
		expect(isCollectionSlug('../etc')).toBe(false);
	});
});

describe('collectionDetailPath / collectionPath', () => {
	it('配信パスとページパスを組み立てる', () => {
		expect(collectionDetailPath('anime')).toBe('/data/collections/anime.json');
		expect(collectionPath('anime')).toBe('/c/anime');
	});
});

describe('fitZoom', () => {
	it('目標高さを期間で割った値を返す', () => {
		// 1000日ちょうどの期間
		const z = fitZoom('2000-01-01', '2002-09-27');
		expect(z).toBeCloseTo(TARGET_SPAN_PX / 1000, 6);
	});

	it('長すぎる期間は下限に、短すぎる期間は上限にclampされる', () => {
		expect(fitZoom('1829-01-01', '2026-07-10')).toBe(MIN_PX_PER_DAY);
		expect(fitZoom('2024-08-09', '2024-08-10')).toBe(MAX_PX_PER_DAY);
	});

	it('期間ゼロや逆転でも破綻しない', () => {
		expect(fitZoom('2000-01-01', '2000-01-01')).toBe(MAX_PX_PER_DAY);
		expect(fitZoom('2000-01-01', '1999-01-01')).toBe(MAX_PX_PER_DAY);
	});
});

describe('timelineHref', () => {
	it('slugと最新のできごとの日付・fitズームを載せたURLを作る', () => {
		expect(timelineHref('anime', '1917-06-30', '2020-12-28')).toBe(
			'/?k=anime&t=2020-12-28&z=0.0688',
		);
	});

	it('clampされたズームもそのまま載る', () => {
		expect(timelineHref('houseplant', '1829-01-01', '2022-01-01')).toContain(`z=${MIN_PX_PER_DAY}`);
	});
});
