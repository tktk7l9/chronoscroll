/**
 * Keep event ids stable when a year-page line is edited.
 *
 * An id is date + hash of the text, so any Wikipedia edit (a spelling, a link label, a comma) makes a new id. Hand-written
 * content (content/curated, content/collections) and the public /e/<id> URLs refer to ids, so a changed hash would
 * silently drop the curated fix, shrink a collection and orphan the page. The monthly refresh loses the Actions cache
 * after 7 days and refetches every year page, so all edits since the last full fetch land at once.
 *
 * rebindIds pairs each id that left the generated set with the most similar new line of the same day, using the rules
 * of near-duplicate removal, and records the pair in pipeline/sidecar/id-aliases.json. The record matters: the previous
 * text of a curated event is its hand-written summary, which may not resemble the year-page line next month.
 */
import type { NewsEvent } from '../../src/lib/types.ts';
import { bigramJaccard, isDuplicateText, textBigrams } from './dedupe.ts';

export interface ContinuityEvent {
	id: string;
	date: string;
	text: string;
	links: readonly string[];
}

/** generated id (hash of the current text) → stable id */
export type IdAliases = Readonly<Record<string, string>>;

export interface Rebinding {
	/** Generated ids to replace, generated id → stable id */
	rebound: Map<string, string>;
	/** Input aliases plus the pairs found in this run */
	aliases: Record<string, string>;
	/** Previous ids with no line left in the generated set */
	orphans: string[];
}

function byDate(events: readonly ContinuityEvent[]): Map<string, ContinuityEvent[]> {
	const groups = new Map<string, ContinuityEvent[]>();
	for (const e of events) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
	return groups;
}

const similarity = (a: ContinuityEvent, b: ContinuityEvent): number =>
	bigramJaccard(textBigrams(a.text), textBigrams(b.text));

const asDuplicate = (e: ContinuityEvent) => ({ text: e.text, textLength: e.text.length, links: e.links });

/** Candidate pairs of one day, closest first. Ties fall to the ids so that the result does not depend on input order */
function closestPairs(olds: readonly ContinuityEvent[], news: readonly ContinuityEvent[]) {
	return olds
		.flatMap((o) =>
			news
				.filter((n) => isDuplicateText(asDuplicate(o), asDuplicate(n)))
				.map((n) => ({ o, n, score: similarity(o, n) })),
		)
		.sort((a, b) => b.score - a.score || a.o.id.localeCompare(b.o.id) || a.n.id.localeCompare(b.n.id));
}

export function rebindIds(
	generated: readonly ContinuityEvent[],
	previous: readonly ContinuityEvent[],
	aliases: IdAliases,
): Rebinding {
	const generatedIds = new Set(generated.map((e) => e.id));
	const previousIds = new Set(previous.map((e) => e.id));
	const rebound = new Map<string, string>();
	const taken = new Set(generatedIds);
	for (const { id } of generated) {
		const stable = aliases[id];
		if (stable === undefined || taken.has(stable)) continue;
		rebound.set(id, stable);
		taken.add(stable);
	}

	const orphans = previous.filter((e) => !taken.has(e.id));
	const fresh = byDate(generated.filter((e) => !previousIds.has(e.id) && !rebound.has(e.id)));
	const found: Record<string, string> = {};
	for (const [date, olds] of byDate(orphans)) {
		const used = new Set<string>();
		for (const { o, n } of closestPairs(olds, fresh.get(date) ?? [])) {
			if (taken.has(o.id) || used.has(n.id)) continue;
			used.add(n.id);
			taken.add(o.id);
			rebound.set(n.id, o.id);
			found[n.id] = o.id;
		}
	}
	return {
		rebound,
		aliases: { ...aliases, ...found },
		orphans: orphans.filter((e) => !taken.has(e.id)).map((e) => e.id),
	};
}

const ARTICLE_URL = 'https://ja.wikipedia.org/wiki/';

/** The shipped event as continuity input. Its primary link is the only article title the chunks keep */
export function previousEvent(e: NewsEvent): ContinuityEvent {
	const links = e.sources
		.filter((s) => s.url.startsWith(ARTICLE_URL))
		.map((s) => decodeURIComponent(s.url.slice(ARTICLE_URL.length)))
		.filter((title) => !/^\d+年(の日本)?$/.test(title));
	return { id: e.id, date: e.date, text: e.summary, links };
}

/**
 * Orphans that hand-written content still refers to stay on the timeline as they were shipped: a line deleted from a
 * year page must not take a curated event out of a collection. related links are recomputed by the build.
 */
export function eventsToCarry(
	orphans: readonly string[],
	previous: readonly NewsEvent[],
	referenced: ReadonlySet<string>,
): NewsEvent[] {
	const orphanIds = new Set(orphans);
	return previous
		.filter((e) => orphanIds.has(e.id) && referenced.has(e.id))
		.map(({ related: _related, ...event }) => event);
}
