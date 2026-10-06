import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '../../test/fetch.ts';
import { makeCollection, makeEvent, makeMeta } from '../../test/fixtures.ts';
import { dayOf } from '../timescale.ts';
import { TimelineData, timelineData } from './data.svelte.ts';

const overview = [makeEvent({ id: 'ov-1', date: '1950-01-01' })];
const chunk1900 = [makeEvent({ id: 'c-1', date: '1920-03-03' })];
const collectionDetail = {
	...makeCollection({ slug: 'theme' }),
	events: [makeEvent({ id: 'col-1', date: '1930-01-01' })],
};

function baseRoutes() {
	return {
		'/data/index.json': makeMeta(),
		'/data/overview.json': overview,
		'/data/books.json': { 'ov-1': [{ title: '本', store: 'amazon', url: 'https://example.com/b' }] },
		'/data/collections.json': {
			collections: [makeCollection({ slug: 'theme' }), makeCollection({ slug: 'other' })],
			byEvent: { 'ov-1': ['theme', 'missing'] },
		},
		'/data/chunks/1900s.json': chunk1900,
		'/data/collections/theme.json': collectionDetail,
	};
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('TimelineData', () => {
	it('exports a shared instance', () => {
		expect(timelineData).toBeInstanceOf(TimelineData);
	});

	it('uses a default density before metadata arrives', () => {
		const data = new TimelineData();
		expect(data.eventsPerDay).toBe(0.25);
		expect(data.points).toEqual([]);
		// Without metadata there is nothing to load
		stubFetch({});
		data.ensureRange(0, 1);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('loads index + overview, then books and collections as decoration', async () => {
		stubFetch(baseRoutes());
		const data = new TimelineData();
		await data.init();
		await flush();
		expect(data.meta?.total).toBe(200);
		expect(data.loadError).toBeNull();
		expect(data.byId('ov-1')?.id).toBe('ov-1');
		expect(data.points).toHaveLength(1);
		expect(data.eventsPerDay).toBeCloseTo(200 / (dayOf('1999-12-31') - dayOf('1900-01-01')));
		expect(data.booksById('ov-1')).toHaveLength(1);
		expect(data.booksById('nope')).toEqual([]);
		// Unknown slugs in the reverse index are dropped
		expect(data.collectionsByEvent('ov-1').map((c) => c.slug)).toEqual(['theme']);
		expect(data.collectionsByEvent('nope')).toEqual([]);
	});

	it('reports a load error when the main data fails but tolerates missing decorations', async () => {
		stubFetch({ '/data/index.json': 500, '/data/overview.json': [] });
		const data = new TimelineData();
		await data.init();
		await flush();
		expect(data.loadError).toContain('/data/index.json: HTTP 500');
		expect(data.collections).toEqual([]);
		expect(data.booksById('x')).toEqual([]);
	});

	it('handles an empty dataset', async () => {
		stubFetch({ ...baseRoutes(), '/data/index.json': makeMeta({ total: 0 }) });
		const data = new TimelineData();
		await data.init();
		expect(data.eventsPerDay).toBe(0.25);
	});

	it('loads each chunk in range once and retries a chunk that failed', async () => {
		let fail = true;
		const { calls } = stubFetch({
			...baseRoutes(),
			'/data/chunks/1900s.json': () =>
				fail
					? new Response('x', { status: 503 })
					: new Response(JSON.stringify(chunk1900), { status: 200 }),
		});
		const data = new TimelineData();
		await data.init();
		const from = dayOf('1925-01-01');
		const to = dayOf('1915-01-01');

		data.ensureRange(from, to);
		await flush();
		expect(data.byId('c-1')).toBeUndefined();

		fail = false;
		data.ensureRange(from, to);
		// A second call while the first is in flight does not refetch
		data.ensureRange(from, to);
		await flush();
		expect(data.byId('c-1')?.date).toBe('1920-03-03');
		data.ensureRange(from, to);
		await flush();
		expect(calls.filter((u) => u.includes('1900s'))).toHaveLength(2);
	});

	it('loadById returns a known event at once, or waits for its chunk', async () => {
		stubFetch(baseRoutes());
		const data = new TimelineData();
		await data.init();
		expect((await data.loadById('ov-1', '1950-01-01'))?.id).toBe('ov-1');
		expect((await data.loadById('c-1', '1920-03-03'))?.title).toBe(chunk1900[0].title);
	});

	it('loadById rejects a malformed date without fetching or throwing', async () => {
		const { calls } = stubFetch(baseRoutes());
		const data = new TimelineData();
		await data.init();
		const before = calls.length;
		await expect(data.loadById('not-a-date', 'not-a-date')).resolves.toBeUndefined();
		expect(calls).toHaveLength(before);
	});

	it('loadById gives up with undefined when the event never arrives', async () => {
		vi.useFakeTimers();
		try {
			stubFetch(baseRoutes());
			const data = new TimelineData();
			await data.init();
			const p = data.loadById('ghost', '1920-01-01');
			await vi.runAllTimersAsync();
			expect(await p).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	describe('card-only overview first', () => {
		const lite = overview.map(({ id, date, precision, title, category, region, importance }) => ({
			id,
			date,
			precision,
			title,
			category,
			region,
			importance,
		}));

		/** Holds overview.json until release() so the in-between state can be observed */
		function heldOverview(ok = true) {
			let release!: () => void;
			const gate = new Promise<void>((r) => (release = r));
			const route = async () => {
				await gate;
				return ok
					? new Response(JSON.stringify(overview), { status: 200 })
					: new Response('x', { status: 503 });
			};
			return { route, release: () => release() };
		}

		it('draws previews before the full overview and swaps them without duplicates', async () => {
			const held = heldOverview();
			const { calls } = stubFetch({
				...baseRoutes(),
				'/data/overview-lite.json': lite,
				'/data/overview.json': held.route,
			});
			const data = new TimelineData();
			await data.init();
			expect(data.meta?.total).toBe(200);
			expect(data.points.map((p) => p.ev.id)).toEqual(['ov-1']);
			// A preview has no body, so the detail dialog must not get it
			expect(data.byId('ov-1')).toBeUndefined();
			expect(calls).toContain('/data/overview.json');

			held.release();
			await flush();
			await flush();
			expect(data.byId('ov-1')?.summary).toBe(overview[0].summary);
			expect(data.points).toHaveLength(1);
		});

		it('loadById of a preview waits for the full overview instead of fetching a chunk', async () => {
			const held = heldOverview();
			const { calls } = stubFetch({
				...baseRoutes(),
				'/data/overview-lite.json': lite,
				'/data/overview.json': held.route,
			});
			const data = new TimelineData();
			await data.init();
			const p = data.loadById('ov-1', '1950-01-01');
			held.release();
			expect((await p)?.summary).toBe(overview[0].summary);
			expect(calls.some((u) => u.includes('/chunks/'))).toBe(false);
		});

		it('falls back to the chunk when the full overview fails', async () => {
			const held = heldOverview(false);
			const chunk1950 = [overview[0]];
			stubFetch({
				...baseRoutes(),
				'/data/overview-lite.json': lite,
				'/data/overview.json': held.route,
				'/data/chunks/1950s.json': chunk1950,
			});
			const data = new TimelineData();
			await data.init();
			held.release();
			expect(data.loadError).toBeNull();
			expect((await data.loadById('ov-1', '1950-01-01'))?.summary).toBe(overview[0].summary);
		});

		it('keeps a full event over a later preview of the same id', async () => {
			const held = heldOverview();
			stubFetch({
				...baseRoutes(),
				'/data/overview-lite.json': lite,
				'/data/overview.json': held.route,
				'/data/collections/theme.json': { ...collectionDetail, events: overview },
			});
			const data = new TimelineData();
			await data.loadCollection('theme');
			await data.init();
			expect(data.points).toHaveLength(1);
			expect(data.points[0].ev.summary).toBe(overview[0].summary);
			held.release();
		});
	});

	it('loads a collection once, adds its events, and returns null on failure', async () => {
		const { calls } = stubFetch({ ...baseRoutes(), '/data/collections/broken.json': 404 });
		const data = new TimelineData();
		const detail = await data.loadCollection('theme');
		expect(detail?.events[0].id).toBe('col-1');
		expect(data.byId('col-1')).toBeDefined();
		expect(await data.loadCollection('theme')).toBe(detail);
		expect(calls.filter((u) => u.includes('theme.json'))).toHaveLength(1);
		expect(await data.loadCollection('broken')).toBeNull();
	});
});
