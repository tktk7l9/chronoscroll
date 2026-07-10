export type Category =
	| 'politics'
	| 'economy'
	| 'culture'
	| 'science'
	| 'sports'
	| 'disaster'
	| 'society'
	| 'war';

export type Region = 'japan' | 'world' | 'both';

export type Precision = 'day' | 'month' | 'year';

export interface EventSource {
	label: string;
	url: string;
}

export interface EventImage {
	src: string;
	width: number;
	height: number;
	credit: string;
}

export interface NewsEvent {
	id: string;
	/** ISO yyyy-mm-dd（precision が month/year の場合は 01 埋め） */
	date: string;
	precision: Precision;
	title: string;
	summary: string;
	category: Category;
	region: Region;
	/** 注目度 0-100。ズームLODの表示閾値に使う */
	importance: number;
	sources: EventSource[];
	image?: EventImage;
	/** スプライトの symbol id（トップ層のみ） */
	svg?: string;
}

export interface DecadeMeta {
	key: string;
	count: number;
}

/** static/data/index.json のメタ情報 */
export interface IndexMeta {
	generatedAt: string;
	minDate: string;
	maxDate: string;
	total: number;
	decades: DecadeMeta[];
}

export const CATEGORIES: readonly Category[] = [
	'politics',
	'economy',
	'culture',
	'science',
	'sports',
	'disaster',
	'society',
	'war',
] as const;

export const CATEGORY_LABELS: Record<Category, string> = {
	politics: '政治',
	economy: '経済',
	culture: '文化',
	science: '科学',
	sports: 'スポーツ',
	disaster: '災害',
	society: '社会',
	war: '戦争',
};

export const REGION_LABELS: Record<Region, string> = {
	japan: '日本',
	world: '世界',
	both: '日本・世界',
};
