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

/** カードに出す短いタイトル（末尾の句点を落として切り詰め） */
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

/** 1チャンクあたりの上限。超える十年は前半/後半の5年チャンクに分割する */
export const MAX_EVENTS_PER_CHUNK = 1200;

/** 日付昇順（同日はid順）の正準ソート */
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
 * 十年単位にチャンクし、MAX_EVENTS_PER_CHUNK を超える十年は前半/後半の5年に分割する。
 * キーは "1960s"（十年）/ "2020h1"・"2020h2"（5年前半/後半）。
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

/** 初期ロード用: 重要度が閾値以上のイベントのみ */
export function overviewSlice(events: readonly NewsEvent[], minImportance = 95): NewsEvent[] {
	return sortEvents(events.filter((e) => e.importance >= minImportance));
}

/** 検索テキストの上限文字数（索引サイズ抑制。要点は文頭に来るため実用上十分） */
export const SEARCH_TEXT_MAX = 72;

/** 検索worker用の軽量ドキュメント [id, date, text] */
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
