// Serve /e/<id> from R2. To fit the static-asset free tier (20,000 files),
// only the 27,000+ per-event pages (prerendered HTML) live in R2.
// /e/* hits the Worker first. Everything else is resolved by static assets first, and missing paths
// fall through to the Worker, where notFound() returns 404 (because there is no build/404.html;
// see not_found_handling in wrangler.jsonc).
import securityHeaders from '../config/security-headers.json';

export type Resolution =
	| { kind: 'redirect'; location: string }
	| { kind: 'page'; key: string }
	| { kind: 'notFound' };

/** The part of what R2 get returns that we use. Accepts both R2Object (no body) and R2ObjectBody */
export interface PageObject {
	httpEtag: string;
	body?: ReadableStream;
}

export interface PagesBucket {
	get(key: string, options?: { onlyIf?: Headers }): Promise<PageObject | null>;
}

export interface Env {
	PAGES: PagesBucket;
}

// Event ids start with a date and contain only alphanumerics, dots, hyphens, and underscores (measured on 27,137 events).
// A leading dot is not allowed, so `..` cannot pass. Neither can `%` or `/`.
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CACHE_PAGE = 'public, max-age=3600, stale-while-revalidate=86400';
const NOT_FOUND_HTML =
	'<!doctype html><html lang="ja"><meta charset="utf-8"><title>ページが見つかりません | chronoscroll</title>' +
	'<p>ページが見つかりません。<a href="/">年表へ戻る</a></p></html>';

export function resolve(pathname: string): Resolution {
	if (!pathname.startsWith('/e/')) return { kind: 'notFound' };
	let rest = pathname.slice('/e/'.length);
	let redirect = false;
	if (rest.endsWith('/')) {
		rest = rest.slice(0, -1);
		redirect = true;
	}
	if (rest.endsWith('.html')) {
		rest = rest.slice(0, -'.html'.length);
		redirect = true;
	}
	if (!ID.test(rest)) return { kind: 'notFound' };
	return redirect ? { kind: 'redirect', location: `/e/${rest}` } : { kind: 'page', key: `e/${rest}.html` };
}

export function pageHeaders(etag: string | null, cacheable: boolean): Headers {
	const h = new Headers(securityHeaders as Record<string, string>);
	h.set('Content-Type', 'text/html; charset=utf-8');
	h.set('Cache-Control', cacheable ? CACHE_PAGE : 'no-store');
	if (etag) h.set('ETag', etag);
	return h;
}

function notFound(): Response {
	return new Response(NOT_FOUND_HTML, { status: 404, headers: pageHeaders(null, false) });
}

export async function handle(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		const headers = pageHeaders(null, false);
		headers.set('Allow', 'GET, HEAD');
		headers.set('Content-Type', 'text/plain; charset=utf-8');
		return new Response('Method Not Allowed', { status: 405, headers });
	}
	const url = new URL(request.url);
	const r = resolve(url.pathname);
	if (r.kind === 'redirect') {
		const headers = pageHeaders(null, false);
		headers.delete('Content-Type');
		headers.set('Location', `${url.origin}${r.location}${url.search}`);
		return new Response(null, { status: 301, headers });
	}
	// There is no build/404.html, so paths not resolved by static assets fall through here and notFound() returns 404
	if (r.kind === 'notFound') return notFound();

	let obj: PageObject | null;
	try {
		// Passing the request headers to onlyIf makes R2 evaluate If-None-Match etc. and return without a body on a match
		obj = await env.PAGES.get(r.key, { onlyIf: request.headers });
	} catch {
		const h = pageHeaders(null, false);
		h.set('Retry-After', '30');
		return new Response('Service Unavailable', { status: 503, headers: h });
	}
	if (obj === null) return notFound();
	const headers = pageHeaders(obj.httpEtag, true);
	if (obj.body === undefined) return new Response(null, { status: 304, headers });
	return new Response(request.method === 'HEAD' ? null : obj.body, { status: 200, headers });
}
