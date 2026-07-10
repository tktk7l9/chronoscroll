import { describe, expect, it } from 'vitest';
import { nextDelay } from './throttle.ts';

describe('nextDelay', () => {
	it('間隔が空いていれば待機不要', () => {
		expect(nextDelay(1000, 2000, 500)).toBe(0);
		expect(nextDelay(1000, 1500, 500)).toBe(0);
	});

	it('間隔が足りなければ残り時間を返す', () => {
		expect(nextDelay(1000, 1200, 500)).toBe(300);
		expect(nextDelay(1000, 1000, 500)).toBe(500);
	});
});
