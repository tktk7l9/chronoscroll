import { describe, expect, it } from 'vitest';
import { nextDelay, retryDelayMs, isRetryableError } from './throttle.ts';

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

describe('retryDelayMs', () => {
	it('指数バックオフ（2秒×3^n）で 6 回まで', () => {
		expect(retryDelayMs(0)).toBe(2000);
		expect(retryDelayMs(1)).toBe(6000);
		expect(retryDelayMs(2)).toBe(18000);
		expect(retryDelayMs(3)).toBe(54000);
	});

	it('上限 60 秒で頭打ち', () => {
		expect(retryDelayMs(4)).toBe(60000);
		expect(retryDelayMs(5)).toBe(60000);
	});

	it('6 回目以降は null（諦める）', () => {
		expect(retryDelayMs(6)).toBeNull();
		expect(retryDelayMs(10)).toBeNull();
	});

	it('Retry-After が指定されていればそちらを優先（上限 120 秒）', () => {
		expect(retryDelayMs(0, 30)).toBe(30000);
		expect(retryDelayMs(3, 5)).toBe(54000);
		expect(retryDelayMs(0, 600)).toBe(120000);
		expect(retryDelayMs(6, 30)).toBeNull();
	});

	it('Retry-After が不正なら無視する', () => {
		expect(retryDelayMs(0, NaN)).toBe(2000);
		expect(retryDelayMs(0, -5)).toBe(2000);
	});
});

describe('isRetryableError', () => {
	it('レート制限・過負荷・ネットワーク断は再試行する', () => {
		expect(isRetryableError('HTTP 429')).toBe(true);
		expect(isRetryableError('HTTP 503')).toBe(true);
		expect(isRetryableError('maxlag')).toBe(true);
		expect(isRetryableError('fetch failed')).toBe(true);
		expect(isRetryableError('read ECONNRESET')).toBe(true);
		expect(isRetryableError('The operation was aborted due to timeout')).toBe(true);
	});

	it('存在しないページなどの API エラーや 4xx は再試行しない', () => {
		expect(isRetryableError("API error: missingtitle The page you specified doesn't exist.")).toBe(false);
		expect(isRetryableError('HTTP 404 (https://ja.wikipedia.org/w/api.php)')).toBe(false);
		expect(isRetryableError('HTTP 400 (x)')).toBe(false);
		expect(isRetryableError('API error: invalidtitle Bad title')).toBe(false);
	});
});
