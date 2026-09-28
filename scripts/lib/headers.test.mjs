import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CACHE_RULES, renderHeadersFile } from './headers.mjs';

const security = JSON.parse(readFileSync('config/security-headers.json', 'utf8'));

describe('renderHeadersFile', () => {
	it('adds security headers to all paths', () => {
		const out = renderHeadersFile({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' });
		expect(out).toContain('/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n');
	});

	it('adds Cache-Control to data and immutable assets', () => {
		const out = renderHeadersFile({});
		expect(CACHE_RULES).toEqual([
			['/data/*', 'public, max-age=3600, stale-while-revalidate=86400'],
			['/_app/immutable/*', 'public, max-age=31536000, immutable'],
		]);
		expect(out).toContain('\n/data/*\n  Cache-Control: public, max-age=3600, stale-while-revalidate=86400\n');
		expect(out).toContain('\n/_app/immutable/*\n  Cache-Control: public, max-age=31536000, immutable\n');
	});

	it('static/_headers matches the content generated from JSON (drift check)', () => {
		expect(readFileSync('static/_headers', 'utf8')).toBe(renderHeadersFile(security));
	});
});
