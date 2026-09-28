import { describe, expect, it } from 'vitest';
import { AMAZON_ASSOC_TAG, limitBooks, resolveBookUrl } from './books.ts';
import type { BookRef } from './types.ts';

describe('resolveBookUrl', () => {
	it('amazon + asin: adds the tag to the dp link', () => {
		const book: BookRef = { title: 'A', store: 'amazon', asin: 'B0BX5H8M3S' };
		expect(resolveBookUrl(book)).toBe(`https://www.amazon.co.jp/dp/B0BX5H8M3S?tag=${AMAZON_ASSOC_TAG}`);
	});

	it('amazon + url (no query): appends ?tag=', () => {
		const book: BookRef = { title: 'A', store: 'amazon', url: 'https://www.amazon.co.jp/dp/XYZ' };
		expect(resolveBookUrl(book)).toBe(`https://www.amazon.co.jp/dp/XYZ?tag=${AMAZON_ASSOC_TAG}`);
	});

	it('amazon + url (with query): appends &tag=', () => {
		const book: BookRef = { title: 'A', store: 'amazon', url: 'https://www.amazon.co.jp/dp/XYZ?x=1' };
		expect(resolveBookUrl(book)).toBe(`https://www.amazon.co.jp/dp/XYZ?x=1&tag=${AMAZON_ASSOC_TAG}`);
	});

	it('throws for amazon without asin or url', () => {
		const book: BookRef = { title: 'A', store: 'amazon' };
		expect(() => resolveBookUrl(book)).toThrow('An amazon book needs asin or url: A');
	});

	it('rakuten + url: returns it as is', () => {
		const book: BookRef = { title: 'B', store: 'rakuten', url: 'https://hb.afl.rakuten.co.jp/hgc/xxxxx/' };
		expect(resolveBookUrl(book)).toBe('https://hb.afl.rakuten.co.jp/hgc/xxxxx/');
	});

	it('throws for rakuten without url', () => {
		const book: BookRef = { title: 'B', store: 'rakuten' };
		expect(() => resolveBookUrl(book)).toThrow('A rakuten book needs url: B');
	});
});

describe('limitBooks', () => {
	const books: BookRef[] = [
		{ title: 'A', store: 'rakuten', url: 'https://x/1' },
		{ title: 'B', store: 'rakuten', url: 'https://x/2' },
		{ title: 'C', store: 'rakuten', url: 'https://x/3' },
		{ title: 'D', store: 'rakuten', url: 'https://x/4' },
		{ title: 'E', store: 'rakuten', url: 'https://x/5' },
	];

	it('returns lists under the limit unchanged', () => {
		expect(limitBooks(books.slice(0, 2))).toEqual(books.slice(0, 2));
	});

	it('truncates beyond the limit', () => {
		expect(limitBooks(books)).toEqual(books.slice(0, 4));
	});

	it('returns a list exactly at the limit unchanged', () => {
		expect(limitBooks(books.slice(0, 4))).toEqual(books.slice(0, 4));
	});

	it('returns an empty array for an empty array', () => {
		expect(limitBooks([])).toEqual([]);
	});

	it('accepts an explicit max', () => {
		expect(limitBooks(books, 1)).toEqual(books.slice(0, 1));
	});
});
