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
});
