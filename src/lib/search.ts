import MiniSearch from 'minisearch';

/**
 * 日本語対応トークナイザ。
 * 英数字の連なりは1単語、それ以外（CJK等）は文字bigramに分解する。
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

/** 検索ドキュメント: pipelineのsearch.jsonの1行 [id, date, text] */
export type SearchDoc = [id: string, date: string, text: string];

export interface SearchHit {
	id: string;
	date: string;
	text: string;
	score: number;
}

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
	limit = 20,
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
