import { describe, expect, it } from 'vitest';
import { AMAZON_ASSOC_TAG, limitBooks, resolveBookUrl } from './books.ts';
import type { BookRef } from './types.ts';

describe('resolveBookUrl', () => {
	it('amazon + asin: dpリンクにタグを付与する', () => {
		const book: BookRef = { title: 'A', store: 'amazon', asin: 'B0BX5H8M3S' };
		expect(resolveBookUrl(book)).toBe(`https://www.amazon.co.jp/dp/B0BX5H8M3S?tag=${AMAZON_ASSOC_TAG}`);
	});

	it('amazon + url（クエリなし）: ?tag= を付与する', () => {
		const book: BookRef = { title: 'A', store: 'amazon', url: 'https://www.amazon.co.jp/dp/XYZ' };
		expect(resolveBookUrl(book)).toBe(`https://www.amazon.co.jp/dp/XYZ?tag=${AMAZON_ASSOC_TAG}`);
	});

	it('amazon + url（クエリあり）: &tag= を付与する', () => {
		const book: BookRef = { title: 'A', store: 'amazon', url: 'https://www.amazon.co.jp/dp/XYZ?x=1' };
		expect(resolveBookUrl(book)).toBe(`https://www.amazon.co.jp/dp/XYZ?x=1&tag=${AMAZON_ASSOC_TAG}`);
	});

	it('amazon で asin も url もなければ throw する', () => {
		const book: BookRef = { title: 'A', store: 'amazon' };
		expect(() => resolveBookUrl(book)).toThrow('amazon の書籍には asin か url が必要です: A');
	});

	it('rakuten + url: そのまま返す', () => {
		const book: BookRef = { title: 'B', store: 'rakuten', url: 'https://hb.afl.rakuten.co.jp/hgc/xxxxx/' };
		expect(resolveBookUrl(book)).toBe('https://hb.afl.rakuten.co.jp/hgc/xxxxx/');
	});

	it('rakuten で url がなければ throw する', () => {
		const book: BookRef = { title: 'B', store: 'rakuten' };
		expect(() => resolveBookUrl(book)).toThrow('rakuten の書籍には url が必要です: B');
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

	it('上限未満はそのまま返す', () => {
		expect(limitBooks(books.slice(0, 2))).toEqual(books.slice(0, 2));
	});

	it('上限を超える分は切り詰める', () => {
		expect(limitBooks(books)).toEqual(books.slice(0, 4));
	});

	it('上限ちょうどはそのまま返す', () => {
		expect(limitBooks(books.slice(0, 4))).toEqual(books.slice(0, 4));
	});

	it('空配列は空配列を返す', () => {
		expect(limitBooks([])).toEqual([]);
	});

	it('maxを明示指定できる', () => {
		expect(limitBooks(books, 1)).toEqual(books.slice(0, 1));
	});
});
