/**
 * 公開 URL の起点（末尾スラッシュなし）。canonical・OGP・sitemap が参照する。
 * `static/robots.txt` と `static/ogp-collection-src.html` だけは静的ファイルなので同じ値を直接書いてある。
 */
export const SITE_ORIGIN = 'https://chronoscroll.saitotakuya0719.workers.dev';

export function absoluteUrl(path: string): string {
	return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
