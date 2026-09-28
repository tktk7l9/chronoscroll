import type {
	Category,
	ChunkMeta,
	EventImage,
	IndexMeta,
	NewsEvent,
	Region,
} from '../../src/lib/types.ts';
import type { RawEvent } from './wikitext.ts';
import { eventDateAndId } from './wikitext.ts';

export function wikipediaUrl(title: string): string {
	return `https://ja.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/** Short title shown on the card (drop the trailing 「。」 and truncate) */
export function truncateTitle(text: string, max = 48): string {
	const t = text.replace(/。$/, '');
	return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export interface BuildEventArgs {
	raw: RawEvent;
	importance: number;
	category: Category;
	region: Region;
	image?: EventImage;
}

export function buildEvent({ raw, importance, category, region, image }: BuildEventArgs): NewsEvent {
	const { date, id } = eventDateAndId(raw);
	const primary = raw.links[0];
	const sources = [];
	if (primary) {
		sources.push({ label: `Wikipedia: ${primary.label}`, url: wikipediaUrl(primary.target) });
	}
	sources.push({ label: `Wikipedia: ${raw.year}年`, url: wikipediaUrl(`${raw.year}年`) });
	return {
		id,
		date,
		precision: raw.precision,
		title: truncateTitle(raw.text),
		summary: raw.text,
		category,
		region,
		importance,
		sources,
		...(image ? { image } : {}),
	};
}

export function decadeKeyOf(year: number): string {
	return `${Math.floor(year / 10) * 10}s`;
}

/** Max events per chunk. A decade exceeding it is split into first-half/second-half 5-year chunks */
export const MAX_EVENTS_PER_CHUNK = 1200;

/** Canonical sort by ascending date (same date by id) */
export function sortEvents(events: readonly NewsEvent[]): NewsEvent[] {
	return [...events].sort((a, b) =>
		a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
	);
}

export interface Chunk {
	meta: ChunkMeta;
	events: NewsEvent[];
}

/**
 * Chunk by decade; a decade exceeding MAX_EVENTS_PER_CHUNK is split into first-half/second-half 5-year chunks.
 * Keys are "1960s" (decade) / "2020h1", "2020h2" (first/second 5-year half).
 */
export function buildChunks(
	events: readonly NewsEvent[],
	maxPerChunk = MAX_EVENTS_PER_CHUNK,
): Chunk[] {
	const byDecade = new Map<number, NewsEvent[]>();
	for (const ev of sortEvents(events)) {
		const decade = Math.floor(Number(ev.date.slice(0, 4)) / 10) * 10;
		const arr = byDecade.get(decade);
		if (arr) arr.push(ev);
		else byDecade.set(decade, [ev]);
	}
	const chunks: Chunk[] = [];
	for (const [decade, evs] of byDecade) {
		if (evs.length <= maxPerChunk) {
			chunks.push({
				meta: { key: `${decade}s`, fromYear: decade, toYear: decade + 9, count: evs.length },
				events: evs,
			});
			continue;
		}
		const first = evs.filter((e) => Number(e.date.slice(0, 4)) < decade + 5);
		const second = evs.filter((e) => Number(e.date.slice(0, 4)) >= decade + 5);
		chunks.push({
			meta: { key: `${decade}h1`, fromYear: decade, toYear: decade + 4, count: first.length },
			events: first,
		});
		chunks.push({
			meta: { key: `${decade}h2`, fromYear: decade + 5, toYear: decade + 9, count: second.length },
			events: second,
		});
	}
	return chunks;
}

/** For the initial load: only events at or above the importance threshold */
export function overviewSlice(events: readonly NewsEvent[], minImportance = 95): NewsEvent[] {
	return sortEvents(events.filter((e) => e.importance >= minImportance));
}

/** Max characters of search text (keeps the index small; the key point comes at the start, so this is enough in practice) */
export const SEARCH_TEXT_MAX = 72;

/** Lightweight document for the search worker [id, date, text] */
export function searchDocs(events: readonly NewsEvent[]): [string, string, string][] {
	return sortEvents(events).map((e) => [
		e.id,
		e.date,
		e.summary.length <= SEARCH_TEXT_MAX ? e.summary : e.summary.slice(0, SEARCH_TEXT_MAX),
	]);
}

export type { ChunkMeta, IndexMeta };

export function buildIndexMeta(events: readonly NewsEvent[], generatedAt: string): IndexMeta {
	if (events.length === 0) {
		return { generatedAt, minDate: '', maxDate: '', total: 0, chunks: [] };
	}
	const sorted = sortEvents(events);
	return {
		generatedAt,
		minDate: sorted[0].date,
		maxDate: sorted[sorted.length - 1].date,
		total: sorted.length,
		chunks: buildChunks(sorted).map((c) => c.meta),
	};
}
