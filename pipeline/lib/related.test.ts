import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../../src/lib/types.ts';
import { articleTitleFromUrl, computeRelated, entityTitles } from './related.ts';

function wikiUrl(title: string): string {
	return `https://ja.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function ev(
	id: string,
	date: string,
	importance: number,
	sources: NewsEvent['sources'],
	title = id,
): Pick<NewsEvent, 'id' | 'date' | 'title' | 'importance' | 'sources'> {
	return { id, date, title, importance, sources };
}

describe('articleTitleFromUrl', () => {
	it('URLエンコード・アンダースコアを復元する', () => {
		expect(articleTitleFromUrl(wikiUrl('東京オリンピック'))).toBe('東京オリンピック');
		expect(articleTitleFromUrl(wikiUrl('A B'))).toBe('A B');
	});

	it('/wiki/ を含まないURLはnull', () => {
		expect(articleTitleFromUrl('https://example.com/x')).toBeNull();
	});

	it('不正なパーセントエンコーディングはnull（例外を握りつぶす）', () => {
		expect(articleTitleFromUrl('https://ja.wikipedia.org/wiki/%E3%81')).toBeNull();
	});
});

describe('entityTitles', () => {
	it('年ページの出典は除外する', () => {
		const titles = entityTitles({
			sources: [
				{ label: 'Wikipedia: 東京オリンピック', url: wikiUrl('東京オリンピック') },
				{ label: 'Wikipedia: 1964年', url: wikiUrl('1964年') },
			],
		});
		expect(titles).toEqual(['東京オリンピック']);
	});

	it('地名的な記事は除外する', () => {
		const titles = entityTitles({
			sources: [
				{ label: 'Wikipedia: アメリカ', url: wikiUrl('アメリカ') },
				{ label: 'Wikipedia: ChatGPT', url: wikiUrl('ChatGPT') },
			],
		});
		expect(titles).toEqual(['ChatGPT']);
	});

	it('出典がなければ空配列', () => {
		expect(entityTitles({ sources: [] })).toEqual([]);
	});

	it('ラベルの表記揺れに左右されずURLから正規タイトルを復元する', () => {
		const titles = entityTitles({
			sources: [{ label: 'Wikipedia: 阪神・淡路大震災', url: wikiUrl('兵庫県南部地震') }],
		});
		expect(titles).toEqual(['兵庫県南部地震']);
	});
});

describe('computeRelated', () => {
	it('同じ実体を出典に持つ2件を相互に関連付ける', () => {
		const events = [
			ev('a', '2016-03-09', 90, [{ label: 'Wikipedia: AlphaGo', url: wikiUrl('AlphaGo') }]),
			ev('b', '2017-06-12', 80, [{ label: 'Wikipedia: AlphaGo', url: wikiUrl('AlphaGo') }]),
		];
		const rel = computeRelated(events);
		expect(rel.get('a')).toEqual([{ id: 'b', date: '2017-06-12', title: 'b' }]);
		expect(rel.get('b')).toEqual([{ id: 'a', date: '2016-03-09', title: 'a' }]);
	});

	it('実体を共有しなければMapにエントリを作らない', () => {
		const events = [
			ev('a', '2000-01-01', 50, [{ label: 'Wikipedia: X', url: wikiUrl('X') }]),
			ev('b', '2000-01-02', 50, [{ label: 'Wikipedia: Y', url: wikiUrl('Y') }]),
		];
		const rel = computeRelated(events);
		expect(rel.has('a')).toBe(false);
		expect(rel.has('b')).toBe(false);
	});

	it('地名だけを共有していても関連付けない（誤結合防止）', () => {
		const events = [
			ev('a', '2000-01-01', 50, [{ label: 'Wikipedia: 日本', url: wikiUrl('日本') }]),
			ev('b', '2000-01-02', 50, [{ label: 'Wikipedia: 日本', url: wikiUrl('日本') }]),
		];
		expect(computeRelated(events).size).toBe(0);
	});

	it('重要度降順・同点は日付昇順で上位maxRelated件に絞る', () => {
		const shared = { label: 'Wikipedia: X', url: wikiUrl('X') };
		const events = [
			ev('center', '2000-01-01', 50, [shared]),
			ev('hi', '2001-01-01', 90, [shared]),
			ev('mid', '2002-01-01', 70, [shared]),
			ev('tie1', '2003-01-01', 60, [shared]),
			ev('tie2', '2001-06-01', 60, [shared]),
			ev('lo', '2004-01-01', 10, [shared]),
		];
		const rel = computeRelated(events, 3);
		expect(rel.get('center')).toEqual([
			{ id: 'hi', date: '2001-01-01', title: 'hi' },
			{ id: 'mid', date: '2002-01-01', title: 'mid' },
			{ id: 'tie2', date: '2001-06-01', title: 'tie2' },
		]);
	});

	it('重要度・日付とも同じ候補が複数あってもソートが安定して破綻しない', () => {
		const shared = { label: 'Wikipedia: X', url: wikiUrl('X') };
		const events = [
			ev('a', '2000-01-01', 50, [shared]),
			ev('b', '2000-06-01', 50, [shared]),
			ev('c', '2000-06-01', 50, [shared]),
		];
		const rel = computeRelated(events);
		expect(rel.get('a')?.map((r) => r.id).sort()).toEqual(['b', 'c']);
	});

	it('自分自身は候補に含まれない', () => {
		const shared = { label: 'Wikipedia: X', url: wikiUrl('X') };
		const events = [ev('a', '2000-01-01', 50, [shared]), ev('b', '2000-01-02', 50, [shared])];
		const rel = computeRelated(events);
		expect(rel.get('a')?.some((r) => r.id === 'a')).toBe(false);
	});

	it('複数の実体を共有していても相手は重複しない', () => {
		const shared1 = { label: 'Wikipedia: X', url: wikiUrl('X') };
		const shared2 = { label: 'Wikipedia: Y', url: wikiUrl('Y') };
		const events = [
			ev('a', '2000-01-01', 50, [shared1, shared2]),
			ev('b', '2000-01-02', 40, [shared1, shared2]),
		];
		const rel = computeRelated(events);
		expect(rel.get('a')).toEqual([{ id: 'b', date: '2000-01-02', title: 'b' }]);
	});
});
