import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '../../test/fetch.ts';
import type { SearchDoc } from '../search.ts';
import type { SearchRequest, SearchResponse } from './search.worker.ts';

const docs: SearchDoc[] = [
	['1923-09-01-quake', '1923-09-01', '関東大震災が発生する'],
	['1964-10-10-olympics', '1964-10-10', '東京オリンピックが開幕する'],
];

let posted: SearchResponse[];

/** Load a fresh copy of the worker module (it keeps its index in module state) */
async function loadWorker(): Promise<(req: SearchRequest) => void> {
	vi.resetModules();
	posted = [];
	vi.stubGlobal('postMessage', (m: SearchResponse) => posted.push(m));
	await import('./search.worker.ts');
	const handler = self.onmessage as unknown as (e: { data: SearchRequest }) => void;
	return (req) => handler({ data: req });
}

async function settle(count: number): Promise<void> {
	await vi.waitFor(() => expect(posted.length).toBeGreaterThanOrEqual(count));
}

beforeEach(() => {
	self.onmessage = null;
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('search worker', () => {
	it('reports loading, builds the index once, then answers with hits', async () => {
		const { calls } = stubFetch({ '/data/search.json': docs });
		const send = await loadWorker();
		send({ seq: 1, query: '震災' });
		await settle(2);
		expect(posted[0]).toEqual({ seq: 1, status: 'loading' });
		expect(posted[1]).toMatchObject({ seq: 1, status: 'ready' });
		expect((posted[1] as { hits: { id: string }[] }).hits[0].id).toBe('1923-09-01-quake');

		send({ seq: 2, query: 'オリンピック' });
		await settle(3);
		expect(posted[2]).toMatchObject({ seq: 2, status: 'ready' });
		expect(calls).toHaveLength(1);
	});

	it('shares one index fetch between queries sent while it is still loading', async () => {
		const { calls } = stubFetch({ '/data/search.json': docs });
		const send = await loadWorker();
		send({ seq: 1, query: '震災' });
		send({ seq: 2, query: 'オリンピック' });
		await settle(4);
		expect(calls).toHaveLength(1);
		const ready = posted.filter((m) => m.status === 'ready').map((m) => m.seq);
		expect(ready.sort()).toEqual([1, 2]);
	});

	it('reports an error when the index cannot be fetched', async () => {
		stubFetch({ '/data/search.json': 500 });
		const send = await loadWorker();
		send({ seq: 7, query: '震災' });
		await settle(2);
		expect(posted[1]).toEqual({ seq: 7, status: 'error', message: 'Error: search.json: HTTP 500' });
	});

	it('retries the index fetch on the next query after a failure', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
		let fail = true;
		const { calls } = stubFetch({
			'/data/search.json': () =>
				fail
					? new Response('error', { status: 503 })
					: new Response(JSON.stringify(docs), { status: 200 }),
		});
		const send = await loadWorker();
		send({ seq: 1, query: '震災' });
		await settle(2);
		expect(posted[1]).toMatchObject({ seq: 1, status: 'error' });

		fail = false;
		send({ seq: 2, query: '震災' });
		await settle(3);
		expect(posted[2]).toEqual({ seq: 2, status: 'loading' });
		// The retry waits out a short backoff before fetching again
		expect(calls).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(10_000);
		await settle(4);
		expect(calls).toHaveLength(2);
		expect(posted[3]).toMatchObject({ seq: 2, status: 'ready' });
		expect((posted[3] as { hits: { id: string }[] }).hits[0].id).toBe('1923-09-01-quake');
	});

	it('shares one retry between queries sent during the backoff and grows the delay', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
		const { calls } = stubFetch({ '/data/search.json': 500 });
		const send = await loadWorker();
		send({ seq: 1, query: 'a' });
		await settle(2);
		expect(calls).toHaveLength(1);

		send({ seq: 2, query: 'b' });
		send({ seq: 3, query: 'c' });
		await settle(4);
		await vi.advanceTimersByTimeAsync(500);
		await settle(6);
		expect(calls).toHaveLength(2);
		expect(posted.slice(4).map((m) => [m.seq, m.status])).toEqual([
			[2, 'error'],
			[3, 'error'],
		]);

		// Second failure: the next retry waits longer than the first
		send({ seq: 4, query: 'd' });
		await settle(7);
		await vi.advanceTimersByTimeAsync(500);
		expect(calls).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(500);
		await settle(8);
		expect(calls).toHaveLength(3);
	});

	it('retries at once when the backoff has already elapsed', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
		let fail = true;
		const { calls } = stubFetch({
			'/data/search.json': () =>
				fail
					? new Response('error', { status: 500 })
					: new Response(JSON.stringify(docs), { status: 200 }),
		});
		const send = await loadWorker();
		send({ seq: 1, query: '震災' });
		await settle(2);
		await vi.advanceTimersByTimeAsync(60_000);
		fail = false;
		send({ seq: 2, query: '震災' });
		await settle(4);
		expect(calls).toHaveLength(2);
		expect(posted[3]).toMatchObject({ seq: 2, status: 'ready' });
	});

	it('caps the retry backoff at 8 seconds', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
		const { calls } = stubFetch({ '/data/search.json': 500 });
		const send = await loadWorker();
		// Six failures, each retried after the previous backoff has fully elapsed
		for (let i = 1; i <= 6; i++) {
			if (i > 1) await vi.advanceTimersByTimeAsync(60_000);
			send({ seq: i, query: 'a' });
			await settle(i * 2);
		}
		expect(calls).toHaveLength(6);
		// Uncapped, the wait after the sixth failure would be 16s; capped it is 8s.
		// (vi.waitFor also advances fake timers a little, hence the loose bounds)
		send({ seq: 7, query: 'a' });
		await settle(13);
		await vi.advanceTimersByTimeAsync(7_000);
		expect(calls).toHaveLength(6);
		await vi.advanceTimersByTimeAsync(2_000);
		await settle(14);
		expect(calls).toHaveLength(7);
	});
});
