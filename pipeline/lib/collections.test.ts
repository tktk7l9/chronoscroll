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
	it('parses meta and entries', () => {
		expect(parseCollectionYaml(YAML)).toEqual({
			slug: 'anime',
			title: 'アニメの歴史',
			lead: 'リード文',
			description: '説明文',
			icon: 'art-anime',
			entries: [{ id: '1963-01-01-a' }, { id: '1917-06-30-b' }],
		});
	});

	it('icon is optional', () => {
		const parsed = parseCollectionYaml(
			'slug: a\ntitle: T\nlead: L\ndescription: D\nentries:\n  - id: x\n',
		);
		expect(parsed.icon).toBeUndefined();
		expect('icon' in parsed).toBe(false);
	});

	it('errors on an empty file', () => {
		expect(() => parseCollectionYaml('')).toThrow('is empty');
		expect(() => parseCollectionYaml('  \n')).toThrow('is empty');
	});

	it('errors when not a mapping', () => {
		expect(() => parseCollectionYaml('~\n')).toThrow('mapping');
		expect(() => parseCollectionYaml('- id: a')).toThrow('mapping');
	});

	it('errors when slug is missing or empty', () => {
		expect(() => parseCollectionYaml('title: T')).toThrow('slug is empty');
		expect(() => parseCollectionYaml('slug: ""\ntitle: T')).toThrow('slug is empty');
	});

	it('errors on invalid characters in slug', () => {
		expect(() => parseCollectionYaml('slug: Anime_1\ntitle: T')).toThrow('only lowercase letters, digits and hyphens');
	});

	it('errors when title/lead/description is missing', () => {
		expect(() => parseCollectionYaml('slug: a')).toThrow('title(a) is empty');
		expect(() => parseCollectionYaml('slug: a\ntitle: T')).toThrow('lead(a) is empty');
		expect(() => parseCollectionYaml('slug: a\ntitle: T\nlead: L')).toThrow(
			'description(a) is empty',
		);
	});

	it('errors when icon is empty or not a string', () => {
		const head = 'slug: a\ntitle: T\nlead: L\ndescription: D\n';
		expect(() => parseCollectionYaml(`${head}icon: ""`)).toThrow('icon(a) is empty');
		expect(() => parseCollectionYaml(`${head}icon: 3`)).toThrow('icon(a) is empty');
	});

	it('errors when entries is missing or empty', () => {
		const head = 'slug: a\ntitle: T\nlead: L\ndescription: D\n';
		expect(() => parseCollectionYaml(head)).toThrow('entries is empty');
		expect(() => parseCollectionYaml(`${head}entries: []`)).toThrow('entries is empty');
	});

	it('errors when an entry has no id or an empty id', () => {
		const head = 'slug: a\ntitle: T\nlead: L\ndescription: D\n';
		expect(() => parseCollectionYaml(`${head}entries:\n  - date: "2000-01-01"`)).toThrow('id');
		expect(() => parseCollectionYaml(`${head}entries:\n  - id: ""`)).toThrow('id');
	});
});

describe('collectionCuratedEntries', () => {
	it('flattens entries of all collections', () => {
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

	it('sorts by date ascending and adds span and count', () => {
		const detail = buildCollectionDetail(source(), byId);
		expect(detail.events.map((e) => e.id)).toEqual(['b', 'a']);
		expect(detail.count).toBe(2);
		expect(detail.fromDate).toBe('1917-06-30');
		expect(detail.toDate).toBe('1963-01-01');
		expect(detail.title).toBe('アニメの歴史');
	});

	it('adds icon only when present', () => {
		expect('icon' in buildCollectionDetail(source(), byId)).toBe(false);
		expect(buildCollectionDetail(source({ icon: 'art-x' }), byId).icon).toBe('art-x');
	});

	it('drops unknown ids and collapses duplicates', () => {
		const detail = buildCollectionDetail(
			source({ entries: [{ id: 'a' }, { id: 'a' }, { id: 'zzz' }] }),
			byId,
		);
		expect(detail.events.map((e) => e.id)).toEqual(['a']);
	});

	it('errors when no entry resolves', () => {
		expect(() => buildCollectionDetail(source({ entries: [{ id: 'zzz' }] }), byId)).toThrow(
			'has no events',
		);
	});
});

describe('toCollectionMeta', () => {
	it('drops the event bodies', () => {
		const byId = new Map([['a', ev('a', '2000-01-01')]]);
		const meta = toCollectionMeta(buildCollectionDetail(source({ entries: [{ id: 'a' }] }), byId));
		expect('events' in meta).toBe(false);
		expect(meta.slug).toBe('anime');
		expect(meta.count).toBe(1);
	});
});

describe('eventCollectionIndex', () => {
	it('builds event id -> slug[] and merges multiple memberships', () => {
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
	it('returns unknown ids per collection', () => {
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
