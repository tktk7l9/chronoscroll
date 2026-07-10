/**
 * イベント個別ページ（全件prerender・JSなしの純静的HTML）。
 * ロングテールSEOの入口として、各イベントに検索エンジンが辿れるURLを与える。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import type { NewsEvent } from '$lib/types';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;
export const csr = false;

interface Cache {
	byId: Map<string, NewsEvent>;
	sorted: NewsEvent[];
	indexOf: Map<string, number>;
}

let cache: Cache | null = null;

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

export const entries: EntryGenerator = () => [...loadAll().byId.keys()].map((id) => ({ id }));

export const load: PageServerLoad = ({ params }) => {
	const { byId, sorted, indexOf } = loadAll();
	const ev = byId.get(params.id);
	if (!ev) error(404, 'イベントが見つかりません');
	const i = indexOf.get(ev.id)!;
	const pick = (e: NewsEvent | undefined) =>
		e ? { id: e.id, title: e.title, date: e.date } : null;
	return { ev, prev: pick(sorted[i - 1]), next: pick(sorted[i + 1]) };
};
