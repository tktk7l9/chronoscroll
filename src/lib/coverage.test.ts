import { describe, expect, it } from 'vitest';
import { formatCount, formatEventDate, formatJpDate } from './coverage.ts';

describe('formatCount', () => {
	it('groups every 3 digits', () => {
		expect(formatCount(27014)).toBe('27,014');
		expect(formatCount(1234567)).toBe('1,234,567');
	});

	it('returns short numbers unchanged', () => {
		expect(formatCount(0)).toBe('0');
		expect(formatCount(999)).toBe('999');
	});

	it('adds no extra comma at digit boundaries', () => {
		expect(formatCount(1000)).toBe('1,000');
		expect(formatCount(999999)).toBe('999,999');
		expect(formatCount(1000000)).toBe('1,000,000');
	});
});

describe('formatJpDate', () => {
	it('formats an ISO date as 1868年1月1日', () => {
		expect(formatJpDate('1868-01-01')).toBe('1868年1月1日');
		expect(formatJpDate('2026-07-10')).toBe('2026年7月10日');
	});

	it('drops zero padding from month and day', () => {
		expect(formatJpDate('1964-10-10')).toBe('1964年10月10日');
		expect(formatJpDate('2011-03-11')).toBe('2011年3月11日');
	});
});

describe('formatEventDate', () => {
	it('shows year, month and day for day precision', () => {
		expect(formatEventDate('1963-01-01', 'day')).toBe('1963年1月1日');
	});

	it('hides the padded day for month precision', () => {
		expect(formatEventDate('1950-10-01', 'month')).toBe('1950年10月');
	});

	it('shows only the year for year precision', () => {
		expect(formatEventDate('1975-01-01', 'year')).toBe('1975年');
	});
});
