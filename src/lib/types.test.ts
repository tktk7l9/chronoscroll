import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_LABELS, REGION_LABELS } from './types.ts';

describe('category/region constants', () => {
	it('every category has a Japanese label', () => {
		for (const cat of CATEGORIES) {
			expect(CATEGORY_LABELS[cat]).toBeTruthy();
		}
		expect(Object.keys(CATEGORY_LABELS)).toHaveLength(CATEGORIES.length);
	});

	it('every region has a Japanese label', () => {
		expect(REGION_LABELS.japan).toBe('日本');
		expect(REGION_LABELS.world).toBe('世界');
		expect(REGION_LABELS.both).toBe('日本・世界');
	});
});
