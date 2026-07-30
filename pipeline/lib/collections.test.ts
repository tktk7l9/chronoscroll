import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../../src/lib/types.ts';
import {
	buildCollectionDetail,
	collectionCuratedEntries,
	eventCollectionIndex,
	parseCollectionYaml,
	toCollectionMeta,
	unmatchedCollectionIds,
	type CollectionSource,
} from './collections.ts';

const YAML = [
	'slug: anime',
	'title: アニメの歴史',
	'lead: リード文',
	'description: 説明文',
	'icon: art-anime',
	'entries:',
	'  - id: 1963-01-01-a',
	'  - id: 1917-06-30-b',
].join('\n');

function ev(id: string, date: string): NewsEvent {
	return {
		id,
		date,
		precision: 'day',
		title: `title-${id}`,
		summary: 's',
		category: 'culture',
		region: 'japan',
		importance: 50,
		sources: [],
	};
}

function source(over: Partial<CollectionSource> = {}): CollectionSource {
	return {
		slug: 'anime',
		title: 'アニメの歴史',
		lead: 'リード文',
		description: '説明文',
		entries: [{ id: 'a' }, { id: 'b' }],
		...over,
	};
}

describe('parseCollectionYaml', () => {
	it('メタとentriesをパースする', () => {
		expect(parseCollectionYaml(YAML)).toEqual({
			slug: 'anime',
			title: 'アニメの歴史',
			lead: 'リード文',
			description: '説明文',
			icon: 'art-anime',
			entries: [{ id: '1963-01-01-a' }, { id: '1917-06-30-b' }],
		});
	});

	it('iconは省略できる', () => {
		const parsed = parseCollectionYaml(
			'slug: a\ntitle: T\nlead: L\ndescription: D\nentries:\n  - id: x\n',
		);
		expect(parsed.icon).toBeUndefined();
		expect('icon' in parsed).toBe(false);
	});

	it('空ファイルはエラー', () => {
		expect(() => parseCollectionYaml('')).toThrow('空です');
		expect(() => parseCollectionYaml('  \n')).toThrow('空です');
	});

	it('マッピングでなければエラー', () => {
		expect(() => parseCollectionYaml('~\n')).toThrow('マッピング');
		expect(() => parseCollectionYaml('- id: a')).toThrow('マッピング');
	});

	it('slugが無い・空ならエラー', () => {
		expect(() => parseCollectionYaml('title: T')).toThrow('slugが空です');
		expect(() => parseCollectionYaml('slug: ""\ntitle: T')).toThrow('slugが空です');
	});

	it('slugに使えない文字があればエラー', () => {
		expect(() => parseCollectionYaml('slug: Anime_1\ntitle: T')).toThrow('ハイフンのみ');
	});

	it('title/lead/descriptionが無ければエラー', () => {
		expect(() => parseCollectionYaml('slug: a')).toThrow('title(a)が空です');
		expect(() => parseCollectionYaml('slug: a\ntitle: T')).toThrow('lead(a)が空です');
		expect(() => parseCollectionYaml('slug: a\ntitle: T\nlead: L')).toThrow(
			'description(a)が空です',
		);
	});

	it('iconが空文字や文字列以外ならエラー', () => {
		const head = 'slug: a\ntitle: T\nlead: L\ndescription: D\n';
		expect(() => parseCollectionYaml(`${head}icon: ""`)).toThrow('icon(a)が空です');
		expect(() => parseCollectionYaml(`${head}icon: 3`)).toThrow('icon(a)が空です');
	});

	it('entriesが無い・空配列ならエラー', () => {
		const head = 'slug: a\ntitle: T\nlead: L\ndescription: D\n';
		expect(() => parseCollectionYaml(head)).toThrow('entriesが空です');
		expect(() => parseCollectionYaml(`${head}entries: []`)).toThrow('entriesが空です');
	});

	it('entryにidが無い・空文字ならエラー', () => {
		const head = 'slug: a\ntitle: T\nlead: L\ndescription: D\n';
		expect(() => parseCollectionYaml(`${head}entries:\n  - date: "2000-01-01"`)).toThrow('id');
		expect(() => parseCollectionYaml(`${head}entries:\n  - id: ""`)).toThrow('id');
	});
});

describe('collectionCuratedEntries', () => {
	it('全特集のentriesを平坦化する', () => {
		expect(
			collectionCuratedEntries([
				source({ entries: [{ id: 'a' }] }),
				source({ slug: 'b', entries: [{ id: 'b' }, { id: 'c' }] }),
			]),
		).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
	});
});

describe('buildCollectionDetail', () => {
	const byId = new Map([
		['a', ev('a', '1963-01-01')],
		['b', ev('b', '1917-06-30')],
	]);

	it('日付昇順に並べ、期間と件数を付ける', () => {
		const detail = buildCollectionDetail(source(), byId);
		expect(detail.events.map((e) => e.id)).toEqual(['b', 'a']);
		expect(detail.count).toBe(2);
		expect(detail.fromDate).toBe('1917-06-30');
		expect(detail.toDate).toBe('1963-01-01');
		expect(detail.title).toBe('アニメの歴史');
	});

	it('iconは有るときだけ付く', () => {
		expect('icon' in buildCollectionDetail(source(), byId)).toBe(false);
		expect(buildCollectionDetail(source({ icon: 'art-x' }), byId).icon).toBe('art-x');
	});

	it('存在しないidは落とし、重複指定は畳む', () => {
		const detail = buildCollectionDetail(
			source({ entries: [{ id: 'a' }, { id: 'a' }, { id: 'zzz' }] }),
			byId,
		);
		expect(detail.events.map((e) => e.id)).toEqual(['a']);
	});

	it('1件も解決できなければエラー', () => {
		expect(() => buildCollectionDetail(source({ entries: [{ id: 'zzz' }] }), byId)).toThrow(
			'1件もありません',
		);
	});
});

describe('toCollectionMeta', () => {
	it('イベント本体を落とす', () => {
		const byId = new Map([['a', ev('a', '2000-01-01')]]);
		const meta = toCollectionMeta(buildCollectionDetail(source({ entries: [{ id: 'a' }] }), byId));
		expect('events' in meta).toBe(false);
		expect(meta.slug).toBe('anime');
		expect(meta.count).toBe(1);
	});
});

describe('eventCollectionIndex', () => {
	it('イベントid→slug[]を作り、複数所属を結合する', () => {
		const byId = new Map([
			['a', ev('a', '2000-01-01')],
			['b', ev('b', '2001-01-01')],
		]);
		const details = [
			buildCollectionDetail(source({ entries: [{ id: 'a' }, { id: 'b' }] }), byId),
			buildCollectionDetail(source({ slug: 'other', entries: [{ id: 'b' }] }), byId),
		];
		expect(eventCollectionIndex(details)).toEqual({ a: ['anime'], b: ['anime', 'other'] });
	});
});

describe('unmatchedCollectionIds', () => {
	it('存在しないidを特集ごとに返す', () => {
		expect(
			unmatchedCollectionIds(
				[
					source({ entries: [{ id: 'a' }, { id: 'zzz' }] }),
					source({ slug: 'ok', entries: [{ id: 'a' }] }),
				],
				new Set(['a']),
			),
		).toEqual([{ slug: 'anime', ids: ['zzz'] }]);
	});
});
