/**
 * Wikimedia API クライアント（IO層・カバレッジゲート対象外）。
 * - User-Agent 明示・maxlag・直列スロットリング・リトライ
 */
import { nextDelay } from '../lib/throttle.ts';

const UA = 'chronoscroll-pipeline/0.1 (https://github.com/tktk7l9/chronoscroll)';
const MIN_INTERVAL_MS = 150;
const RETRY_DELAYS_MS = [1000, 3000, 9000];

let lastRequestAt = 0;

async function throttled(): Promise<void> {
	const wait = nextDelay(lastRequestAt, Date.now(), MIN_INTERVAL_MS);
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	lastRequestAt = Date.now();
}

export async function apiPost(
	endpoint: string,
	params: Record<string, string>,
): Promise<unknown> {
	const body = new URLSearchParams({ ...params, format: 'json', formatversion: '2', maxlag: '5' });
	for (let attempt = 0; ; attempt++) {
		await throttled();
		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body.toString(),
			});
			if (res.status === 429 || res.status === 503) throw new Error(`HTTP ${res.status}`);
			if (!res.ok) throw new Error(`HTTP ${res.status} (${endpoint})`);
			const json = (await res.json()) as { error?: { code?: string; info?: string } };
			if (json.error) {
				if (json.error.code === 'maxlag') throw new Error('maxlag');
				throw new Error(`API error: ${json.error.code} ${json.error.info}`);
			}
			return json;
		} catch (e) {
			if (attempt >= RETRY_DELAYS_MS.length) throw e;
			const delay = RETRY_DELAYS_MS[attempt];
			console.warn(`  リトライ ${attempt + 1}/${RETRY_DELAYS_MS.length} (${delay}ms待機): ${e}`);
			await new Promise((r) => setTimeout(r, delay));
		}
	}
}

export const JA_WIKI_API = 'https://ja.wikipedia.org/w/api.php';
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

/** 年ページの wikitext を取得 */
export async function fetchYearWikitext(year: number): Promise<string | null> {
	const json = (await apiPost(JA_WIKI_API, {
		action: 'parse',
		page: `${year}年`,
		prop: 'wikitext',
	}).catch((e) => {
		console.warn(`  ${year}年: 取得失敗 (${e})`);
		return null;
	})) as { parse?: { wikitext?: string } } | null;
	return json?.parse?.wikitext ?? null;
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

interface QueryPagesResponse {
	query?: {
		normalized?: { from: string; to: string }[];
		redirects?: { from: string; to: string }[];
		pages?: {
			title: string;
			pageprops?: { wikibase_item?: string };
			thumbnail?: { source: string; width: number; height: number };
			pageimage?: string;
		}[];
	};
}

/** 元タイトル → normalized/redirects を辿った最終タイトルの対応表 */
function resolveTitleMap(titles: readonly string[], q: QueryPagesResponse['query']): Map<string, string> {
	const norm = new Map((q?.normalized ?? []).map((n) => [n.from, n.to]));
	const redir = new Map((q?.redirects ?? []).map((r) => [r.from, r.to]));
	const map = new Map<string, string>();
	for (const t of titles) {
		let cur = norm.get(t) ?? t;
		const seen = new Set<string>();
		while (redir.has(cur) && !seen.has(cur)) {
			seen.add(cur);
			cur = redir.get(cur)!;
		}
		map.set(t, cur);
	}
	return map;
}

/** タイトル群 → Wikidata Qid（見つからなければ null） */
export async function fetchQids(titles: readonly string[]): Promise<Map<string, string | null>> {
	const result = new Map<string, string | null>();
	for (const batch of chunk(titles, 50)) {
		const json = (await apiPost(JA_WIKI_API, {
			action: 'query',
			prop: 'pageprops',
			ppprop: 'wikibase_item',
			redirects: '1',
			titles: batch.join('|'),
		})) as QueryPagesResponse;
		const titleMap = resolveTitleMap(batch, json.query);
		const byTitle = new Map((json.query?.pages ?? []).map((p) => [p.title, p]));
		for (const t of batch) {
			const page = byTitle.get(titleMap.get(t)!);
			result.set(t, page?.pageprops?.wikibase_item ?? null);
		}
	}
	return result;
}

/** Qid群 → sitelink数（言語版数） */
export async function fetchSitelinkCounts(qids: readonly string[]): Promise<Map<string, number>> {
	const result = new Map<string, number>();
	for (const batch of chunk(qids, 50)) {
		const json = (await apiPost(WIKIDATA_API, {
			action: 'wbgetentities',
			ids: batch.join('|'),
			props: 'sitelinks',
		})) as { entities?: Record<string, { sitelinks?: Record<string, unknown> }> };
		for (const qid of batch) {
			const ent = json.entities?.[qid];
			result.set(qid, ent?.sitelinks ? Object.keys(ent.sitelinks).length : 0);
		}
	}
	return result;
}

/**
 * タイトル群 → 直近60日の1日平均ページビュー（ja.wikipedia）。
 * - prop=pageviews は1レスポンスで一部のページ分しか返さないため、continue を辿る
 * - 特定タイトルが pvi-cached-error 等で失敗するとバッチ全体がエラーになるため、
 *   エラーメッセージから当該タイトルを抜いてリトライする（失敗タイトルは0扱い）
 * - それでも失敗したバッチはスキップ（キャッシュに入れず次回再試行）
 */
export async function fetchPageviews(titles: readonly string[]): Promise<Map<string, number>> {
	const result = new Map<string, number>();
	for (const original of chunk(titles, 50)) {
		let batch = [...original];
		for (let attempt = 0; attempt < 6 && batch.length > 0; attempt++) {
			try {
				const merged = new Map<string, Record<string, number | null>>();
				let titleMap = new Map<string, string>();
				let cont: Record<string, string> = {};
				for (let guard = 0; guard < 60; guard++) {
					const json = (await apiPost(JA_WIKI_API, {
						action: 'query',
						prop: 'pageviews',
						redirects: '1',
						titles: batch.join('|'),
						...cont,
					})) as QueryPagesResponse & {
						continue?: Record<string, string>;
						query?: { pages?: { title: string; pageviews?: Record<string, number | null> }[] };
					};
					if (guard === 0) titleMap = resolveTitleMap(batch, json.query);
					for (const p of json.query?.pages ?? []) {
						if (p.pageviews) {
							merged.set(p.title, { ...(merged.get(p.title) ?? {}), ...p.pageviews });
						}
					}
					if (!json.continue) break;
					cont = json.continue;
				}
				for (const t of batch) {
					const pv = merged.get(titleMap.get(t) ?? t);
					const views = Object.values(pv ?? {}).filter((v): v is number => v !== null);
					result.set(t, views.length > 0 ? views.reduce((a, b) => a + b, 0) / views.length : 0);
				}
				break;
			} catch (e) {
				const failed = String(e).match(/page "(.+?)" failed/)?.[1];
				if (failed && batch.includes(failed)) {
					console.warn(`  pageviews失敗タイトルを除外: ${failed}`);
					result.set(failed, 0);
					batch = batch.filter((t) => t !== failed);
					continue;
				}
				console.warn(`  pageviewsバッチをスキップ (${batch.length}件): ${e}`);
				break;
			}
		}
	}
	return result;
}

export interface PageImage {
	src: string;
	width: number;
	height: number;
	/** Commonsのファイル名（File:なし） */
	name: string;
}

/** タイトル群 → 代表画像サムネイル */
export async function fetchPageImages(
	titles: readonly string[],
): Promise<Map<string, PageImage | null>> {
	const result = new Map<string, PageImage | null>();
	for (const batch of chunk(titles, 50)) {
		const json = (await apiPost(JA_WIKI_API, {
			action: 'query',
			prop: 'pageimages',
			piprop: 'thumbnail|name',
			pithumbsize: '640',
			redirects: '1',
			titles: batch.join('|'),
		})) as QueryPagesResponse;
		const titleMap = resolveTitleMap(batch, json.query);
		const byTitle = new Map((json.query?.pages ?? []).map((p) => [p.title, p]));
		for (const t of batch) {
			const page = byTitle.get(titleMap.get(t)!);
			result.set(
				t,
				page?.thumbnail && page.pageimage
					? {
							src: page.thumbnail.source,
							width: page.thumbnail.width,
							height: page.thumbnail.height,
							name: page.pageimage,
						}
					: null,
			);
		}
	}
	return result;
}
