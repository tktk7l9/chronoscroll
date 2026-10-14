import { describe, expect, it } from 'vitest';
import {
	collectionListCounts,
	computeReadmeStats,
	formatCount,
	syncReadme,
	type ReadmeField,
	type ReadmeStats,
} from './readme-stats.ts';

const image = { src: 'x.jpg', width: 1, height: 1, credit: 'c' };
const related = [{ id: 'b', date: '2000-01-01', title: 't' }];

const STATS: ReadmeStats = {
	total: 12345,
	withImage: 4000,
	withRelated: 5000,
	curated: 1001,
	collectionCounts: [3, 10, 7],
	newlyWritten: 6,
};

/** The README lines the fields read, with the numbers of STATS */
const README = [
	'- **特集** — アニメ／中国の**3本20件**を年代順に通読できる',
	'- **イベント個別ページ** — 全12,345件をJSなしの静的HTMLとしてprerender',
	'- **収録データの明示** — ヘッダーに総件数と収録期間（`全12,345件 · 1829年1月1日 〜 2026年10月1日`）を常時表示',
	'- **ハイブリッドキュレーション** — 自動生成27,000件+ `content/curated/` の手動キュレーション1,001件（要約リライト・SVG割当）+ `content/collections/` の特集3本20件（うち6件は年ページに載らない）',
	'- 収録イベント: **12,345件**（1829-01-01 〜 現在）',
	'- 特集: **3本 / 20件**（アニメ10・将棋・囲碁・チェス7・写真とカメラ3。うち6件は新規執筆、残りはキュレーション）',
	'- オリジナルSVGピクトグラム: 114点 / 手動キュレーション: 1,001件（トップ423件を人手レビュー）',
	'- 画像付きイベント: 4,000件（Wikimedia Commonsサムネイル）',
	'- 関連リンク付きイベント: 5,000件（全体の約41%。自動算出+手動指定）',
].join('\n');

describe('computeReadmeStats', () => {
	it('counts events, images and related links, and keeps the given counts', () => {
		const stats = computeReadmeStats({
			events: [{ image, related }, { related: [] }, {}, { image }],
			curated: 9,
			collectionCounts: [2, 1],
			newlyWritten: 1,
		});
		expect(stats).toEqual({
			total: 4,
			withImage: 2,
			withRelated: 1,
			curated: 9,
			collectionCounts: [2, 1],
			newlyWritten: 1,
		});
	});
});

describe('formatCount', () => {
	it('writes thousands separators', () => {
		expect(formatCount(7)).toBe('7');
		expect(formatCount(998)).toBe('998');
		expect(formatCount(27440)).toBe('27,440');
		expect(formatCount(1234567)).toBe('1,234,567');
	});
});

describe('collectionListCounts', () => {
	it('reads the count after each name of the per-collection list, names with ・ included', () => {
		expect(collectionListCounts(README)).toEqual([10, 7, 3]);
	});

	it('is null without the list', () => {
		expect(collectionListCounts('no list here')).toBeNull();
	});
});

describe('syncReadme', () => {
	it('finds nothing to change when every number matches', () => {
		const r = syncReadme(README, STATS);
		expect(r).toEqual({ text: README, mismatches: [], missing: [], listProblems: [] });
	});

	it('reports stale numbers and rewrites only the numbers', () => {
		const stale = README.replace('5,000件（全体の約41%', '5,006件（全体の約40%').replace('全12,345件をJS', '全12,300件をJS');
		const r = syncReadme(stale, STATS);
		expect(r.mismatches).toEqual([
			{ field: 'features: event pages', found: '12,300', expected: '12,345' },
			{ field: 'scale: related', found: '5,006', expected: '5,000' },
			{ field: 'scale: related', found: '40', expected: '41' },
		]);
		expect(r.text).toBe(README);
	});

	it('reports a field whose line is missing or appears twice', () => {
		const withoutImages = README.replace('画像付きイベント', '画像のあるイベント');
		expect(syncReadme(withoutImages, STATS).missing).toEqual(['scale: images']);
		const twice = `${README}\n- 画像付きイベント: 4,000件`;
		expect(syncReadme(twice, STATS).missing).toEqual(['scale: images']);
	});

	it('checks the hand-written per-collection list against the collection counts', () => {
		const wrongList = README.replace('写真とカメラ3。', '写真とカメラ4。');
		expect(syncReadme(wrongList, STATS).listProblems).toEqual([
			'the per-collection list has 10,7,4 (want the counts 10,7,3, largest first)',
		]);
		const noList = README.replace('（アニメ10・将棋・囲碁・チェス7・写真とカメラ3。', '（');
		expect(syncReadme(noList, STATS).listProblems).toEqual(['the per-collection list was not found']);
	});

	it('takes other fields', () => {
		const fields: ReadmeField[] = [{ name: 'only', pattern: /画像付きイベント: ([\d,]+)件/g, values: () => ['1'] }];
		const r = syncReadme(README, STATS, fields);
		expect(r.mismatches).toEqual([{ field: 'only', found: '4,000', expected: '1' }]);
		expect(r.text).toContain('画像付きイベント: 1件');
	});
});
