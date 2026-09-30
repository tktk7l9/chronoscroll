/**
 * Full-text search worker (IO layer, excluded from the coverage gate).
 * Fetches search.json on the first query (or a warm-up request sent when the search box
 * gains focus) and builds the MiniSearch index. A failed fetch is retried on a later query.
 */
import type MiniSearch from 'minisearch';
import { buildSearchIndex, runQuery, type SearchDoc, type SearchHit } from '../search.ts';

export type SearchRequest =
	| { seq: number; query: string }
	/** Fetch and build the index ahead of the first keystroke; nothing is posted back */
	| { warm: true };

export type SearchResponse =
	| { seq: number; status: 'ready'; hits: SearchHit[] }
	| { seq: number; status: 'loading' }
	| { seq: number; status: 'error'; message: string };

let mini: MiniSearch | null = null;
let docsById: Map<string, SearchDoc> | null = null;
let loading: Promise<void> | null = null;

/** Retry backoff after a failed index load: 0.5s, 1s, 2s, ... capped at 8s */
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8000;
let failures = 0;
let retryAt = 0;

async function loadIndex(): Promise<void> {
	const wait = retryAt - Date.now();
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
	const res = await fetch('/data/search.json');
	if (!res.ok) throw new Error(`search.json: HTTP ${res.status}`);
	const docs = (await res.json()) as SearchDoc[];
	docsById = new Map(docs.map((d) => [d[0], d]));
	mini = buildSearchIndex(docs);
	failures = 0;
}

/**
 * Concurrent queries share one in-flight load. A failed load is forgotten so the
 * next query retries (after a short backoff) instead of failing forever.
 */
async function ensureIndex(): Promise<void> {
	loading ??= loadIndex().catch((err: unknown) => {
		loading = null;
		failures += 1;
		retryAt = Date.now() + Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS);
		throw err;
	});
	await loading;
}

self.onmessage = (e: MessageEvent<SearchRequest>) => {
	if ('warm' in e.data) {
		// Precomputation (SHIG 14): failures are reported by the query that follows
		void ensureIndex().catch(() => {});
		return;
	}
	const { seq, query } = e.data;
	void (async () => {
		try {
			if (!mini) {
				postMessage({ seq, status: 'loading' } satisfies SearchResponse);
				await ensureIndex();
			}
			const hits = runQuery(mini!, docsById!, query);
			postMessage({ seq, status: 'ready', hits } satisfies SearchResponse);
		} catch (err) {
			postMessage({ seq, status: 'error', message: String(err) } satisfies SearchResponse);
		}
	})();
};
