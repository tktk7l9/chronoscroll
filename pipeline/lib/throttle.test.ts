import { describe, expect, it } from 'vitest';
import { nextDelay, retryDelayMs, isRetryableError } from './throttle.ts';

describe('nextDelay', () => {
	it('no wait when the interval has passed', () => {
		expect(nextDelay(1000, 2000, 500)).toBe(0);
		expect(nextDelay(1000, 1500, 500)).toBe(0);
	});

	it('returns the remaining time when the interval is short', () => {
		expect(nextDelay(1000, 1200, 500)).toBe(300);
		expect(nextDelay(1000, 1000, 500)).toBe(500);
	});
});

describe('retryDelayMs', () => {
	it('exponential backoff (2s x 3^n) up to 6 times', () => {
		expect(retryDelayMs(0)).toBe(2000);
		expect(retryDelayMs(1)).toBe(6000);
		expect(retryDelayMs(2)).toBe(18000);
		expect(retryDelayMs(3)).toBe(54000);
	});

	it('caps at 60 seconds', () => {
		expect(retryDelayMs(4)).toBe(60000);
		expect(retryDelayMs(5)).toBe(60000);
	});

	it('null from the 6th attempt (gives up)', () => {
		expect(retryDelayMs(6)).toBeNull();
		expect(retryDelayMs(10)).toBeNull();
	});

	it('prefers Retry-After when given (max 120 seconds)', () => {
		expect(retryDelayMs(0, 30)).toBe(30000);
		expect(retryDelayMs(3, 5)).toBe(54000);
		expect(retryDelayMs(0, 600)).toBe(120000);
		expect(retryDelayMs(6, 30)).toBeNull();
	});

	it('ignores an invalid Retry-After', () => {
		expect(retryDelayMs(0, NaN)).toBe(2000);
		expect(retryDelayMs(0, -5)).toBe(2000);
	});
});

describe('isRetryableError', () => {
	it('retries on rate limits, overload and network errors', () => {
		expect(isRetryableError('HTTP 429')).toBe(true);
		expect(isRetryableError('HTTP 503')).toBe(true);
		expect(isRetryableError('maxlag')).toBe(true);
		expect(isRetryableError('fetch failed')).toBe(true);
		expect(isRetryableError('read ECONNRESET')).toBe(true);
		expect(isRetryableError('The operation was aborted due to timeout')).toBe(true);
	});

	it('does not retry API errors such as a missing page or 4xx', () => {
		expect(isRetryableError("API error: missingtitle The page you specified doesn't exist.")).toBe(false);
		expect(isRetryableError('HTTP 404 (https://ja.wikipedia.org/w/api.php)')).toBe(false);
		expect(isRetryableError('HTTP 400 (x)')).toBe(false);
		expect(isRetryableError('API error: invalidtitle Bad title')).toBe(false);
	});
});
