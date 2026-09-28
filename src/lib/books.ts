import type { BookRef } from './types.ts';

/** Amazon Associates tracking ID. Replace it in this one place after approval */
export const AMAZON_ASSOC_TAG = 'PLACEHOLDER-22';

/** Max number of book links shown per event */
export const MAX_BOOKS_PER_EVENT = 4;

/** Resolve the affiliate URL a BookRef actually navigates to */
export function resolveBookUrl(book: BookRef): string {
	if (book.store === 'amazon') {
		if (book.asin) return `https://www.amazon.co.jp/dp/${book.asin}?tag=${AMAZON_ASSOC_TAG}`;
		if (book.url) return appendAmazonTag(book.url);
		throw new Error(`An amazon book needs asin or url: ${book.title}`);
	}
	if (book.url) return book.url;
	throw new Error(`A rakuten book needs url: ${book.title}`);
}

function appendAmazonTag(url: string): string {
	const sep = url.includes('?') ? '&' : '?';
	return `${url}${sep}tag=${AMAZON_ASSOC_TAG}`;
}

/** Truncate to the display limit */
export function limitBooks(books: readonly BookRef[], max = MAX_BOOKS_PER_EVENT): BookRef[] {
	return books.slice(0, max);
}
