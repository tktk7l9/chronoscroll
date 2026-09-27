import { describe, expect, it } from 'vitest';
import { SITE_ORIGIN, absoluteUrl } from './site';

describe('site', () => {
	it('SITE_ORIGIN は https で末尾スラッシュなし', () => {
		expect(SITE_ORIGIN).toBe('https://chronoscroll.saitotakuya0719.workers.dev');
		expect(SITE_ORIGIN.endsWith('/')).toBe(false);
	});

	it('absoluteUrl は先頭スラッシュの有無を吸収する', () => {
		expect(absoluteUrl('/e/2011-03-11-x')).toBe(`${SITE_ORIGIN}/e/2011-03-11-x`);
		expect(absoluteUrl('ogp.png')).toBe(`${SITE_ORIGIN}/ogp.png`);
		expect(absoluteUrl('/')).toBe(`${SITE_ORIGIN}/`);
	});
});
