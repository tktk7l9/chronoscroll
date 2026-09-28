import { describe, expect, it } from 'vitest';
import type { BookRef } from '../../src/lib/types.ts';
import { buildBooksIndex, parseBooksYaml, unmatchedBookIds, type BookEntry } from './books.ts';

describe('parseBooksYaml', () => {
	it('parses an array', () => {
		const entries = parseBooksYaml(
			'- id: a\n  books:\n    - title: T\n      store: rakuten\n      url: https://x/1\n',
		);
		expect(entries).toEqual([
			{ id: 'a', books: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }] },
		]);
	});

	it('an empty file or null document yields an empty array', () => {
		expect(parseBooksYaml('')).toEqual([]);
		expect(parseBooksYaml('  \n')).toEqual([]);
		expect(parseBooksYaml('~\n')).toEqual([]);
	});

	it('errors when not an array', () => {
		expect(() => parseBooksYaml('id: a')).toThrow('must be an array');
	});

	it('errors without id', () => {
		expect(() => parseBooksYaml('- books: []')).toThrow('id');
	});

	it('errors when id is empty', () => {
		expect(() => parseBooksYaml('- id: ""\n  books: []')).toThrow('id');
	});

	it('errors without books', () => {
		expect(() => parseBooksYaml('- id: a')).toThrow('book list is empty');
	});

	it('errors when books is an empty array', () => {
		expect(() => parseBooksYaml('- id: a\n  books: []')).toThrow('book list is empty');
	});

	it('errors when a book has no title', () => {
		expect(() =>
			parseBooksYaml('- id: a\n  books:\n    - store: rakuten\n      url: https://x/1\n'),
		).toThrow('has no title');
	});

	it('errors when a book title is empty', () => {
		expect(() =>
			parseBooksYaml('- id: a\n  books:\n    - title: ""\n      store: rakuten\n      url: https://x/1\n'),
		).toThrow('has no title');
	});

	it('errors on a book whose URL cannot be resolved (includes the resolveBookUrl reason)', () => {
		expect(() => parseBooksYaml('- id: a\n  books:\n    - title: T\n      store: amazon\n')).toThrow(
			'needs asin or url',
		);
	});
});

describe('buildBooksIndex', () => {
	it('single id, single book', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }] },
		];
		expect(buildBooksIndex(entries)).toEqual({
			a: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }],
		});
	});

	it('concatenates in order when the same id appears more than once', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T1', store: 'rakuten', url: 'https://x/1' }] },
			{ id: 'a', books: [{ title: 'T2', store: 'rakuten', url: 'https://x/2' }] },
		];
		expect(buildBooksIndex(entries).a.map((b) => b.title)).toEqual(['T1', 'T2']);
	});

	it('keeps multiple ids separately', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T1', store: 'rakuten', url: 'https://x/1' }] },
			{ id: 'b', books: [{ title: 'T2', store: 'rakuten', url: 'https://x/2' }] },
		];
		const index = buildBooksIndex(entries);
		expect(Object.keys(index)).toEqual(['a', 'b']);
	});

	it('empty input yields an empty object', () => {
		expect(buildBooksIndex([])).toEqual({});
	});

	it('resolves the url of amazon books', () => {
		const entries: BookEntry[] = [{ id: 'a', books: [{ title: 'T', store: 'amazon', asin: 'X1' }] }];
		const result = buildBooksIndex(entries).a[0] as BookRef;
		expect(result.url).toContain('/dp/X1?tag=');
	});
});

describe('unmatchedBookIds', () => {
	it('returns ids not in validIds', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }] },
			{ id: 'ghost', books: [{ title: 'T', store: 'rakuten', url: 'https://x/2' }] },
		];
		expect(unmatchedBookIds(entries, new Set(['a']))).toEqual(['ghost']);
	});

	it('returns an empty array when all match', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }] },
		];
		expect(unmatchedBookIds(entries, new Set(['a']))).toEqual([]);
	});
});
