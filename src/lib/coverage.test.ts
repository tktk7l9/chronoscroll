import { describe, expect, it } from 'vitest';
import { formatCount, formatEventDate, formatJpDate } from './coverage.ts';

describe('formatCount', () => {
	it('3桁ごとに区切る', () => {
		expect(formatCount(27014)).toBe('27,014');
		expect(formatCount(1234567)).toBe('1,234,567');
	});

	it('区切り不要な桁数はそのまま返す', () => {
		expect(formatCount(0)).toBe('0');
		expect(formatCount(999)).toBe('999');
	});

	it('桁数の境界で余分なカンマを付けない', () => {
		expect(formatCount(1000)).toBe('1,000');
		expect(formatCount(999999)).toBe('999,999');
		expect(formatCount(1000000)).toBe('1,000,000');
	});
});

describe('formatJpDate', () => {
	it('ISO日付を「1868年1月1日」形式にする', () => {
		expect(formatJpDate('1868-01-01')).toBe('1868年1月1日');
		expect(formatJpDate('2026-07-10')).toBe('2026年7月10日');
	});

	it('月日のゼロ埋めを外す', () => {
		expect(formatJpDate('1964-10-10')).toBe('1964年10月10日');
		expect(formatJpDate('2011-03-11')).toBe('2011年3月11日');
	});
});

describe('formatEventDate', () => {
	it('precisionがdayなら年月日まで出す', () => {
		expect(formatEventDate('1963-01-01', 'day')).toBe('1963年1月1日');
	});

	it('precisionがmonthなら埋めた日を見せない', () => {
		expect(formatEventDate('1950-10-01', 'month')).toBe('1950年10月');
	});

	it('precisionがyearなら年だけ出す', () => {
		expect(formatEventDate('1975-01-01', 'year')).toBe('1975年');
	});
});
