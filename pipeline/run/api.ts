/**
 * Wikimedia API client (IO layer, excluded from the coverage gate).
 * - Explicit User-Agent, maxlag, serial throttling, retries
 * - Written with Effect: failures are typed (WikiError), waits go through Clock so tests run
 *   them on TestClock, and fetch is a Context.Reference that tests can replace
 */
import { Clock, Console, Context, Data, Duration, Effect, Schedule } from 'effect';
import { isRetryableError, nextDelay, RETRY_MAX_ATTEMPTS, retryDelayMs } from '../lib/throttle.ts';

const UA = 'chronoscroll-pipeline/0.1 (https://github.com/tktk7l9/chronoscroll)';
const MIN_INTERVAL_MS = 150;

/** The fetch used for API calls. Defaults to the global fetch; tests provide a stub */
export const Fetch = Context.Reference<typeof fetch>('chronoscroll/Fetch', {
	defaultValue: () => (input, init) => fetch(input, init),
});

/** A non-2xx response. retryAfterSec is set only for 429/503 that carry a numeric Retry-After */
export class HttpError extends Data.TaggedError('HttpError')<{
	readonly status: number;
	readonly endpoint: string;
	readonly retryAfterSec?: number;
}> {
	override get message(): string {
		return this.status === 429 || this.status === 503
			? `HTTP ${this.status}`
			: `HTTP ${this.status} (${this.endpoint})`;
	}
}

/** An `error` object in a 200 response (maxlag, missingtitle, ...) */
export class ApiError extends Data.TaggedError('ApiError')<{
	readonly code?: string;
	readonly info?: string;
}> {
	override get message(): string {
		return this.code === 'maxlag' ? 'maxlag' : `API error: ${this.code} ${this.info}`;
	}
}

/** fetch itself or the JSON body failed (connection reset, DNS, truncated body, ...) */
export class NetworkError extends Data.TaggedError('NetworkError')<{ readonly cause: unknown }> {
	override get message(): string {
		return this.cause instanceof Error ? this.cause.message : String(this.cause);
	}
}

export type WikiError = HttpError | ApiError | NetworkError;

let lastRequestAt = Number.NEGATIVE_INFINITY;

/** Keep MIN_INTERVAL_MS between requests. The pipeline is serial, so a module-level timestamp is enough */
const throttled = Effect.gen(function* () {
	const now = yield* Clock.currentTimeMillis;
	const wait = nextDelay(lastRequestAt, now, MIN_INTERVAL_MS);
	if (wait > 0) yield* Effect.sleep(wait);
	lastRequestAt = yield* Clock.currentTimeMillis;
});

/** Test hook: forget the last request time so each test starts unthrottled */
export function resetThrottle(): void {
	lastRequestAt = Number.NEGATIVE_INFINITY;
}

const postOnce = (endpoint: string, body: string): Effect.Effect<unknown, WikiError> =>
	Effect.gen(function* () {
		yield* throttled;
		const fetchImpl = yield* Fetch;
		const res = yield* Effect.tryPromise({
			try: (signal) =>
				fetchImpl(endpoint, {
					method: 'POST',
					headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
					body,
					signal,
				}),
			catch: (cause) => new NetworkError({ cause }),
		});
		if (res.status === 429 || res.status === 503) {
			// Rate limited. If Retry-After (seconds) is present, retryDelayMs prefers it
			const retryAfterSec = Number(res.headers.get('retry-after') ?? '');
			return yield* new HttpError({ status: res.status, endpoint, retryAfterSec });
		}
		if (!res.ok) return yield* new HttpError({ status: res.status, endpoint });
		const json = (yield* Effect.tryPromise({
			try: () => res.json(),
			catch: (cause) => new NetworkError({ cause }),
		})) as { error?: { code?: string; info?: string } };
		if (json.error) return yield* new ApiError(json.error);
		return json;
	});

/**
 * Retry policy: at most RETRY_MAX_ATTEMPTS retries, each delay taken from retryDelayMs (the
 * tested pure function) so Retry-After and the backoff caps stay in one place.
 * attempt in the schedule metadata starts at 1, retryDelayMs counts from 0.
 */
const retryPolicy = Schedule.recurs(RETRY_MAX_ATTEMPTS).pipe(
	Schedule.setInputType<WikiError>(),
	Schedule.modifyDelay(({ attempt, input }) => {
		const retryAfterSec = input._tag === 'HttpError' ? input.retryAfterSec : undefined;
		return Effect.succeed(retryDelayMs(attempt - 1, retryAfterSec) ?? 0);
	}),
	Schedule.tap(({ attempt, input, duration }) =>
		Console.warn(`  retry ${attempt} (waiting ${Duration.toMillis(duration)}ms): Error: ${input.message}`),
	),
);

export const apiPost = (
	endpoint: string,
	params: Record<string, string>,
): Effect.Effect<unknown, WikiError> => {
	const body = new URLSearchParams({ ...params, format: 'json', formatversion: '2', maxlag: '5' });
	return postOnce(endpoint, body.toString()).pipe(
		Effect.retry({
			// Missing pages (missingtitle) etc. are the same no matter how often we retry = give up immediately
			while: (e) => isRetryableError(e.message),
			schedule: retryPolicy,
		}),
	);
};

export const JA_WIKI_API = 'https://ja.wikipedia.org/w/api.php';
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

/** Fetch the wikitext of any page (null if it does not exist or the fetch failed) */
export const fetchPageWikitext = (page: string): Effect.Effect<string | null> =>
	apiPost(JA_WIKI_API, { action: 'parse', page, prop: 'wikitext' }).pipe(
		Effect.map((json) => (json as { parse?: { wikitext?: string } }).parse?.wikitext ?? null),
		Effect.catch((e) =>
			Console.warn(`  ${page}: fetch failed (Error: ${e.message})`).pipe(Effect.as(null)),
		),
	);

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

/** Map from original title → final title after following normalized/redirects */
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

/** Titles → Wikidata Qid (null if not found) */
export const fetchQids = (
	titles: readonly string[],
): Effect.Effect<Map<string, string | null>, WikiError> =>
	Effect.gen(function* () {
		const result = new Map<string, string | null>();
		for (const batch of chunk(titles, 50)) {
			const json = (yield* apiPost(JA_WIKI_API, {
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
	});

/** Qids → sitelink count (number of language editions) */
export const fetchSitelinkCounts = (
	qids: readonly string[],
): Effect.Effect<Map<string, number>, WikiError> =>
	Effect.gen(function* () {
		const result = new Map<string, number>();
		for (const batch of chunk(qids, 50)) {
			const json = (yield* apiPost(WIKIDATA_API, {
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
	});

type PageviewsResponse = QueryPagesResponse & {
	continue?: Record<string, string>;
	query?: { pages?: { title: string; pageviews?: Record<string, number | null> }[] };
};

/** One batch of titles → average daily views, following continue (at most 60 pages) */
const pageviewsBatch = (
	batch: readonly string[],
): Effect.Effect<Map<string, number>, WikiError> =>
	Effect.gen(function* () {
		const merged = new Map<string, Record<string, number | null>>();
		let titleMap = new Map<string, string>();
		let cont: Record<string, string> = {};
		for (let guard = 0; guard < 60; guard++) {
			const json = (yield* apiPost(JA_WIKI_API, {
				action: 'query',
				prop: 'pageviews',
				redirects: '1',
				titles: batch.join('|'),
				...cont,
			})) as PageviewsResponse;
			if (guard === 0) titleMap = resolveTitleMap(batch, json.query);
			for (const p of json.query?.pages ?? []) {
				if (p.pageviews) merged.set(p.title, { ...(merged.get(p.title) ?? {}), ...p.pageviews });
			}
			if (!json.continue) break;
			cont = json.continue;
		}
		const out = new Map<string, number>();
		for (const t of batch) {
			const pv = merged.get(titleMap.get(t) ?? t);
			const views = Object.values(pv ?? {}).filter((v): v is number => v !== null);
			out.set(t, views.length > 0 ? views.reduce((a, b) => a + b, 0) / views.length : 0);
		}
		return out;
	});

/**
 * Titles → average daily page views over the last 60 days (ja.wikipedia).
 * - prop=pageviews returns only some pages per response, so follow continue
 * - If a particular title fails with pvi-cached-error etc., the whole batch errors out, so
 *   extract that title from the error message and retry (failed titles count as 0)
 * - Batches that still fail are skipped (not cached, retried next time). Never fails.
 */
export const fetchPageviews = (titles: readonly string[]): Effect.Effect<Map<string, number>> =>
	Effect.gen(function* () {
		const result = new Map<string, number>();
		for (const original of chunk(titles, 50)) {
			let batch = [...original];
			for (let attempt = 0; attempt < 6 && batch.length > 0; attempt++) {
				const outcome = yield* Effect.result(pageviewsBatch(batch));
				if (outcome._tag === 'Success') {
					for (const [t, v] of outcome.success) result.set(t, v);
					break;
				}
				const e = outcome.failure;
				const failed = e.message.match(/page "(.+?)" failed/)?.[1];
				if (failed && batch.includes(failed)) {
					yield* Console.warn(`  excluding titles whose pageviews failed: ${failed}`);
					result.set(failed, 0);
					batch = batch.filter((t) => t !== failed);
					continue;
				}
				yield* Console.warn(`  skipping pageviews batch (${batch.length} titles): Error: ${e.message}`);
				break;
			}
		}
		return result;
	});

export interface PageImage {
	src: string;
	width: number;
	height: number;
	/** Commons file name (without File:) */
	name: string;
}

/** Titles → representative thumbnail image */
export const fetchPageImages = (
	titles: readonly string[],
): Effect.Effect<Map<string, PageImage | null>, WikiError> =>
	Effect.gen(function* () {
		const result = new Map<string, PageImage | null>();
		for (const batch of chunk(titles, 50)) {
			const json = (yield* apiPost(JA_WIKI_API, {
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
	});
