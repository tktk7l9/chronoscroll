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
}

export function parseCuratedYaml(yamlText: string): CuratedEntry[] {
	if (yamlText.trim() === '') return [];
	const data = load(yamlText);
	if (data == null) return [];
	if (!Array.isArray(data)) throw new Error('curated YAMLは配列である必要があります');
	for (const entry of data) {
		if (typeof entry?.id !== 'string' || entry.id === '') {
			throw new Error(`curatedエントリに id がありません: ${JSON.stringify(entry)}`);
		}
	}
	return data as CuratedEntry[];
}

export interface CurateResult {
	events: NewsEvent[];
	updated: string[];
	added: string[];
	/** Entries whose id matches no existing event and that lack the required fields for a new event */
	unmatched: string[];
}

/** Apply the curated layer to the generated events. Existing ids are partially overridden; complete entries are added as new */
export function applyCurated(
	events: readonly NewsEvent[],
	entries: readonly CuratedEntry[],
): CurateResult {
	const byId = new Map(events.map((e) => [e.id, { ...e }]));
	const updated: string[] = [];
	const added: string[] = [];
	const unmatched: string[] = [];

	for (const entry of entries) {
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

	return { events: [...byId.values()], updated, added, unmatched };
}
