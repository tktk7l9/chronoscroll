/**
 * 全文検索ワーカー（IO層・カバレッジゲート対象外）。
 * 初回クエリで search.json を取得して MiniSearch 索引を構築する。
 */
import type MiniSearch from 'minisearch';
import { buildSearchIndex, runQuery, type SearchDoc, type SearchHit } from '../search.ts';

export interface SearchRequest {
	seq: number;
	query: string;
}

export type SearchResponse =
	| { seq: number; status: 'ready'; hits: SearchHit[] }
	| { seq: number; status: 'loading' }
	| { seq: number; status: 'error'; message: string };

let mini: MiniSearch | null = null;
let docsById: Map<string, SearchDoc> | null = null;
let loading: Promise<void> | null = null;

async function ensureIndex(): Promise<void> {
	loading ??= (async () => {
		const res = await fetch('/data/search.json');
		if (!res.ok) throw new Error(`search.json: HTTP ${res.status}`);
		const docs = (await res.json()) as SearchDoc[];
		docsById = new Map(docs.map((d) => [d[0], d]));
		mini = buildSearchIndex(docs);
	})();
	await loading;
}

self.onmessage = (e: MessageEvent<SearchRequest>) => {
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
