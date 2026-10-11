import { load } from 'js-yaml';
import type { CollectionDetail, CollectionMeta, NewsEvent } from '../../src/lib/types.ts';
import type { CuratedEntry } from './curate.ts';
import { sortEvents } from './emit.ts';

/**
 * Contents of content/collections/<slug>.yaml.
 * entries has the same shape as CuratedEntry, and build.ts passes it straight to the curated layer.
 * That way "creating new events", "partially overriding existing events", "id protection from near-duplicate removal",
 * and "manually specifying relatedIds" all work through the existing paths.
 */
export interface CollectionSource {
	slug: string;
	title: string;
	lead: string;
	description: string;
	icon?: string;
	entries: CuratedEntry[];
}

/** The slug used in URLs. Used for both /c/<slug> and ?k=<slug> */
const COLLECTION_SLUG_RE = /^[a-z0-9-]+$/;

function requireString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value === '') {
		throw new Error(`Collection ${label} is empty`);
	}
	return value;
}

export function parseCollectionYaml(yamlText: string): CollectionSource {
	// js-yaml throws on empty input itself, so reject it first with our own message
	if (yamlText.trim() === '') throw new Error('Collection YAML is empty');
	const data = load(yamlText);
	if (data == null || typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('Collection YAML must be a mapping (slug/title/...)');
	}
	const raw = data as Record<string, unknown>;
	const slug = requireString(raw.slug, 'slug');
	if (!COLLECTION_SLUG_RE.test(slug)) {
		throw new Error(`Collection slug may contain only lowercase letters, digits and hyphens: ${slug}`);
	}
	const title = requireString(raw.title, `title(${slug})`);
	const lead = requireString(raw.lead, `lead(${slug})`);
	const description = requireString(raw.description, `description(${slug})`);
	if (raw.icon !== undefined && (typeof raw.icon !== 'string' || raw.icon === '')) {
		throw new Error(`Collection icon(${slug}) is empty`);
	}
	if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
		throw new Error(`Collection (${slug}) entries is empty`);
	}
	for (const entry of raw.entries as { id?: unknown; suppress?: unknown }[]) {
		if (typeof entry?.id !== 'string' || entry.id === '') {
			throw new Error(`Collection (${slug}) entry has no id: ${JSON.stringify(entry)}`);
		}
		// A collection lists events to read; dropping a junk event is done in content/curated/suppress.yaml
		if (entry.suppress !== undefined) {
			throw new Error(`Collection (${slug}) entry ${entry.id}: suppress belongs in content/curated, not in a collection`);
		}
	}
	return {
		slug,
		title,
		lead,
		description,
		...(raw.icon === undefined ? {} : { icon: raw.icon as string }),
		entries: raw.entries as CuratedEntry[],
	};
}

/** Flatten the entries of all collections. build.ts joins them with the curated layer and sends them down the same path */
export function collectionCuratedEntries(
	sources: readonly CollectionSource[],
): CuratedEntry[] {
	return sources.flatMap((s) => s.entries);
}

/**
 * Assemble one collection into data for serving, with the included event bodies.
 * Duplicate ids collapse to the first one, and ids that do not exist are silently dropped
 * (typo detection is handled by unmatchedCollectionIds).
 */
export function buildCollectionDetail(
	source: CollectionSource,
	byId: ReadonlyMap<string, NewsEvent>,
): CollectionDetail {
	const seen = new Set<string>();
	const events: NewsEvent[] = [];
	for (const entry of source.entries) {
		if (seen.has(entry.id)) continue;
		const ev = byId.get(entry.id);
		if (ev === undefined) continue;
		seen.add(entry.id);
		events.push(ev);
	}
	if (events.length === 0) {
		throw new Error(`Collection (${source.slug}) has no events to include`);
	}
	const sorted = sortEvents(events);
	return {
		slug: source.slug,
		title: source.title,
		lead: source.lead,
		description: source.description,
		...(source.icon === undefined ? {} : { icon: source.icon }),
		count: sorted.length,
		fromDate: sorted[0].date,
		toDate: sorted[sorted.length - 1].date,
		events: sorted,
	};
}

/** Take only the listing metadata from the serving data (drop the event bodies) */
export function toCollectionMeta(detail: CollectionDetail): CollectionMeta {
	const { events: _events, ...meta } = detail;
	return meta;
}

/** Reverse lookup event id → collection slug[] it belongs to. Used for "collections that include this" on the detail page */
export function eventCollectionIndex(
	details: readonly CollectionDetail[],
): Record<string, string[]> {
	const index: Record<string, string[]> = {};
	for (const detail of details) {
		for (const ev of detail.events) {
			index[ev.id] = [...(index[ev.id] ?? []), detail.slug];
		}
	}
	return index;
}

/**
 * Return, per collection, references that do not exist in the final set of event ids (for typo detection).
 * Auto-generated ids (hashes of the text) that changed in the monthly Wikipedia regeneration also show up here.
 */
export function unmatchedCollectionIds(
	sources: readonly CollectionSource[],
	validIds: ReadonlySet<string>,
): { slug: string; ids: string[] }[] {
	return sources
		.map((s) => ({ slug: s.slug, ids: s.entries.map((e) => e.id).filter((id) => !validIds.has(id)) }))
		.filter((r) => r.ids.length > 0);
}
