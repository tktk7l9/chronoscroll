import { describe, expect, it } from 'vitest';
import { parseManifest, planSync, sha256 } from './r2-plan.mjs';

describe('planSync', () => {
	it('新規・変更は put、無くなったものは del、同じものは skip（キー順）', () => {
		const local = { 'e/b.html': 'h2', 'e/a.html': 'h1', 'e/c.html': 'h3-new' };
		const remote = { 'e/a.html': 'h1', 'e/c.html': 'h3', 'e/z.html': 'gone' };
		expect(planSync(local, remote)).toEqual({
			put: ['e/b.html', 'e/c.html'],
			del: ['e/z.html'],
			skip: ['e/a.html'],
		});
	});
	it('remote が空なら全件 put', () => {
		expect(planSync({ 'e/a.html': 'h1' }, {})).toEqual({ put: ['e/a.html'], del: [], skip: [] });
	});
});

describe('sha256', () => {
	it('16進 64 桁', () => {
		expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
});

describe('parseManifest', () => {
	it('オブジェクトはそのまま', () => {
		expect(parseManifest('{"e/a.html":"h1"}')).toEqual({ 'e/a.html': 'h1' });
	});
	it('壊れた manifest は空扱い', () => {
		expect(parseManifest('{not json')).toEqual({});
		expect(parseManifest('[1,2]')).toEqual({});
		expect(parseManifest('null')).toEqual({});
	});
});
