import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubFetch, type Route } from '../test/fetch.ts';
import { makeCollection, makeEvent, makeMeta } from '../test/fixtures.ts';
import { TimelineData } from '$lib/state/data.svelte';
import type { SearchRequest, SearchResponse } from '$lib/workers/search.worker';
import Page from './+page.svelte';

// A fresh store per test (the real module exports one shared instance)
const store = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('$lib/state/data.svelte', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/state/data.svelte')>();
	return {
		...actual,
		get timelineData() {
			return store.current;
		},
	};
});

const nav = vi.hoisted(() => ({ replaceState: vi.fn() }));
vi.mock('$app/navigation', () => ({
	afterNavigate: (fn: () => void) => queueMicrotask(fn),
	replaceState: (url: string, state: unknown) => nav.replaceState(url, state),
}));

const worker = vi.hoisted(() => ({ onmessage: null as ((e: MessageEvent) => void) | null, posted: [] as SearchRequest[] }));
vi.mock('$lib/workers/search.worker.ts?worker', () => ({
	default: class {
		set onmessage(fn: (e: MessageEvent) => void) {
			worker.onmessage = fn;
		}
		postMessage(m: SearchRequest) {
			worker.posted.push(m);
		}
	},
}));
/** Query requests only (focusing the box also posts a warm-up request) */
const queries = () => worker.posted.filter((m): m is Extract<SearchRequest, { seq: number }> => 'seq' in m);

const nagano = makeEvent({ id: '1998-02-07-nagano', date: '1998-02-07', title: '長野五輪開幕', importance: 100 });
const kobe = makeEvent({
	id: '1995-01-17-kobe',
	date: '1995-01-17',
	title: '阪神・淡路大震災',
	importance: 100,
	category: 'disaster',
	related: [{ id: '1998-02-07-nagano', date: '1998-02-07', title: '長野五輪開幕' }],
});
const old = makeEvent({ id: '1920-03-03-old', date: '1920-03-03', title: '古いできごと', importance: 100 });

function routes(extra: Record<string, Route> = {}): Record<string, Route> {
	return {
		'/data/index.json': makeMeta(),
		'/data/overview.json': [nagano, kobe],
		'/data/books.json': {},
		'/data/collections.json': {
			collections: [makeCollection({ slug: 'theme', title: 'テスト特集' })],
			byEvent: { '1995-01-17-kobe': ['theme'] },
		},
		'/data/chunks/1900s.json': [old],
		'/data/collections/theme.json': { ...makeCollection({ slug: 'theme' }), events: [kobe] },
		...extra,
	};
}

function open(url: string, extra?: Record<string, Route>) {
	history.replaceState(null, '', url);
	stubFetch(routes(extra));
	store.current = new TimelineData();
	render(Page);
	return userEvent.setup();
}

/** The query string of the most recent URL sync */
function lastUrl(): URLSearchParams {
	const url = nav.replaceState.mock.lastCall?.[0] as string | undefined;
	return new URLSearchParams(url?.startsWith('?') ? url.slice(1) : '');
}

beforeEach(() => {
	nav.replaceState.mockClear();
	worker.posted.length = 0;
	worker.onmessage = null;
});
afterEach(() => {
	vi.unstubAllGlobals();
	history.replaceState(null, '', '/');
});

describe('timeline page', () => {
	it('shows the header, coverage, filters and the newest events', async () => {
		open('/');
		expect(screen.getByRole('link', { name: /chronoscroll/ })).toHaveAttribute('href', '/');
		// The site name is the page's h1; the skip link lands on the timeline (SHIG 20, 59)
		expect(screen.getByRole('heading', { level: 1, name: 'chronoscroll' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: '年表へ移動' })).toHaveAttribute('href', '#timeline');
		expect(screen.getByRole('main')).toHaveAttribute('id', 'timeline');
		expect(screen.getByRole('link', { name: '特集' })).toHaveAttribute('href', '/c');
		expect(screen.getByRole('combobox', { name: 'ニュースを検索' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: '表示フィルタ' })).toBeInTheDocument();
		expect(screen.getByText(/^全[\d,]+件$/)).toBeInTheDocument();
		expect(await screen.findByRole('button', { name: /長野五輪開幕/ })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toBeInTheDocument();
	});

	it('opens an event in the dialog, follows a related link, and clears ?e= on close', async () => {
		const user = open('/');
		await user.click(await screen.findByRole('button', { name: /阪神・淡路大震災/ }));
		expect(await screen.findByRole('heading', { level: 2, name: '阪神・淡路大震災' })).toBeInTheDocument();
		// The collection index arrived after init, so the dialog lists the collection
		expect(await screen.findByRole('link', { name: 'テスト特集' })).toHaveAttribute('href', '/c/theme');
		await waitFor(() => expect(lastUrl().get('e')).toBe('1995-01-17-kobe'));

		const dialog = document.querySelector('dialog')!;
		await user.click(within(dialog).getByRole('button', { name: /長野五輪開幕/ }));
		expect(await screen.findByRole('heading', { level: 2, name: '長野五輪開幕' })).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: '閉じる' }));
		await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).toBeNull());
		await waitFor(() => expect(lastUrl().has('e')).toBe(false));
	});

	it('restores a shared link to an event that is not loaded yet', async () => {
		open('/?e=1920-03-03-old&t=1920-03-03&z=8');
		expect(await screen.findByRole('heading', { level: 2, name: '古いできごと' }, { timeout: 3000 })).toBeInTheDocument();
	});

	it('ignores a malformed shared event link instead of failing', async () => {
		const errors: unknown[] = [];
		const onRejection = (e: PromiseRejectionEvent | Event) => errors.push(e);
		window.addEventListener('unhandledrejection', onRejection);
		process.on('unhandledRejection', onRejection);
		try {
			open('/?e=not-a-date');
			expect(await screen.findByRole('button', { name: /長野五輪開幕/ })).toBeInTheDocument();
			await new Promise((r) => setTimeout(r, 100));
			expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
			expect(errors).toEqual([]);
		} finally {
			window.removeEventListener('unhandledrejection', onRejection);
			process.off('unhandledRejection', onRejection);
		}
	});

	it('writes filter changes into the URL', async () => {
		const user = open('/?r=japan');
		expect(await screen.findByRole('button', { name: '日本' })).toHaveAttribute('aria-pressed', 'true');
		await user.click(screen.getByRole('button', { name: '災害' }));
		await waitFor(() => expect(lastUrl().get('c')).toBe('disaster'));
		expect(lastUrl().get('r')).toBe('japan');
	});

	it('narrows to a collection from ?k= and lets the reader leave it', async () => {
		const user = open('/?k=theme');
		const banner = await screen.findByRole('link', { name: 'テスト特集' });
		expect(banner).toHaveAttribute('href', '/c/theme');
		expect(await screen.findByRole('button', { name: /阪神・淡路大震災/ })).toBeInTheDocument();
		await waitFor(() => expect(screen.queryByRole('button', { name: /長野五輪開幕/ })).toBeNull());

		await user.click(screen.getByRole('button', { name: '特集の絞り込みを解除' }));
		expect(screen.queryByRole('link', { name: 'テスト特集' })).toBeNull();
		expect(await screen.findByRole('button', { name: /長野五輪開幕/ })).toBeInTheDocument();
		await waitFor(() => expect(lastUrl().has('k')).toBe(false));
	});

	it('falls back to the normal view when the collection cannot be loaded', async () => {
		open('/?k=missing');
		// Before collections.json names it, the banner shows the slug
		expect(await screen.findByRole('link', { name: 'missing' })).toBeInTheDocument();
		expect(await screen.findByRole('button', { name: /長野五輪開幕/ })).toBeInTheDocument();
	});

	it('explains what to do when the data cannot be loaded', async () => {
		open('/', { '/data/index.json': 500 });
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('年表のデータを読み込めませんでした。');
		expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
	});

	it('jumps to a search hit and highlights it', async () => {
		const user = open('/');
		await screen.findByRole('button', { name: /長野五輪開幕/ });
		await user.type(screen.getByRole('combobox'), '古い');
		await waitFor(() => expect(queries().length).toBeGreaterThan(0));
		const seq = queries().at(-1)!.seq;
		worker.onmessage!({
			data: {
				seq,
				status: 'ready',
				hits: [{ id: '1920-03-03-old', date: '1920-03-03', text: '古いできごと', score: 1 }],
			} satisfies SearchResponse,
		} as MessageEvent);
		await user.click(await screen.findByRole('option', { name: /古いできごと/ }));
		await waitFor(() => expect(document.querySelector('.card[data-id="1920-03-03-old"]')).toHaveClass('highlighted'), {
			timeout: 3000,
		});
		await waitFor(() => expect(lastUrl().get('q')).toBe('古い'));
	});
});
