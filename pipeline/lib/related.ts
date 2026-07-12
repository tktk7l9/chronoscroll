/**
 * 関連イベントの算出。
 * イベントの出典（sources）はWikipediaの実在記事へのリンクなので、
 * 「同じ記事を出典に持つ2件のイベント」は高い確度で本当に関連している
 * （dedupeの近似重複判定と違い、記事タイトルという厳密な識別子で結びつけるため
 * 「同日に成立した別々の法律」のような定型文由来の誤結合は起きない）。
 * 地名・国名など文脈的すぎるリンク（score.tsのisGeoLikeTarget）は関連付けの鍵から除外する。
 */
import type { NewsEvent, RelatedRef } from '../../src/lib/types.ts';
import { isGeoLikeTarget } from './score.ts';

export const MAX_RELATED = 4;

const YEAR_SOURCE_RE = /^Wikipedia: \d{4}年$/;

/** buildEvent が組み立てる Wikipedia URL からページの正規タイトルを復元する */
export function articleTitleFromUrl(url: string): string | null {
	const m = url.match(/\/wiki\/(.+)$/);
	if (!m) return null;
	try {
		return decodeURIComponent(m[1]).replace(/_/g, ' ');
	} catch {
		return null;
	}
}

/**
 * イベントが言及する実体のタイトル集合。
 * 年ページ自体への出典（`Wikipedia: YYYY年`）と地名的な記事は除外する。
 * URLから復元するため、表記揺れのあるラベル（[[target|label]]のlabel側）に左右されない。
 */
export function entityTitles(ev: Pick<NewsEvent, 'sources'>): string[] {
	const titles: string[] = [];
	for (const s of ev.sources) {
		if (YEAR_SOURCE_RE.test(s.label)) continue;
		const title = articleTitleFromUrl(s.url);
		if (title && !isGeoLikeTarget(title)) titles.push(title);
	}
	return titles;
}

type RelatableEvent = Pick<NewsEvent, 'id' | 'date' | 'title' | 'importance' | 'sources'>;

/**
 * 同じ実体を出典に持つイベント同士を結びつける。
 * 各イベントについて、実体を共有する他イベントのうち重要度上位 maxRelated 件を返す
 * （同率は日付昇順）。共有する実体がなければMapにエントリを作らない。
 */
export function computeRelated(
	events: readonly RelatableEvent[],
	maxRelated = MAX_RELATED,
): Map<string, RelatedRef[]> {
	const byEntity = new Map<string, RelatableEvent[]>();
	for (const ev of events) {
		for (const title of entityTitles(ev)) {
			const group = byEntity.get(title);
			if (group) group.push(ev);
			else byEntity.set(title, [ev]);
		}
	}

	const candidatesById = new Map<string, Map<string, RelatableEvent>>();
	for (const group of byEntity.values()) {
		if (group.length < 2) continue;
		for (const ev of group) {
			let bucket = candidatesById.get(ev.id);
			if (!bucket) {
				bucket = new Map();
				candidatesById.set(ev.id, bucket);
			}
			for (const other of group) {
				if (other.id !== ev.id) bucket.set(other.id, other);
			}
		}
	}

	const result = new Map<string, RelatedRef[]>();
	for (const [id, bucket] of candidatesById) {
		const sorted = [...bucket.values()].sort((a, b) => {
			if (a.importance !== b.importance) return b.importance - a.importance;
			return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
		});
		result.set(
			id,
			sorted.slice(0, maxRelated).map((e) => ({ id: e.id, date: e.date, title: e.title })),
		);
	}
	return result;
}
