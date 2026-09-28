import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handle, pageHeaders, resolve, type PagesBucket } from './serve';

const security = JSON.parse(readFileSync('config/security-headers.json', 'utf8')) as Record<string, string>;

/** Minimal fake of the R2 binding. The ETag is the body length. Returns without a body if If-None-Match matches */
function bucket(pages: Record<string, string>, opts: { throws?: boolean } = {}): PagesBucket {
	return {
		async get(key, options) {
			if (opts.throws) throw new Error('r2 down');
			const html = pages[key];
			if (html === undefined) return null;
			const httpEtag = `"${html.length}"`;
			if (options?.onlyIf?.get('if-none-match') === httpEtag) return { httpEtag };
			return { httpEtag, body: new Response(html).body! };
		},
	};
}

const env = { PAGES: bucket({ 'e/2011-03-11-quake.html': '<h1>quake</h1>' }) };
const req = (path: string, init?: RequestInit) => new Request(`https://x.test${path}`, init);

describe('resolve', () => {
	it('/e/<id> maps to R2 key e/<id>.html', () => {
		expect(resolve('/e/2011-03-11-quake')).toEqual({ kind: 'page', key: 'e/2011-03-11-quake.html' });
	});
	it('redirects .html and trailing slash to the bare URL', () => {
		expect(resolve('/e/2011-03-11-quake.html')).toEqual({ kind: 'redirect', location: '/e/2011-03-11-quake' });
		expect(resolve('/e/2011-03-11-quake/')).toEqual({ kind: 'redirect', location: '/e/2011-03-11-quake' });
		expect(resolve('/e/2011-03-11-quake.html/')).toEqual({ kind: 'redirect', location: '/e/2011-03-11-quake' });
	});
	it('404 for ids with invalid characters', () => {
		for (const p of ['/e/', '/e/../x', '/e/.hidden', '/e/a/b', '/e/%2e%2e', '/e/x.html/y', '/e/.html', '/e//', '/other']) {
			expect(resolve(p), p).toEqual({ kind: 'notFound' });
		}
	});
});

describe('pageHeaders', () => {
	it('full security headers + HTML + cache + ETag', () => {
		const h = pageHeaders('"abc"', true);
		for (const [k, v] of Object.entries(security)) expect(h.get(k)).toBe(v);
		expect(h.get('content-type')).toBe('text/html; charset=utf-8');
		expect(h.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=86400');
		expect(h.get('etag')).toBe('"abc"');
	});
	it('cacheable=false gives no-store without ETag', () => {
		const h = pageHeaders(null, false);
		expect(h.get('cache-control')).toBe('no-store');
		expect(h.has('etag')).toBe(false);
	});
});

describe('handle', () => {
	it('an existing page returns 200 with body and ETag', async () => {
		const res = await handle(req('/e/2011-03-11-quake'), env);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('<h1>quake</h1>');
		expect(res.headers.get('etag')).toBe('"14"');
		expect(res.headers.get('content-security-policy')).toBe(security['Content-Security-Policy']);
	});
	it('304 when If-None-Match matches (no body, with ETag)', async () => {
		const res = await handle(req('/e/2011-03-11-quake', { headers: { 'if-none-match': '"14"' } }), env);
		expect(res.status).toBe(304);
		expect(res.headers.get('etag')).toBe('"14"');
		expect(await res.text()).toBe('');
	});
	it('HEAD has no body', async () => {
		const res = await handle(req('/e/2011-03-11-quake', { method: 'HEAD' }), env);
		expect(res.status).toBe(200);
		expect(res.headers.get('etag')).toBe('"14"');
		expect(await res.text()).toBe('');
	});
	it('a missing page returns 404 HTML (no-store, with security headers)', async () => {
		const res = await handle(req('/e/1999-01-01-nothing'), env);
		expect(res.status).toBe(404);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
		expect(await res.text()).toContain('href="/"');
	});
	it('404 for percent-encoding', async () => {
		const res = await handle(req('/e/%2e%2e/manifest.json'), env);
		expect(res.status).toBe(404);
	});
	it('301 keeping the query', async () => {
		const res = await handle(req('/e/2011-03-11-quake.html?k=anime'), env);
		expect(res.status).toBe(301);
		expect(res.headers.get('location')).toBe('https://x.test/e/2011-03-11-quake?k=anime');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
	});
	it('405 for methods other than GET/HEAD', async () => {
		const res = await handle(req('/e/2011-03-11-quake', { method: 'POST' }), env);
		expect(res.status).toBe(405);
		expect(res.headers.get('allow')).toBe('GET, HEAD');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
	});
	it('503 on an R2 exception', async () => {
		const res = await handle(req('/e/2011-03-11-quake'), { PAGES: bucket({}, { throws: true }) });
		expect(res.status).toBe(503);
		expect(res.headers.get('retry-after')).toBe('30');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
	});
});
