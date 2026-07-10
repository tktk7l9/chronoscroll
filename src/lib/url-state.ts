import type { FilterState } from './filters.ts';
import { EMPTY_FILTER, parseFilter, serializeFilter } from './filters.ts';
import { clampPxPerDay } from './timescale.ts';

/** URLに保持する共有可能な表示状態 */
export interface UrlState {
	/** ビューポート中心の日付 (yyyy-mm-dd)。null=デフォルト（最新） */
	centerDate: string | null;
	/** ズーム (px/日)。null=デフォルト */
	pxPerDay: number | null;
	filter: FilterState;
	query: string;
	/** 詳細表示中のイベントid */
	selectedId: string | null;
}

export const DEFAULT_URL_STATE: UrlState = {
	centerDate: null,
	pxPerDay: null,
	filter: EMPTY_FILTER,
	query: '',
	selectedId: null,
};

/** "1964" → 年央、"1964-10" → 月央、"1964-10-10" → そのまま */
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
	return {
		centerDate: t !== null ? normalizeDateParam(t) : null,
		pxPerDay: Number.isFinite(zNum) && zNum > 0 ? clampPxPerDay(zNum) : null,
		filter: parseFilter(params.get('r') ?? '', params.get('c') ?? ''),
		query: params.get('q') ?? '',
		selectedId: params.get('e'),
	};
}

/** デフォルト値は省略してクエリを組み立てる */
export function serializeUrlState(s: UrlState): URLSearchParams {
	const params = new URLSearchParams();
	if (s.centerDate !== null) params.set('t', s.centerDate);
	if (s.pxPerDay !== null) params.set('z', String(Math.round(s.pxPerDay * 10000) / 10000));
	const { r, c } = serializeFilter(s.filter);
	if (r !== '') params.set('r', r);
	if (c !== '') params.set('c', c);
	if (s.query !== '') params.set('q', s.query);
	if (s.selectedId !== null) params.set('e', s.selectedId);
	return params;
}
