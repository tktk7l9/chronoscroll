import { describe, expect, it } from 'vitest';
import { isVolatileYear } from './cache-policy.ts';

describe('isVolatileYear', () => {
	it('当年は日々編集されるのでキャッシュを使わない', () => {
		expect(isVolatileYear(2026, '2026-08-07')).toBe(true);
	});

	it('前年は12月分が翌年になってから追記されるのでキャッシュを使わない', () => {
		expect(isVolatileYear(2025, '2026-08-07')).toBe(true);
	});

	it('2年以上前は内容が固まっているのでキャッシュを使う', () => {
		expect(isVolatileYear(2024, '2026-08-07')).toBe(false);
		expect(isVolatileYear(1945, '2026-08-07')).toBe(false);
	});

	it('未来の年（--to で先を指定した場合）もキャッシュを使わない', () => {
		expect(isVolatileYear(2027, '2026-08-07')).toBe(true);
	});

	it('年またぎ直後も前年が揮発扱いのままになる', () => {
		expect(isVolatileYear(2026, '2027-01-02')).toBe(true);
		expect(isVolatileYear(2025, '2027-01-02')).toBe(false);
	});
});
