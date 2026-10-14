import { describe, expect, it } from 'vitest';
import { lowerModulePreloadPriority } from './preload-priority';

describe('lowerModulePreloadPriority', () => {
	it('adds fetchpriority="low" to every modulepreload link SvelteKit writes', () => {
		const html =
			'<head><link href="/_app/immutable/bundle.D3rjooMh.js" rel="modulepreload">' +
			'<link rel="modulepreload" href="/x.js" />' +
			'<link href="/_app/immutable/assets/bundle.css" rel="stylesheet"></head>';
		expect(lowerModulePreloadPriority(html)).toBe(
			'<head><link href="/_app/immutable/bundle.D3rjooMh.js" rel="modulepreload" fetchpriority="low">' +
				'<link rel="modulepreload" href="/x.js" fetchpriority="low">' +
				'<link href="/_app/immutable/assets/bundle.css" rel="stylesheet"></head>',
		);
	});

	it('keeps a priority that is already set and leaves other links alone', () => {
		const html = '<link rel="modulepreload" href="/a.js" fetchpriority="high"><link rel="preload" href="/d.json" as="fetch">';
		expect(lowerModulePreloadPriority(html)).toBe(html);
	});
});
