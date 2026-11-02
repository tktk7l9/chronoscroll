import { describe, expect, it } from 'vitest';
import { eventsToCarry, previousEvent, rebindIds, type ContinuityEvent } from './id-continuity.ts';
import type { NewsEvent } from '../../src/lib/types.ts';

const ev = (id: string, text: string, links: string[] = [], date = '2000-01-02'): ContinuityEvent => ({
	id,
	date,
	text,
	links,
});

const LONG = 'ローマ教皇ピウス11世、ナチスによる教会弾圧とユダヤ人差別を批判する回勅を発表';

describe('rebindIds', () => {
	it('keeps the old id when a year-page line was reworded', () => {
		const r = rebindIds([ev('new', `${LONG}した`)], [ev('old', LONG)], {});
		expect([...r.rebound]).toEqual([['new', 'old']]);
		expect(r.aliases).toEqual({ new: 'old' });
		expect(r.orphans).toEqual([]);
	});

	it('matches a shortened line through the shared link, as near-duplicate removal does', () => {
		const r = rebindIds(
			[ev('new', `${LONG}。これは長い補足の説明がさらに続いていく文章である。補足の説明がさらに続く`, ['A'])],
			[ev('old', LONG, ['A'])],
			{},
		);
		expect(r.rebound.get('new')).toBe('old');
	});

	it('follows the rewordings of the 2026-11 refresh that took events out of collections', () => {
		const r = rebindIds(
			[
				ev('5766e673', 'レイキャヴィーク会談。アイスランドの首都レイキャヴィークでレーガン大統領とゴルバチョフ書記長が会談。'),
				ev('d1ae4de5', '東京宝塚劇場開場。'),
			],
			[ev('5e2f9cab', '米ソ首脳会談。アイスランドのレイキャビクでレーガン大統領とゴルバチョフ書記長が会談。')],
			{},
		);
		expect([...r.rebound]).toEqual([['5766e673', '5e2f9cab']]);
	});

	it('does not touch an id that still exists', () => {
		const r = rebindIds([ev('same', LONG)], [ev('same', LONG)], {});
		expect(r.rebound.size).toBe(0);
		expect(r.orphans).toEqual([]);
	});

	it('never crosses dates', () => {
		const r = rebindIds([ev('new', LONG, [], '2000-01-03')], [ev('old', LONG)], {});
		expect(r.rebound.size).toBe(0);
		expect(r.orphans).toEqual(['old']);
	});

	it('leaves an unrelated line of the same day alone and reports the old id as an orphan', () => {
		const r = rebindIds([ev('new', '東京宝塚劇場開場')], [ev('old', LONG)], {});
		expect(r.rebound.size).toBe(0);
		expect(r.orphans).toEqual(['old']);
	});

	it('gives each old id to its closest line, one to one', () => {
		const r = rebindIds(
			[ev('near', `${LONG}。`), ev('far', `${LONG}。さらに別の話題の文章`)],
			[ev('old', LONG)],
			{},
		);
		expect([...r.rebound]).toEqual([['near', 'old']]);
	});

	it('breaks ties the same way on every run', () => {
		const forward = rebindIds([ev('b', `${LONG}。`), ev('a', `${LONG}。`)], [ev('old', LONG)], {});
		const backward = rebindIds([ev('a', `${LONG}。`), ev('b', `${LONG}。`)], [ev('old', LONG)], {});
		expect([...forward.rebound]).toEqual([['a', 'old']]);
		expect([...backward.rebound]).toEqual([['a', 'old']]);
	});

	it('pairs two rewordings of one day correctly when several ids changed', () => {
		const other = 'アメリカ合衆国で新しい大統領が就任し、記念の式典が首都で開かれた';
		const r = rebindIds(
			[ev('n1', `${other}。`), ev('n2', `${LONG}。`)],
			[ev('o1', LONG), ev('o2', other)],
			{},
		);
		expect(Object.fromEntries(r.rebound)).toEqual({ n1: 'o2', n2: 'o1' });
	});

	it('uses a recorded alias without looking at the text, so a hand-rewritten summary stays bound', () => {
		const r = rebindIds([ev('hash', '年表の本文')], [ev('stable', 'まったく別に書き直した要約')], { hash: 'stable' });
		expect(r.rebound.get('hash')).toBe('stable');
		expect(r.orphans).toEqual([]);
	});

	it('keeps old aliases so a line that comes back later still resolves', () => {
		const r = rebindIds([ev('h2', `${LONG}。`)], [ev('stable', LONG)], { h1: 'stable' });
		expect(r.aliases).toEqual({ h1: 'stable', h2: 'stable' });
	});

	it('ignores an alias when its target is generated in its own right', () => {
		const r = rebindIds([ev('hash', LONG), ev('stable', 'まったく別の行')], [ev('stable', 'まったく別の行')], { hash: 'stable' });
		expect(r.rebound.size).toBe(0);
	});
});

describe('previousEvent', () => {
	it('reads the summary and the primary link, leaving the year page out', () => {
		const e = {
			id: 'x',
			date: '2000-01-02',
			summary: 's',
			sources: [
				{ label: 'Wikipedia: A', url: 'https://ja.wikipedia.org/wiki/A' },
				{ label: 'Wikipedia: 2000年', url: 'https://ja.wikipedia.org/wiki/2000%E5%B9%B4' },
			],
		} as NewsEvent;
		expect(previousEvent(e)).toEqual({ id: 'x', date: '2000-01-02', text: 's', links: ['A'] });
	});

	it('copes with sources that do not point at a Wikipedia article', () => {
		const e = {
			id: 'x',
			date: '2000-01-02',
			summary: 's',
			sources: [{ label: '公式', url: 'https://example.com/' }],
		} as NewsEvent;
		expect(previousEvent(e).links).toEqual([]);
	});
});

describe('eventsToCarry', () => {
	const prev = (id: string, related = false) =>
		({ id, summary: 's', ...(related ? { related: [{ id: 'r', date: 'd', title: 't' }] } : {}) }) as NewsEvent;

	it('keeps an orphan that hand-written content refers to and drops its stale related links', () => {
		expect(eventsToCarry(['a'], [prev('a', true)], new Set(['a']))).toEqual([{ id: 'a', summary: 's' }]);
	});

	it('lets every other orphan go', () => {
		expect(eventsToCarry(['b'], [prev('b')], new Set(['a']))).toEqual([]);
	});
});
