import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchHit } from '../search.ts';
import type { SearchRequest, SearchResponse } from '../workers/search.worker.ts';
import SearchBox from './SearchBox.svelte';

/** Stand-in for the search worker: records requests and lets the test answer them */
const workers = vi.hoisted(() => ({ instances: [] as FakeWorkerLike[] }));
interface FakeWorkerLike {
	onmessage: ((e: MessageEvent<SearchResponse>) => void) | null;
	posted: SearchRequest[];
}
vi.mock('../workers/search.worker.ts?worker', () => ({
	default: class {
		onmessage: ((e: MessageEvent<SearchResponse>) => void) | null = null;
		posted: SearchRequest[] = [];
		constructor() {
			workers.instances.push(this);
		}
		postMessage(msg: SearchRequest) {
			this.posted.push(msg);
		}
	},
}));

function hit(n: number): SearchHit {
	return { id: `id-${n}`, date: `19${10 + n}-05-01`, text: `できごと${n}`, score: 1 };
}

/** A worker response without its sequence number (distributes over the union) */
type Reply = SearchResponse extends infer R ? (R extends unknown ? Omit<R, 'seq'> : never) : never;

type QueryRequest = Extract<SearchRequest, { seq: number }>;
const isQuery = (m: SearchRequest): m is QueryRequest => 'seq' in m;

/** Wait for the debounced request (warm-up messages do not count), then answer it */
async function answer(response: Reply, seqOffset = 0): Promise<void> {
	await waitFor(() => expect(workers.instances[0]?.posted.filter(isQuery).length ?? 0).toBeGreaterThan(0));
	const w = workers.instances[0];
	const seq = w.posted.filter(isQuery).at(-1)!.seq + seqOffset;
	w.onmessage!({ data: { seq, ...response } as SearchResponse } as MessageEvent<SearchResponse>);
}

function setup() {
	const onjump = vi.fn();
	let query = $state('');
	render(SearchBox, {
		props: {
			onjump,
			get query() {
				return query;
			},
			set query(v: string) {
				query = v;
			},
		},
	});
	const input = screen.getByRole('combobox', { name: 'ニュースを検索' });
	return { user: userEvent.setup(), onjump, input, query: () => query };
}

beforeEach(() => {
	workers.instances.length = 0;
});

describe('SearchBox', () => {
	it('starts collapsed and does not spin up the worker until the user types', async () => {
		const { input } = setup();
		expect(input).toHaveAttribute('aria-expanded', 'false');
		expect(workers.instances).toHaveLength(0);
	});

	it('warms the index once on focus or hover so the first query does not wait (SHIG 14, 65)', async () => {
		const { user, input } = setup();
		await user.hover(input);
		expect(workers.instances[0].posted).toEqual([{ warm: true }]);
		await user.click(input);
		await user.tab();
		await user.click(input);
		expect(workers.instances[0].posted).toEqual([{ warm: true }]);
		expect(input).toHaveAttribute('aria-expanded', 'false');
	});

	it('does not prefetch the index when the browser asks for reduced data', async () => {
		Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
		try {
			const { user, input } = setup();
			await user.click(input);
			expect(workers.instances).toHaveLength(0);
		} finally {
			delete (navigator as { connection?: unknown }).connection;
		}
	});

	it('debounces the query, shows loading, then lists hits and jumps on Enter', async () => {
		const { user, input, onjump, query } = setup();
		await user.click(input);
		await user.type(input, '  地震 ');
		expect(query()).toBe('  地震 ');

		await answer({ status: 'loading' });
		expect(await screen.findByRole('status')).toHaveTextContent('索引を準備中…');
		// The listbox stays mounted (empty) while the popup is open so aria-controls resolves
		expect(screen.getByRole('listbox', { name: '検索結果' })).toBeEmptyDOMElement();
		expect(input).toHaveAttribute('aria-controls', 'search-results');

		await answer({ status: 'ready', hits: [hit(1), hit(2)] });
		const list = await screen.findByRole('listbox', { name: '検索結果' });
		expect(input).toHaveAttribute('aria-expanded', 'true');
		expect(workers.instances[0].posted.filter(isQuery).at(-1)!.query).toBe('地震');
		const options = screen.getAllByRole('option');
		expect(list).toContainElement(options[0]);
		expect(options[0]).toHaveTextContent('1911.05');
		expect(options[0]).toHaveAttribute('aria-selected', 'true');
		expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

		await user.keyboard('{ArrowDown}');
		expect(options[1]).toHaveAttribute('aria-selected', 'true');
		await user.keyboard('{ArrowDown}');
		expect(options[1]).toHaveAttribute('aria-selected', 'true');
		await user.keyboard('{ArrowUp}{ArrowUp}');
		expect(options[0]).toHaveAttribute('aria-selected', 'true');
		await user.keyboard('{ArrowDown}{Enter}');
		expect(onjump).toHaveBeenCalledWith(hit(2));
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('selects a hit with the mouse', async () => {
		const { user, input, onjump } = setup();
		await user.type(input, '戦争');
		await answer({ status: 'ready', hits: [hit(3)] });
		await user.click(await screen.findByRole('option', { name: /できごと3/ }));
		expect(onjump).toHaveBeenCalledWith(hit(3));
	});

	it('says what to try next when nothing matches, and Enter does nothing', async () => {
		const { user, input, onjump } = setup();
		await user.type(input, 'zzz');
		await answer({ status: 'ready', hits: [] });
		expect(await screen.findByRole('status')).toHaveTextContent('「zzz」に一致するできごとはありません');
		expect(input).not.toHaveAttribute('aria-activedescendant');
		await user.keyboard('{Enter}');
		expect(onjump).not.toHaveBeenCalled();
	});

	it('explains the limit when the result list is full', async () => {
		const { user, input } = setup();
		await user.type(input, '年');
		await answer({ status: 'ready', hits: Array.from({ length: 20 }, (_, i) => hit(i)) });
		expect(await screen.findByRole('status')).toHaveTextContent('上位20件を表示しています');
	});

	it('shows a recovery hint when the index fails to load', async () => {
		const { user, input } = setup();
		await user.type(input, '条約');
		await answer({ status: 'error', message: 'boom' });
		expect(await screen.findByRole('status')).toHaveTextContent('もう一度入力すると再試行します');
		expect(screen.queryAllByRole('option')).toHaveLength(0);
	});

	it('ignores stale responses from an earlier query', async () => {
		const { user, input } = setup();
		await user.type(input, '古い');
		await answer({ status: 'ready', hits: [hit(1)] }, -1);
		await new Promise((r) => setTimeout(r, 50));
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('clears the results when the query is emptied and closes on Escape', async () => {
		const { user, input } = setup();
		await user.type(input, '選挙');
		await answer({ status: 'ready', hits: [hit(1)] });
		await screen.findByRole('listbox');
		await user.keyboard('{Escape}');
		expect(input).not.toHaveFocus();
		expect(screen.queryByRole('listbox')).toBeNull();

		await user.click(input);
		await user.clear(input);
		expect(screen.queryByRole('listbox')).toBeNull();
		expect(input).toHaveAttribute('aria-expanded', 'false');
	});

	it('closes shortly after losing focus', async () => {
		const { user, input } = setup();
		await user.type(input, '選挙');
		await answer({ status: 'ready', hits: [hit(1)] });
		await screen.findByRole('listbox');
		await user.tab();
		await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
	});

	it('focuses the search box with "/" unless typing elsewhere or using a modifier', async () => {
		const { user, input } = setup();
		const other = document.createElement('textarea');
		document.body.append(other);
		try {
			other.focus();
			await user.keyboard('/');
			expect(input).not.toHaveFocus();

			other.blur();
			await user.keyboard('{Control>}/{/Control}');
			expect(input).not.toHaveFocus();

			await user.keyboard('/');
			expect(input).toHaveFocus();
			// The shortcut key itself is not typed into the box
			expect(input).toHaveValue('');

			// Once inside an input, "/" is ordinary text (e.g. a date like 1945/8)
			await user.keyboard('1945/8');
			expect(input).toHaveValue('1945/8');
		} finally {
			other.remove();
		}
	});
});
