import { load } from 'js-yaml';
import type { NewsEvent } from '../../src/lib/types.ts';

/** One entry of content/curated/*.yaml. Overrides an existing event or adds a new one */
export interface CuratedEntry extends Partial<Omit<NewsEvent, 'id' | 'related'>> {
	id: string;
	/**
	 * Ids of other events to link explicitly (overrides and reinforces the automatic linking).
	 * Its type differs from NewsEvent.related (RelatedRef[]), so it is kept as a separate field, and
	 * unlike normal fields, applyCurated does not write it into the event automatically
	 * (the final assembly of related is done by pipeline/lib/related.ts).
	 */
	relatedIds?: readonly string[];
	/**
	 * Why the event is dropped (required, non-empty). An entry with `suppress` removes the generated event with
	 * that id, for a line of the year page that is not an event at all (a list line from inside a <ref>, a bare
	 * 「…も参照」 line). Everything else is derived from the events (chunks, overview, search, collections,
	 * related links, sitemap, /e/ pages), so the event disappears from all of them. Such an entry may not set any
	 * other field: there is nothing left to override. Wrong text belongs in fixes.yaml, not here.
	 */
	suppress?: string;
}

/** Throws unless a `suppress` entry carries a reason and nothing else */
function checkSuppressEntry(entry: Record<string, unknown>): void {
	if (entry.suppress === undefined) return;
	if (typeof entry.suppress !== 'string' || entry.suppress.trim() === '') {
		throw new Error(`curated entry ${entry.id}: suppress needs a reason`);
	}
	const others = Object.keys(entry).filter((k) => k !== 'id' && k !== 'suppress');
	if (others.length > 0) {
		throw new Error(`curated entry ${entry.id}: a suppressed entry cannot set ${others.join(', ')}`);
	}
}

export function parseCuratedYaml(yamlText: string): CuratedEntry[] {
	if (yamlText.trim() === '') return [];
	const data = load(yamlText);
	if (data == null) return [];
	if (!Array.isArray(data)) throw new Error('curated YAML must be an array');
	for (const entry of data) {
		if (typeof entry?.id !== 'string' || entry.id === '') {
			throw new Error(`curated entry has no id: ${JSON.stringify(entry)}`);
		}
		checkSuppressEntry(entry);
	}
	return data as CuratedEntry[];
}

/**
 * Ids whose `date` lies in a different year than the id prefix (ids are 「YYYY-MM-DD-…」).
 * A date override keeps the id, so a correction must stay within the year: the client loads the chunk of a
 * deep link (?e=<id>) from the id prefix (loadById in src/lib/state), while buildChunks places the event by its
 * date, so a cross-year override would put the event where that deep link never looks. Ids without a year
 * prefix cannot be checked and are skipped.
 */
export function crossYearDateOverrides(entries: readonly CuratedEntry[]): string[] {
	return entries
		.filter((e) => e.date !== undefined && /^\d{4}-/.test(e.id) && e.date.slice(0, 4) !== e.id.slice(0, 4))
		.map((e) => e.id);
}

export interface CurateResult {
	events: NewsEvent[];
	updated: string[];
	added: string[];
	/**
	 * Entries whose id matches no existing event and that lack the required fields for a new event
	 * (a `suppress` entry whose event no longer exists lands here too)
	 */
	unmatched: string[];
	/** Ids removed by a `suppress` entry, in entry order */
	suppressed: string[];
}

/** Ids that a `suppress` entry removes */
export function suppressedIds(entries: readonly CuratedEntry[]): Set<string> {
	return new Set(entries.filter((e) => e.suppress !== undefined).map((e) => e.id));
}

/**
 * Apply the curated layer to the generated events. Existing ids are partially overridden; complete entries are
 * added as new; ids with a `suppress` entry are removed (whatever other entries say about them, in any order).
 */
export function applyCurated(
	events: readonly NewsEvent[],
	entries: readonly CuratedEntry[],
): CurateResult {
	const byId = new Map(events.map((e) => [e.id, { ...e }]));
	const updated: string[] = [];
	const added: string[] = [];
	const unmatched: string[] = [];
	const suppressed: string[] = [];
	const suppress = suppressedIds(entries);

	for (const entry of entries) {
		// A suppressed id is removed below, so neither its suppress entry nor any override of it applies
		if (suppress.has(entry.id)) continue;
		// relatedIds is not a direct field of NewsEvent, so exclude it from the normal copy
		const { id, relatedIds: _relatedIds, ...fields } = entry;
		const existing = byId.get(id);
		if (existing) {
			for (const [k, v] of Object.entries(fields)) {
				if (v !== undefined) (existing as Record<string, unknown>)[k] = v;
			}
			updated.push(id);
			continue;
		}
		if (fields.date && fields.title && fields.summary) {
			byId.set(id, {
				id,
				date: fields.date,
				precision: fields.precision ?? 'day',
				title: fields.title,
				summary: fields.summary,
				category: fields.category ?? 'society',
				region: fields.region ?? 'japan',
				importance: fields.importance ?? 100,
				sources: fields.sources ?? [],
				...(fields.image ? { image: fields.image } : {}),
				...(fields.svg ? { svg: fields.svg } : {}),
			});
			added.push(id);
			continue;
		}
		unmatched.push(id);
	}

	for (const id of suppress) {
		if (byId.delete(id)) suppressed.push(id);
		else unmatched.push(id);
	}

	return { events: [...byId.values()], updated, added, unmatched, suppressed };
}
