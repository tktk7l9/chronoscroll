import { describe, expect, it } from 'vitest';
import { isVolatileYear } from './cache-policy.ts';

describe('isVolatileYear', () => {
	it('skips the cache for the current year because it is edited daily', () => {
		expect(isVolatileYear(2026, '2026-08-07')).toBe(true);
	});

	it('skips the cache for the previous year because December is added in the new year', () => {
		expect(isVolatileYear(2025, '2026-08-07')).toBe(true);
	});

	it('uses the cache for 2+ years ago because the content is settled', () => {
		expect(isVolatileYear(2024, '2026-08-07')).toBe(false);
		expect(isVolatileYear(1945, '2026-08-07')).toBe(false);
	});

	it('skips the cache for future years (when --to points ahead)', () => {
		expect(isVolatileYear(2027, '2026-08-07')).toBe(true);
	});

	it('keeps the previous year volatile right after the new year', () => {
		expect(isVolatileYear(2026, '2027-01-02')).toBe(true);
		expect(isVolatileYear(2025, '2027-01-02')).toBe(false);
	});
});
