import type { CollectionMeta, IndexMeta, NewsEvent } from '../lib/types.ts';

/** A small, fully synthetic event for component tests (no real dataset rows) */
export function makeEvent(overrides: Partial<NewsEvent> = {}): NewsEvent {
	return {
		id: '1900-01-01-test',
		date: '1900-01-01',
		precision: 'day',
		title: 'テストのできごと',
		summary: 'テスト用の要約です。',
		category: 'politics',
		region: 'japan',
		importance: 90,
		sources: [{ label: 'Wikipedia「1900年」', url: 'https://ja.wikipedia.org/wiki/1900%E5%B9%B4' }],
		...overrides,
	};
}

export function makeCollection(overrides: Partial<CollectionMeta> = {}): CollectionMeta {
	return {
		slug: 'test-theme',
		title: 'テスト特集',
		lead: '特集のリード文',
		description: '特集の説明文',
		count: 3,
		fromDate: '1900-01-01',
		toDate: '1950-12-31',
		...overrides,
	};
}

export function makeMeta(overrides: Partial<IndexMeta> = {}): IndexMeta {
	return {
		generatedAt: '2026-01-01T00:00:00Z',
		minDate: '1900-01-01',
		maxDate: '1999-12-31',
		total: 200,
		chunks: [
			{ key: '1900s', fromYear: 1900, toYear: 1949, count: 50 },
			{ key: '1950s', fromYear: 1950, toYear: 1999, count: 150 },
		],
		...overrides,
	};
}
