/**
 * Runtime store for event data (IO layer, excluded from the coverage gate).
 * Loads the card-only overview first (first paint), then the full overview, and lazy-loads
 * decade chunks based on the visible range.
 */
import { chunkKeysInRange } from '../chunks.ts';
import { collectionDetailPath } from '../collections.ts';
import { dayOf } from '../timescale.ts';
import type {
	BookRef,
	CollectionDetail,
	CollectionMeta,
	CollectionsIndex,
	IndexMeta,
	NewsEvent,
	OverviewLiteEvent,
} from '../types.ts';
import { toPoints, type EventPoint } from '../viewport.ts';

export class TimelineData {
	meta = $state<IndexMeta | null>(null);
	/** Incremented on every chunk load. Trigger for recomputing points */
	version = $state(0);
	loadError = $state<string | null>(null);
	/** List of collections (metadata only). Empty array before fetching */
	collections = $state<CollectionMeta[]>([]);

	#events = new Map<string, NewsEvent>();
	/**
	 * Card-only stand-ins from overview-lite.json, drawn until the full event arrives.
	 * Kept apart from #events so byId/loadById never hand a body-less event to the detail dialog.
	 */
	#previews = new Map<string, NewsEvent>();
	/** Settles once the full overview.json has been taken in (or has failed) */
	#overviewSettled: Promise<void> | null = null;
	#loaded = new Set<string>();
	#pending = new Set<string>();
	#books: Record<string, BookRef[]> = {};
	#collectionsByEvent: Record<string, string[]> = {};
	#collectionDetails = new Map<string, CollectionDetail>();

	readonly points: EventPoint[] = $derived.by(() => {
		void this.version;
		return toPoints([...this.#previews.values(), ...this.#events.values()]);
	});

	readonly eventsPerDay: number = $derived.by(() => {
		if (!this.meta || this.meta.total === 0) return 0.25;
		return this.meta.total / Math.max(1, dayOf(this.meta.maxDate) - dayOf(this.meta.minDate));
	});

	async init(): Promise<void> {
		try {
			// The small card-only file paints the first screen; the full overview (about 4x larger)
			// is fetched after it so the two do not split the bandwidth before LCP.
			// If the lite file is missing, fall back to waiting for the full overview as before
			const [meta, lite] = await Promise.all([
				fetchJson<IndexMeta>('/data/index.json'),
				fetchJson<OverviewLiteEvent[]>('/data/overview-lite.json').catch(() => null),
			]);
			if (lite !== null) {
				this.#addPreviews(lite);
				// Everything else waits until the first screen is painted: a request that starts
				// before LCP counts against it in Lighthouse's simulation even when it does not block it.
				// #overviewSettled is set before meta so a deep link (?e=) already waits on it
				const painted = afterPaint();
				this.#overviewSettled = painted
					.then(() => fetchJson<NewsEvent[]>('/data/overview.json'))
					.then(
						(events) => this.#addEvents(events),
						// Without the full overview, details fall back to loading the event's chunk
						() => {},
					);
				this.meta = meta;
				await painted;
			} else {
				this.#addEvents(await fetchJson<NewsEvent[]>('/data/overview.json'));
				this.meta = meta;
			}
		} catch (e) {
			this.loadError = String(e);
		}
		// books.json / collections.json are fetched independently of the timeline's main data.
		// A failure does not trigger loadError (only that decoration is missing;
		// it does not take down the whole timeline and leave it blank)
		void fetchJson<Record<string, BookRef[]>>('/data/books.json')
			.then((books) => {
				this.#books = books;
				this.version++;
			})
			.catch(() => {});
		void fetchJson<CollectionsIndex>('/data/collections.json')
			.then((index) => {
				this.#collectionsByEvent = index.byEvent;
				this.collections = index.collections;
				this.version++;
			})
			.catch(() => {});
	}

	booksById(id: string): BookRef[] {
		void this.version;
		return this.#books[id] ?? [];
	}

	/**
	 * Collections that include this event (empty array if not fetched yet).
	 * Reading version first is required. #collectionsByEvent is a plain object, and
	 * before fetching, slugs is empty, so the .map callback never runs and this.collections is never read;
	 * nothing is tracked and it is not re-evaluated after collections.json arrives.
	 */
	collectionsByEvent(id: string): CollectionMeta[] {
		void this.version;
		const slugs = this.#collectionsByEvent[id] ?? [];
		return slugs
			.map((slug) => this.collections.find((c) => c.slug === slug))
			.filter((c): c is CollectionMeta => c !== undefined);
	}

	/**
	 * Take in the events of a collection. The detail JSON contains all their bodies, so
	 * this single call enables the collection-filtered view without loading chunks.
	 */
	async loadCollection(slug: string): Promise<CollectionDetail | null> {
		const cached = this.#collectionDetails.get(slug);
		if (cached) return cached;
		try {
			const detail = await fetchJson<CollectionDetail>(collectionDetailPath(slug));
			this.#collectionDetails.set(slug, detail);
			this.#addEvents(detail.events);
			return detail;
		} catch {
			return null;
		}
	}

	/** Load the chunks needed for the visible range + buffer (guarded against duplicate loads) */
	ensureRange(fromDay: number, toDay: number): void {
		if (!this.meta) return;
		for (const key of chunkKeysInRange(this.meta.chunks, fromDay, toDay)) {
			if (this.#loaded.has(key) || this.#pending.has(key)) continue;
			this.#pending.add(key);
			void fetchJson<NewsEvent[]>(`/data/chunks/${key}.json`)
				.then((events) => {
					this.#loaded.add(key);
					this.#addEvents(events);
				})
				.catch(() => {
					// On failure, clear pending so it retries next time
				})
				.finally(() => this.#pending.delete(key));
		}
	}

	/**
	 * Look up an event. #events is a plain Map that cannot be tracked, so read version.
	 * Without this, `$derived(data.byId(id))` is not re-evaluated when a chunk arrives, and
	 * with a ?e=<id> deep link (「年表でこの位置を開く」 on the detail page)
	 * the detail stays null forever.
	 */
	byId(id: string): NewsEvent | undefined {
		void this.version;
		return this.#events.get(id);
	}

	/** For search jumps: load the needed chunk from the id's date and return the event */
	async loadById(id: string, date: string): Promise<NewsEvent | undefined> {
		const existing = this.#events.get(id);
		if (existing) return existing;
		// An overview event that is only a preview yet: its body is on the way with overview.json,
		// so wait for that instead of fetching a whole chunk
		if (this.#previews.has(id) && this.#overviewSettled) {
			await this.#overviewSettled;
			const full = this.#events.get(id);
			if (full) return full;
		}
		const day = dayOf(date);
		// A malformed ?e= deep link (the date is taken from the id prefix) yields NaN, which
		// would throw inside chunkKeysInRange. There is no chunk to wait for, so give up at once
		if (!Number.isFinite(day)) return undefined;
		this.ensureRange(day, day);
		// ensureRange is async. Wait for the relevant chunk to finish loading
		for (let i = 0; i < 100 && !this.#events.has(id); i++) {
			await new Promise((r) => setTimeout(r, 50));
		}
		return this.#events.get(id);
	}

	#addEvents(events: readonly NewsEvent[]): void {
		for (const ev of events) {
			this.#events.set(ev.id, ev);
			this.#previews.delete(ev.id);
		}
		this.version++;
	}

	#addPreviews(events: readonly OverviewLiteEvent[]): void {
		for (const ev of events) {
			if (!this.#events.has(ev.id)) this.#previews.set(ev.id, { ...ev, summary: '', sources: [] });
		}
		this.version++;
	}
}

/** Margin after the paint: presentation (when LCP is stamped) trails the frame by a few frames */
const AFTER_PAINT_MS = 300;

/**
 * Resolves a little after the frame that draws the first cards. One rAF only reaches the start
 * of that frame (its paint is still pending), so wait for the next one, then a short margin
 */
function afterPaint(): Promise<void> {
	return new Promise((resolve) => {
		const later = () => setTimeout(resolve, AFTER_PAINT_MS);
		if (typeof requestAnimationFrame !== 'function') return later();
		requestAnimationFrame(() => requestAnimationFrame(later));
	});
}

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return (await res.json()) as T;
}

export const timelineData = new TimelineData();
