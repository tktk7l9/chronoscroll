import { isCollectionSlug } from './collections.ts';
import type { FilterState } from './filters.ts';
import { EMPTY_FILTER, parseFilter, serializeFilter } from './filters.ts';
import { clampPxPerDay } from './timescale.ts';

/** Shareable view state kept in the URL */
export interface UrlState {
	/** Date at the center of the viewport (yyyy-mm-dd). null = default (latest) */
	centerDate: string | null;
	/** Zoom (px/day). null = default */
	pxPerDay: number | null;
	filter: FilterState;
	query: string;
	/** Id of the event shown in detail */
	selectedId: string | null;
	/** Slug of the collection being filtered by. The id set is resolved from collections.json, so only the slug goes in the URL */
	collection: string | null;
}

export const DEFAULT_URL_STATE: UrlState = {
	centerDate: null,
	pxPerDay: null,
	filter: EMPTY_FILTER,
	query: '',
	selectedId: null,
	collection: null,
};

/** "1964" → middle of the year, "1964-10" → middle of the month, "1964-10-10" → as is */
export function normalizeDateParam(t: string): string | null {
	if (/^\d{4}$/.test(t)) return `${t}-07-01`;
	if (/^\d{4}-\d{2}$/.test(t)) return `${t}-15`;
	if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
	return null;
}

export function parseUrlState(params: URLSearchParams): UrlState {
	const t = params.get('t');
	const z = params.get('z');
	const zNum = z === null ? NaN : Number(z);
	const k = params.get('k');
	return {
		centerDate: t !== null ? normalizeDateParam(t) : null,
		pxPerDay: Number.isFinite(zNum) && zNum > 0 ? clampPxPerDay(zNum) : null,
		filter: parseFilter(params.get('r') ?? '', params.get('c') ?? ''),
		query: params.get('q') ?? '',
		selectedId: params.get('e'),
		collection: k !== null && isCollectionSlug(k) ? k : null,
	};
}

/** Build the query, omitting default values */
export function serializeUrlState(s: UrlState): URLSearchParams {
	const params = new URLSearchParams();
	if (s.centerDate !== null) params.set('t', s.centerDate);
	if (s.pxPerDay !== null) params.set('z', String(Math.round(s.pxPerDay * 10000) / 10000));
	const { r, c } = serializeFilter(s.filter);
	if (r !== '') params.set('r', r);
	if (c !== '') params.set('c', c);
	if (s.query !== '') params.set('q', s.query);
	if (s.selectedId !== null) params.set('e', s.selectedId);
	if (s.collection !== null) params.set('k', s.collection);
	return params;
}
