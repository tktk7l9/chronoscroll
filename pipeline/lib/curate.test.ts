import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../../src/lib/types.ts';
import { applyCurated, parseCuratedYaml } from './curate.ts';

function ev(id: string): NewsEvent {
	return {
		id,
		date: '1964-10-10',
		precision: 'day',
		title: '元タイトル',
		summary: '元要約。',
		category: 'society',
		region: 'japan',
		importance: 50,
		sources: [{ label: 'x', url: 'https://example.com' }],
	};
}

describe('parseCuratedYaml', () => {
	it('配列をパースする', () => {
		const entries = parseCuratedYaml('- id: a\n  title: 新タイトル\n- id: b\n  importance: 100\n');
		expect(entries).toEqual([
			{ id: 'a', title: '新タイトル' },
			{ id: 'b', importance: 100 },
		]);
	});

	it('空ファイルやnullドキュメントは空配列', () => {
		expect(parseCuratedYaml('')).toEqual([]);
		expect(parseCuratedYaml('  \n')).toEqual([]);
		expect(parseCuratedYaml('~\n')).toEqual([]);
	});

	it('配列でなければエラー', () => {
		expect(() => parseCuratedYaml('id: a')).toThrow('配列');
	});

	it('idがなければエラー', () => {
		expect(() => parseCuratedYaml('- title: x')).toThrow('id');
	});
});

describe('applyCurated', () => {
	it('既存イベントを部分上書きする', () => {
		const { events, updated, added, unmatched } = applyCurated(
			[ev('a')],
			[{ id: 'a', title: '新タイトル', importance: 99.9, svg: 'art-a' }],
		);
		expect(updated).toEqual(['a']);
		expect(added).toEqual([]);
		expect(unmatched).toEqual([]);
		const e = events[0];
		expect(e.title).toBe('新タイトル');
		expect(e.importance).toBe(99.9);
		expect(e.svg).toBe('art-a');
		expect(e.summary).toBe('元要約。');
	});

	it('undefined のフィールドは上書きしない', () => {
		const { events } = applyCurated([ev('a')], [{ id: 'a', title: undefined, summary: '新要約' }]);
		expect(events[0].title).toBe('元タイトル');
		expect(events[0].summary).toBe('新要約');
	});

	it('必須項目が揃った新規エントリは追加する（デフォルト補完）', () => {
		const { events, added } = applyCurated(
			[],
			[{ id: 'new1', date: '2000-01-01', title: 'T', summary: 'S' }],
		);
		expect(added).toEqual(['new1']);
		expect(events[0]).toMatchObject({
			id: 'new1',
			precision: 'day',
			category: 'society',
			region: 'japan',
			importance: 100,
			sources: [],
		});
	});

	it('新規エントリの明示フィールドとimage/svgを尊重する', () => {
		const image = { src: 'https://upload.wikimedia.org/x.jpg', width: 1, height: 1, credit: 'c' };
		const { events } = applyCurated(
			[],
			[
				{
					id: 'new2',
					date: '2000-01-01',
					precision: 'month',
					title: 'T',
					summary: 'S',
					category: 'war',
					region: 'world',
					importance: 88,
					sources: [{ label: 'l', url: 'u' }],
					image,
					svg: 'art-x',
				},
			],
		);
		expect(events[0]).toMatchObject({
			precision: 'month',
			category: 'war',
			region: 'world',
			importance: 88,
			image,
			svg: 'art-x',
		});
	});

	it('既存になく必須項目も足りないものは unmatched', () => {
		const { unmatched, events } = applyCurated([ev('a')], [{ id: 'ghost', title: 'X' }]);
		expect(unmatched).toEqual(['ghost']);
		expect(events).toHaveLength(1);
	});

	it('relatedIdsはNewsEventへ直接コピーされない（related組み立てはrelated.tsが担当するため）', () => {
		const { events } = applyCurated(
			[ev('a')],
			[{ id: 'a', title: '新タイトル', relatedIds: ['b', 'c'] }],
		);
		expect(events[0]).not.toHaveProperty('relatedIds');
		expect(events[0].title).toBe('新タイトル');
	});

	it('新規エントリのrelatedIdsもNewsEventへ直接コピーされない', () => {
		const { events } = applyCurated(
			[],
			[{ id: 'new1', date: '2000-01-01', title: 'T', summary: 'S', relatedIds: ['x'] }],
		);
		expect(events[0]).not.toHaveProperty('relatedIds');
	});
});
