import MiniSearch from 'minisearch';

/**
 * Tokenizer that handles Japanese.
 * Runs of alphanumerics are one word; everything else (CJK etc.) is split into character bigrams.
 */
export function bigramTokenize(text: string): string[] {
	const tokens: string[] = [];
	for (const run of text.toLowerCase().matchAll(/[a-z0-9]+|[^\sa-z0-9、。・「」（）()!?！？:：;；,.]+/g)) {
		const s = run[0];
		if (/^[a-z0-9]+$/.test(s)) {
			tokens.push(s);
		} else if (s.length === 1) {
			tokens.push(s);
		} else {
			for (let i = 0; i < s.length - 1; i++) tokens.push(s.slice(i, i + 2));
		}
	}
	return tokens;
}

/** Search document: one row of the pipeline's search.json [id, date, text] */
export type SearchDoc = [id: string, date: string, text: string];

export interface SearchHit {
	id: string;
	date: string;
	text: string;
	score: number;
}

/** Maximum number of hits returned to the dropdown. */
export const SEARCH_LIMIT = 20;

export function buildSearchIndex(docs: readonly SearchDoc[]): MiniSearch {
	const mini = new MiniSearch({
		fields: ['text'],
		idField: 'id',
		tokenize: bigramTokenize,
		searchOptions: { combineWith: 'AND', tokenize: bigramTokenize },
	});
	mini.addAll(docs.map(([id, , text]) => ({ id, text })));
	return mini;
}

export function runQuery(
	mini: MiniSearch,
	docsById: ReadonlyMap<string, SearchDoc>,
	query: string,
	limit = SEARCH_LIMIT,
): SearchHit[] {
	const q = query.trim();
	if (q === '') return [];
	return mini
		.search(q)
		.slice(0, limit)
		.map((r) => {
			const doc = docsById.get(r.id as string)!;
			return { id: doc[0], date: doc[1], text: doc[2], score: r.score };
		});
}

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Hint line shown in the search dropdown (null = nothing to say).
 * Each message says what the user can do next (SHIG 55).
 */
export function searchStatusMessage(
	status: SearchStatus,
	query: string,
	hitCount: number,
	limit = SEARCH_LIMIT,
): string | null {
	if (status === 'loading') return '索引を準備中…';
	if (status === 'error') {
		return '検索を準備できませんでした。通信状況を確かめて、もう一度入力すると再試行します';
	}
	if (status !== 'ready') return null;
	if (hitCount === 0) {
		return `「${query.trim()}」に一致するできごとはありません。人名・地名・出来事名など別の言葉で試してください`;
	}
	if (hitCount >= limit) return `上位${limit}件を表示しています。言葉を足すと絞り込めます`;
	return null;
}
