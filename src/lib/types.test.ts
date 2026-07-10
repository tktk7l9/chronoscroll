import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_LABELS, REGION_LABELS } from './types.ts';

describe('カテゴリ/地域の定数', () => {
	it('全カテゴリに日本語ラベルがある', () => {
		for (const cat of CATEGORIES) {
			expect(CATEGORY_LABELS[cat]).toBeTruthy();
		}
		expect(Object.keys(CATEGORY_LABELS)).toHaveLength(CATEGORIES.length);
	});

	it('全地域に日本語ラベルがある', () => {
		expect(REGION_LABELS.japan).toBe('日本');
		expect(REGION_LABELS.world).toBe('世界');
		expect(REGION_LABELS.both).toBe('日本・世界');
	});
});
