import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiPost, Fetch, fetchPageviews, fetchPageWikitext, resetThrottle } from './api.ts';

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;

/** A fetch stub that answers from a script, one reply per call, and counts calls */
function scriptedFetch(replies: Reply[]) {
	const calls: string[] = [];
	const impl: typeof fetch = async (_input, init) => {
		calls.push(String(init?.body ?? ''));
		const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
		if (reply instanceof Error) throw reply;
		return new Response(JSON.stringify(reply.body ?? {}), {
			status: reply.status,
			headers: reply.headers,
		});
	};
	return { impl, calls };
}

/** Let pending promises (the stubbed fetch, res.json) settle between clock adjustments */
const settle = Effect.promise(() => new Promise<void>((r) => setTimeout(r, 0)));

const advance = (ms: number) =>
	Effect.gen(function* () {
		yield* settle;
		yield* TestClock.adjust(ms);
		yield* settle;
	});

const run = <A, E>(effect: Effect.Effect<A, E>, fetchImpl: typeof fetch) =>
	Effect.runPromise(
		effect.pipe(Effect.provideService(Fetch, fetchImpl), Effect.provide(TestClock.layer())) as Effect.Effect<A>,
	);

beforeEach(() => {
	resetThrottle();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('apiPost', () => {
	it('returns the JSON body on success', async () => {
		const { impl, calls } = scriptedFetch([{ status: 200, body: { ok: 1 } }]);
		await expect(run(apiPost('https://x.test/api', { action: 'q' }), impl)).resolves.toEqual({ ok: 1 });
		expect(calls[0]).toContain('maxlag=5');
	});

	it('backs off 2s then 6s on 429 and succeeds on the third call', async () => {
		const { impl, calls } = scriptedFetch([
			{ status: 429 },
			{ status: 429 },
			{ status: 200, body: { ok: 1 } },
		]);
		const program = Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(apiPost('https://x.test/api', {}));
			yield* advance(0);
			expect(calls).toHaveLength(1);
			yield* advance(1_999);
			expect(calls).toHaveLength(1);
			yield* advance(1);
			expect(calls).toHaveLength(2);
			yield* advance(5_999);
			expect(calls).toHaveLength(2);
			yield* advance(1);
			return yield* Fiber.join(fiber);
		});
		await expect(run(program, impl)).resolves.toEqual({ ok: 1 });
		expect(calls).toHaveLength(3);
	});

	it('prefers a longer Retry-After over the backoff', async () => {
		const { impl, calls } = scriptedFetch([
			{ status: 503, headers: { 'retry-after': '30' } },
			{ status: 200, body: {} },
		]);
		const program = Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(apiPost('https://x.test/api', {}));
			yield* advance(29_999);
			expect(calls).toHaveLength(1);
			yield* advance(1);
			return yield* Fiber.join(fiber);
		});
		await run(program, impl);
		expect(calls).toHaveLength(2);
	});

	it('gives up after 6 retries with the last typed error', async () => {
		const { impl, calls } = scriptedFetch([{ status: 429 }]);
		const program = Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(Effect.flip(apiPost('https://x.test/api', {})));
			for (let i = 0; i < 8; i++) yield* advance(120_000);
			return yield* Fiber.join(fiber);
		});
		const error = await run(program, impl);
		expect(error).toMatchObject({ _tag: 'HttpError', status: 429 });
		expect(calls).toHaveLength(7);
	});

	it('does not retry an API error such as missingtitle', async () => {
		const { impl, calls } = scriptedFetch([{ status: 200, body: { error: { code: 'missingtitle', info: 'x' } } }]);
		const error = await run(Effect.flip(apiPost('https://x.test/api', {})), impl);
		expect(error).toMatchObject({ _tag: 'ApiError', code: 'missingtitle' });
		expect(error.message).toBe('API error: missingtitle x');
		expect(calls).toHaveLength(1);
	});

	it('does not retry a 404', async () => {
		const { impl, calls } = scriptedFetch([{ status: 404 }]);
		const error = await run(Effect.flip(apiPost('https://x.test/api', {})), impl);
		expect(error.message).toBe('HTTP 404 (https://x.test/api)');
		expect(calls).toHaveLength(1);
	});

	it('retries maxlag and network failures', async () => {
		const { impl, calls } = scriptedFetch([
			{ status: 200, body: { error: { code: 'maxlag' } } },
			new TypeError('fetch failed'),
			{ status: 200, body: { ok: 1 } },
		]);
		const program = Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(apiPost('https://x.test/api', {}));
			for (let i = 0; i < 3; i++) yield* advance(10_000);
			return yield* Fiber.join(fiber);
		});
		await expect(run(program, impl)).resolves.toEqual({ ok: 1 });
		expect(calls).toHaveLength(3);
	});

	it('keeps 150ms between consecutive requests', async () => {
		const { impl, calls } = scriptedFetch([{ status: 200, body: {} }]);
		const program = Effect.gen(function* () {
			yield* apiPost('https://x.test/api', {});
			const fiber = yield* Effect.forkChild(apiPost('https://x.test/api', {}));
			yield* advance(149);
			expect(calls).toHaveLength(1);
			yield* advance(1);
			return yield* Fiber.join(fiber);
		});
		await run(program, impl);
		expect(calls).toHaveLength(2);
	});
});

describe('fetchPageWikitext', () => {
	it('returns null for a missing page instead of failing', async () => {
		const { impl } = scriptedFetch([{ status: 200, body: { error: { code: 'missingtitle', info: 'x' } } }]);
		await expect(run(fetchPageWikitext('1700年'), impl)).resolves.toBeNull();
	});
});

describe('fetchPageviews', () => {
	it('drops a title that the API reports as failed and retries the rest of the batch', async () => {
		const { impl, calls } = scriptedFetch([
			{ status: 200, body: { error: { code: 'pvi-cached-error', info: 'page "B" failed' } } },
			{ status: 200, body: { query: { pages: [{ title: 'A', pageviews: { d1: 10, d2: 20 } }] } } },
		]);
		const program = Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(fetchPageviews(['A', 'B']));
			yield* advance(1_000);
			return yield* Fiber.join(fiber);
		});
		const result = await run(program, impl);
		expect(result).toEqual(new Map([['B', 0], ['A', 15]]));
		expect(calls).toHaveLength(2);
	});
});
