/**
 * Base of the public URL (no trailing slash). Referenced by canonical, OGP, and sitemap.
 * Only `static/robots.txt` and `static/ogp-collection-src.html` are static files, so they hard-code the same value.
 */
export const SITE_ORIGIN = 'https://chronoscroll.saitotakuya0719.workers.dev';

export function absoluteUrl(path: string): string {
	return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
