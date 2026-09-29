import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCollection, makeEvent } from '../test/fixtures.ts';

// Loaders read the committed static data from disk; serve a small synthetic tree instead
const files = vi.hoisted(() => ({ tree: {} as Record<string, string> }));
vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	const readFileSync = (p: string) => {
		if (!(p in files.tree)) throw new Error(`ENOENT ${p}`);
		return files.tree[p];
	};
	const readdirSync = (dir: string) =>
		Object.keys(files.tree)
			.filter((p) => p.startsWith(`${dir}/`))
			.map((p) => p.slice(dir.length + 1));
	return { ...actual, default: { ...actual, readFileSync, readdirSync }, readFileSync, readdirSync };
});

const a = makeEvent({ id: '1900-01-01-a', date: '1900-01-01', title: 'A' });
const b1 = makeEvent({ id: '1950-05-05-b1', date: '1950-05-05', title: 'B1' });
const b2 = makeEvent({ id: '1950-05-05-b2', date: '1950-05-05', title: 'B2' });
const c = makeEvent({ id: '1990-01-01-c', date: '1990-01-01', title: 'C' });

beforeEach(() => {
	vi.resetModules();
	files.tree = {
		'static/data/chunks/1900s.json': JSON.stringify([a]),
		// Unsorted on purpose, with a same-day pair ordered by id
		'static/data/chunks/1950s.json': JSON.stringify([c, b2, b1]),
		'static/data/books.json': JSON.stringify({ '1950-05-05-b1': [{ title: '本', store: 'amazon', url: 'https://example.com/x' }] }),
		'static/data/collections.json': JSON.stringify({
			collections: [makeCollection({ slug: 'first', title: '一' }), makeCollection({ slug: 'second', title: '二' })],
			byEvent: { '1950-05-05-b1': ['second', 'gone'] },
		}),
		'static/data/collections/first.json': JSON.stringify({ ...makeCollection({ slug: 'first' }), events: [a] }),
		'static/data/collections/second.json': JSON.stringify({ ...makeCollection({ slug: 'second' }), events: [b1] }),
	};
});

type Loader = (e: { params: Record<string, string> }) => Record<string, unknown>;

describe('/e/[id] loader', () => {
	it('prerenders every event and links neighbours in date order', async () => {
		const mod = await import('./e/[id]/+page.server.ts');
		expect(mod.prerender).toBe(true);
		expect(mod.csr).toBe(false);
		const ids = (mod.entries as () => { id: string }[])().map((e) => e.id);
		expect(ids).toEqual(['1900-01-01-a', '1950-05-05-b1', '1950-05-05-b2', '1990-01-01-c']);

		const load = mod.load as unknown as Loader;
		const mid = load({ params: { id: '1950-05-05-b1' } });
		expect(mid.prev).toEqual({ id: a.id, title: 'A', date: a.date });
		expect(mid.next).toEqual({ id: b2.id, title: 'B2', date: b2.date });
		expect(mid.books).toHaveLength(1);
		expect((mid.collections as { slug: string }[]).map((x) => x.slug)).toEqual(['second']);

		const first = load({ params: { id: a.id } });
		expect(first.prev).toBeNull();
		expect(first.books).toEqual([]);
		expect(first.collections).toEqual([]);
		expect(load({ params: { id: c.id } }).next).toBeNull();
	});

	it('404s for an unknown event', async () => {
		const mod = await import('./e/[id]/+page.server.ts');
		expect(() => (mod.load as unknown as Loader)({ params: { id: 'nope' } })).toThrow(
			expect.objectContaining({ status: 404 }),
		);
	});
});

describe('/c/[slug] loader', () => {
	it('prerenders every collection with prev/next links', async () => {
		const mod = await import('./c/[slug]/+page.server.ts');
		expect((mod.entries as () => { slug: string }[])()).toEqual([{ slug: 'first' }, { slug: 'second' }]);
		const load = mod.load as unknown as Loader;
		const first = load({ params: { slug: 'first' } });
		expect((first.detail as { events: unknown[] }).events).toHaveLength(1);
		expect(first.prev).toBeNull();
		expect(first.next).toEqual({ slug: 'second', title: '二' });
		expect(load({ params: { slug: 'second' } }).prev).toEqual({ slug: 'first', title: '一' });
	});

	it('404s for unknown or malformed slugs before touching the disk', async () => {
		const mod = await import('./c/[slug]/+page.server.ts');
		const load = mod.load as unknown as Loader;
		expect(() => load({ params: { slug: 'missing' } })).toThrow(expect.objectContaining({ status: 404 }));
		expect(() => load({ params: { slug: '../etc' } })).toThrow(expect.objectContaining({ status: 404 }));
	});

	it('404s for a malformed slug even when the index lists it, without reading its path', async () => {
		const bad = '../secret';
		files.tree['static/data/collections.json'] = JSON.stringify({
			collections: [makeCollection({ slug: bad, title: '不正' })],
			byEvent: {},
		});
		files.tree[`static/data/collections/${bad}.json`] = JSON.stringify({ ...makeCollection({ slug: bad }), events: [] });
		const mod = await import('./c/[slug]/+page.server.ts');
		const load = mod.load as unknown as Loader;
		expect(() => load({ params: { slug: bad } })).toThrow(expect.objectContaining({ status: 404 }));
	});
});

describe('/c loader, sitemap and layout', () => {
	it('lists the collections', async () => {
		const mod = await import('./c/+page.server.ts');
		const out = (mod.load as unknown as () => { collections: { slug: string }[] })();
		expect(out.collections.map((x) => x.slug)).toEqual(['first', 'second']);
	});

	it('lists the top page, collections and every event in the sitemap', async () => {
		const { GET } = await import('./sitemap.xml/+server.ts');
		const res = GET();
		expect(res.headers.get('Content-Type')).toBe('application/xml');
		const xml = await res.text();
		const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
		expect(locs).toEqual(['/', '/c', '/c/first', '/c/second', '/e/1900-01-01-a', '/e/1990-01-01-c', '/e/1950-05-05-b2', '/e/1950-05-05-b1']);
	});

	it('prerenders the whole site', async () => {
		expect((await import('./+layout.ts')).prerender).toBe(true);
	});
});
