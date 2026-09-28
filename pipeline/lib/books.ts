import { load } from 'js-yaml';
import { resolveBookUrl } from '../../src/lib/books.ts';
import type { BookRef } from '../../src/lib/types.ts';

/** One entry of content/affiliate/books.yaml */
export interface BookEntry {
	id: string;
	books: BookRef[];
}

export function parseBooksYaml(yamlText: string): BookEntry[] {
	if (yamlText.trim() === '') return [];
	const data = load(yamlText);
	if (data == null) return [];
	if (!Array.isArray(data)) throw new Error('books YAMLは配列である必要があります');
	for (const entry of data as { id?: unknown; books?: unknown }[]) {
		if (typeof entry?.id !== 'string' || entry.id === '') {
			throw new Error(`booksエントリに id がありません: ${JSON.stringify(entry)}`);
		}
		if (!Array.isArray(entry.books) || entry.books.length === 0) {
			throw new Error(`books(${entry.id})の書籍リストが空です`);
		}
		for (const book of entry.books as { title?: unknown }[]) {
			if (typeof book?.title !== 'string' || book.title === '') {
				throw new Error(`books(${entry.id})の書籍に title がありません: ${JSON.stringify(book)}`);
			}
			try {
				resolveBookUrl(book as BookRef);
			} catch (e) {
				throw new Error(`books(${entry.id}): ${(e as Error).message}`);
			}
		}
	}
	return data as BookEntry[];
}

/** Build a map of id → BookRef[] with resolved URLs (same ids are concatenated in order) */
export function buildBooksIndex(entries: readonly BookEntry[]): Record<string, BookRef[]> {
	const index: Record<string, BookRef[]> = {};
	for (const entry of entries) {
		const resolved = entry.books.map((b) => ({ ...b, url: resolveBookUrl(b) }));
		index[entry.id] = [...(index[entry.id] ?? []), ...resolved];
	}
	return index;
}

/** Return ids of books entries that do not exist in the final set of event ids (for typo detection) */
export function unmatchedBookIds(
	entries: readonly BookEntry[],
	validIds: ReadonlySet<string>,
): string[] {
	return entries.filter((e) => !validIds.has(e.id)).map((e) => e.id);
}
