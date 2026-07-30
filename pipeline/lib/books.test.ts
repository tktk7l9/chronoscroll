import { describe, expect, it } from 'vitest';
import type { BookRef } from '../../src/lib/types.ts';
import { buildBooksIndex, parseBooksYaml, unmatchedBookIds, type BookEntry } from './books.ts';

describe('parseBooksYaml', () => {
	it('配列をパースする', () => {
		const entries = parseBooksYaml(
			'- id: a\n  books:\n    - title: T\n      store: rakuten\n      url: https://x/1\n',
		);
		expect(entries).toEqual([
			{ id: 'a', books: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }] },
		]);
	});

	it('空ファイルやnullドキュメントは空配列', () => {
		expect(parseBooksYaml('')).toEqual([]);
		expect(parseBooksYaml('  \n')).toEqual([]);
		expect(parseBooksYaml('~\n')).toEqual([]);
	});

	it('配列でなければエラー', () => {
		expect(() => parseBooksYaml('id: a')).toThrow('配列');
	});

	it('idがなければエラー', () => {
		expect(() => parseBooksYaml('- books: []')).toThrow('id');
	});

	it('idが空文字ならエラー', () => {
		expect(() => parseBooksYaml('- id: ""\n  books: []')).toThrow('id');
	});

	it('booksがなければエラー', () => {
		expect(() => parseBooksYaml('- id: a')).toThrow('書籍リストが空です');
	});

	it('booksが空配列ならエラー', () => {
		expect(() => parseBooksYaml('- id: a\n  books: []')).toThrow('書籍リストが空です');
	});

	it('書籍にtitleがなければエラー', () => {
		expect(() =>
			parseBooksYaml('- id: a\n  books:\n    - store: rakuten\n      url: https://x/1\n'),
		).toThrow('title がありません');
	});

	it('書籍のtitleが空文字ならエラー', () => {
		expect(() =>
			parseBooksYaml('- id: a\n  books:\n    - title: ""\n      store: rakuten\n      url: https://x/1\n'),
		).toThrow('title がありません');
	});

	it('URLを解決できない書籍はエラー（resolveBookUrlの理由を含む）', () => {
		expect(() => parseBooksYaml('- id: a\n  books:\n    - title: T\n      store: amazon\n')).toThrow(
			'asin か url が必要です',
		);
	});
});

describe('buildBooksIndex', () => {
	it('単一id・単一書籍', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }] },
		];
		expect(buildBooksIndex(entries)).toEqual({
			a: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }],
		});
	});

	it('同じidが複数回出てくる場合は順番に結合する', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T1', store: 'rakuten', url: 'https://x/1' }] },
			{ id: 'a', books: [{ title: 'T2', store: 'rakuten', url: 'https://x/2' }] },
		];
		expect(buildBooksIndex(entries).a.map((b) => b.title)).toEqual(['T1', 'T2']);
	});

	it('複数idを個別に持つ', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T1', store: 'rakuten', url: 'https://x/1' }] },
			{ id: 'b', books: [{ title: 'T2', store: 'rakuten', url: 'https://x/2' }] },
		];
		const index = buildBooksIndex(entries);
		expect(Object.keys(index)).toEqual(['a', 'b']);
	});

	it('空入力は空オブジェクト', () => {
		expect(buildBooksIndex([])).toEqual({});
	});

	it('amazon書籍はurlを解決済みの形にする', () => {
		const entries: BookEntry[] = [{ id: 'a', books: [{ title: 'T', store: 'amazon', asin: 'X1' }] }];
		const result = buildBooksIndex(entries).a[0] as BookRef;
		expect(result.url).toContain('/dp/X1?tag=');
	});
});

describe('unmatchedBookIds', () => {
	it('validIdsに存在しないidを返す', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }] },
			{ id: 'ghost', books: [{ title: 'T', store: 'rakuten', url: 'https://x/2' }] },
		];
		expect(unmatchedBookIds(entries, new Set(['a']))).toEqual(['ghost']);
	});

	it('全て一致すれば空配列', () => {
		const entries: BookEntry[] = [
			{ id: 'a', books: [{ title: 'T', store: 'rakuten', url: 'https://x/1' }] },
		];
		expect(unmatchedBookIds(entries, new Set(['a']))).toEqual([]);
	});
});
