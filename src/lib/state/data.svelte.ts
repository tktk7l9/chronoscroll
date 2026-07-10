/**
 * イベントデータのランタイムストア（IO層・カバレッジゲート対象外）。
 * overview を初期ロードし、可視範囲に応じて十年チャンクを遅延ロードする。
 */
import { decadeKeysInRange } from '../chunks.ts';
import { dayOf } from '../timescale.ts';
import type { IndexMeta, NewsEvent } from '../types.ts';
import { toPoints, type EventPoint } from '../viewport.ts';

export class TimelineData {
	meta = $state<IndexMeta | null>(null);
	/** チャンクロードごとに増える。points再計算のトリガ */
	version = $state(0);
	loadError = $state<string | null>(null);

	#events = new Map<string, NewsEvent>();
	#loaded = new Set<string>();
	#pending = new Set<string>();
	#availableDecades: ReadonlySet<string> = new Set();

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
			this.#availableDecades = new Set(meta.decades.map((d) => d.key));
			this.#addEvents(overview);
			this.meta = meta;
		} catch (e) {
			this.loadError = String(e);
		}
	}

	/** 可視範囲+バッファに必要な十年チャンクをロードする（多重ロード防止付き） */
	ensureRange(fromDay: number, toDay: number): void {
		for (const key of decadeKeysInRange(fromDay, toDay, this.#availableDecades)) {
			if (this.#loaded.has(key) || this.#pending.has(key)) continue;
			this.#pending.add(key);
			void fetchJson<NewsEvent[]>(`/data/decades/${key}.json`)
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

	byId(id: string): NewsEvent | undefined {
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
