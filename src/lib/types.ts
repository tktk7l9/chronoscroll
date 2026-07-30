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

/** 関連イベントへの参照。詳細ダイアログ/個別ページで即座にリンクを描画できるよう非正規化して埋め込む */
export interface RelatedRef {
	id: string;
	date: string;
	title: string;
}

/**
 * アフィリエイト書籍リンク（content/affiliate/books.yaml 由来）。
 * NewsEvent には一切マージしない。static/data/books.json として別経路で配信する。
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
	/** 同じ実体を出典に持つ、または手動で結びつけた関連イベント（重要度順・最大数件） */
	related?: RelatedRef[];
}

/**
 * 特集（テーマ別にイベントを束ねた読み物）のメタ情報。
 * content/collections/<slug>.yaml 由来で、static/data/collections.json に載る。
 */
export interface CollectionMeta {
	slug: string;
	title: string;
	/** 一覧カードと本文冒頭に出す1〜2文 */
	lead: string;
	/** meta description 用 */
	description: string;
	/** スプライトの symbol id */
	icon?: string;
	count: number;
	/** 収録イベントの最古/最新の日付（ISO） */
	fromDate: string;
	toDate: string;
}

/** static/data/collections/<slug>.json の中身。メタ + 収録イベント本体（日付昇順） */
export interface CollectionDetail extends CollectionMeta {
	events: NewsEvent[];
}

/** static/data/collections.json。一覧と、イベントid→所属slugの逆引き */
export interface CollectionsIndex {
	collections: CollectionMeta[];
	byEvent: Record<string, string[]>;
}

/** 遅延ロード用チャンク（基本は十年、件数が多い十年は5年に分割） */
export interface ChunkMeta {
	key: string;
	fromYear: number;
	toYear: number;
	count: number;
}

/** static/data/index.json のメタ情報 */
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
