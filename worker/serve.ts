// /e/<id> を R2 から返す。静的アセットの無料枠（20,000 ファイル）に収めるため、
// 27,000 本超のイベント個別ページ（prerender 済み HTML）だけを R2 に置いている。
// /e/* は Worker が先に受ける。それ以外は静的アセットが先に解決し、無いパスは
// Worker に落ちて notFound() が 404 を返す（build/404.html を置いていないため。
// wrangler.jsonc の not_found_handling 参照）。
import securityHeaders from '../config/security-headers.json';

export type Resolution =
	| { kind: 'redirect'; location: string }
	| { kind: 'page'; key: string }
	| { kind: 'notFound' };

/** R2 の get が返すもののうち使う部分。R2Object（本文なし）と R2ObjectBody の両方を受ける */
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

// イベント id は日付で始まり英数字・ドット・ハイフン・アンダースコアだけ（27,137 件で実測）。
// 先頭ドットを許さないので `..` は通らない。`%` や `/` も通らない。
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
	// build/404.html を置いていないため、静的アセットで解決できないパスはここに落ちて notFound() が 404 を返す
	if (r.kind === 'notFound') return notFound();

	let obj: PageObject | null;
	try {
		// onlyIf に要求ヘッダーを渡すと If-None-Match 等を R2 が評価し、一致すれば本文なしで返る
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
