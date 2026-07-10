import { describe, expect, it } from 'vitest';
import { importanceThreshold, tickStepYears, zoomLevelLabel } from './lod.ts';

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
