/**
 * イベントデータのランタイムストア（IO層・カバレッジゲート対象外）。
 * overview を初期ロードし、可視範囲に応じて十年チャンクを遅延ロードする。
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
} from '../types.ts';
import { toPoints, type EventPoint } from '../viewport.ts';

export class TimelineData {
	meta = $state<IndexMeta | null>(null);
	/** チャンクロードごとに増える。points再計算のトリガ */
	version = $state(0);
	loadError = $state<string | null>(null);
	/** 特集の一覧（メタのみ）。取得前は空配列 */
	collections = $state<CollectionMeta[]>([]);

	#events = new Map<string, NewsEvent>();
	#loaded = new Set<string>();
	#pending = new Set<string>();
	#books: Record<string, BookRef[]> = {};
	#collectionsByEvent: Record<string, string[]> = {};
	#collectionDetails = new Map<string, CollectionDetail>();

	readonly points: EventPoint[] = $derived.by(() => {
		void this.version;
		return toPoints([...this.#events.values()]);
	});

	readonly eventsPerDay: number = $derived.by(() => {
		if (!this.meta || this.meta.total === 0) return 0.25;
		return this.meta.total / Math.max(1, dayOf(this.meta.maxDate) - dayOf(this.meta.minDate));
	});

	async init(): Promise<void> {
		try {
			const [meta, overview] = await Promise.all([
				fetchJson<IndexMeta>('/data/index.json'),
				fetchJson<NewsEvent[]>('/data/overview.json'),
			]);
			this.#addEvents(overview);
			this.meta = meta;
		} catch (e) {
			this.loadError = String(e);
		}
		// books.json / collections.json は年表の主データとは独立に取得する。
		// 失敗してもloadErrorは発火させない（該当の飾りが出ないだけに留め、
		// 年表全体を巻き込んで真っ白にしない）
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
	 * このイベントが収録されている特集（未取得なら空配列）。
	 * version を先に読むのが必須。#collectionsByEvent が素のオブジェクトである上に、
	 * 未取得時は slugs が空で .map のコールバックが走らず this.collections も読まれないため、
	 * 何も追跡せず collections.json 到着後も再評価されない。
	 */
	collectionsByEvent(id: string): CollectionMeta[] {
		void this.version;
		const slugs = this.#collectionsByEvent[id] ?? [];
		return slugs
			.map((slug) => this.collections.find((c) => c.slug === slug))
			.filter((c): c is CollectionMeta => c !== undefined);
	}

	/**
	 * 特集の収録イベントを取り込む。詳細JSONに本体が全件入っているので、
	 * これ1回でチャンクを読まずに特集の絞り込み表示ができる。
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

	/** 可視範囲+バッファに必要なチャンクをロードする（多重ロード防止付き） */
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
					// 失敗時はpendingを解除して次回リトライ
				})
				.finally(() => this.#pending.delete(key));
		}
	}

	/**
	 * イベントを引く。#events は素のMapで追跡できないため version を読む。
	 * これが無いと `$derived(data.byId(id))` がチャンク到着で再評価されず、
	 * ?e=<id> のディープリンク（個別ページの「年表でこの位置を開く」）で
	 * 詳細が永久にnullのままになる。
	 */
	byId(id: string): NewsEvent | undefined {
		void this.version;
		return this.#events.get(id);
	}

	/** 検索ジャンプ用: idの日付から必要チャンクをロードして返す */
	async loadById(id: string, date: string): Promise<NewsEvent | undefined> {
		const existing = this.#events.get(id);
		if (existing) return existing;
		const day = dayOf(date);
		this.ensureRange(day, day);
		// ensureRangeは非同期。該当チャンクのロード完了を待つ
		for (let i = 0; i < 100 && !this.#events.has(id); i++) {
			await new Promise((r) => setTimeout(r, 50));
		}
		return this.#events.get(id);
	}

	#addEvents(events: readonly NewsEvent[]): void {
		for (const ev of events) this.#events.set(ev.id, ev);
		this.version++;
	}
}

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return (await res.json()) as T;
}

export const timelineData = new TimelineData();
