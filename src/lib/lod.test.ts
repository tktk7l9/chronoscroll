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
	it('端点が0と1に対応する', () => {
		expect(zoomToT(MIN_PX_PER_DAY)).toBe(0);
		expect(zoomToT(MAX_PX_PER_DAY)).toBe(1);
		expect(tToZoom(0)).toBeCloseTo(MIN_PX_PER_DAY);
		expect(tToZoom(1)).toBeCloseTo(MAX_PX_PER_DAY);
	});

	it('往復変換できる（対数スケール）', () => {
		for (const px of [0.1, 1, 8, 50]) {
			expect(tToZoom(zoomToT(px))).toBeCloseTo(px);
		}
	});

	it('範囲外はクランプされる', () => {
		expect(zoomToT(0.001)).toBe(0);
		expect(zoomToT(1000)).toBe(1);
		expect(tToZoom(-1)).toBeCloseTo(MIN_PX_PER_DAY);
		expect(tToZoom(2)).toBeCloseTo(MAX_PX_PER_DAY);
	});
});

describe('ZOOM_STOPS', () => {
	it('各目盛りの代表値はそのレベル帯に属する', () => {
		for (const s of ZOOM_STOPS) {
			expect(zoomLevelLabel(s.pxPerDay)).toBe(s.label);
		}
	});

	it('目盛りはズームイン方向へ単調増加', () => {
		for (let i = 1; i < ZOOM_STOPS.length; i++) {
			expect(ZOOM_STOPS[i].pxPerDay).toBeGreaterThan(ZOOM_STOPS[i - 1].pxPerDay);
		}
	});
});

describe('importanceThreshold', () => {
	// 実データ相当: 約1.5万件 / 158年 ≈ 0.26件/日
	const eventsPerDay = 0.26;

	it('概観ズームではほぼ最上位のみ', () => {
		const t = importanceThreshold(0.05, eventsPerDay);
		expect(t).toBeGreaterThan(99);
		expect(t).toBeLessThanOrEqual(100);
	});

	it('ズームインするほど閾値が下がる', () => {
		const t1 = importanceThreshold(0.05, eventsPerDay);
		const t2 = importanceThreshold(1, eventsPerDay);
		const t3 = importanceThreshold(10, eventsPerDay);
		expect(t2).toBeLessThan(t1);
		expect(t3).toBeLessThan(t2);
	});

	it('最大ズームでは全件表示（0）', () => {
		expect(importanceThreshold(96, eventsPerDay)).toBe(0);
	});

	it('eventsPerDay=0 のガード', () => {
		expect(importanceThreshold(1, 0)).toBe(0);
	});
});

describe('zoomLevelLabel', () => {
	it('px/日の帯でラベルが変わる', () => {
		expect(zoomLevelLabel(0.05)).toBe('概観');
		expect(zoomLevelLabel(0.5)).toBe('十年');
		expect(zoomLevelLabel(3)).toBe('年');
		expect(zoomLevelLabel(20)).toBe('月');
		expect(zoomLevelLabel(96)).toBe('日');
	});
});

describe('tickStepYears', () => {
	it('ズームに応じて目盛りが細かくなる', () => {
		expect(tickStepYears(0.04)).toBe(50);
		expect(tickStepYears(0.06)).toBe(10);
		expect(tickStepYears(0.15)).toBe(5);
		expect(tickStepYears(1)).toBe(1);
	});
});

describe('needsChunkData', () => {
	// 実データ相当: 27,014件 / 158年 ≈ 0.467件/日
	const eventsPerDay = 0.467;

	it('概観〜十年ズームでは閾値がoverview.jsonのカットオフを上回るため不要', () => {
		expect(needsChunkData(0.077, eventsPerDay)).toBe(false); // 概観
		expect(needsChunkData(0.42, eventsPerDay)).toBe(false); // 十年
	});

	it('年ズーム以降は閾値が下回るため必要になる', () => {
		expect(needsChunkData(3.1, eventsPerDay)).toBe(true); // 年
		expect(needsChunkData(17.9, eventsPerDay)).toBe(true); // 月
		expect(needsChunkData(62, eventsPerDay)).toBe(true); // 日
	});

	it('境界: importanceThresholdがちょうどカットオフのときは不要（未満のみ必要）', () => {
		expect(needsChunkData(1, eventsPerDay, importanceThreshold(1, eventsPerDay))).toBe(false);
	});

	it('カスタムのoverviewMinImportanceを指定できる', () => {
		// カットオフを引き上げるほど「閾値がそれを下回る」ズームが広がり、必要判定されやすくなる
		expect(needsChunkData(0.42, eventsPerDay, 99.5)).toBe(true);
		// 逆にカットオフを下げれば、同じズームでも不要のまま
		expect(needsChunkData(0.42, eventsPerDay, 50)).toBe(false);
	});

	it('OVERVIEW_MIN_IMPORTANCEはデフォルト値と一致する', () => {
		expect(needsChunkData(3.1, eventsPerDay)).toBe(
			importanceThreshold(3.1, eventsPerDay) < OVERVIEW_MIN_IMPORTANCE,
		);
	});
});
