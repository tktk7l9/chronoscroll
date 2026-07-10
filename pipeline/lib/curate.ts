import { load } from 'js-yaml';
import type { NewsEvent } from '../../src/lib/types.ts';

/** content/curated/*.yaml の1エントリ。既存イベントの上書き、または新規追加 */
export interface CuratedEntry extends Partial<Omit<NewsEvent, 'id'>> {
	id: string;
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
	/** idが既存イベントに一致せず、新規追加の必須項目も足りないもの */
	unmatched: string[];
}

/** 生成イベントへcurated層を適用する。既存idは部分上書き、完全なエントリは新規追加 */
export function applyCurated(
	events: readonly NewsEvent[],
	entries: readonly CuratedEntry[],
): CurateResult {
	const byId = new Map(events.map((e) => [e.id, { ...e }]));
	const updated: string[] = [];
	const added: string[] = [];
	const unmatched: string[] = [];

	for (const entry of entries) {
		const { id, ...fields } = entry;
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
