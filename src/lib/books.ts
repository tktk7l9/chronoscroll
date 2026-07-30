import type { BookRef } from './types.ts';

/** Amazon アソシエイト・トラッキングID。審査通過後はこの1箇所を差し替える */
export const AMAZON_ASSOC_TAG = 'PLACEHOLDER-22';

/** 1イベントあたりに表示する書籍リンクの上限 */
export const MAX_BOOKS_PER_EVENT = 4;

/** BookRef から実際に遷移させるアフィリエイトURLを解決する */
export function resolveBookUrl(book: BookRef): string {
	if (book.store === 'amazon') {
		if (book.asin) return `https://www.amazon.co.jp/dp/${book.asin}?tag=${AMAZON_ASSOC_TAG}`;
		if (book.url) return appendAmazonTag(book.url);
		throw new Error(`amazon の書籍には asin か url が必要です: ${book.title}`);
	}
	if (book.url) return book.url;
	throw new Error(`rakuten の書籍には url が必要です: ${book.title}`);
}

function appendAmazonTag(url: string): string {
	const sep = url.includes('?') ? '&' : '?';
	return `${url}${sep}tag=${AMAZON_ASSOC_TAG}`;
}

/** 表示件数を上限で切り詰める */
export function limitBooks(books: readonly BookRef[], max = MAX_BOOKS_PER_EVENT): BookRef[] {
	return books.slice(0, max);
}
