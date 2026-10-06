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

/** Reference to a related event. Denormalized and embedded so the detail dialog / detail page can render links immediately */
export interface RelatedRef {
	id: string;
	date: string;
	title: string;
}

/**
 * Affiliate book links (from content/affiliate/books.yaml).
 * Never merged into NewsEvent. Served through a separate path as static/data/books.json.
 */
export interface BookRef {
	title: string;
	author?: string;
	store: 'amazon' | 'rakuten';
	asin?: string;
	url?: string;
}

export interface NewsEvent {
	id: string;
	/** ISO yyyy-mm-dd (padded with 01 when precision is month/year) */
	date: string;
	precision: Precision;
	title: string;
	summary: string;
	category: Category;
	region: Region;
	/** Prominence 0-100. Used as the display threshold for zoom LOD */
	importance: number;
	sources: EventSource[];
	image?: EventImage;
	/** Sprite symbol id (top tier only) */
	svg?: string;
	/** Related events that cite the same entity or were linked manually (by importance, a few at most) */
	related?: RelatedRef[];
}

/**
 * Card-only slice of an overview event (static/data/overview-lite.json).
 * The first screen needs only what a timeline card draws and what LOD/filters read, so the
 * initial fetch is about a quarter of overview.json (LCP). The detail dialog still reads the
 * full event, which arrives with overview.json right after.
 */
export type OverviewLiteEvent = Pick<
	NewsEvent,
	'id' | 'date' | 'precision' | 'title' | 'category' | 'region' | 'importance' | 'svg'
>;

/**
 * Metadata for a collection (a themed reading list that groups events).
 * Comes from content/collections/<slug>.yaml and is included in static/data/collections.json.
 */
export interface CollectionMeta {
	slug: string;
	title: string;
	/** One or two sentences shown on the listing card and at the top of the body */
	lead: string;
	/** For the meta description */
	description: string;
	/** Sprite symbol id */
	icon?: string;
	count: number;
	/** Oldest/newest date of the included events (ISO) */
	fromDate: string;
	toDate: string;
}

/** Contents of static/data/collections/<slug>.json. Metadata + included event bodies (ascending by date) */
export interface CollectionDetail extends CollectionMeta {
	events: NewsEvent[];
}

/** static/data/collections.json. The listing and a reverse lookup of event id → slugs it belongs to */
export interface CollectionsIndex {
	collections: CollectionMeta[];
	byEvent: Record<string, string[]>;
}

/** Lazy-load chunk (a decade by default; decades with many events are split into 5 years) */
export interface ChunkMeta {
	key: string;
	fromYear: number;
	toYear: number;
	count: number;
}

/** Metadata of static/data/index.json */
export interface IndexMeta {
	generatedAt: string;
	minDate: string;
	maxDate: string;
	total: number;
	chunks: ChunkMeta[];
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
