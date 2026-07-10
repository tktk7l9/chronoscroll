import type {
	Category,
	DecadeMeta,
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

/** 日付昇順（同日はid順）の正準ソート */
export function sortEvents(events: readonly NewsEvent[]): NewsEvent[] {
	return [...events].sort((a, b) =>
		a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
	);
}

export function chunkByDecade(events: readonly NewsEvent[]): Map<string, NewsEvent[]> {
	const chunks = new Map<string, NewsEvent[]>();
	for (const ev of sortEvents(events)) {
		const key = decadeKeyOf(Number(ev.date.slice(0, 4)));
		const arr = chunks.get(key);
		if (arr) arr.push(ev);
		else chunks.set(key, [ev]);
	}
	return chunks;
}

/** 初期ロード用: 重要度が閾値以上のイベントのみ */
export function overviewSlice(events: readonly NewsEvent[], minImportance = 95): NewsEvent[] {
	return sortEvents(events.filter((e) => e.importance >= minImportance));
}

/** 検索worker用の軽量ドキュメント [id, date, text] */
export function searchDocs(events: readonly NewsEvent[]): [string, string, string][] {
	return sortEvents(events).map((e) => [e.id, e.date, e.summary]);
}

export type { DecadeMeta, IndexMeta };

export function buildIndexMeta(events: readonly NewsEvent[], generatedAt: string): IndexMeta {
	if (events.length === 0) {
		return { generatedAt, minDate: '', maxDate: '', total: 0, decades: [] };
	}
	const sorted = sortEvents(events);
	const decades = [...chunkByDecade(sorted).entries()].map(([key, evs]) => ({
		key,
		count: evs.length,
	}));
	return {
		generatedAt,
		minDate: sorted[0].date,
		maxDate: sorted[sorted.length - 1].date,
		total: sorted.length,
		decades,
	};
}
