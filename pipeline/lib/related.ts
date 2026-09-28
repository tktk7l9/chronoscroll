/**
 * Computing related events.
 * An event's sources are links to real Wikipedia articles, so
 * "two events that cite the same article" are very likely truly related
 * (unlike dedupe's near-duplicate check, they are linked by an exact identifier, the article title, so
 * false links from boilerplate such as "separate laws enacted on the same day" do not happen).
 * Links that are too contextual, such as place and country names (isGeoLikeTarget in score.ts), are excluded from the linking keys.
 */
import type { NewsEvent, RelatedRef } from '../../src/lib/types.ts';
import { isGeoLikeTarget } from './score.ts';

export const MAX_RELATED = 4;

const YEAR_SOURCE_RE = /^Wikipedia: \d{4}年$/;

/** Recover the page's canonical title from the Wikipedia URL that buildEvent assembles */
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
 * The set of entity titles an event mentions.
 * Sources pointing to the year page itself (`Wikipedia: YYYY年`) and place-name-like articles are excluded.
 * Because titles are recovered from URLs, they are not affected by label variations (the label side of [[target|label]]).
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
 * Link events that cite the same entity.
 * For each event, return the top maxRelated other events by importance among those sharing an entity
 * (ties by ascending date). If no entity is shared, no Map entry is created.
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
