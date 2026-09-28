import type { Category, NewsEvent, Region } from './types.ts';
import { CATEGORIES } from './types.ts';

/** null = allow everything. A Set allows only the selected items */
export interface FilterState {
	regions: ReadonlySet<Region> | null;
	categories: ReadonlySet<Category> | null;
	/**
	 * Set of event ids when filtering by a collection.
	 * The URL carries the slug (?k=) rather than the ids, and the id set is resolved from collections.json, so
	 * it is not handled by serializeFilter/parseFilter (url-state.ts holds the slug).
	 */
	collectionIds: ReadonlySet<string> | null;
}

export const EMPTY_FILTER: FilterState = {
	regions: null,
	categories: null,
	collectionIds: null,
};

export function matchesFilter(ev: NewsEvent, f: FilterState): boolean {
	if (f.collectionIds !== null && !f.collectionIds.has(ev.id)) return false;
	if (f.regions !== null) {
		// Events with both match either the japan or world selection
		const hit = ev.region === 'both' ? f.regions.size > 0 : f.regions.has(ev.region);
		if (!hit) return false;
	}
	if (f.categories !== null && !f.categories.has(ev.category)) return false;
	return true;
}

export function isFiltering(f: FilterState): boolean {
	return f.regions !== null || f.categories !== null || f.collectionIds !== null;
}

/** Replace the collection filter (null clears it). The region/category selection is kept as is */
export function withCollection(
	f: FilterState,
	collectionIds: ReadonlySet<string> | null,
): FilterState {
	return { ...f, collectionIds };
}

/** For URLs: CSV like "japan" / "politics,culture". null ⇔ empty string */
export function serializeFilter(f: FilterState): { r: string; c: string } {
	return {
		r: f.regions === null ? '' : [...f.regions].sort().join(','),
		c: f.categories === null ? '' : [...f.categories].sort().join(','),
	};
}

export function parseFilter(r: string, c: string): FilterState {
	const regions = r
		.split(',')
		.filter((x): x is Region => x === 'japan' || x === 'world');
	const cats = c.split(',').filter((x): x is Category => (CATEGORIES as string[]).includes(x));
	return {
		regions: regions.length > 0 ? new Set(regions) : null,
		categories: cats.length > 0 ? new Set(cats) : null,
		collectionIds: null,
	};
}

/** Chip toggle. Clearing everything returns to null (= show all) */
export function toggleIn<T>(current: ReadonlySet<T> | null, value: T): ReadonlySet<T> | null {
	const next = new Set(current ?? []);
	if (next.has(value)) next.delete(value);
	else next.add(value);
	return next.size === 0 ? null : next;
}
