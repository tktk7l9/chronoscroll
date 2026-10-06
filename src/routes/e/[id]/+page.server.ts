/**
 * Event detail page (all prerendered, pure static HTML without JS).
 * As an entry point for long-tail SEO, gives each event a URL that search engines can follow.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import type { BookRef, CollectionMeta, CollectionsIndex, NewsEvent } from '#lib/types.js';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;
export const csr = false;

interface Cache {
	byId: Map<string, NewsEvent>;
	sorted: NewsEvent[];
	indexOf: Map<string, number>;
}

let cache: Cache | null = null;
let booksIndex: Record<string, BookRef[]> | null = null;
let collectionsIndex: CollectionsIndex | null = null;

function loadAll(): Cache {
	if (!cache) {
		const events: NewsEvent[] = [];
		for (const f of readdirSync('static/data/chunks')) {
			events.push(...(JSON.parse(readFileSync(`static/data/chunks/${f}`, 'utf8')) as NewsEvent[]));
		}
		events.sort((a, b) =>
			a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
		);
		cache = {
			byId: new Map(events.map((e) => [e.id, e])),
			sorted: events,
			indexOf: new Map(events.map((e, i) => [e.id, i])),
		};
	}
	return cache;
}

function loadBooks(): Record<string, BookRef[]> {
	if (!booksIndex) {
		booksIndex = JSON.parse(readFileSync('static/data/books.json', 'utf8')) as Record<string, BookRef[]>;
	}
	return booksIndex;
}

/** Collections that include this event (to link to the theme side internally) */
function loadCollections(id: string): CollectionMeta[] {
	if (!collectionsIndex) {
		collectionsIndex = JSON.parse(
			readFileSync('static/data/collections.json', 'utf8'),
		) as CollectionsIndex;
	}
	const slugs = collectionsIndex.byEvent[id] ?? [];
	return slugs
		.map((slug) => collectionsIndex!.collections.find((c) => c.slug === slug))
		.filter((c): c is CollectionMeta => c !== undefined);
}

export const entries: EntryGenerator = () => [...loadAll().byId.keys()].map((id) => ({ id }));

export const load: PageServerLoad = ({ params }) => {
	const { byId, sorted, indexOf } = loadAll();
	const ev = byId.get(params.id);
	if (!ev) error(404, 'イベントが見つかりません');
	const i = indexOf.get(ev.id)!;
	const pick = (e: NewsEvent | undefined) =>
		e ? { id: e.id, title: e.title, date: e.date } : null;
	const books = loadBooks()[ev.id] ?? [];
	return {
		ev,
		books,
		collections: loadCollections(ev.id),
		prev: pick(sorted[i - 1]),
		next: pick(sorted[i + 1]),
	};
};
