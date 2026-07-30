import type { Category, NewsEvent, Region } from './types.ts';
import { CATEGORIES } from './types.ts';

/** null = 全て許可。Setは選択されたもののみ許可 */
export interface FilterState {
	regions: ReadonlySet<Region> | null;
	categories: ReadonlySet<Category> | null;
	/**
	 * 特集で絞り込み中のイベントid集合。
	 * URLにはid列ではなく slug（?k=）が乗り、id集合は collections.json から解決するため
	 * serializeFilter/parseFilter の対象にはしない（url-state.ts が slug を持つ）。
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
		// both のイベントは japan/world どちらの選択にも合致する
		const hit = ev.region === 'both' ? f.regions.size > 0 : f.regions.has(ev.region);
		if (!hit) return false;
	}
	if (f.categories !== null && !f.categories.has(ev.category)) return false;
	return true;
}

export function isFiltering(f: FilterState): boolean {
	return f.regions !== null || f.categories !== null || f.collectionIds !== null;
}

/** 特集の絞り込みを差し替える（解除は null）。地域/カテゴリの選択はそのまま残す */
export function withCollection(
	f: FilterState,
	collectionIds: ReadonlySet<string> | null,
): FilterState {
	return { ...f, collectionIds };
}

/** URL用: "japan" / "politics,culture" のようなCSV。null⇔空文字 */
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

/** チップのトグル操作。全解除で null（=全て表示）に戻す */
export function toggleIn<T>(current: ReadonlySet<T> | null, value: T): ReadonlySet<T> | null {
	const next = new Set(current ?? []);
	if (next.has(value)) next.delete(value);
	else next.add(value);
	return next.size === 0 ? null : next;
}
