import { describe, expect, it } from 'vitest';
import { isMassDelete, parseManifest, planSync, sha256 } from './r2-plan.mjs';

describe('planSync', () => {
	it('put for new/changed, del for removed, skip for unchanged (key order)', () => {
		const local = { 'e/b.html': 'h2', 'e/a.html': 'h1', 'e/c.html': 'h3-new' };
		const remote = { 'e/a.html': 'h1', 'e/c.html': 'h3', 'e/z.html': 'gone' };
		expect(planSync(local, remote)).toEqual({
			put: ['e/b.html', 'e/c.html'],
			del: ['e/z.html'],
			skip: ['e/a.html'],
		});
	});
	it('put everything when remote is empty', () => {
		expect(planSync({ 'e/a.html': 'h1' }, {})).toEqual({ put: ['e/a.html'], del: [], skip: [] });
	});
});

describe('sha256', () => {
	it('64 hex digits', () => {
		expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
});

describe('isMassDelete', () => {
	it('always false when remote has 0 objects', () => {
		expect(isMassDelete({ del: [] }, 0, 0)).toBe(false);
		expect(isMassDelete({ del: ['e/a.html'] }, 5, 0)).toBe(false);
	});
	it('true when local is empty and remote is not', () => {
		expect(isMassDelete({ del: [] }, 0, 5)).toBe(true);
	});
	it('true when del exceeds 10% of remote', () => {
		expect(isMassDelete({ del: ['a', 'b'] }, 8, 10)).toBe(true);
	});
	it('false when del is exactly 10% of remote', () => {
		expect(isMassDelete({ del: ['a'] }, 9, 10)).toBe(false);
	});
	it('false when del is 0', () => {
		expect(isMassDelete({ del: [] }, 10, 10)).toBe(false);
	});
});

describe('parseManifest', () => {
	it('keeps an object as is', () => {
		expect(parseManifest('{"e/a.html":"h1"}')).toEqual({ 'e/a.html': 'h1' });
	});
	it('treats a broken manifest as empty', () => {
		expect(parseManifest('{not json')).toEqual({});
		expect(parseManifest('[1,2]')).toEqual({});
		expect(parseManifest('null')).toEqual({});
	});
});
