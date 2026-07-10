import { describe, expect, it } from 'vitest';
import { bigramTokenize, buildSearchIndex, runQuery, type SearchDoc } from './search.ts';

describe('bigramTokenize', () => {
	it('日本語はbigramに分解する', () => {
		expect(bigramTokenize('東京五輪')).toEqual(['東京', '京五', '五輪']);
	});

	it('英数字は単語のまま（小文字化）', () => {
		expect(bigramTokenize('iPhone 15 発売')).toEqual(['iphone', '15', '発売']);
	});

	it('1文字の run はそのまま', () => {
		expect(bigramTokenize('雪 が 降る')).toEqual(['雪', 'が', '降る']);
	});

	it('句読点・括弧は区切りとして扱う', () => {
		expect(bigramTokenize('開戦。終戦')).toEqual(['開戦', '終戦']);
	});

	it('空文字は空配列', () => {
		expect(bigramTokenize('')).toEqual([]);
	});
});

describe('buildSearchIndex / runQuery', () => {
	const docs: SearchDoc[] = [
		['e1', '1964-10-10', '東京オリンピック開幕。'],
		['e2', '1964-10-01', '東海道新幹線が開業。'],
		['e3', '2021-07-23', '東京オリンピック（2020年大会）開会式。'],
	];
	const byId = new Map(docs.map((d) => [d[0], d] as const));
	const mini = buildSearchIndex(docs);

	it('日本語クエリでヒットする', () => {
		const hits = runQuery(mini, byId, 'オリンピック');
		expect(hits.map((h) => h.id).sort()).toEqual(['e1', 'e3']);
		expect(hits[0].text).toContain('オリンピック');
	});

	it('AND検索で絞り込める', () => {
		const hits = runQuery(mini, byId, '新幹線 開業');
		expect(hits.map((h) => h.id)).toEqual(['e2']);
	});

	it('空クエリ・ヒットなしは空配列', () => {
		expect(runQuery(mini, byId, '  ')).toEqual([]);
		expect(runQuery(mini, byId, '存在しないもの')).toEqual([]);
	});

	it('limitで件数を制限する', () => {
		expect(runQuery(mini, byId, 'オリンピック', 1)).toHaveLength(1);
	});
});
